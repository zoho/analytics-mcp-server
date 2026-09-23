import { z } from "zod";
import { defineTool } from "../../../tool-registry";
import { getAnalyticsClient, config } from "../../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../../utils/common";

// ---- Tool Registrations ----

defineTool({
  name: "listAggregateFormulas",
  description: `
    Use Case:
    1) Fetches the list of aggregate formulas in a workspace or a specific view/table.
    2) Use this to discover existing aggregate formulas and their expressions before creating new ones or referencing them in reports.

    Important Notes:
    1) If viewId is provided, fetches aggregate formulas for that specific view/table only.
    2) If viewId is not provided, fetches aggregate formulas for the entire workspace.
    3) If formulaNameContainsStr is provided, only formulas whose names contain that string (case-insensitive) are returned.

    Returns:
    A JSON array of aggregate formula objects. Each object contains:
    - formulaId: The unique identifier of the aggregate formula.
    - formulaName: The name of the aggregate formula.
    - expression: The SQL aggregate expression of the formula.
    - description: A description of the aggregate formula (if available).
    - subType: The data sub-type of the formula result (e.g. DECIMAL_NUMBER).
    - tableName: The name of the table the formula belongs to.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    viewId: z
      .string()
      .optional()
      .describe(
        "Optional. The ID of the view/table. If provided, fetches aggregate formulas for that specific view. If not provided, fetches for the entire workspace."
      ),
    formulaNameContainsStr: z
      .string()
      .optional()
      .describe(
        "Optional. If provided, filters and returns only those formulas whose names contain this string (case-insensitive)."
      ),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, viewId, formulaNameContainsStr, orgId }) => {
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
          let formulas: any[];

          if (viewId) {
            const viewInst = ac.getViewInstance(org_id, workspace, viewId);
            formulas = await (viewInst as any).getAggregateFormulas();
          } else {
            const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
            formulas = await (workspaceInst as any).getAggregateFormulas();
          }

          if (!formulas || formulas.length === 0) {
            return ToolResponse("No aggregate formulas found.");
          }

          // Apply name filter if provided
          if (formulaNameContainsStr && formulaNameContainsStr.trim() !== "") {
            const filterStr = formulaNameContainsStr.toLowerCase();
            formulas = formulas.filter(
              (f: any) => f.formulaName && f.formulaName.toLowerCase().includes(filterStr)
            );
            if (formulas.length === 0) {
              return ToolResponse(`No aggregate formulas found matching '${formulaNameContainsStr}'.`);
            }
          }

          // Return only the relevant fields
          const result = formulas.map((f: any) => ({
            formulaId: f.formulaId,
            formulaName: f.formulaName,
            expression: f.expression,
            description: f.description ?? "",
            subType: f.subType,
            tableName: f.tableName,
          }));

          return ToolResponse(JSON.stringify(result));
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while fetching aggregate formulas");
    }
  },
});

defineTool({
  name: "addAggregateFormula",
  description: `
    1. Use Case:
    - Create an aggregate formula in the specified table of a workspace in Zoho Analytics.
    - Use this when the user wants to define a reusable aggregate formula expression on a table.

    2. Important Notes:
    - Aggregate Formulas are select query expressions that return a single aggregate value as output.
    - The expression should always return a valid aggregate value.
    - Any column or table names used in the expression should be enclosed in double quotes. Literal values should be enclosed in single quotes.
    - While the expression can contain complex nested functions, it should always return a single aggregate value.
    - Assume the expression is MySQL-compatible.
    - Note that the tool also supports multi-table aggregate formulas, where the expression can reference columns from related tables (lookups should exist between such tables). In such cases, the expression should use the fully qualified column names (e.g., "TableName"."ColumnName") to avoid ambiguity.
    - Multi-table aggregate formulas should be created with the child table as the base table.
    - Enclose table and column names with double quotes whereas literal values with single quotes in the expression.

    3. Arguments:
    - workspaceId (str): The ID of the workspace.
    - tableId (str): The ID of the table (view) in which to create the aggregate formula.
    - formulaName (str): The name of the aggregate formula.
    - expression (str): The SQL aggregate expression.
        For example: SUM("Revenue") or AVG("Salary") or running_sum(sum("Sales"."Sales"))
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - str: Success message with the created formula ID, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    tableId: z.string().describe("The ID of the table (view) in which to create the aggregate formula"),
    formulaName: z.string().describe("The name of the aggregate formula to create"),
    expression: z
      .string()
      .describe('The SQL aggregate expression, e.g. SUM("Revenue") or running_sum(sum("Sales"."Sales"))'),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, tableId, formulaName, expression, orgId }) => {
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
          const formulaId = await (viewInst as any).addAggregateFormula(formulaName, expression);
          return ToolResponse(`Aggregate formula '${formulaName}' created successfully. Formula ID: ${formulaId}`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the aggregate formula");
    }
  },
});

defineTool({
  name: "editAggregateFormula",
  description: `
    1. Use Case:
    - Edit an existing aggregate formula in Zoho Analytics.
    - Use this to update the aggregate expression or description.

    2. Important Notes:
    - Use listAggregateFormulas (or metadata tools) to find the formulaId of the aggregate formula you want to edit.
    - Aggregate formulas are typically used as measures (e.g. SUM/COUNT/AVG over columns, conditional aggregates, etc.).
    - Any column or table names in the expression should be enclosed in double quotes. Literal values in single quotes.
    - Assume the expression is MySQL-compatible.

    3. Arguments:
    - workspaceId (str): The ID of the workspace.
    - formulaId (str): The ID of the aggregate formula to edit.
    - expression (str): The new aggregate formula expression.
    - description (str | None): Optional. New description for the aggregate formula.
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - str: Success message, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace"),
    formulaId: z.string().describe("The ID of the aggregate formula to edit"),
    expression: z
      .string()
      .describe('The new aggregate formula expression, e.g. SUM(IF("Status" = \'Active\', "Revenue", 0))'),
    description: z
      .string()
      .optional()
      .describe("Optional. New description for the aggregate formula."),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, formulaId, expression, description, orgId }) => {
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
          const wsInst = ac.getWorkspaceInstance(org_id, workspace);
          const sdkConfig: Record<string, string> = {};
          if (description) {
            sdkConfig.description = description;
          }
          await (wsInst as any).editAggregateFormula(formulaId, expression, sdkConfig);
          return ToolResponse(`Aggregate formula (ID: ${formulaId}) updated successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while editing the aggregate formula");
    }
  },
});
