import { parentPort, workerData } from "worker_threads";
import { getQuickJS, type QuickJSContext, type QuickJSDeferredPromise } from "quickjs-emscripten";
import { ToolCallError, type SandboxOptions, type SandboxResult, type ToolBridge } from "./sandbox";

/** Worker-thread entry: runs the QuickJS sandbox so the host event loop stays free. */
async function run(
  code: string,
  toolNames: string[],
  bridge: ToolBridge,
  o: Required<SandboxOptions>,
): Promise<SandboxResult> {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(o.memoryBytes);
  runtime.setMaxStackSize(512 * 1024);
  // CPU budget: only time spent inside the VM counts; host/tool-call waits are excluded.
  let cpuUsed = 0;
  let lastTick = Date.now();
  const enterVm = () => {
    lastTick = Date.now();
  };
  runtime.setInterruptHandler(() => {
    const now = Date.now();
    cpuUsed += now - lastTick;
    lastTick = now;
    return cpuUsed > o.cpuMs;
  });
  const vm: QuickJSContext = runtime.newContext();

  const logs: string[] = [];
  let logChars = 0;
  const pending = new Set<QuickJSDeferredPromise>();
  let calls = 0;

  try {
    const log = vm.newFunction("__log", (...args) => {
      const line = args.map((h) => String(vm.dump(h))).join(" ");
      logChars += line.length;
      if (logChars <= o.maxOutputChars) logs.push(line);
      else if (logChars - line.length <= o.maxOutputChars) logs.push("…[logs truncated]");
    });
    vm.setProp(vm.global, "__log", log);
    log.dispose();

    // __call(name, argsJson) -> Promise<resultJson>
    const call = vm.newFunction("__call", (nameH, argsH) => {
      const name = vm.getString(nameH);
      const argsJson = vm.getString(argsH);
      const d = vm.newPromise();
      pending.add(d);
      const settle = (fn: () => void) => {
        if (!vm.alive) return; // sandbox already torn down
        fn();
        pending.delete(d);
        enterVm();
        runtime.executePendingJobs();
      };

      if (++calls > o.maxToolCalls) {
        settle(() => {
          const e = vm.newString(`Tool call limit exceeded (${o.maxToolCalls})`);
          d.reject(e);
          e.dispose();
        });
        return d.handle;
      }

      Promise.resolve()
        .then(() => bridge(name, JSON.parse(argsJson)))
        .then(
          (res) =>
            settle(() => {
              const h = vm.newString(JSON.stringify(res === undefined ? null : res));
              d.resolve(h);
              h.dispose();
            }),
          (err) =>
            settle(() => {
              const payload =
                err instanceof ToolCallError
                  ? JSON.stringify({ __toolError: true, message: err.message, ...err.details })
                  : err instanceof Error
                    ? err.message
                    : String(err);
              const h = vm.newString(payload);
              d.reject(h);
              h.dispose();
            }),
        );
      return d.handle;
    });
    vm.setProp(vm.global, "__call", call);
    call.dispose();

    // Build `tools` + `console` inside the sandbox, then remove the raw hooks.
    const prelude = `((hostCall, hostLog) => {
      const fmt = (a) => typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })();
      const out = (...a) => hostLog(...a.map(fmt));
      globalThis.console = { log: out, info: out, warn: out, error: out };
      globalThis.tools = {};
      for (const n of ${JSON.stringify(toolNames)}) {
        tools[n] = (args) =>
          hostCall(n, JSON.stringify(args === undefined ? {} : args))
            .then(JSON.parse, (m) => {
              let o = null;
              try { o = JSON.parse(m); } catch (e) {}
              if (o && o.__toolError) {
                const err = new Error(o.message);
                err.errors = o.errors;
                err.messages = o.messages;
                throw err;
              }
              throw new Error(String(m));
            });
      }
    })(__call, __log);
    delete globalThis.__call;
    delete globalThis.__log;`;
    enterVm();
    vm.unwrapResult(vm.evalCode(prelude, "prelude.js")).dispose();

    // User code runs as the body of an async function.
    const wrapped = `(async () => {
      const __r = await (async () => {\n${code}\n})();
      return JSON.stringify(__r === undefined ? null : __r);
    })()`;
    enterVm();
    const evalRes = vm.evalCode(wrapped, "user-code.js");
    const promiseHandle = vm.unwrapResult(evalRes);
    const resolved = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();
    enterVm();
    runtime.executePendingJobs();

    const outcome = await resolved;
    const valueHandle = vm.unwrapResult(outcome);
    const json = vm.getString(valueHandle);
    valueHandle.dispose();

    if (json.length > o.maxOutputChars) {
      return { result: json.slice(0, o.maxOutputChars) + "…[truncated]", logs };
    }
    return { result: JSON.parse(json), logs };
  } catch (e: any) {
    // QuickJS errors arrive as dumped objects {name, message, stack}
    const msg = e?.message ?? (e?.name ? `${e.name}` : String(e));
    if (cpuUsed > o.cpuMs) return { logs, error: `CPU time limit exceeded (${o.cpuMs}ms)` };
    return { logs, error: msg };
  } finally {
    for (const d of pending) d.dispose(); // avoid leaking handles -> dispose assertion
    pending.clear();
    if (vm.alive) vm.dispose();
    runtime.dispose();
  }
}

interface WorkerInput {
  code: string;
  toolNames: string[];
  opts: Required<SandboxOptions>;
}

type CallReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; details?: { errors: unknown[]; messages: string[] } };

const { code, toolNames, opts } = workerData as WorkerInput;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let nextId = 0;

parentPort!.on("message", (r: CallReply) => {
  const w = waiting.get(r.id);
  if (!w) return;
  waiting.delete(r.id);
  if (r.ok) w.resolve(r.value);
  else w.reject(r.details ? new ToolCallError(r.message, r.details) : new Error(r.message));
});

const bridge: ToolBridge = (name, args) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    parentPort!.postMessage({ type: "call", id, name, args });
  });

run(code, toolNames, bridge, opts).then(
  (result) => parentPort!.postMessage({ type: "done", result }),
  (e) => parentPort!.postMessage({ type: "done", result: { logs: [], error: String(e?.message ?? e) } }),
);
