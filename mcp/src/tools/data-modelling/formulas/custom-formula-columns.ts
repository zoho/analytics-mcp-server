import { z } from "zod";
import { defineTool } from "../../../tool-registry";
import { getAnalyticsClient, config } from "../../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../../utils/common";

// ---- Tool Registrations ----

defineTool({
  name: "listCustomFormulaColumns",
  description: `
    Use Case:
    1) Fetches the list of custom formula columns defined on a specific table in Zoho Analytics.
    2) Use this to discover existing formula columns and their expressions before creating new ones or referencing them in reports.

    What are Custom Formula Columns?
    - Also referred to as formula columns or custom formula columns.
    - Unlike aggregate formulas (which return a single aggregated value), a custom formula column is a derived field defined by a SQL SELECT clause expression.
      It adds a new computed column to the table that is computed row-by-row.

    Important Notes:
    1) Formula columns are always scoped to a specific table (viewId). A tableId is always required.
    2) If formulaNameContainsStr is provided, only formulas whose names contain that string (case-insensitive) are returned.

    Returns:
    A JSON array of custom formula column objects. Each object contains:
    - formulaId: The unique identifier of the formula column.
    - formulaName: The name of the formula column.
    - expression: The SQL SELECT clause expression of the formula column.
    - description: A description of the formula column (if available).
    - tableName: The name of the table the formula column belongs to.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    tableId: z.string().describe("The ID of the table (view) whose formula columns should be listed"),
    formulaNameContainsStr: z
      .string()
      .optional()
      .describe(
        "Optional. If provided, filters and returns only those formula columns whose names contain this string (case-insensitive)."
      ),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableId, formulaNameContainsStr, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const viewInst = ac.getViewInstance(org_id, workspace, tableId);
          let formulas: any[] = await (viewInst as any).getFormulaColumns();

          if (!formulas || formulas.length === 0) {
            return ToolResponse("No custom formula columns found.");
          }

          // Apply name filter if provided
          if (formulaNameContainsStr && formulaNameContainsStr.trim() !== "") {
            const filterStr = formulaNameContainsStr.toLowerCase();
            formulas = formulas.filter(
              (f: any) => f.formulaName && f.formulaName.toLowerCase().includes(filterStr)
            );
            if (formulas.length === 0) {
              return ToolResponse(`No custom formula columns found matching '${formulaNameContainsStr}'.`);
            }
          }

          // Return only the relevant fields
          const result = formulas.map((f: any) => ({
            formulaId: f.formulaId,
            formulaName: f.formulaName,
            expression: f.expression,
            description: f.description ?? "",
            tableName: f.tableName,
          }));

          return ToolResponse(JSON.stringify(result));
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while fetching custom formula columns");
    }
  },
});

defineTool({
  name: "addCustomFormulaColumn",
  description: `
    1. Use Case:
    - Create a custom formula column (derived field) in the specified table of a workspace in Zoho Analytics.
    - Use this when the user wants to add a new computed column to a table using a SQL SELECT clause expression.

    2. What are Custom Formula Columns?
    - Also referred to as formula columns or custom formula columns.
    - Unlike aggregate formulas (which return a single aggregated value), a custom formula column is defined by a SQL SELECT clause expression and represents a row-level derived field.
    - The expression should return a scalar value per row (not an aggregated value).
    - Any column or table names used in the expression should be enclosed in double quotes. Literal values should be enclosed in single quotes.
    - Assume the expression is MySQL-compatible.

    3. Arguments:
    - workspaceId (str): The ID of the workspace.
    - tableId (str): The ID of the table (view) in which to create the formula column.
    - formulaName (str): The name of the formula column to create.
    - expression (str): The SQL SELECT clause expression, e.g. "Price" * "Quantity" or IF("Status" = 'Active', 1, 0)
    - description (str | None): Optional description of the formula column.
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - str: Success message with the created formula column ID, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    tableId: z.string().describe("The ID of the table (view) in which to create the formula column"),
    formulaName: z.string().describe("The name of the formula column to create"),
    expression: z
      .string()
      .describe('The SQL SELECT clause expression for the derived field, e.g. "Price" * "Quantity" or IF("Status" = \'Active\', 1, 0)'),
    description: z
      .string()
      .optional()
      .describe("Optional description of the formula column"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableId, formulaName, expression, description, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const viewInst = ac.getViewInstance(org_id, workspace, tableId);
          const sdkConfig: Record<string, string> = {};
          if (description) {
            sdkConfig.description = description;
          }
          const formulaId = await (viewInst as any).addFormulaColumn(formulaName, expression, sdkConfig);
          return ToolResponse(`Custom formula column '${formulaName}' created successfully. Formula ID: ${formulaId}`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the custom formula column");
    }
  },
});

defineTool({
  name: "editCustomFormulaColumn",
  description: `
    1. Use Case:
    - Edit an existing custom formula column in the specified table of a workspace in Zoho Analytics.
    - Use this to update the expression or description of an existing formula column.

    2. Important Notes:
    - Use listCustomFormulaColumns to find the formulaId of the formula column you want to edit.
    - The expression should be a SQL SELECT clause expression (row-level derived field), not an aggregate expression.
    - Any column or table names in the expression should be enclosed in double quotes. Literal values in single quotes.
    - Assume the expression is MySQL-compatible.

    3. Arguments:
    - workspaceId (str): The ID of the workspace.
    - tableId (str): The ID of the table (view) that owns the formula column.
    - formulaId (str): The ID of the formula column to edit.
    - expression (str): The new SQL SELECT clause expression.
    - description (str | None): Optional. New description for the formula column.
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - str: Success message, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    tableId: z.string().describe("The ID of the table (view) that owns the formula column"),
    formulaId: z.string().describe("The ID of the formula column to edit"),
    expression: z
      .string()
      .describe('The new SQL SELECT clause expression, e.g. "Price" * "Quantity" or IFNULL("Revenue", 0)'),
    description: z
      .string()
      .optional()
      .describe("Optional. New description for the formula column."),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableId, formulaId, expression, description, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const viewInst = ac.getViewInstance(org_id, workspace, tableId);
          const sdkConfig: Record<string, string> = {};
          if (description) {
            sdkConfig.description = description;
          }
          await (viewInst as any).editFormulaColumn(formulaId, expression, sdkConfig);
          return ToolResponse(`Custom formula column (ID: ${formulaId}) updated successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while editing the custom formula column");
    }
  },
});

defineTool({
  name: "deleteCustomFormulaColumn",
  description: `
    1. Use Case:
    - Delete an existing custom formula column from a table in Zoho Analytics.
    - Use this when the user wants to permanently remove a formula column from a table.

    2. Important Notes:
    - Use listCustomFormulaColumns to find the formulaId of the formula column you want to delete.
    - This operation is irreversible. Confirm with the user before proceeding.

    3. Arguments:
    - workspaceId (str): The ID of the workspace.
    - tableId (str): The ID of the table (view) that owns the formula column.
    - formulaId (str): The ID of the formula column to delete.
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - str: Success message, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    tableId: z.string().describe("The ID of the table (view) that owns the formula column"),
    formulaId: z.string().describe("The ID of the formula column to delete"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableId, formulaId, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const viewInst = ac.getViewInstance(org_id, workspace, tableId);
          await (viewInst as any).deleteFormulaColumn(formulaId);
          return ToolResponse(`Custom formula column (ID: ${formulaId}) deleted successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while deleting the custom formula column");
    }
  },
});
