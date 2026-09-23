import { getAnalyticsClient } from "./apiUtil";
import z from "zod";

interface ApiError extends Error {
  errorCode?: number;
}

export async function retryWithFallback<T>(
  originalOrgId: string[],
  entityId: string,
  entityType: string,
  apiCall: (...args: any[]) => T,
  ...args: any[]
): Promise<T> {
  if (!Array.isArray(originalOrgId)) {
    throw new Error("original_org_id must be passed as a list to allow modification");
  }
  try {
    return await apiCall(originalOrgId[0], ...args);
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.errorCode && (apiError.errorCode === 8084 || apiError.errorCode === 7387)) {
      const properOrgId = await getProperOrgId(entityId, entityType);
      const result = apiCall(properOrgId, ...args);
      originalOrgId[0] = properOrgId;
      return result;
    }
    throw error;
  }
}

async function getWorkspaceOrgId(workspaceId: string): Promise<string> {
  const analyticsClient = getAnalyticsClient();
  const workspaceDetails = await analyticsClient.getWorkspaceDetails(workspaceId);
  const orgId = (workspaceDetails as any).orgId
  return orgId
}

async function getViewOrgId(viewId: string): Promise<string> {
  const analyticsClient = getAnalyticsClient();
  const viewDetails = await analyticsClient.getViewDetails(viewId, { 
    withInvolvedMetaInfo: false 
  });
  const orgId = (viewDetails as any).orgId
  return orgId
}

async function getProperOrgId(entityId: string, entityType: string): Promise<string> {
  if (entityType === "WORKSPACE") {
    return await getWorkspaceOrgId(entityId);
  } else if (entityType === "VIEW") {
    return await getViewOrgId(entityId);
  } else {
    throw new Error(`Unsupported entity type: ${entityType}`);
  }
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


export function logAndReturnError(err: unknown, message: string): MessageContent {
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


export function logAndReturnErrorAsStr(err: unknown, message: string): string {
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
  return `${message}: ${errorMessage}`;
}