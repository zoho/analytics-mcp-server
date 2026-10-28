import { config } from "./apiUtil";
import z from "zod";

const ORG_MISMATCH_ERROR_CODES = [8084, 7387];

export class OrgIdNotSetError extends Error {
  constructor() {
    super("Organization ID is not configured. Please set the ANALYTICS_ORG_ID environment variable and restart the MCP server.");
    this.name = "OrgIdNotSetError";
  }
}

export function requireOrgId(): string {
  const orgId = config.ORGID?.trim();
  if (!orgId) {
    throw new OrgIdNotSetError();
  }
  return orgId;
}

export function isOrgMismatchError(err: unknown): boolean {
  const errorCode = (err as { errorCode?: number } | null | undefined)?.errorCode;
  return errorCode !== undefined && ORG_MISMATCH_ERROR_CODES.includes(Number(errorCode));
}

export interface ErrorContext {
  orgId?: string;
  workspaceId?: string;
  viewId?: string;
}


const messageSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const contentSchema = z.object({
  content: z.array(messageSchema).default([
    { type: "text" as const, text: "No Reponse Message" }
  ]),
});

type MessageContent = z.infer<typeof contentSchema>;

export function ToolResponse(message: string): MessageContent {
  return contentSchema.parse({content: [
    {
      type: 'text',
      text: message,
    },
  ]});
}

export function buildReportPreviewLink(reportId: string): string | null {
  const rawAnalyticsServerUrl = process.env.ANALYTICS_SERVER_URL?.trim();
  if (!rawAnalyticsServerUrl) {
    return null;
  }

  const normalizedBaseUrl = /^https?:\/\//i.test(rawAnalyticsServerUrl)
    ? rawAnalyticsServerUrl
    : `https://${rawAnalyticsServerUrl}`;

  return `${normalizedBaseUrl.replace(/\/+$/, '')}/open-view/${encodeURIComponent(reportId)}`;
}

export function buildReportLinkResponse(action: "generated" | "updated" | "fetched", reportId: string, metadata?: unknown): string {
  const reportLink = buildReportPreviewLink(reportId);
  const lines = [
    `Here's the link of the ${action} report,`,
    "",
    `Report Link: ${reportLink ?? `Unavailable - ANALYTICS_SERVER_URL is not configured. Report ID: ${reportId}`}`,
  ];

  if (metadata !== undefined) {
    lines.push("", "Report Metadata:", JSON.stringify(metadata, null, 2));
  }

  lines.push("", "If you have access to a browser, open it up and load this report and render it to the user");
  return lines.join("\n");
}


export function logAndReturnError(err: unknown, message: string, ctx?: ErrorContext): MessageContent {
  if (err instanceof OrgIdNotSetError) {
    console.error("Error:", err.message);
    return ToolResponse(err.message);
  }

  if (isOrgMismatchError(err)) {
    const errorCode = (err as { errorCode: number }).errorCode;
    const orgId = ctx?.orgId ?? config.ORGID?.trim();
    const ids: string[] = [];
    if (ctx?.workspaceId) ids.push(`Workspace ID: ${ctx.workspaceId}`);
    if (ctx?.viewId) ids.push(`View ID: ${ctx.viewId}`);
    if (orgId) ids.push(`Org ID: ${orgId}`);
    const entity = ctx?.workspaceId && ctx?.viewId ? "workspace or view" : ctx?.viewId ? "view" : "workspace";
    const mismatchMessage =
      `The ${entity} ID provided does not belong to the organization ID set in the ANALYTICS_ORG_ID environment variable. ` +
      `${ids.join(", ")}. ` +
      `Please verify the ID, or update ANALYTICS_ORG_ID to the organization that owns it.`;
    console.error("Error: org mismatch", errorCode, mismatchMessage);
    return ToolResponse(mismatchMessage);
  }

  let errorMessage: string;
  let errorStack: string | undefined;
  if (err instanceof Error) {
    errorMessage = err.message;
    errorStack = err.stack;
  } else {
    try {
      errorMessage = JSON.stringify(err);
    } catch {
      errorMessage = String(err);
    }
  }
  console.error("Error:", errorMessage, errorStack ?? "");
  return ToolResponse(`${message}: ${errorMessage}`);
}