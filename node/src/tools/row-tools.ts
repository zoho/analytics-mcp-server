import { z } from "zod";
import type { ServerInstance } from "../common";
import { getAnalyticsClient } from '../utils/apiUtil';
import { requireOrgId, ToolResponse, logAndReturnError } from "../utils/common";


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
        },
        annotations: {
          title: "Add Row",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, columns }) => {
        try {
            const orgId = requireOrgId();
            const analyticsClient = getAnalyticsClient();
            const view = analyticsClient.getViewInstance(orgId, workspaceId, tableId);
            await view.addRow(columns);
            return ToolResponse("Row added successfully.");
        } catch (err) {
            return logAndReturnError(err, "Error while adding row", { workspaceId, viewId: tableId });
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
        },
        annotations: {
          title: "Delete Rows",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, criteria }) => {
        try {
            const orgId = requireOrgId();
            const analyticsClient = getAnalyticsClient();
            const view = analyticsClient.getViewInstance(orgId, workspaceId, tableId);
            await view.deleteRow(criteria);
            return ToolResponse("Rows deleted successfully.");
        } catch (err) {
            return logAndReturnError(err, "Error while deleting rows", { workspaceId, viewId: tableId });
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
        },
        annotations: {
          title: "Update Rows",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true, //Update is considered idempotent because we expect the input to be the desired final value of the row(s). There is no scope for updating based on current value of the row, which may lead to non-idempotency.
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, columns, criteria }) => {
        try {
            const orgId = requireOrgId();
            const analyticsClient = getAnalyticsClient();
            const view = analyticsClient.getViewInstance(orgId, workspaceId, tableId);
            await view.updateRow(columns, criteria);
            return ToolResponse("Rows updated successfully.");
        } catch (err) {
            return logAndReturnError(err, "Error while updating rows", { workspaceId, viewId: tableId });
        }
    });
}
