import { z } from "zod";
import type { ServerInstance } from "../common";
import { getAnalyticsClient, config } from '../utils/apiUtil';
import { retryWithFallback } from "../utils/common";
import { ToolResponse, logAndReturnError } from "../utils/common";


export function registerRowTools(server: ServerInstance) {

    server.registerTool("addRow",
    {
        description: `
        <use_case>
        Adds a new row to the specified table.
        </use_case>
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace where the table is located"),
            tableId: z.string().describe("The ID of the table to which the row will be added"),
            columns: z.record(z.string(), z.string()).describe("A dictionary containing the column names and their corresponding values for the new row"),
            orgId: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Add Row",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, columns, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, table, cols) => {
                const analyticsClient = getAnalyticsClient();
                const view = analyticsClient.getViewInstance(org_id || "", workspace, table);
                await view.addRow(cols);
                return ToolResponse("Row added successfully.");
            },workspaceId, tableId, columns);
        } catch (err) {
            return logAndReturnError(err, "Error while adding row");
        }
    });

    server.registerTool("deleteRows",
    {
        description: `
        <use_case>
        Deletes rows from the specified table based on the given criteria.
        </use_case>
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace where the table is located"),
            tableId: z.string().describe("The ID of the table from which rows will be deleted"),
            criteria: z.string().describe("A string representing the criteria for selecting rows to delete. Example criteria: \"\\\"SalesTable\\\".\\\"Region\\\"='East'\""),
            orgId: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Delete Rows",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, criteria, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, table, crit) => {
                const analyticsClient = getAnalyticsClient();
                const view = analyticsClient.getViewInstance(org_id || "", workspace, table);
                await view.deleteRow(crit);
                return ToolResponse("Rows deleted successfully.");
            }, workspaceId, tableId, criteria);
        } catch (err) {
            return logAndReturnError(err, "Error while deleting rows");
        }
    });

    server.registerTool("updateRows",
    {
        description: `
        <use_case>
        Updates rows in the specified table based on the given criteria.
        </use_case>
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace where the table is located"),
            tableId: z.string().describe("The ID of the table to be updated"),
            columns: z.record(z.string(), z.string()).describe("A dictionary containing the column names and their new values for the update"),
            criteria: z.string().describe("A string representing the criteria for selecting rows to update. Example criteria: \"\\\"SalesTable\\\".\\\"Region\\\"='East'\""),
            orgId: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Update Rows",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true, //Update is considered idempotent because we expect the input to be the desired final value of the row(s). There is no scope for updating based on current value of the row, which may lead to non-idempotency.
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, columns, criteria, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, table, crit, cols) => {
                const analyticsClient = getAnalyticsClient();
                const view = analyticsClient.getViewInstance(org_id, workspace, table);
                await view.updateRow(cols, crit);
                return ToolResponse("Rows updated successfully.");
            }, workspaceId, tableId, criteria, columns);
        } catch (err) {
            return logAndReturnError(err, "Error while updating rows");
        }
    });
}
