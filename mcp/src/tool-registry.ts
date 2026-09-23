import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolContext {
  server: McpServer;
}

export type ToolArgsSchema = Record<string, z.ZodTypeAny>;

export type InferArgs<TSchema extends ToolArgsSchema> =
  z.infer<z.ZodObject<TSchema>>;


export interface ToolDefinition<TSchema extends ToolArgsSchema = ToolArgsSchema> {
  name: string;
  description: string;
  args: TSchema;
  handler: (args: InferArgs<TSchema>, ctx: ToolContext) => Promise<unknown>;
}
 
export interface ToolSuccess { ok: true;  result: unknown }
export interface ToolError   { ok: false; error:  string }
export type ToolResult = ToolSuccess | ToolError;
 
class ToolRegistry {

  private readonly tools = new Map<string, ToolDefinition<any>>();
  private context: ToolContext | undefined;
 

  register(definition: ToolDefinition<any>): this {
    if (this.tools.has(definition.name)) {
      throw new Error(
        `[ToolRegistry] "${definition.name}" is already registered. Names must be unique.`
      );
    }
    this.tools.set(definition.name, definition);
    return this;
  }
 

  setContext(ctx: ToolContext): this {
    this.context = ctx;
    return this;
  }
 

  async execute(
    toolName: string,
    rawArgs: Record<string, unknown>
  ): Promise<ToolResult> {
 
    if (!this.context) {
      return {
        ok: false,
        error: "[ToolRegistry] Context not set. Call toolRegistry.setContext({ server }) before executing tools.",
      };
    }
 
    const definition = this.tools.get(toolName);
    if (!definition) {
      const available = [...this.tools.keys()].join(", ");
      return {
        ok: false,
        error: `Unknown tool "${toolName}".`,
      };
    }
 

    const argsSchema = z.object(definition.args).strict();
    const parsed = argsSchema.safeParse(rawArgs);
 
    if (!parsed.success) {
      const messages = parsed.error.issues
        .map((e) => `"${e.path.join(".")}": ${e.message}`)
        .join("; ");
      return { ok: false, error: `Validation failed - ${messages}` };
    }
 
    try {
      const result = await definition.handler(parsed.data, this.context);
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Handler threw: ${message}` };
    }
  }
 
 
  list(): Array<{ name: string; description: string }> {
    return [...this.tools.values()].map((d) => ({ name: d.name, description: d.description }));
  }
}
 
export const toolRegistry = new ToolRegistry();

export function defineTool<TSchema extends ToolArgsSchema>(
  definition: ToolDefinition<TSchema>
): void {
  toolRegistry.register(definition);
}


export function registerMasterTool(server: McpServer): void {
  server.registerTool(
    "execute_analytics_tool", {
        description: "Zoho Analytics Master Tool. Executes any registered Zoho Analytics operations (tools) by name and corresponding arguments. Returns the result of the tool execution.",
        inputSchema: {
            tool_name: z.string().describe("snake_case name of the tool to execute"),
            tool_args: z.record(z.string(), z.unknown()).describe("Arguments for the tool"),
        }
    },
    async ({ tool_name, tool_args }) => {
      const result = await toolRegistry.execute(
        tool_name,
        tool_args as Record<string, unknown>
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }
  );
}




/*
How to register a tool:


defineTool({
  name: "get_view_summary",
  description: "Uses LLM sampling to generate a natural-language summary of a view.",
  args: {
    workspace_id: z.string().describe("ID of the workspace containing the view"),
    view_id:      z.string().describe("ID of the view to summarise"),
  },
  // args is fully typed: { workspace_id: string; view_id: string }
  // No <TArgs> annotation needed — TypeScript infers it from `args` above.
  handler: async ({ workspace_id, view_id }, ctx) => {
    const prompt = `Summarize Zoho Analytics view "${view_id}" in workspace "${workspace_id}" in two sentences.`;
 
    const response = await ctx.server.server.createMessage({
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens: 500,
    });
 
    const summary = response.content.type === "text" ? response.content.text : "(no summary)";
    return { summary };
  },
});
*/