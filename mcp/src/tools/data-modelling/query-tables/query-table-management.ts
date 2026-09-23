import { z } from "zod";
import { defineTool } from "../../../tool-registry";
import { getAnalyticsClient, config } from "../../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../../utils/common";

// ---- Tool Registrations ----

defineTool({
  name: "createQueryTable",
  description: "Create a query table in the specified workspace with the given name and SQL query",
  args: {
    workspaceId: z.string().describe("The ID of the workspace in which to create the query table"),
    tableName: z.string().describe("The name of the query table to create"),
    query: z.string().describe("The SQL select query to create the query table"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableName, query, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, table, sql) => {
          const analyticsClient = getAnalyticsClient();
          const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
          const configParam = {};
          const tableId = await workspaceInst.createQueryTable(sql, table, configParam);
          return ToolResponse(`Query table '${table}' created successfully. Table Id: ${tableId}`);
        },
        workspaceId,
        tableName,
        query
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the query table");
    }
  },
});

defineTool({
  name: "editQueryTable",
  description: `
    Edit the SQL query of an existing query table in the specified workspace.

    Use Case:
    - Use this when you need to update or modify the SQL query that defines a query table.

    Important Notes:
    - Only the SQL query can be modified via this tool (CONFIG: sqlQuery).
    - The viewId must be the ID of the query table view (not a regular table or report).

    Returns:
    - A success message if the query table was updated successfully.
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the query table"),
    viewId: z.string().describe("The ID of the query table to edit"),
    sqlQuery: z.string().describe("The new SQL select query to set for the query table"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, viewId, sqlQuery, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, view, sql) => {
          const analyticsClient = getAnalyticsClient();
          const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
          await workspaceInst.editQueryTable(view, sql);
          return ToolResponse(`Query table '${view}' updated successfully.`);
        },
        workspaceId,
        viewId,
        sqlQuery
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while editing the query table");
    }
  },
});

defineTool({
  name: "getQueryTableDetails",
  description: `
    Use Case:
    - Fetches the details of a specific query table in a workspace, including its SQL query and column structure.
    - Use this when you need to inspect or review an existing query table before making changes.

    Important Notes:
    - The queryTableId must be the ID of a query table view (viewType: 6), not a regular table or report.

    Returns:
    - A JSON object containing the query table details (e.g., view name, SQL query, columns).
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the query table"),
    queryTableId: z.string().describe("The ID of the query table to retrieve details for"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, queryTableId, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, qtId) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          const details = await (workspaceInst as any).getQueryTableDetails(qtId);
          return ToolResponse(JSON.stringify(details));
        },
        workspaceId,
        queryTableId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while fetching the query table details");
    }
  },
});
