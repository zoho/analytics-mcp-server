import { z } from "zod";
import { getAnalyticsClient } from '../../utils/apiUtil';
import { requireOrgId, ToolResponse, logAndReturnError } from "../../utils/common";

// ─────────────────────────────────────────────────────────────────────────────
// createQueryTable
// ─────────────────────────────────────────────────────────────────────────────

export const createQueryTableSchema = {
    workspaceId: z.string().describe("The ID of the workspace in which to create the query table"),
    tableName: z.string().describe("The name of the query table to create"),
    query: z.string().describe("The SQL select query to create the query table"),
};

type CreateQueryTableArgs = z.infer<z.ZodObject<typeof createQueryTableSchema>>;

export async function createQueryTableHandler({
    workspaceId,
    tableName,
    query,
}: CreateQueryTableArgs) {
    try {
        const orgId = requireOrgId();
        const analyticsClient = getAnalyticsClient();
        const workspaceInst = analyticsClient.getWorkspaceInstance(orgId, workspaceId);
        const configParam = {};
        const tableId = await workspaceInst.createQueryTable(query, tableName, configParam);
        return ToolResponse(`Query table '${tableName}' created successfully. Table Id: ${tableId}`);
    } catch (err) {
        return logAndReturnError(err, "An error occurred while creating the query table", { workspaceId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getQueryTableDetails
// ─────────────────────────────────────────────────────────────────────────────

export const getQueryTableDetailsSchema = {
    workspaceId: z.string().describe("The ID of the workspace containing the query table"),
    queryTableId: z.string().describe("The ID of the query table to retrieve details for"),
};

type GetQueryTableDetailsArgs = z.infer<z.ZodObject<typeof getQueryTableDetailsSchema>>;

export async function getQueryTableDetailsHandler({
    workspaceId,
    queryTableId,
}: GetQueryTableDetailsArgs) {
    try {
        const orgId = requireOrgId();
        const ac = getAnalyticsClient();
        const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
        const details = await (workspaceInst as any).getQueryTableDetails(queryTableId);
        delete details.lastDesignModifiedByZuId;
        delete details.createdByZuId;
        delete details.involvedViews;
        delete details.columns;
        delete details.lastDesignModifiedTime;
        return ToolResponse(JSON.stringify(details));
    } catch (err) {
        return logAndReturnError(err, "An error occurred while fetching the query table details", { workspaceId, viewId: queryTableId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// editQueryTable
// ─────────────────────────────────────────────────────────────────────────────

export const editQueryTableSchema = {
    workspaceId: z.string().describe("The ID of the workspace containing the query table"),
    viewId: z.string().describe("The ID of the query table to edit"),
    sqlQuery: z.string().describe("The new SQL select query to set for the query table"),
};

type EditQueryTableArgs = z.infer<z.ZodObject<typeof editQueryTableSchema>>;

export async function editQueryTableHandler({
    workspaceId,
    viewId,
    sqlQuery,
}: EditQueryTableArgs) {
    try {
        const orgId = requireOrgId();
        const analyticsClient = getAnalyticsClient();
        const workspaceInst = analyticsClient.getWorkspaceInstance(orgId, workspaceId);
        await workspaceInst.editQueryTable(viewId, sqlQuery);
        return ToolResponse(`Query table '${viewId}' updated successfully.`);
    } catch (err) {
        return logAndReturnError(err, "An error occurred while editing the query table", { workspaceId, viewId });
    }
}
