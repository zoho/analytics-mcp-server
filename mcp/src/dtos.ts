import { z } from "zod";

/**
 * Shared DTOs used in tool `returns` schemas.
 * Schemas given an `id` via `.meta()` are published once by get_signature and referenced by name.
 * Zoho pass-through objects are declared with `looseObject`: the listed fields are guaranteed,
 * other fields returned by Zoho Analytics may also be present.
 */

export const WorkspaceDto = z
  .looseObject({
    workspaceId: z.string(),
    workspaceName: z.string(),
    workspaceDesc: z.string().nullish(),
    orgId: z.string().nullish(),
    createdTime: z.string().nullish().describe("Creation time, epoch milliseconds as a string"),
    createdBy: z.string().nullish().describe("Email of the creator"),
    isDefault: z.boolean().nullish(),
    owned: z.boolean().nullish().describe("true when the workspace is owned by the user, false when shared"),
  })
  .meta({ id: "Workspace", description: "A Zoho Analytics workspace" });

export const ViewSummaryDto = z
  .looseObject({
    viewId: z.string(),
    viewName: z.string(),
    viewDesc: z.string().nullish(),
    viewType: z
      .string()
      .nullish()
      .describe(
        "Table, QueryTable, AnalysisView (chart report), SummaryView, Pivot or Dashboard. Not returned when searching with naturalLanguageQuery; the fields below are then absent too"
      ),
    parentViewId: z.string().nullish().describe("For reports: ID of the base table; empty string otherwise"),
    folderId: z.string().nullish().describe("ID of the containing folder; null when the view is not in a folder"),
    createdTime: z.string().nullish().describe("Epoch milliseconds as a string"),
    createdBy: z.string().nullish(),
    lastModifiedTime: z.string().nullish().describe("Epoch milliseconds as a string"),
    lastModifiedBy: z.string().nullish(),
    isFavorite: z.boolean().nullish(),
    sharedBy: z.string().nullish().describe("Empty string when the view is not shared"),
  })
  .meta({ id: "ViewSummary", description: "Short description of a view (table, query table, report, ...)" });

export const FolderDto = z
  .looseObject({
    folderId: z.string(),
    folderName: z.string(),
    folderDesc: z.string().nullish(),
    folderIndex: z.number().nullish().describe("Position of the folder in the workspace"),
    parentFolderId: z.string().nullish().describe('"-1" for a root-level folder, otherwise the parent folder ID'),
    isDefault: z.boolean().nullish(),
  })
  .meta({ id: "Folder", description: "A folder in a workspace" });

export const ColumnDto = z
  .looseObject({
    columnId: z.string().nullish(),
    columnName: z.string(),
    dataType: z.string().nullish().describe("e.g. PLAIN, NUMBER, DECIMAL_NUMBER, POSITIVE_NUMBER, DATE_AS_DATE"),
    dataTypeName: z.string().nullish().describe("Display name of the data type, e.g. Plain Text, Number, Date"),
    columnDesc: z.string().nullish(),
    columnMaxSize: z.number().nullish(),
    isNullable: z.boolean().nullish(),
    isHidden: z.boolean().nullish(),
    isPIIColumn: z.boolean().nullish(),
    sortedOrder: z.number().nullish(),
    sortedIndex: z.number().nullish(),
    thousandSeparator: z.string().nullish().describe("Number columns only"),
    decimalSeparator: z.string().nullish().describe("Number columns only"),
    decimalPlaces: z.number().nullish().describe("Number columns only; -1 when not fixed"),
    dateFormat: z.string().nullish().describe("Date columns only"),
  })
  .meta({ id: "Column", description: "A column of a table / query table" });

export const FormulaDto = z
  .looseObject({
    formulaId: z.string().nullish(),
    formulaName: z.string().nullish(),
    expression: z.string().nullish(),
  })
  .meta({ id: "Formula", description: "An aggregate formula or custom formula column" });

/** A view referenced by another view (base tables of a report, query table, dashboard). */
export const InvolvedViewDto = z.looseObject({
  viewId: z.string(),
  viewName: z.string(),
  viewType: z.string().describe("Same vocabulary as ViewSummary.viewType, e.g. Table, QueryTable, AnalysisView"),
});

/** `data` of tools that create an object and return its id. */
export const idResult = (idName: string, description: string) =>
  z.object({ [idName]: z.string().describe(description) });

/** `data` of tools that perform an action and have nothing to return. */
export const NoData = z.null();

/** `data` of tools that list objects. */
export const listResult = <T extends z.ZodType>(key: string, item: T) =>
  z.object({ [key]: z.array(item), count: z.number().describe("Number of items returned") });
