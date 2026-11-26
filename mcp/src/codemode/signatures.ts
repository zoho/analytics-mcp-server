import { z } from "zod";
import { toolRegistry } from "../tool-registry";

type JsonSchema = {
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

const INDENT = "  ";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim().replace(/\*\//g, "* /");

function jsDoc(text: string | undefined, indent: string): string {
  if (!text || !text.trim()) return "";
  return `${indent}/** ${oneLine(text)} */\n`;
}

function toTs(schema: JsonSchema | undefined, indent: string): string {
  if (!schema || typeof schema !== "object") return "any";

  if (schema.$ref) return schema.$ref.replace(/^#\/definitions\//, "");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ") || "never";

  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.map((s) => toTs(s, indent)).join(" | ");
  if (schema.allOf) return schema.allOf.map((s) => toTs(s, indent)).join(" & ");

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length === 0) return schema.properties ? objectToTs(schema, indent) : "any";

  return types
    .map((t) => {
      switch (t) {
        case "string":
          return "string";
        case "number":
        case "integer":
          return "number";
        case "boolean":
          return "boolean";
        case "null":
          return "null";
        case "array":
          if (schema.prefixItems) return `[${schema.prefixItems.map((s) => toTs(s, indent)).join(", ")}]`;
          return `Array<${toTs(schema.items, indent)}>`;
        case "object":
          return objectToTs(schema, indent);
        default:
          return "any";
      }
    })
    .join(" | ");
}

function objectToTs(schema: JsonSchema, indent: string): string {
  const keys = Object.keys(schema.properties ?? {});
  const extra = schema.additionalProperties;
  if (keys.length === 0) {
    if (extra && typeof extra === "object") return `Record<string, ${toTs(extra, indent)}>`;
    return "Record<string, any>";
  }
  const inner = indent + INDENT;
  const required = new Set(schema.required ?? []);
  const lines = keys.map((k) => {
    const prop = schema.properties![k];
    const name = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
    return `${jsDoc(prop.description, inner)}${inner}${name}${required.has(k) ? "" : "?"}: ${toTs(prop, inner)};`;
  });
  if (extra && typeof extra === "object") lines.push(`${inner}[key: string]: ${toTs(extra, inner)};`);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

export const ENVELOPE_DECLARATION = `/** Every tool resolves with this envelope. A failed call rejects (Error with .errors and .messages), so on a resolved call \`data\` holds the tool's result. */
type ToolResponse<T> = {
  status: "success" | "error";
  /** Helpful notes, hints and warnings (e.g. suggested next steps, truncation notices) */
  messages: string[];
  errors: Array<{ message: string; code?: string | number; path?: string }>;
  data: T;
};`;

const JSON_SCHEMA_OPTS = { unrepresentable: "any", target: "draft-7" } as const;

function schemaToJson(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  return z.toJSONSchema(schema, { ...JSON_SCHEMA_OPTS, io } as any) as JsonSchema;
}

/**
 * Removes the legacy free-text "Returns" blocks from tool descriptions: the exact return type
 * is published as a DTO in the signature instead.
 */
function stripReturnsBlocks(text: string): string {
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const idx = lines.findIndex((l) => /^\s*(\d+\.\s*)?(<returns>|returns?\s*:)/i.test(l));
      return idx === -1 ? block : lines.slice(0, idx).join("\n");
    })
    .join("\n\n");
}

function cleanDescription(text: string): string {
  return stripReturnsBlocks(text)
    .replace(/<\/?[a-z_]+>/gi, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n * ")
    .replace(/\*\//g, "* /");
}

interface Rendered {
  declaration: string;
  definitions: Record<string, JsonSchema>;
}

function renderTool(name: string): Rendered | undefined {
  const def = toolRegistry.getDefinition(name);
  if (!def) return undefined;

  const definitions: Record<string, JsonSchema> = {};

  let argsType: string;
  try {
    const json = schemaToJson(z.object(def.args), "input");
    Object.assign(definitions, json.definitions ?? {});
    argsType = toTs(json, "");
  } catch {
    argsType = "Record<string, any>";
  }

  let dataType = "any";
  try {
    const json = schemaToJson(def.returns, "output");
    Object.assign(definitions, json.definitions ?? {});
    dataType = toTs(json, "");
  } catch {
    // fall back to any
  }

  const declaration =
    `/**\n * ${cleanDescription(def.description)}\n */\n` +
    `tools.${name}(args: ${argsType}): Promise<ToolResponse<${dataType}>>;`;
  return { declaration, definitions };
}

export function getSignatures(toolNames: string[]): { signatures: string; unknown: string[] } {
  const declarations: string[] = [];
  const definitions: Record<string, JsonSchema> = {};
  const unknown: string[] = [];

  for (const n of toolNames) {
    const rendered = renderTool(n);
    if (!rendered) {
      unknown.push(n);
      continue;
    }
    declarations.push(rendered.declaration);
    Object.assign(definitions, rendered.definitions);
  }

  const typeDecls = Object.entries(definitions).map(([typeName, schema]) => {
    const doc = schema.description ? `/** ${oneLine(schema.description)} */\n` : "";
    return `${doc}type ${typeName} = ${toTs(schema, "")};`;
  });

  const signatures = [...typeDecls, ...declarations].join("\n\n");
  return { signatures, unknown };
}
