import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolResponse, fail, failFromError } from "./response";

export interface ToolContext {
  server: McpServer;
}

export type ToolArgsSchema = Record<string, z.ZodTypeAny>;

export type InferArgs<TSchema extends ToolArgsSchema> =
  z.infer<z.ZodObject<TSchema>>;


export interface ToolDefinition<
  TSchema extends ToolArgsSchema = ToolArgsSchema,
  TReturns extends z.ZodType = z.ZodType
> {
  name: string;
  description: string;
  args: TSchema;
  /** DTO describing the shape of `data` in a successful response. Published through get_signature. */
  returns: TReturns;
  handler: (args: InferArgs<TSchema>, ctx: ToolContext) => Promise<ToolResponse<z.infer<TReturns>>>;
}

class ToolRegistry {

  private readonly tools = new Map<string, ToolDefinition<any, any>>();
  private context: ToolContext | undefined;
 

  register(definition: ToolDefinition<any, any>): this {
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
  ): Promise<ToolResponse> {

    if (!this.context) {
      return fail("[ToolRegistry] Context not set. Call toolRegistry.setContext({ server }) before executing tools.");
    }

    const definition = this.tools.get(toolName);
    if (!definition) {
      return fail(
        `Unknown tool "${toolName}". Please refer to the Zoho Analytics Skill to understand the available tools and invoke them as necessary.`
      );
    }

    const argsSchema = z.object(definition.args).strict();
    const parsed = argsSchema.safeParse(rawArgs);

    if (!parsed.success) {
      return fail(
        parsed.error.issues.map((e) => ({
          message: `Validation failed - ${e.message}`,
          path: e.path.join("."),
        })),
        `Invalid arguments for "${toolName}". Check the tool's signature (get_signature) or the skill reference.`
      );
    }

    try {
      const response = await definition.handler(parsed.data, this.context);
      if (process.env.VALIDATE_TOOL_RESPONSES === "1") this.checkResponse(definition, response);
      return response;
    } catch (err) {
      return failFromError(err, `Tool "${toolName}" threw an unexpected error`);
    }
  }

  /** Dev aid: reports (stderr only) when a handler's `data` does not match its declared DTO. */
  private checkResponse(definition: ToolDefinition<any, any>, response: ToolResponse): void {
    if (!response || typeof response !== "object" || !("status" in response)) {
      console.error(`[DTO] "${definition.name}" did not return a ToolResponse envelope`);
      return;
    }
    if (response.status !== "success") return;
    const check = definition.returns.safeParse(response.data);
    if (!check.success) {
      const issues = check.error.issues.map((i: z.core.$ZodIssue) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.error(`[DTO] "${definition.name}" data does not match its declared DTO - ${issues}`);
    }
  }

  getDefinition(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  list(): Array<{ name: string; description: string }> {
    return [...this.tools.values()].map((d) => ({ name: d.name, description: d.description }));
  }
}
 
export const toolRegistry = new ToolRegistry();

export function defineTool<TSchema extends ToolArgsSchema, TReturns extends z.ZodType>(
  definition: ToolDefinition<TSchema, TReturns>
): void {
  toolRegistry.register(definition);
}


export function registerMasterTool(server: McpServer): void {
  server.registerTool(
    "execute_analytics_tool", {
        description: "Zoho Analytics Master Tool. Executes any registered Zoho Analytics operations (tools) by name and corresponding arguments. Returns a JSON response envelope {status, messages, errors, data}; the tool's result is in `data`.",
        inputSchema: {
            tool_name: z.string().describe("snake_case name of the tool to execute"),
            tool_args: z.record(z.string(), z.unknown()).describe("Arguments for the tool"),
        }
    },
    async ({ tool_name, tool_args }) => {
      const response = await toolRegistry.execute(
        tool_name,
        tool_args as Record<string, unknown>
      );
      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        isError: response.status === "error",
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