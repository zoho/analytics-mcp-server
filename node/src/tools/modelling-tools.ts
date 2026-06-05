import { z } from "zod";
import type { ServerInstance } from "../common";
import {getAnalyticsClient, config } from '../utils/apiUtil';
import { retryWithFallback, ToolResponse, logAndReturnError } from "../utils/common";
import dedent from "dedent";

export function registerModellingTools(server: ServerInstance) {

    server.registerTool("createWorkspace",
    {
        description: "Create a new workspace in Zoho Analytics with the given name",
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
            const ac = getAnalyticsClient();
            const org = ac.getOrgInstance(config.ORGID || "");
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
            orgId: z.string().optional().describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided.")
        },
        annotations: {
          title: "Create Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, columnsArr, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, tableAlias, cols_arr) => {
                const tableDesign = {
                    TABLENAME: tableAlias,
                    COLUMNS: cols_arr
                };
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(config.ORGID || "", workspace);
                const tableId = await workspaceInst.createTable(tableDesign);
                return ToolResponse(`Table '${tableName}' created successfully. Table Id: ${tableId}`);
            }, workspaceId, tableName, columnsArr);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the table");
        }
    });

    server.registerTool("createChartReport",
    {
    description: dedent`
    1.Use Cases:
    - Create a chart report in the specified workspace for a table in Zoho Analytics.
    - Use this to generate visual representations of data using bar, line, pie, scatter, or bubble charts.

    2.Important Notes:
    - A chart is a report that visually represents data from a table or multiple tables.
    - If yAxis operation is "actual", only "scatter" chart is allowed. For all other chart types, use "sum" for numeric columns and "count" for string columns in yAxis.
    - Charts can include filters to narrow down the dataset.
    - A chart can be created over columns from the same table or from other tables with which a relationship is defined.
    - For xAxis operations for numeric columns, use "measure" or "dimension" instead of "actual", depending upon the type of the numeric column.
    
    3.Arguments:
    - workspaceId (str): ID of the workspace to create the chart in.
    - tableName (str): The base table name for the chart.
    - chartName (str): Desired name for the chart report.
    - chartDetails (dict): Details of the chart including:
        - chartType (str): One of ["bar", "line", "pie", "scatter", "bubble"]
        - xAxis (dict):
            - columnName (str)
            - operation (str): 
                For string:- actual, count, distinctCount
                For number:- sum, average, min, max, measure, dimension, count, distinctCount
                For dates:- year, month, week, fullDate, dateTime, range, count, distinctCount
            - tableName (optional [str]): If the column belongs to another table with which a relationship is defined with base table, provide the tableName.
        - yAxis (dict): Same structure as xAxis
    - filters (list[dict] | None): Optional. Filter definitions per <filters_args>.
    - orgId (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
    
        3.1.Filter Arguments:
        - tableName (str): The name of the table containing the column to filter.
        - columnName (str): The name of the column to filter.
        - operation (str): Specifies the function applied to the specified column used in the filter. The accepted functions differ based on the data type of the column.
            Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
            String: actual, count, distinctCount
            Number: measure, dimension, sum, average, min, max, count, distinctCount
        - filterType (str): The type of filter to apply. Accepted values: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
        - values (list): The values to filter on.
            Example:
            - For individualValues: "value1", "value2"
            - For range: "10 to 20", "50 and above"
            - For ranking: "top 10", "bottom 5"
        - exclude (bool): Whether to exclude or include the filtered values. Default is False.

    4.Returns:
    - str: Chart creation status or error message.
    `,
    inputSchema: {
      workspaceId: z.string(),
      tableName: z.string(),
      chartName: z.string(),
      chartDetails: z
        .object({
          chartType: z
            .enum(["bar", "line", "pie", "scatter", "bubble"]),
          xAxis: z
            .object({
              columnName: z.string(),
              operation: z.string(),
              tableName: z
                .string()
                .optional()
            }),
          yAxis: z
            .object({
              columnName: z.string(),
              operation: z.string(),
              tableName: z
                .string()
                .optional(),
            }),
        }),
      filters: z
        .array(
          z.object({
            tableName: z.string(),
            columnName: z.string(),
            operation: z
              .string(),
            filterType: z
              .string(),
            values: z.array(z.string()),
            exclude: z.boolean(),
          })
        )
        .optional(),
      orgId: z
         .string()
         .optional(),
     },
     annotations: {
       title: "Create Chart Report",
       readOnlyHint: false,
       destructiveHint: false,
       idempotentHint: false,
       openWorldHint: false
     }
   },
   async ({
     workspaceId,
     tableName,
     chartName,
     chartDetails,
     filters,
     orgId,
     }) => {
     
     try {
         if (!orgId) {
             orgId = config.ORGID || "";
         }
        if (!chartDetails.chartType) {
            return ToolResponse("Chart type is required. Please provide 'chartType' in chartDetails.");
        }
        const { chartType, xAxis, yAxis } = chartDetails;
        if (!xAxis || !yAxis) {
            return ToolResponse("Both xAxis and yAxis must be provided in chartDetails.");
        }
        if (!xAxis.columnName || !xAxis.operation) {
            return ToolResponse("xAxis must contain 'columnName' and 'operation'.");
        }
        if (!yAxis.columnName || !yAxis.operation) {
            return ToolResponse("yAxis must contain 'columnName' and 'operation'.");
        }
        if (["bar", "line", "pie", "bubble"].includes(chartType) && ["Measure", "sum", "average", "min", "max"].includes(xAxis.operation)) {
            return ToolResponse(`For chart type '${chartType}', xAxis operation cannot be '${xAxis.operation}'. Use 'dimension' instead.`);
        }
        if (["bar", "line", "pie", "bubble"].includes(chartType) && yAxis.operation === "actual") {
            return ToolResponse(`For chart type '${chartType}', yAxis operation cannot be 'actual'. Use 'sum' instead.`);
        }
        const axisColumns: any[] = [];
        for (const [axisType, axis] of [["xAxis", xAxis], ["yAxis", yAxis]] as const) {
            const axisConfig: Record<string, any> = {
                type: axisType,
                columnName: axis.columnName,
                operation: axis.operation,
            };
            if (axis.tableName) axisConfig.tableName = axis.tableName;
            axisColumns.push(axisConfig);
        }
        const conf: Record<string, any> = {
            baseTableName: tableName,
            title: chartName,
            reportType: "chart",
            chartType,
            axisColumns,
        };
        if (filters) {
            if (!Array.isArray(filters)) {
                return ToolResponse("Filters must be provided as an array of objects.");
            }
            for (const f of filters) {
                if (!("columnName" in f && "operation" in f && "filterType" in f && "values" in f && "exclude" in f)) {
                    return ToolResponse("Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'.");
                }
            }
            conf.filters = filters;
        }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace) => {
                const ac = getAnalyticsClient();
                const workspaceInst = ac.getWorkspaceInstance(org_id || "", workspace);
                const reportId = await workspaceInst.createReport(conf);
                return ToolResponse(`Chart report created successfully. Report ID: ${reportId}`);
            }, workspaceId);
    } catch (error: any) {
        if (typeof error.message === "string" && error.message.includes("Invalid input") && error.message.includes("operation") && error.message.includes("actual")) {
            return logAndReturnError("Invalid operation 'actual' for numeric column. Use 'sum' or 'count' instead.", "Chart creation error");
        }
        if ("errorMessage" in error && "errorCode" in error){
            const { errorMessage, errorCode } = error as { errorMessage: string; errorCode: number };
            if (errorCode === 8166) {
                let responseStr = errorMessage;
                responseStr += dedent`
                Supported operations for columns of different types:
                For string:- actual, count, distinctCount
                For number:- sum, average, min, max, measure, dimension, count, distinctCount
                For dates:- year, month, week, fullDate, dateTime, range, count, distinctCount
                `
                return ToolResponse(responseStr);
            }
        }
        return logAndReturnError(error, "An error occurred while creating the chart report");
    }
  }
    );

    server.registerTool("createSummaryReport",
    {
        description: dedent`
        1. use_case:
        - Create a summary report in the specified workspace and table in Zoho Analytics.
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
        - orgId (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
        
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
        inputSchema: {
            workspaceId: z.string(),
            tableName: z.string(),
            reportName: z.string(),
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
            filters: z.array(z.object({
                tableName: z.string().optional(),
                columnName: z.string(),
                operation: z.string(),
                filterType: z.string(),
                values: z.array(z.string()),
                exclude: z.boolean()
            })).optional(),
            orgId: z.string().optional()
        },
        annotations: {
          title: "Create Summary Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, reportName, summaryDetails, filters, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
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
            const conf: any = {
                baseTableName: tableName,
                title: reportName,
                reportType: "summary",
                axisColumns
            };
            if (filters) {
                conf.filters = filters;
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id || "", workspace);
                const reportId = await workspaceInst.createReport(conf);
                return ToolResponse(`Summary report created successfully. Report ID: ${reportId}`);
            },workspaceId);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the summary report");
        }
    });

    server.registerTool("createPivotReport",
    {
        description: dedent`
    1. use_cases:
    - Create a pivot table report in the specified workspace and table in Zoho Analytics.
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
    - orgId (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.

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
        inputSchema: {
        workspaceId: z.string(),
        tableName: z.string(),
        reportName: z.string(),
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
        filters: z.array(z.object({
            tableName: z.string().optional(),
            columnName: z.string(),
            operation: z.string(),
            filterType: z.string(),
            values: z.array(z.string()),
            exclude: z.boolean()
        })).optional(),
        orgId: z.string().optional()
        },
        annotations: {
          title: "Create Pivot Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, reportName, pivotDetails, filters, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
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
            const conf: any = {
                baseTableName: tableName,
                title: reportName,
                reportType: "pivot",
                axisColumns
            };
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
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, bodyConf) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id || "", workspace);
                const reportId = await workspaceInst.createReport(bodyConf);
                return ToolResponse(`Pivot report created successfully. Report ID: ${reportId}`);
            }, workspaceId, conf);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the pivot report");
        }
    });

    server.registerTool("createQueryTable",
    {
        description: "Create a query table in the specified workspace with the given name and SQL query",
        inputSchema: {
        workspaceId: z.string().describe("The ID of the workspace in which to create the query table"),
        tableName: z.string().describe("The name of the query table to create"),
        query: z.string().describe("The SQL select query to create the query table"),
        orgId: z.string().optional().describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided.")
        },
        annotations: {
          title: "Create Query Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, query, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async(org_id, workspace, table, sql) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
                const configParam = {};
                const tableId = await workspaceInst.createQueryTable(sql, table, configParam);
                return ToolResponse(`Query table '${table}' created successfully. Table Id: ${tableId}`);
            }, workspaceId, tableName, query);            
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the query table");
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
        orgId: z.string().nullable().optional(),
      },
      annotations: {
        title: "Delete View",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ workspaceId, viewId, orgId }) => {
        try {
            if (!orgId){
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, view) => {
                const analyticsClient = getAnalyticsClient();
                const viewInstance = analyticsClient.getViewInstance(org_id || "", workspace, view);
                await viewInstance.delete();
                return ToolResponse(`View with ID ${view} deleted successfully from workspace ${workspace}.`);
            }, workspaceId, viewId);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while deleting the view");
        }
    }
  );
}
