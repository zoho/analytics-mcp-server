import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolRegistry } from "../tool-registry";
import { runInSandbox, ToolCallError } from "./sandbox";
import { getSandboxOptions } from "./config";
import { getSignatures, ENVELOPE_DECLARATION } from "./signatures";

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/**
 * Calls a tool and returns its response envelope ({status, messages, errors, data}).
 * An error response rejects the call, so a successful `await tools.x()` always has usable `data`.
 */
async function bridge(name: string, args: unknown): Promise<unknown> {
  const response = await toolRegistry.execute(name, (args ?? {}) as Record<string, unknown>);
  if (response.status === "error") {
    const text = response.errors
      .map((e) => `${e.path ? `[${e.path}] ` : ""}${e.code !== undefined ? `(${e.code}) ` : ""}${e.message}`)
      .join("; ");
    throw new ToolCallError(`${name} failed: ${text || "unknown error"}`, {
      errors: response.errors,
      messages: response.messages,
    });
  }
  return response;
}

export function registerCodeModeTools(server: McpServer): void {
  server.registerTool(
    "get_signature",
    {
      description:
        "Returns the TypeScript signatures of Zoho Analytics tools: argument types, optionality, descriptions, " +
        "and the exact type of the `data` each tool returns. " +
        "so they can be called correctly from `execute_code` as `tools.<toolName>(args)`. " +
        "Call this BEFORE using a tool in `execute_code`. Pass an empty list to get all available tool names.",
      inputSchema: {
        tool_names: z
          .array(z.string())
          .describe("camelCase names of the tools, e.g. [\"queryData\", \"getViewDetails\"]. Empty list returns all tool names."),
      },
    },
    async ({ tool_names }) => {
      if (tool_names.length === 0) {
        return asText("No Tool names are provided. Please load the zoho-analytics-skill to explore the available tools and learn how to use them.");
      }
      const { signatures, unknown } = getSignatures(tool_names);
      let text = signatures ? `${ENVELOPE_DECLARATION}\n\n${signatures}` : "";
      if (unknown.length > 0) {
        text += `${text ? "\n\n" : ""}// Unknown tools: ${unknown.join(", ")}. Available tools: ${toolRegistry.names().join(", ")}`;
      }
      return { ...asText(text), isError: signatures === "" };
    },
  );

  server.registerTool(
    "execute_code",
    {
      description:
        "Runs JavaScript in a sandbox (QuickJS) to chain, loop over or batch Zoho Analytics tools in ONE call, " +
        "instead of many separate execute_analytics_tool calls. " +
        "Inside the code, every Zoho Analytics tool is an async function: `await tools.<toolName>(args)`. " +
        "Call `get_signature` first with the tool names you intend to use to learn their argument types. " +
        "Write the body of an async function: use `await`, `return` the final value (must be JSON-serializable), " +
        "and `console.log` for debugging (captured in `logs`). " +
        "Every tool resolves with a typed envelope `{ status, messages, errors, data }`; the tool's result is in `data` " +
        "(its type is given by get_signature). If a tool fails, the call rejects with an Error " +
        "(with `.errors` and `.messages`), so use try/catch only when you want to handle failures; otherwise " +
        "`const { data } = await tools.x(...)` can be used directly and piped into the next call. " +
        "No network, filesystem, timers or `require`; execution is limited by time, memory and number of tool calls.",
      inputSchema: {
        code: z.string().describe("JavaScript body of an async function"),
      },
    },
    async ({ code }) => {
      const toolNames = toolRegistry.names();
      const out = await runInSandbox(code, toolNames, bridge, getSandboxOptions());
      return { ...asText(out), isError: out.error !== undefined };
    },
  );
}
