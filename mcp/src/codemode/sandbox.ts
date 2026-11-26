import path from "path";
import { Worker } from "worker_threads";

export interface SandboxOptions {
  timeoutMs?: number; // wall-clock limit for the whole run (worker is terminated)
  cpuMs?: number; // limit on time spent executing inside the VM (excludes tool-call waits)
  memoryBytes?: number; // QuickJS heap limit
  maxToolCalls?: number; // cap on host calls from the sandbox
  maxOutputChars?: number; // cap on serialized result / logs size
}

export interface SandboxResult {
  result?: unknown;
  logs: string[];
  error?: string;
}

/** Thrown by the bridge to reject a sandbox tool call with structured details (exposed as `error.errors` / `error.messages`). */
export class ToolCallError extends Error {
  constructor(
    message: string,
    public details: { errors: unknown[]; messages: string[] },
  ) {
    super(message);
  }
}

export type ToolBridge = (name: string, args: unknown) => Promise<unknown>;

const DEFAULTS: Required<SandboxOptions> = {
  timeoutMs: 60_000,
  cpuMs: 5_000,
  memoryBytes: 64 * 1024 * 1024,
  maxToolCalls: 50,
  maxOutputChars: 100_000,
};

/**
 * Runs untrusted JS in a fresh QuickJS (wasm) instance inside a worker thread. The ONLY capabilities it gets:
 *   - `tools.<name>(args)`  -> async, bridged to the host (JSON in / JSON out)
 *   - `console.log/warn/error` -> captured into `logs`
 * No fs, network, process, require, timers, or host object references.
 */
export async function runInSandbox(
  code: string,
  toolNames: string[],
  bridge: ToolBridge,
  opts: SandboxOptions = {},
): Promise<SandboxResult> {
  const o = { ...DEFAULTS, ...opts };
  const isTs = path.extname(__filename) === ".ts";
  const worker = new Worker(path.join(__dirname, isTs ? "sandbox.worker.ts" : "sandbox.worker.js"), {
    workerData: { code, toolNames, opts: o },
    execArgv: isTs ? ["--require", "tsx/cjs"] : [],
    resourceLimits: { maxOldGenerationSizeMb: Math.max(128, Math.ceil(o.memoryBytes / (1024 * 1024)) * 2) },
  });

  return new Promise<SandboxResult>((resolve) => {
    let settled = false;
    const finish = (r: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ logs: [], error: `Timed out after ${o.timeoutMs}ms` }),
      o.timeoutMs,
    );

    worker.on("message", (m: any) => {
      if (m.type === "done") return finish(m.result);
      if (m.type !== "call") return;
      Promise.resolve()
        .then(() => bridge(m.name, m.args))
        .then(
          (value) => !settled && worker.postMessage({ id: m.id, ok: true, value: value === undefined ? null : value }),
          (err) =>
            !settled &&
            worker.postMessage({
              id: m.id,
              ok: false,
              message: err instanceof Error ? err.message : String(err),
              details: err instanceof ToolCallError ? err.details : undefined,
            }),
        );
    });
    worker.on("error", (e) => finish({ logs: [], error: `Sandbox failed: ${e?.message ?? e}` }));
    worker.on("exit", (c) => finish({ logs: [], error: `Sandbox exited unexpectedly (code ${c})` }));
  });
}
