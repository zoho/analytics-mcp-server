import { z } from "zod";
import { defineTool } from "../../../tool-registry";
import { getAnalyticsClient, config } from "../../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../../utils/common";

// ---- Tool Registrations ----

defineTool({
  name: "createLookup",
  description: `
    Creates a lookup relationship between two columns across two tables. A lookup is a relationship between two tables that connects a column in one table to a matching column in another table. A lookup tells the system that these two columns are related, allowing you to combine data from both tables in reports/dashboards/multi-table aggregate formulas.

    The direction of the relationship flows from source → target.
    For ONE_TO_MANY: source is the "one" (parent) side, target is the "many" (child) side.
    For ONE_TO_ONE and MANY_TO_MANY: source/target order is arbitrary but must be consistent.
    MANY_TO_ONE is not supported directly - swap the source and target and use ONE_TO_MANY instead.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing both tables"),
    sourceTableId: z.string().describe("ID of the source (typically parent/one-side) table"),
    sourceColumnId: z.string().describe("ID of the column in the source table to link from"),
    targetTableId: z.string().describe("ID of the target (typically child/many-side) table"),
    targetColumnId: z.string().describe("ID of the column in the target table to link to"),
    relationshipType: z
      .enum(["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY", "MANY_TO_ONE"])
      .describe(
        "Nature of the relationship. MANY_TO_ONE will be automatically converted to ONE_TO_MANY by swapping source and target."
      ),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({
    workspaceId,
    sourceTableId,
    sourceColumnId,
    targetTableId,
    targetColumnId,
    relationshipType,
    orgId,
  }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }

      // MANY_TO_ONE → swap source/target and use ONE_TO_MANY
      let effectiveRelationType = relationshipType;
      let effectiveSourceTableId = sourceTableId;
      let effectiveSourceColumnId = sourceColumnId;
      let effectiveTargetTableId = targetTableId;
      let effectiveTargetColumnId = targetColumnId;

      if (relationshipType === "MANY_TO_ONE") {
        effectiveRelationType = "ONE_TO_MANY";
        effectiveSourceTableId = targetTableId;
        effectiveSourceColumnId = targetColumnId;
        effectiveTargetTableId = sourceTableId;
        effectiveTargetColumnId = sourceColumnId;
      }

      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, srcTable, srcCol, tgtTable, tgtCol, relType) => {
          const ac = getAnalyticsClient();
          const viewInstance = ac.getViewInstance(org_id || "", workspace, srcTable);
          const references = [
            {
              viewId: tgtTable,
              columnId: tgtCol,
              relationType: relType,
            },
          ];
          await (viewInstance as any).addLookupV2(srcCol, references, {});
          return ToolResponse(
            `Lookup relationship created successfully. Source table: ${srcTable}, Source column: ${srcCol} → Target table: ${tgtTable}, Target column: ${tgtCol}, Relationship type: ${relType}`
          );
        },
        workspaceId,
        effectiveSourceTableId,
        effectiveSourceColumnId,
        effectiveTargetTableId,
        effectiveTargetColumnId,
        effectiveRelationType
      );
    } catch (err: any) {
      const errorCode = err?.errorCode;
      const errorMessage = err?.errorMessage;
      if (errorCode !== undefined) {
        return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while creating the lookup"}`);
      }
      return logAndReturnError(err, "An error occurred while creating the lookup");
    }
  },
});

defineTool({
  name: "deleteLookup",
  description: "Remove a lookup relationship for a specified column in a table (view).",
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the table"),
    viewId: z.string().describe("The ID of the view (table) from which to remove the lookup"),
    columnId: z.string().describe("The ID of the column whose lookup relationship should be removed"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, viewId, columnId, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, view, col) => {
          const ac = getAnalyticsClient();
          const viewInstance = ac.getViewInstance(org_id || "", workspace, view);
          await (viewInstance as any).removeLookup(col, {});
          return ToolResponse(`Lookup relationship for column ${col} in view ${view} removed successfully.`);
        },
        workspaceId,
        viewId,
        columnId
      );
    } catch (err: any) {
      const errorCode = err?.errorCode;
      const errorMessage = err?.errorMessage;
      if (errorCode !== undefined) {
        return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while removing the lookup"}`);
      }
      return logAndReturnError(err, "An error occurred while removing the lookup");
    }
  },
});
