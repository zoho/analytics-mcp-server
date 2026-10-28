import { z } from "zod";
import type { ServerInstance } from "../common";
import { getAnalyticsClient } from '../utils/apiUtil';
import { requireOrgId, isOrgMismatchError, ToolResponse, logAndReturnError } from "../utils/common";
import dedent from "dedent";
import { PRODUCT_NAME } from "../config/product";
import { createChartReportSchema, createChartReportHandler, createSummaryReportSchema, createSummaryReportHandler, createPivotReportSchema, createPivotReportHandler, updateChartSchema, updateChartHandler } from "./handlers/reports";
import { createQueryTableSchema, createQueryTableHandler, editQueryTableSchema, editQueryTableHandler } from "./handlers/query-tables";

export function registerModellingTools(server: ServerInstance) {

    server.registerTool("addAggregateFormula",
    {
        description: dedent`
        1. Use Case:
        - Create an aggregate formula in the specified table of a workspace in ${PRODUCT_NAME}.
        - Use this when the user wants to define a reusable aggregate formula expression on a table.

        2. Important Notes:
        - Aggregate Formulas are select query expressions that return a single aggregate value as output.
        - The expression should always return a valid aggregate value.
        - Any column or table names used in the expression should be enclosed in double quotes. Literal values should be enclosed in single quotes.
        - While the expression can contain complex nested functions, it should always return a single aggregate value.
        - Assume the expression is MySQL-compatible.
        - Note that the tool also supports multi-table aggregate formulas, where the expression can reference columns from related tables (lookups should exist between such tables). In such cases, the expression should use the fully qualified column names (e.g., "TableName"."ColumnName") to avoid ambiguity.
        - Multi-table aggregate formulas should be created with the child table as the base table.
        - Enclose table and column names with dobule quotes whereas literal values with single quotes in the expression.

        3. Arguments:
        - workspaceId (str): The ID of the workspace.
        - tableId (str): The ID of the table (view) in which to create the aggregate formula.
        - formulaName (str): The name of the aggregate formula.
        - expression (str): The SQL aggregate expression.
            For example: SUM("Revenue") or AVG("Salary") or running_sum(sum("Sales"."Sales"))

        4. Returns:
        - str: Success message with the created formula ID, or an error message.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace"),
            tableId: z.string().describe("The ID of the table (view) in which to create the aggregate formula"),
            formulaName: z.string().describe("The name of the aggregate formula to create"),
            expression: z.string().describe('The SQL aggregate expression, e.g. SUM("Revenue") or running_sum(sum("Sales"."Sales"))'),
        },
        annotations: {
            title: "Add Aggregate Formula",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, formulaName, expression }) => {
        try {
            const orgId = requireOrgId();
            console.error(`[addAggregateFormula] Creating aggregate formula '${formulaName}' in table '${tableId}' of workspace '${workspaceId}'`);
            const ac = getAnalyticsClient();
            const viewInst = ac.getViewInstance(orgId, workspaceId, tableId);
            console.error(`[addAggregateFormula] Calling ViewAPI.addAggregateFormula for formula: '${formulaName}', expression: '${expression}'`);
            const formulaId = await viewInst.addAggregateFormula(formulaName, expression);
            console.error(`[addAggregateFormula] Successfully created aggregate formula. Formula ID: ${formulaId}`);
            return ToolResponse(`Aggregate formula '${formulaName}' created successfully. Formula ID: ${formulaId}`);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the aggregate formula", { workspaceId, viewId: tableId });
        }
    });


    server.registerTool("createWorkspace",
    {
        description: `Create a new workspace in ${PRODUCT_NAME} with the given name`,
        inputSchema: {
        workspaceName: z.string().describe("Name of the workspace to create")
        },
        annotations: {
          title: "Create Workspace",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceName }) => {
        try {
            const orgId = requireOrgId();
            const ac = getAnalyticsClient();
            const org = ac.getOrgInstance(orgId);
            const configParam = {};
            const workspace_id = await org.createWorkspace(workspaceName, configParam);
            return ToolResponse(`Workspace '${workspaceName}' created successfully. Workspace Id: ${workspace_id}`);
        } catch (err) {
            if (
                typeof err === "object" &&
                err !== null &&
                "errorCode" in err
            ) {
                const errorCode = (err as { errorCode: number }).errorCode;
                if (errorCode === 7101) {
                return ToolResponse("Workspace name is already taken. Provide an alternate name.");
                }
            }
            return logAndReturnError(err, "An error occurred while creating the workspace");
        }
    });


    server.registerTool("createTable",
    {
        description: "Create a new table in the given workspace with the given name",
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace in which to create the table"),
            tableName: z.string().describe("The name of the table to create"),
            columnsArr: z.array(z.object({
                COLUMNNAME: z.string().describe("The name of the column"),
                DATATYPE: z.enum(["PLAIN", "NUMBER", "DATE", "EMAIL", "CURRENCY", "URL", "POSITIVE_NUMBER", "DECIMAL_NUMBER"]).describe("The data type of the column")
            })).describe("A list of column definitions for the table"),
        },
        annotations: {
          title: "Create Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, columnsArr }) => {
        try {
            const orgId = requireOrgId();
            const tableDesign = {
                TABLENAME: tableName,
                COLUMNS: columnsArr
            };
            const analyticsClient = getAnalyticsClient();
            const workspaceInst = analyticsClient.getWorkspaceInstance(orgId, workspaceId);
            const tableId = await workspaceInst.createTable(tableDesign);
            return ToolResponse(`Table '${tableName}' created successfully. Table Id: ${tableId}`);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the table", { workspaceId });
        }
    });

    server.registerTool("createChartReport",
    {
    description: dedent`
    1. Use Cases:
    - Create a chart report in the specified workspace for a table in ${PRODUCT_NAME}.
    - Use this to generate visual representations of data using various chart types.

    2. Important Notes:
    - A chart is a report that visually represents data from a table or multiple related tables.
    - Charts can include filters to narrow down the dataset.
    - Multiple axis columns of the same type are supported (e.g., multiple yAxis for multi-measure charts).
    - For numeric columns: use "measure" as operation to treat as a continuous numeric value, "dimension" to treat as categorical data.
    - For string columns: use "actual" for raw values, or "count"/"distinctCount" for aggregations.
    - For date columns: use time-part operations like "year", "month", "week", "fullDate", etc.
    - "sizeAxis" is required for bubble and packed bubble charts.
    - Use "colorAxis" to add a color dimension/aggregate to support chart coloring.
    - Use your best judgement to pick the chart for the task and the right operation types for each axis based on the chart type and column types.
      The tool will validate compatibility and return a detailed error if the column/operation configuration is invalid for the specified chart type.
    - Validate the correctness of the individual values provided in filter using queryData tool.
    - columns provided in axis columns can belong to multiple different yet related tables (related via a lookup relationship)

    3. Arguments:
    - workspaceId (str): ID of the workspace to create the chart in.
    - tableName (str): The base table name for the chart.
    - chartName (str): Desired name for the chart report.
    - chartDetails (dict): Details of the chart including:
        - chartType (str): The chart type. Examples: "bar", "horizontal bar", "stacked bar", "line", "area",
        "pie", "ring", "scatter", "bubble", "packed bubble", "funnel", "pyramid", "butterfly", "combo",
        "heat map", "tree map", "sunburst", "sankey", "word cloud", "race line", "race bar", "race bubble",
        "gantt", "histogram", "web", "map scatter", "map filled", "map bubble", "map pie", "geo heat map"
        - axisColumns (list[dict]): List of axis column definitions. Each entry has:
            - type (str): Axis shelf - one of "xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"
            - columnName (str): Name of the column.
            - operation (str):
                String columns: actual, count, distinctCount
                Number columns: measure, dimension, sum, average, min, max, count, distinctCount
                Date columns: year, month, week, day, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
            - tableName (optional str): If the column belongs to a related table, provide its name.
    - filters (list[dict] | None): Optional. Filter definitions per <filters_args>.

        3.1. Filter Arguments:
        - tableName (str): The name of the table containing the column to filter.
        - columnName (str): The name of the column to filter.
        - operation (str): Function applied to the column in the filter.
            Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
            String: actual, count, distinctCount
            Number: measure, dimension, sum, average, min, max, count, distinctCount
        - filterType (str): Type of filter. Accepted: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
        - values (list): Values to filter on.
            - individualValues: ["value1", "value2"]
            - range: ["10 to 20", "50 and above"]
            - ranking: ["top 10", "bottom 5"]
        - exclude (bool): Whether to exclude the matched values. Default is false.

    4. Returns:
    - str: Chart creation status or error message.
    `,
    inputSchema: createChartReportSchema,
     annotations: {
       title: "Create Chart Report",
       readOnlyHint: false,
       destructiveHint: false,
       idempotentHint: false,
       openWorldHint: false
     }
   },
   createChartReportHandler
    );

    server.registerTool("createSummaryReport",
    {
        description: dedent`
        1. use_case:
        - Create a summary report in the specified workspace and table in ${PRODUCT_NAME}.
        - Use this to generate grouped aggregate reports, ideal for quick summaries with group-by and aggregate logic.
        - Creates a summary table that groups data by specified columns and applies aggregate functions.
        
        2. important_notes:
        - Do NOT use "actual" operation for numeric columns in aggregate. Use "sum" instead.
        - You can use lookup columns from other tables if relationships are already defined.

        3. arguments:
        - workspaceId (str): The ID of the workspace to create the Summary report in.
        - tableName (str): The name of the base table for the summary report.
        - reportName (str): The name for the Summary to be created.
        - summaryDetails (dict): Contains:
            - groupBy (list[dict]):
                Each dict must have:
                - columnName (str)
                - tableName (str)
                - operation (str): Below are the valid operation types based on datatypes
                    Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
                    String: actual, count, distinctCount
                    Number: measure, dimension, sum, average, min, max, count, distinctCount
            - aggregate (list[dict]): Each dict must have:
                - columnName (str)
                - operation (str): sum, average, count, min, max, etc.
                - tableName (str): Need to be provided if the column belongs to another table with which a lookup is defined.
        - filters (list[dict] | None): Optional filters. See <filters_args> in createChartReport tool.
        
            3.1. filter_args:
            - tableName (str): The name of the table containing the column to filter.
            - columnName (str): The name of the column to filter.
            - operation (str): Specifies the function applied to the specified column used in the filter. The accepted functions differ based on the data type of the column.
                Date: actual, seasonal, relative
                String: actual, count, distinctCount
                Number: measure, dimension, sum, average, min, max, count, distinctCount
            - filterType (str): The type of filter to apply. Accepted values: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
            - values (list): The values to filter on.
                Example:
                - For individualValues: "value1", "value2"
                - For range: "10 to 20", "50 and above"
                - For ranking: "top 10", "bottom 5"
            - exclude (bool): Whether to exclude or include the filtered values. Default is False.
        
        4.returns:
        - str: Chart creation status or error message.
        `,
        inputSchema: createSummaryReportSchema,
        annotations: {
          title: "Create Summary Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    createSummaryReportHandler
    );

    server.registerTool("createPivotReport",
    {
        description: dedent`
    1. use_cases:
    - Create a pivot table report in the specified workspace and table in ${PRODUCT_NAME}.
    - Use this when you need multidimensional data summaries by defining rows, columns, and data fields.

    2. Important Notes:
    - All pivot details (row, column, data) are optional individually but at least one of them must be provided and valid.
    - Allowed operations:
        - String columns: actual, count, distinctCount
        - Number columns: measure, dimension, sum, average, min, max, count
        - Date columns: year, month, week, day
    - Data fields require aggregate operations like sum, count, etc.
    - Lookup fields from other tables can be used if lookup is already defined.
    - For row and column fields, prefer non-aggregate operations like actual, measure or dimension depending on the data type. 
    For data fields, prefer aggregate operations like sum, count, etc.

    3. arguments:
    - workspaceId (str): ID of the workspace to create the report in.
    - tableName (str): Base table name for the report.
    - reportName (str): Desired name of the pivot report.
    - pivotDetails (dict): Contains:
        - row (optional(list[dict])): Each dict must have 'columnName' and 'tableName' and 'operation'.
        - column (optional(list[dict])): Same structure as row.
        - data (optional(list[dict])): same structure as row.
    - filters (list[dict] | None): Optional filters to restrict data scope. Filter definitions per <filters_args>.

        3.1. filters_args:
        - tableName (str): The name of the table containing the column to filter.
        - columnName (str): The name of the column to filter.
        - operation (str): Specifies the function applied to the specified column used in the filter. The accepted functions differ based on the data type of the column.
            Date: actual, seasonal, relative
            String: actual, count, distinctCount
            Number: sum, average, min, max
        - filterType (str): The type of filter to apply. Accepted values: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
        - values (list): The values to filter on.
            Example:
            - For individualValues: "value1", "value2"
            - For range: "10 to 20"
            - For ranking: "top 10", "bottom 5"
        - exclude (bool): Whether to exclude or include the filtered values. Default is False.
        `,
        inputSchema: createPivotReportSchema,
        annotations: {
          title: "Create Pivot Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    createPivotReportHandler
    );

    server.registerTool("createQueryTable",
    {
        description: "Create a query table in the specified workspace with the given name and SQL query",
        inputSchema: createQueryTableSchema,
        annotations: {
          title: "Create Query Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    createQueryTableHandler
    );

    server.registerTool("editQueryTable",
    {
        description: `
    Edit the SQL query of an existing query table in the specified workspace.

    Use Case:
    - Use this when you need to update or modify the SQL query that defines a query table.

    Important Notes:
    - Only the SQL query can be modified via this tool (CONFIG: sqlQuery).
    - The viewId must be the ID of the query table view (not a regular table or report).
    - you can use the getQueryTableDetails tool to fetch the current details of the query table before editing it, if necessary.
  `,
        inputSchema: editQueryTableSchema,
        annotations: {
            title: "Edit Query Table",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false
        }
    },
    editQueryTableHandler
    );

    server.registerTool("createLookup",
    {
        description: dedent`
        Creates a lookup relationship between two columns across two tables. a Lookup is a relationship between two tables that connects a column in one table to a matching column in another table. A lookup tells the system that these two columns are related, allowing you to combine data from both tables in reports/dashboards/multi-table aggregate formulas.

        The direction of the relationship flows from source → target.
        For ONE_TO_MANY: source is the "one" (parent) side, target is the "many" (child) side.
        For ONE_TO_ONE and MANY_TO_MANY: source/target order is arbitrary but must be consistent.
        MANY_TO_ONE is not supported directly - swap the source and target and use ONE_TO_MANY instead.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing both tables"),
            sourceTableId: z.string().describe("ID of the source (typically parent/one-side) table"),
            sourceColumnId: z.string().describe("ID of the column in the source table to link from"),
            targetTableId: z.string().describe("ID of the target (typically child/many-side) table"),
            targetColumnId: z.string().describe("ID of the column in the target table to link to"),
            relationshipType: z.enum(["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY", "MANY_TO_ONE"]).describe(
                "Nature of the relationship. MANY_TO_ONE will be automatically converted to ONE_TO_MANY by swapping source and target."
            ),
        },
        annotations: {
            title: "Create Lookup",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, sourceTableId, sourceColumnId, targetTableId, targetColumnId, relationshipType }) => {
        try {
            const orgId = requireOrgId();

            // MANY_TO_ONE → swap source/target and use ONE_TO_MANY
            let effectiveRelationType = relationshipType;
            let effectiveSourceTableId = sourceTableId;
            let effectiveSourceColumnId = sourceColumnId;
            let effectiveTargetTableId = targetTableId;
            let effectiveTargetColumnId = targetColumnId;

            if (relationshipType === "MANY_TO_ONE") {
                console.error("[createLookup] MANY_TO_ONE detected - swapping source and target, using ONE_TO_MANY");
                effectiveRelationType = "ONE_TO_MANY";
                effectiveSourceTableId = targetTableId;
                effectiveSourceColumnId = targetColumnId;
                effectiveTargetTableId = sourceTableId;
                effectiveTargetColumnId = sourceColumnId;
            }

            console.error(`[createLookup] Creating lookup: sourceTable=${effectiveSourceTableId}, sourceColumn=${effectiveSourceColumnId}, targetTable=${effectiveTargetTableId}, targetColumn=${effectiveTargetColumnId}, relationType=${effectiveRelationType}`);

            const ac = getAnalyticsClient();
            const viewInstance = ac.getViewInstance(orgId, workspaceId, effectiveSourceTableId);
            const references = [
                {
                    viewId: effectiveTargetTableId,
                    columnId: effectiveTargetColumnId,
                    relationType: effectiveRelationType
                }
            ];
            await viewInstance.addLookupV2(effectiveSourceColumnId, references, {});
            console.error(`[createLookup] Lookup created successfully`);
            return ToolResponse(
                `Lookup relationship created successfully. Source table: ${effectiveSourceTableId}, Source column: ${effectiveSourceColumnId} → Target table: ${effectiveTargetTableId}, Target column: ${effectiveTargetColumnId}, Relationship type: ${effectiveRelationType}`
            );
        } catch (err: any) {
            console.error("[createLookup] Error:", err);
            const errorCode = err?.errorCode;
            const errorMessage = err?.errorMessage;

            const errorCodeMessages: Record<string | number, string> = {
                // Add specific error code mappings here as needed
            };

            if (errorCode !== undefined && !isOrgMismatchError(err)) {
                const mappedMessage = errorCodeMessages[errorCode];
                if (mappedMessage) {
                    return ToolResponse(`Error [${errorCode}]: ${mappedMessage}`);
                }
                return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while creating the lookup"}`);
            }
            return logAndReturnError(err, "An error occurred while creating the lookup", { workspaceId, viewId: sourceTableId });
        }
    });

    server.registerTool("deleteLookup",
    {
        description: "Remove a lookup relationship for a specified column in a table (view).",
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing the table"),
            viewId: z.string().describe("The ID of the view (table) from which to remove the lookup"),
            columnId: z.string().describe("The ID of the column whose lookup relationship should be removed"),
        },
        annotations: {
            title: "Delete Lookup",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, viewId, columnId }) => {
        try {
            const orgId = requireOrgId();

            console.error(`[deleteLookup] Removing lookup: viewId=${viewId}, columnId=${columnId}`);

            const ac = getAnalyticsClient();
            const viewInstance = ac.getViewInstance(orgId, workspaceId, viewId);
            await viewInstance.removeLookup(columnId, {});
            console.error(`[deleteLookup] Lookup removed successfully`);
            return ToolResponse(`Lookup relationship for column ${columnId} in view ${viewId} removed successfully.`);
        } catch (err: any) {
            console.error("[deleteLookup] Error:", err);
            const errorCode = err?.errorCode;
            const errorMessage = err?.errorMessage;

            if (errorCode !== undefined && !isOrgMismatchError(err)) {
                return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while removing the lookup"}`);
            }
            return logAndReturnError(err, "An error occurred while removing the lookup", { workspaceId, viewId });
        }
    });

    server.registerTool("deleteView",
    {
      description: `
      <use_case>
        Delete a view (table, report, or dashboard) in the specified workspace.
      </use_case>
      `,
      inputSchema: {
        workspaceId: z.string(),
        viewId: z.string(),
      },
      annotations: {
        title: "Delete View",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ workspaceId, viewId }) => {
        try {
            const orgId = requireOrgId();
            const analyticsClient = getAnalyticsClient();
            const viewInstance = analyticsClient.getViewInstance(orgId, workspaceId, viewId);
            await viewInstance.delete();
            return ToolResponse(`View with ID ${viewId} deleted successfully from workspace ${workspaceId}.`);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while deleting the view", { workspaceId, viewId });
        }
    }
  );

    server.registerTool("updatePivot",
    {
        description: dedent`
        1. Use Cases:
        - Update an existing pivot report in the specified workspace in ${PRODUCT_NAME}.
        - Use this to modify the row, column, data fields, filters, or title of an existing pivot report.

        2. Important Notes:
        - This tool only supports updating reports whose reportType is "pivot". It does not support chart or summary reports.
        - The update is a FULL REPLACEMENT: the complete axis, filter, and user-filter configuration is replaced with
          whatever is sent. If you omit filters, the existing filters are cleared.
        - ALWAYS call the readReportMetadata tool first to retrieve the current configuration, then modify the desired
          fields and re-submit the complete configuration via this tool.
        - baseTableName must NOT be provided for updates (it is inferred from the existing report).
        - title is optional in update. Omit it to keep the existing title.
        - reportType must always be supplied and must be "pivot".
        - All pivot fields (row, column, data) are optional individually, but at least one must be provided.
        - Allowed operations:
            - String columns: actual, count, distinctCount
            - Number columns: measure, dimension, sum, average, min, max, count
            - Date columns: year, month, week, day
        - Data fields require aggregate operations like sum, count, etc.
        - For row and column fields, prefer non-aggregate operations like actual, measure, or dimension.
        - filters follow the same structure as in createPivotReport.

        3. Arguments:
        - workspaceId (str): ID of the workspace containing the pivot report.
        - reportId (str): ID of the pivot report to update.
        - pivotDetails (dict): Updated pivot configuration. Contains:
            - row (optional list[dict]): Each dict must have 'columnName', 'tableName', and 'operation'.
            - column (optional list[dict]): Same structure as row.
            - data (optional list[dict]): Same structure as row.
        - title (str | None): Optional. New title for the pivot report. Omit to keep the existing title.
        - filters (list[dict] | None): Optional. Filter definitions (same structure as createPivotReport).
            - tableName (str): The name of the table containing the column to filter.
            - columnName (str): The name of the column to filter.
            - operation (str): Function applied to the column in the filter.
            - filterType (str): Type of filter. Accepted: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
            - values (list): Values to filter on.
            - exclude (bool): Whether to exclude the matched values. Default is false.

        4. Returns:
        - str: Update status or error message.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing the pivot report"),
            reportId: z.string().describe("The ID of the pivot report to update"),
            pivotDetails: z.object({
                row: z.array(z.object({
                    columnName: z.string(),
                    tableName: z.string(),
                    operation: z.string()
                })).optional(),
                column: z.array(z.object({
                    columnName: z.string(),
                    tableName: z.string(),
                    operation: z.string()
                })).optional(),
                data: z.array(z.object({
                    columnName: z.string(),
                    tableName: z.string(),
                    operation: z.string()
                })).optional()
            }),
            title: z.string().optional().describe("Optional. New title for the pivot report. Omit to keep the existing title."),
            filters: z.array(z.object({
                tableName: z.string().optional(),
                columnName: z.string(),
                operation: z.string(),
                filterType: z.string(),
                values: z.array(z.string()),
                exclude: z.boolean()
            })).optional(),
        },
        annotations: {
            title: "Update Pivot Report",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, reportId, pivotDetails, title, filters }) => {
        try {
            const orgId = requireOrgId();

            if (!pivotDetails) {
                return ToolResponse("Pivot details must be provided.");
            }
            if (!pivotDetails.row && !pivotDetails.column && !pivotDetails.data) {
                return ToolResponse("At least one of 'row', 'column', or 'data' must be provided in pivotDetails.");
            }

            const axisColumns: any[] = [];
            const requiredKeys = ["columnName", "tableName", "operation"];
            for (const [axisType, axisKey] of [["row", "row"], ["column", "column"], ["data", "data"]] as const) {
                const axisList = (pivotDetails as any)[axisKey];
                if (axisList) {
                    if (!Array.isArray(axisList) || axisList.length === 0) {
                        return ToolResponse(`${axisKey} must be a non-empty list of dictionaries with 'columnName', 'tableName', and 'operation'.`);
                    }
                    for (const entry of axisList) {
                        if (!requiredKeys.every(k => k in entry)) {
                            return ToolResponse(`Each entry in '${axisKey}' must contain 'columnName', 'tableName', and 'operation'.`);
                        }
                        const defaultOperation = (axisType === "row" || axisType === "column") ? "actual" : "count";
                        axisColumns.push({
                            type: axisType,
                            columnName: entry.columnName,
                            operation: entry.operation || defaultOperation,
                            tableName: entry.tableName
                        });
                    }
                }
            }

            const conf: Record<string, any> = {
                reportType: "pivot",
                axisColumns
            };

            // title is optional in update - only include if provided
            if (title) {
                conf.title = title;
            }

            if (filters) {
                if (!Array.isArray(filters)) {
                    return ToolResponse("Filters must be a list of dictionaries.");
                }
                for (const f of filters) {
                    if (!["columnName", "operation", "filterType", "values", "exclude"].every(k => k in f)) {
                        return ToolResponse("Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'.");
                    }
                }
                conf.filters = filters;
            }

            console.error(`[updatePivot] Updating pivot report '${reportId}' in workspace '${workspaceId}'`);

            const ac = getAnalyticsClient();
            const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
            await workspaceInst.updateReport(reportId, conf);
            console.error(`[updatePivot] Successfully updated pivot report '${reportId}'`);
            return ToolResponse(`Pivot report '${reportId}' updated successfully.`);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while updating the pivot report", { workspaceId, viewId: reportId });
        }
    });

    server.registerTool("updateSummary",
    {
        description: dedent`
        1. Use Cases:
        - Update an existing summary report in the specified workspace in ${PRODUCT_NAME}.
        - Use this to modify the groupBy columns, aggregate columns, filters, or title of an existing summary report.

        2. Important Notes:
        - This tool only supports updating reports whose reportType is "summary". It does not support chart or pivot reports.
        - The update is a FULL REPLACEMENT: the complete axis, filter, and user-filter configuration is replaced with
          whatever is sent. If you omit filters, the existing filters are cleared.
        - ALWAYS call the readReportMetadata tool first to retrieve the current configuration, then modify the desired
          fields and re-submit the complete configuration via this tool.
        - baseTableName must NOT be provided for updates (it is inferred from the existing report).
        - title is optional in update. Omit it to keep the existing title.
        - reportType must always be supplied and must be "summary".
        - Both 'groupBy' and 'aggregate' must be provided.
        - Do NOT use "actual" operation for numeric columns in aggregate. Use "sum" instead.
        - filters follow the same structure as in createSummaryReport.

        3. Arguments:
        - workspaceId (str): ID of the workspace containing the summary report.
        - reportId (str): ID of the summary report to update.
        - summaryDetails (dict): Updated summary configuration. Contains:
            - groupBy (list[dict]): Each dict must have:
                - columnName (str)
                - tableName (str)
                - operation (str): Valid operations based on datatype:
                    Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
                    String: actual, count, distinctCount
                    Number: measure, dimension, sum, average, min, max, count, distinctCount
            - aggregate (list[dict]): Each dict must have:
                - columnName (str)
                - operation (str): sum, average, count, min, max, etc.
                - tableName (str): Required if the column belongs to a related table with a lookup defined.
        - title (str | None): Optional. New title for the summary report. Omit to keep the existing title.
        - filters (list[dict] | None): Optional. Filter definitions (same structure as createSummaryReport).
            - tableName (str): The name of the table containing the column to filter.
            - columnName (str): The name of the column to filter.
            - operation (str): Function applied to the column in the filter.
            - filterType (str): Type of filter. Accepted: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
            - values (list): Values to filter on.
            - exclude (bool): Whether to exclude the matched values. Default is false.

        4. Returns:
        - str: Update status or error message.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing the summary report"),
            reportId: z.string().describe("The ID of the summary report to update"),
            summaryDetails: z.object({
                groupBy: z.array(z.object({
                    columnName: z.string(),
                    tableName: z.string(),
                    operation: z.string()
                })).nonempty(),
                aggregate: z.array(z.object({
                    columnName: z.string(),
                    operation: z.string(),
                    tableName: z.string()
                })).nonempty()
            }),
            title: z.string().optional().describe("Optional. New title for the summary report. Omit to keep the existing title."),
            filters: z.array(z.object({
                tableName: z.string().optional(),
                columnName: z.string(),
                operation: z.string(),
                filterType: z.string(),
                values: z.array(z.string()),
                exclude: z.boolean()
            })).optional(),
        },
        annotations: {
            title: "Update Summary Report",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, reportId, summaryDetails, title, filters }) => {
        try {
            const orgId = requireOrgId();

            if (!summaryDetails.groupBy || !summaryDetails.aggregate) {
                return ToolResponse("Both 'groupBy' and 'aggregate' must be provided in summaryDetails.");
            }

            const axisColumns: any[] = [];
            for (const gb of summaryDetails.groupBy) {
                axisColumns.push({
                    type: "groupBy",
                    columnName: gb.columnName,
                    operation: gb.operation,
                    tableName: gb.tableName
                });
            }
            for (const ag of summaryDetails.aggregate) {
                if (ag.operation === "actual") {
                    return ToolResponse("Invalid operation 'actual' in aggregate. Use 'sum', 'count', etc.");
                }
                axisColumns.push({
                    type: "summarize",
                    columnName: ag.columnName,
                    operation: ag.operation,
                    tableName: ag.tableName
                });
            }

            const conf: Record<string, any> = {
                reportType: "summary",
                axisColumns
            };

            // title is optional in update - only include if provided
            if (title) {
                conf.title = title;
            }

            if (filters) {
                conf.filters = filters;
            }

            console.error(`[updateSummary] Updating summary report '${reportId}' in workspace '${workspaceId}'`);

            const ac = getAnalyticsClient();
            const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
            await workspaceInst.updateReport(reportId, conf);
            console.error(`[updateSummary] Successfully updated summary report '${reportId}'`);
            return ToolResponse(`Summary report '${reportId}' updated successfully.`);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while updating the summary report", { workspaceId, viewId: reportId });
        }
    });

    server.registerTool("updateChart",
    {
        description: dedent`
        1. Use Cases:
        - Update an existing chart report in the specified workspace in ${PRODUCT_NAME}.
        - Use this to modify the chart type, axis columns, filters, or title of an existing chart report.

        2. Important Notes:
        - This tool only supports updating reports whose reportType is "chart". It does not support pivot or summary reports.
        - The update is a FULL REPLACEMENT: the complete axis, filter, and user-filter configuration is replaced with
          whatever is sent. If you omit filters, the existing filters are cleared.
        - ALWAYS call the readReportMetadata tool first to retrieve the current configuration, then modify the desired
          fields and re-submit the complete configuration via this tool.
        - baseTableName must NOT be provided for updates (it is inferred from the existing report).
        - title is optional in update. Omit it to keep the existing title.
        - reportType must always be supplied and must be "chart".
        - axisColumns follow the same structure as in createChartReport:
            - type (str): Axis shelf - one of "xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"
            - columnName (str): Name of the column.
            - operation (str):
                String columns: actual, count, distinctCount
                Number columns: measure, dimension, sum, average, min, max, count, distinctCount
                Date columns: year, month, week, day, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
            - tableName (optional str): If the column belongs to a related table, provide its name.
        - filters follow the same structure as in createChartReport.
        - The tool validates chart compatibility (axis columns vs. chart type) before sending the update, just like createChartReport.
        - Validate the correctness of individual values provided in filters using the queryData tool.

        3. Arguments:
        - workspaceId (str): ID of the workspace containing the chart report.
        - reportId (str): ID of the chart report to update.
        - chartDetails (dict): Updated chart configuration including:
            - chartType (str): The chart type. Examples: "bar", "horizontal bar", "stacked bar", "line", "area",
              "pie", "ring", "scatter", "bubble", "packed bubble", "funnel", "pyramid", "butterfly", "combo",
              "heat map", "tree map", "sunburst", "sankey", "word cloud", "race line", "race bar", "race bubble",
              "gantt", "histogram", "web", "map scatter", "map filled", "map bubble", "map pie", "geo heat map"
            - axisColumns (list[dict]): List of axis column definitions (same structure as createChartReport).
        - title (str | None): Optional. New title for the chart report. Omit to keep the existing title.
        - filters (list[dict] | None): Optional. Filter definitions (same structure as createChartReport).
            - tableName (str): The name of the table containing the column to filter.
            - columnName (str): The name of the column to filter.
            - operation (str): Function applied to the column in the filter.
            - filterType (str): Type of filter. Accepted: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
            - values (list): Values to filter on.
            - exclude (bool): Whether to exclude the matched values. Default is false.

        4. Returns:
        - str: Update status or error message.
        `,
        inputSchema: updateChartSchema,
        annotations: {
            title: "Update Chart Report",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    updateChartHandler
    );
}

