import { z } from "zod";
import { defineTool } from "../../../tool-registry";
import { getAnalyticsClient, config } from "../../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../../utils/common";

// ---- Shared helpers ----

const DATA_TYPES = [
  "PLAIN",
  "MULTI_LINE",
  "EMAIL",
  "NUMBER",
  "POSITIVE_NUMBER",
  "DECIMAL_NUMBER",
  "CURRENCY",
  "PERCENT",
  "DATE",
  "BOOLEAN",
  "URL",
  "AUTO_NUMBER",
  "GEO",
  "DURATION",
] as const;

// ---- Tool Registration ----

defineTool({
  name: "createTable",
  description: "Create a new table in the given workspace with the given name",
  args: {
    workspaceId: z.string().describe("The ID of the workspace in which to create the table"),
    tableName: z.string().describe("The name of the table to create"),
    columnsArr: z
      .array(
        z.object({
          columnName: z.string().describe("The name of the column"),
          dataType: z
            .enum(["PLAIN", "NUMBER", "DATE", "EMAIL", "CURRENCY", "URL", "POSITIVE_NUMBER", "DECIMAL_NUMBER"])
            .describe("The data type of the column"),
        })
      )
      .describe("A list of column definitions for the table"),
  },
  handler: async ({ workspaceId, tableName, columnsArr }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, tableAlias, cols_arr) => {
          const tableDesign = {
            TABLENAME: tableAlias,
            COLUMNS: cols_arr.map((c: { columnName: string; dataType: string }) => ({
              COLUMNNAME: c.columnName,
              DATATYPE: c.dataType,
            })),
          };
          const analyticsClient = getAnalyticsClient();
          const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
          const tableId = await workspaceInst.createTable(tableDesign);
          return ToolResponse(`Table '${tableName}' created successfully. Table Id: ${tableId}`);
        },
        workspaceId,
        tableName,
        columnsArr
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the table");
    }
  },
});

defineTool({
  name: "addColumn",
  description: `
    Add one or more columns to an existing table in the given workspace.

    arguments:
    - workspaceId: The ID of the workspace containing the table.
    - viewId: The ID of the view (table) to which columns should be added.
    - columns: A list of column definitions to add. Each column supports:
        - columnName (required): The name of the column.
        - dataType (required): One of ${DATA_TYPES.join(", ")}.
        - isPIIColumn (optional, default false): Marks the column as containing personal data.
        - GEOROLE (optional): Geo location type. Required when dataType is GEO.
            Values: 0 - Continent, 1 - Country, 2 - State/Province, 3 - County/District,
            4 - City, 5 - Zip Code, 6 - Latitude, 7 - Longitude, 8 - Airport.

    returns:
    - A summary of the added columns with their column IDs.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the table"),
    viewId: z.string().describe("The ID of the view (table) to which columns should be added"),
    columns: z
      .array(
        z.object({
          columnName: z.string().describe("The name of the column"),
          dataType: z.enum(DATA_TYPES).describe("The data type of the column"),
          isPIIColumn: z
            .boolean()
            .optional()
            .describe("Marks the column as containing personal data. Defaults to false"),
          GEOROLE: z
            .number()
            .int()
            .min(0)
            .max(8)
            .optional()
            .describe(
              "Geo location type. Required when dataType is GEO. 0 - Continent, 1 - Country, 2 - State/Province, 3 - County/District, 4 - City, 5 - Zip Code, 6 - Latitude, 7 - Longitude, 8 - Airport"
            ),
        })
      )
      .min(1)
      .describe("A list of column definitions to add"),
  },
  handler: async ({ workspaceId, viewId, columns }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, view, cols) => {
          const analyticsClient = getAnalyticsClient();
          const viewInst = analyticsClient.getViewInstance(org_id, workspace, view);

          const results: { columnName: string; columnId: string }[] = [];
          for (const col of cols) {
            const configObj: Record<string, any> = {};
            if (col.isPIIColumn !== undefined) {
              configObj.isPIIColumn = col.isPIIColumn;
            }
            if (col.GEOROLE !== undefined) {
              configObj.GEOROLE = col.GEOROLE;
            }
            const columnId = await viewInst.addColumn(col.columnName, col.dataType, configObj);
            results.push({ columnName: col.columnName, columnId });
          }

          const summary = results
            .map((r) => `- ${r.columnName} (Column Id: ${r.columnId})`)
            .join("\n");
          return ToolResponse(
            `Added ${results.length} column(s) to view '${view}':\n${summary}`
          );
        },
        workspaceId,
        viewId,
        columns
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while adding columns");
    }
  },
});

defineTool({
  name: "deleteColumn",
  description: `
    Delete a single column from an existing table in the given workspace.

    arguments:
    - workspaceId: The ID of the workspace containing the table.
    - viewId: The ID of the view (table) from which the column should be deleted.
    - columnId: The ID of the column to delete.
    - deleteDependentViews: Whether to delete the column even when it has dependent views.
        Defaults to false.

    returns:
    - A success message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the table"),
    viewId: z.string().describe("The ID of the view (table) from which the column should be deleted"),
    columnId: z.string().describe("The ID of the column to delete"),
    deleteDependentViews: z
      .boolean()
      .optional()
      .describe("Whether to delete the column even when it has dependent views. Defaults to false"),
  },
  handler: async ({ workspaceId, viewId, columnId, deleteDependentViews }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, view, colId, deleteDependent) => {
          const analyticsClient = getAnalyticsClient();
          const viewInst = analyticsClient.getViewInstance(org_id, workspace, view);
          const configObj: Record<string, any> = {};
          if (deleteDependent !== undefined) {
            configObj.deleteDependentViews = deleteDependent;
          }
          await viewInst.deleteColumn(colId, configObj);
          return ToolResponse(`Column '${colId}' deleted successfully from view '${view}'.`);
        },
        workspaceId,
        viewId,
        columnId,
        deleteDependentViews
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while deleting the column");
    }
  },
});
