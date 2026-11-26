export interface ToolErrorDetail {
  message: string;
  /** Zoho Analytics error code, when available */
  code?: string | number;
  /** Name of the offending argument/field, when applicable */
  path?: string;
}

/**
 * The single response envelope returned by every tool.
 * - status:   "success" or "error"
 * - messages: human-readable notes, hints and warnings (e.g. suggested next steps, truncation notices)
 * - errors:   populated only when status is "error"
 * - data:     the tool's typed payload (see the tool's `returns` DTO); null on error
 */
export interface ToolResponse<T = unknown> {
  status: "success" | "error";
  messages: string[];
  errors: ToolErrorDetail[];
  data: T | null;
}

const toArray = (m?: string | string[]): string[] =>
  m === undefined ? [] : Array.isArray(m) ? m : [m];

export function ok<T>(data: T, messages?: string | string[]): ToolResponse<T> {
  return { status: "success", messages: toArray(messages), errors: [], data };
}

export function fail(
  errors: string | ToolErrorDetail | Array<string | ToolErrorDetail>,
  messages?: string | string[]
): ToolResponse<never> {
  const list = Array.isArray(errors) ? errors : [errors];
  return {
    status: "error",
    messages: toArray(messages),
    errors: list.map((e) => (typeof e === "string" ? { message: e } : e)),
    data: null,
  };
}

function describeError(err: unknown): { text: string; code?: string | number } {
  if (err && typeof err === "object") {
    const e = err as { errorCode?: string | number; errorMessage?: string; message?: string };
    const code = e.errorCode !== undefined ? e.errorCode : undefined;
    if (typeof e.errorMessage === "string" && e.errorMessage) return { text: e.errorMessage, code };
    if (err instanceof Error) return { text: err.message, code };
    try {
      return { text: JSON.stringify(err), code };
    } catch {
      return { text: String(err), code };
    }
  }
  return { text: String(err) };
}

/** Logs the error to stderr and converts it into an error response. */
export function failFromError(err: unknown, message: string, messages?: string | string[]): ToolResponse<never> {
  const { text, code } = describeError(err);
  console.error("Error:", text, err instanceof Error ? (err.stack ?? "") : "");
  return fail({ message: `${message}: ${text}`, ...(code !== undefined ? { code } : {}) }, messages);
}
