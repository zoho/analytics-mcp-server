import { z } from "zod";
import { defineTool } from "../../tool-registry";
import { getAnalyticsClient, config } from "../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../utils/common";
import { validateChartCompatibility, type AxisColumnInput } from "./chart-validation";

// ---- Tool Registrations ----

defineTool({
  name: "readReportMetadata",
  description: `
    1. Use Case:
    - Retrieve the full visual metadata (design configuration) of an existing report in Zoho Analytics.
    - Supports all report types: chart, pivot, and summary.

    2. Important Notes:
    - This is a read-only operation; it does not modify the report in any way.
    - The returned metadata includes the report's title, reportType, chartType (for chart reports),
      axisColumns, filters, and userFilters — the complete design configuration of the report.
    - Always call this tool first before updating a report (e.g., via the updateReport tool), because
      the update endpoint performs a full replacement of the axis, filter, and user-filter configuration.
      Inspect the current configuration here, modify the desired fields, then re-submit via the update tool.

    3. Arguments:
    - workspaceId (str): The ID of the workspace containing the report.
    - reportId (str): The ID of the report whose metadata should be retrieved.
    - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

    4. Returns:
    - A JSON string containing the report metadata, or an error message.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the report"),
    reportId: z.string().describe("The ID of the report whose metadata to retrieve"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, reportId, orgId }) => {
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
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          const metadata = await (workspaceInst as any).getReportMetadata(reportId);
          return ToolResponse(JSON.stringify(metadata, null, 2));
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while retrieving the report metadata");
    }
  },
});

defineTool({
  name: "createReport",
  description: `
    Create a report in the specified workspace in Zoho Analytics.
    Maps directly to the Zoho Analytics Create Report API.

    Supported report types (set via 'reportType'):
    1. "chart"   - Visual data representations using a wide variety of chart types.
                   Requires 'chartConfig'.
    2. "summary" - Grouped aggregate reports with group-by and aggregate logic.
                   Requires 'summaryConfig'.
    3. "pivot"   - Multidimensional data summaries with rows, columns, and data fields.
                   Requires 'pivotConfig'.

    Always provide exactly one config object matching the chosen 'reportType'.

    -- Chart Config (reportType: "chart") ------------------------------------------
    - chartType (str): The chart type. Examples: "bar", "horizontal bar", "stacked bar", "line",
      "area", "pie", "ring", "scatter", "bubble", "packed bubble", "funnel", "pyramid",
      "butterfly", "combo", "heat map", "tree map", "sunburst", "sankey", "word cloud",
      "race line", "race bar", "race bubble", "gantt", "histogram", "web",
      "map scatter", "map filled", "map bubble", "map pie", "geo heat map"
    - axisColumns (list[dict]): List of axis column definitions. Each entry has:
        - type (str): Axis shelf - one of "xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"
        - columnName (str): Name of the column.
        - operation (str):
            String columns: actual, count, distinctCount
            Number columns: measure, dimension, sum, average, min, max, count, distinctCount
            Date columns:   year, month, week, day, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
        - tableName (optional str): If the column belongs to a related table, provide its name.
    - Notes:
        - "sizeAxis" is required for bubble and packed bubble charts.
        - Use "colorAxis" to add a color dimension/aggregate for chart coloring.
        - Columns in axisColumns can belong to multiple related tables (via lookup relationships).
        - The tool validates chart compatibility and returns a detailed error if the column/operation
          configuration is invalid for the specified chart type.
        - Validate filter values using the queryData tool before setting filters.

    -- Summary Config (reportType: "summary") --------------------------------------
    - groupBy (list, min 1): Each entry - columnName, tableName, operation.
        Date:   year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
        String: actual, count, distinctCount
        Number: measure, dimension, sum, average, min, max, count, distinctCount
    - aggregate (list, min 1): Each entry - columnName, tableName, operation (e.g. sum, count, average, min, max).
        Do NOT use "actual" in aggregate operations.

    -- Pivot Config (reportType: "pivot") ------------------------------------------
    - row / column / data (all optional, but at least one required): Each entry - columnName, tableName, operation.
        String: actual, count, distinctCount
        Number: measure, dimension, sum, average, min, max, count
        Date:   year, month, week, day
    - For row/column: prefer non-aggregate operations (actual, measure, dimension).
    - For data: prefer aggregate operations (sum, count, etc.).

    -- Filters (optional, all report types) ----------------------------------------
    Each filter:
    - tableName (str, optional)
    - columnName (str)
    - operation (str)
    - filterType (str): individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
    - values (list[str])
    - exclude (bool)

    -- User Filters (optional, all report types) -----------------------------------
    Interactive filter widgets exposed to viewers of the report. Each user filter:
    - columnName (str, required): Column to expose as a user filter.
    - tableName (str, required): Table that owns the column. Unlike static filters, this is mandatory.
    - operation (str, required): Filter operation.
        Dimensions: "actual"
        Measures: "sum", "max", "min", "avg", "std", "count", "dc", "actual"
        Dates: "actual", "dateRange", "relative", "seasonal"
    - compType (str, conditional - required except for 'dateRange'): UI widget type.
        Dimensions/Dates: "singleSelect" or "multiSelect"
        Measures: "slider" or "multiSelect"
    - filterType (str, conditional - required for measures and date actual/seasonal):
        Measures: "individualValues", "range", "ranking", "rankingPct"
        Date actual: "year", "quarteryear", "monthyear", "weekyear", "fulldate", "datetime", "quarter", "month", "week", "date"
        Date seasonal: "quarter", "month", "week", "weekday", "day", "hour"
    - isallval (bool, optional): When true, defaults to showing all values.
    - values (list[str|number], optional): Available/pre-selected values for the filter widget.
    - defaultFilterValues (list[str], optional): Values pre-selected when the report loads.
    - exclude (bool, optional): When true, filter excludes selected values.
    - behaviour (str, optional): "ListAllValues", "ListRelevantValues", "ListOnlyRelevantValues".
        NOT applicable for "dateRange" or "relative" operations.
  `,
  args: {
    workspaceId: z.string().describe("ID of the workspace to create the report in"),
    tableName: z.string().describe("Name of the base table for the report"),
    reportName: z.string().describe("Desired name for the report"),
    reportType: z.enum(["chart", "summary", "pivot"]).describe("Type of report to create"),
    chartConfig: z
      .object({
        chartType: z
          .string()
          .describe(
            'Chart type, e.g. "bar", "line", "pie", "scatter", "bubble", "stacked bar", "funnel", "heat map", "sankey", and many more.'
          ),
        axisColumns: z
          .array(
            z.object({
              type: z
                .enum(["xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"])
                .describe('Axis shelf: "xAxis", "yAxis", "colorAxis", "sizeAxis", or "textAxis"'),
              columnName: z.string().describe("Name of the column"),
              operation: z
                .string()
                .describe(
                  "Operation for the column. String: actual/count/distinctCount. Number: measure/dimension/sum/average/min/max/count/distinctCount. Date: year/month/week/day/fullDate/dateTime/range/monthYear/quarterYear/weekYear/count/distinctCount"
                ),
              tableName: z
                .string()
                .optional()
                .describe("If the column belongs to a related table, provide its name"),
            })
          )
          .min(1)
          .describe("List of axis column definitions"),
      })
      .optional()
      .describe("Required when reportType is 'chart'"),
    summaryConfig: z
      .object({
        groupBy: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .min(1),
        aggregate: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .min(1),
      })
      .optional()
      .describe("Required when reportType is 'summary'"),
    pivotConfig: z
      .object({
        row: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
        column: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
        data: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
      })
      .optional()
      .describe("Required when reportType is 'pivot'"),
    filters: z
      .array(
        z.object({
          tableName: z.string().optional(),
          columnName: z.string(),
          operation: z.string(),
          filterType: z.string(),
          values: z.array(z.string()),
          exclude: z.boolean(),
        })
      )
      .optional()
      .describe("Optional filters to restrict the dataset"),
    userFilters: z
      .array(
        z.object({
          columnName: z.string(),
          tableName: z.string(),
          operation: z.string(),
          compType: z.string().optional(),
          filterType: z.string().optional(),
          isallval: z.boolean().optional(),
          values: z.array(z.union([z.string(), z.number()])).optional(),
          defaultFilterValues: z.array(z.string()).optional(),
          exclude: z.boolean().optional(),
          behaviour: z.string().optional(),
        })
      )
      .optional()
      .describe(
        "Optional user filters - interactive filter widgets exposed to viewers. Each user filter must include columnName, tableName, and operation. compType is required for all operations except 'dateRange'. filterType is required for measures and date actual/seasonal operations."
      ),
  },
  handler: async ({
    workspaceId,
    tableName,
    reportName,
    reportType,
    chartConfig,
    summaryConfig,
    pivotConfig,
    filters,
    userFilters,
  }) => {
    try {
      const orgId = config.ORGID || "";
      const axisColumns: Record<string, any>[] = [];
      const conf: Record<string, any> = {
        baseTableName: tableName,
        title: reportName,
        reportType,
      };

      if (reportType === "chart") {
        if (!chartConfig) {
          return ToolResponse("chartConfig is required when reportType is 'chart'.");
        }
        const { chartType, axisColumns: inputAxisColumns } = chartConfig;

        if (!chartType) {
          return ToolResponse("Chart type is required. Please provide 'chartType' in chartConfig.");
        }
        if (!inputAxisColumns || inputAxisColumns.length === 0) {
          return ToolResponse("At least one axis column must be provided in chartConfig.axisColumns.");
        }

        // Validate each axis column has required fields
        for (let i = 0; i < inputAxisColumns.length; i++) {
          const col = inputAxisColumns[i];
          if (!col.columnName) {
            return ToolResponse(`axisColumns[${i}] is missing 'columnName'.`);
          }
          if (!col.operation) {
            return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'operation'.`);
          }
          if (!col.type) {
            return ToolResponse(
              `axisColumns[${i}] ('${col.columnName}') is missing 'type'. Must be one of: xAxis, yAxis, colorAxis, sizeAxis, textAxis.`
            );
          }
        }

        // Run compatibility validation
        const validation = validateChartCompatibility(chartType, inputAxisColumns as AxisColumnInput[]);
        if (!validation.valid) {
          return ToolResponse(validation.error!);
        }

        // Build payload axisColumns
        for (const col of inputAxisColumns) {
          const entry: Record<string, any> = {
            type: col.type,
            columnName: col.columnName,
            operation: col.operation,
          };
          if (col.tableName) entry.tableName = col.tableName;
          axisColumns.push(entry);
        }

        conf.chartType = chartType;

        if (filters) {
          for (const f of filters) {
            if (
              !("columnName" in f && "operation" in f && "filterType" in f && "values" in f && "exclude" in f)
            ) {
              return ToolResponse(
                "Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'."
              );
            }
          }
        }
      } else if (reportType === "summary") {
        if (!summaryConfig) {
          return ToolResponse("summaryConfig is required when reportType is 'summary'.");
        }
        const { groupBy, aggregate } = summaryConfig;

        for (const gb of groupBy) {
          axisColumns.push({
            type: "groupBy",
            columnName: gb.columnName,
            operation: gb.operation,
            tableName: gb.tableName,
          });
        }
        for (const ag of aggregate) {
          if (ag.operation === "actual") {
            return ToolResponse("Invalid operation 'actual' in aggregate. Use 'sum', 'count', etc.");
          }
          axisColumns.push({
            type: "summarize",
            columnName: ag.columnName,
            operation: ag.operation,
            tableName: ag.tableName,
          });
        }
      } else {
        // reportType === "pivot"
        if (!pivotConfig) {
          return ToolResponse("pivotConfig is required when reportType is 'pivot'.");
        }
        if (!pivotConfig.row && !pivotConfig.column && !pivotConfig.data) {
          return ToolResponse(
            "At least one of 'row', 'column', or 'data' must be provided in pivotConfig."
          );
        }

        const requiredKeys = ["columnName", "tableName", "operation"];
        for (const axisKey of ["row", "column", "data"] as const) {
          const axisList = pivotConfig[axisKey];
          if (axisList) {
            if (!Array.isArray(axisList) || axisList.length === 0) {
              return ToolResponse(
                `'${axisKey}' must be a non-empty list with 'columnName', 'tableName', and 'operation'.`
              );
            }
            for (const entry of axisList) {
              if (!requiredKeys.every((k) => k in entry)) {
                return ToolResponse(
                  `Each entry in '${axisKey}' must contain 'columnName', 'tableName', and 'operation'.`
                );
              }
              const defaultOperation =
                axisKey === "row" || axisKey === "column" ? "actual" : "count";
              axisColumns.push({
                type: axisKey,
                columnName: entry.columnName,
                operation: entry.operation || defaultOperation,
                tableName: entry.tableName,
              });
            }
          }
        }
      }

      conf.axisColumns = axisColumns;
      if (filters) {
        conf.filters = filters;
      }

      // Validate and add user filters if provided
      if (userFilters && userFilters.length > 0) {
        for (let i = 0; i < userFilters.length; i++) {
          const uf = userFilters[i];
          
          // Check required fields
          if (!uf.columnName) {
            return ToolResponse(`userFilters[${i}] is missing required field 'columnName'.`);
          }
          if (!uf.tableName) {
            return ToolResponse(`userFilters[${i}] ('${uf.columnName}') is missing required field 'tableName'. Unlike static filters, tableName is mandatory for user filters.`);
          }
          if (!uf.operation) {
            return ToolResponse(`userFilters[${i}] ('${uf.columnName}') is missing required field 'operation'.`);
          }

          // Validate compType requirement (required for all operations except 'dateRange')
          if (uf.operation !== "dateRange" && !uf.compType) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'compType' is required for all operations except 'dateRange'. ` +
              `For dimensions and dates use 'singleSelect' or 'multiSelect'. For measures use 'slider' or 'multiSelect'.`
            );
          }

          // Validate behaviour field (not applicable for dateRange or relative operations)
          if ((uf.operation === "dateRange" || uf.operation === "relative") && uf.behaviour) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'behaviour' field cannot be used with '${uf.operation}' operation. Remove the 'behaviour' field.`
            );
          }

          // Validate filterType requirement for measures and date actual/seasonal operations
          const measureOperations = ["sum", "max", "min", "avg", "std", "count", "dc"];
          const dateActualOrSeasonal = uf.operation === "actual" || uf.operation === "seasonal";
          const isMeasureOperation = measureOperations.includes(uf.operation);
          
          if ((isMeasureOperation || dateActualOrSeasonal) && uf.operation !== "dateRange" && uf.operation !== "relative" && !uf.filterType) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'filterType' is required for operation '${uf.operation}'. ` +
              `For measures use: 'individualValues', 'range', 'ranking', or 'rankingPct'. ` +
              `For date actual use: 'year', 'quarteryear', 'monthyear', 'weekyear', 'fulldate', 'datetime', 'quarter', 'month', 'week', 'date'. ` +
              `For date seasonal use: 'quarter', 'month', 'week', 'weekday', 'day', 'hour'.`
            );
          }
        }
        
        conf.userFilters = userFilters;
      }

      const reportTypeLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1);
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const analyticsClient = getAnalyticsClient();
          const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
          const reportId = await (workspaceInst as any).createReport(conf);
          return ToolResponse(`${reportTypeLabel} report created successfully. Report ID: ${reportId}`);
        },
        workspaceId
      );
    } catch (error: any) {
      if ("errorMessage" in error && "errorCode" in error) {
        const { errorMessage, errorCode } = error as { errorMessage: string; errorCode: number };
        if (errorCode === 8166) {
          return ToolResponse(
            errorMessage +
              "\nSupported operations for columns of different types:\n" +
              "  String: actual, count, distinctCount\n" +
              "  Number: measure, dimension, sum, average, min, max, count, distinctCount\n" +
              "  Date:   year, month, week, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount"
          );
        }
      }
      return logAndReturnError(error, "An error occurred while creating the report");
    }
  },
});

defineTool({
  name: "updateReport",
  description: `
    Update an existing report in the specified workspace in Zoho Analytics.
    Supports all report types: chart, pivot, and summary.

    IMPORTANT:
    - ALWAYS call the readReportMetadata tool first to retrieve the current configuration.
      The update is a FULL REPLACEMENT — the complete axis, filter, and user-filter configuration
      is replaced with whatever is sent. If you omit filters, existing filters are cleared.
    - baseTableName must NOT be provided for updates (it is inferred from the existing report).
    - title is optional in update. Omit it to keep the existing title.
    - reportType must always be supplied and must match the existing report type.

    -- Chart Update (reportType: "chart") ------------------------------------------
    - chartConfig is required. Contains:
        - chartType (str): The chart type. Examples: "bar", "horizontal bar", "stacked bar", "line",
          "area", "pie", "ring", "scatter", "bubble", "packed bubble", "funnel", "pyramid",
          "butterfly", "combo", "heat map", "tree map", "sunburst", "sankey", "word cloud",
          "race line", "race bar", "race bubble", "gantt", "histogram", "web",
          "map scatter", "map filled", "map bubble", "map pie", "geo heat map"
        - axisColumns (list[dict]): Each entry has:
            - type (str): "xAxis", "yAxis", "colorAxis", "sizeAxis", or "textAxis"
            - columnName (str)
            - operation (str):
                String: actual, count, distinctCount
                Number: measure, dimension, sum, average, min, max, count, distinctCount
                Date:   year, month, week, day, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
            - tableName (optional str): For columns from related tables.
    - The tool validates chart compatibility (axis columns vs. chart type).

    -- Summary Update (reportType: "summary") --------------------------------------
    - summaryConfig is required. Contains:
        - groupBy (list, min 1): Each entry - columnName, tableName, operation.
        - aggregate (list, min 1): Each entry - columnName, tableName, operation.
          Do NOT use "actual" in aggregate operations.

    -- Pivot Update (reportType: "pivot") ------------------------------------------
    - pivotConfig is required. At least one of row, column, or data must be provided. Contains:
        - row (optional list[dict]): Each dict - columnName, tableName, operation.
        - column (optional list[dict]): Same structure as row.
        - data (optional list[dict]): Same structure as row. Prefer aggregate operations.

    -- Filters (optional, all report types) ----------------------------------------
    Each filter:
    - tableName (str, optional)
    - columnName (str)
    - operation (str)
    - filterType (str): individualValues, range, ranking, rankingPct, dateRange, year, quarterYear,
      monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
    - values (list[str])
    - exclude (bool)

    -- User Filters (optional, all report types) -----------------------------------
    Interactive filter widgets exposed to viewers of the report. Omitting this clears existing user filters.
    Each user filter:
    - columnName (str, required): Column to expose as a user filter.
    - tableName (str, required): Table that owns the column. Unlike static filters, this is mandatory.
    - operation (str, required): Filter operation.
        Dimensions: "actual"
        Measures: "sum", "max", "min", "avg", "std", "count", "dc", "actual"
        Dates: "actual", "dateRange", "relative", "seasonal"
    - compType (str, conditional - required except for 'dateRange'): UI widget type.
        Dimensions/Dates: "singleSelect" or "multiSelect"
        Measures: "slider" or "multiSelect"
    - filterType (str, conditional - required for measures and date actual/seasonal):
        Measures: "individualValues", "range", "ranking", "rankingPct"
        Date actual: "year", "quarteryear", "monthyear", "weekyear", "fulldate", "datetime", "quarter", "month", "week", "date"
        Date seasonal: "quarter", "month", "week", "weekday", "day", "hour"
    - isallval (bool, optional): When true, defaults to showing all values.
    - values (list[str|number], optional): Available/pre-selected values for the filter widget.
    - defaultFilterValues (list[str], optional): Values pre-selected when the report loads.
    - exclude (bool, optional): When true, filter excludes selected values.
    - behaviour (str, optional): "ListAllValues", "ListRelevantValues", "ListOnlyRelevantValues".
        NOT applicable for "dateRange" or "relative" operations.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the report"),
    reportId: z.string().describe("The ID of the report to update"),
    reportType: z
      .enum(["chart", "summary", "pivot"])
      .describe("Type of the report being updated — must match the existing report type"),
    title: z
      .string()
      .optional()
      .describe("Optional. New title for the report. Omit to keep the existing title."),
    chartConfig: z
      .object({
        chartType: z
          .string()
          .describe(
            'Chart type, e.g. "bar", "line", "pie", "scatter", "bubble", "stacked bar", "funnel", "heat map", "sankey", and many more.'
          ),
        axisColumns: z
          .array(
            z.object({
              type: z
                .enum(["xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"])
                .describe('Axis shelf: "xAxis", "yAxis", "colorAxis", "sizeAxis", or "textAxis"'),
              columnName: z.string().describe("Name of the column"),
              operation: z
                .string()
                .describe(
                  "Operation for the column. String: actual/count/distinctCount. Number: measure/dimension/sum/average/min/max/count/distinctCount. Date: year/month/week/day/fullDate/dateTime/range/monthYear/quarterYear/weekYear/count/distinctCount"
                ),
              tableName: z
                .string()
                .optional()
                .describe("If the column belongs to a related table, provide its name"),
            })
          )
          .min(1)
          .describe("List of axis column definitions"),
      })
      .optional()
      .describe("Required when reportType is 'chart'"),
    summaryConfig: z
      .object({
        groupBy: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .min(1),
        aggregate: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .min(1),
      })
      .optional()
      .describe("Required when reportType is 'summary'"),
    pivotConfig: z
      .object({
        row: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
        column: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
        data: z
          .array(
            z.object({
              columnName: z.string(),
              tableName: z.string(),
              operation: z.string(),
            })
          )
          .optional(),
      })
      .optional()
      .describe("Required when reportType is 'pivot'"),
    filters: z
      .array(
        z.object({
          tableName: z.string().optional(),
          columnName: z.string(),
          operation: z.string(),
          filterType: z.string(),
          values: z.array(z.string()),
          exclude: z.boolean(),
        })
      )
      .optional()
      .describe("Optional filters. Omitting this clears existing filters."),
    userFilters: z
      .array(
        z.object({
          columnName: z.string(),
          tableName: z.string(),
          operation: z.string(),
          compType: z.string().optional(),
          filterType: z.string().optional(),
          isallval: z.boolean().optional(),
          values: z.array(z.union([z.string(), z.number()])).optional(),
          defaultFilterValues: z.array(z.string()).optional(),
          exclude: z.boolean().optional(),
          behaviour: z.string().optional(),
        })
      )
      .optional()
      .describe(
        "Optional user filters - interactive filter widgets exposed to viewers. Omitting this clears existing user filters. Each user filter must include columnName, tableName, and operation. compType is required for all operations except 'dateRange'. filterType is required for measures and date actual/seasonal operations."
      ),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({
    workspaceId,
    reportId,
    reportType,
    title,
    chartConfig,
    summaryConfig,
    pivotConfig,
    filters,
    userFilters,
    orgId,
  }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }

      const axisColumns: Record<string, any>[] = [];
      const conf: Record<string, any> = { reportType };

      if (title) {
        conf.title = title;
      }

      if (reportType === "chart") {
        if (!chartConfig) {
          return ToolResponse("chartConfig is required when reportType is 'chart'.");
        }
        const { chartType, axisColumns: inputAxisColumns } = chartConfig;

        if (!chartType) {
          return ToolResponse("Chart type is required. Please provide 'chartType' in chartConfig.");
        }
        if (!inputAxisColumns || inputAxisColumns.length === 0) {
          return ToolResponse("At least one axis column must be provided in chartConfig.axisColumns.");
        }

        // Validate each axis column has required fields
        for (let i = 0; i < inputAxisColumns.length; i++) {
          const col = inputAxisColumns[i];
          if (!col.columnName) {
            return ToolResponse(`axisColumns[${i}] is missing 'columnName'.`);
          }
          if (!col.operation) {
            return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'operation'.`);
          }
          if (!col.type) {
            return ToolResponse(
              `axisColumns[${i}] ('${col.columnName}') is missing 'type'. Must be one of: xAxis, yAxis, colorAxis, sizeAxis, textAxis.`
            );
          }
        }

        // Run compatibility validation
        const validation = validateChartCompatibility(chartType, inputAxisColumns as AxisColumnInput[]);
        if (!validation.valid) {
          return ToolResponse(validation.error!);
        }

        // Build payload axisColumns
        for (const col of inputAxisColumns) {
          const entry: Record<string, any> = {
            type: col.type,
            columnName: col.columnName,
            operation: col.operation,
          };
          if (col.tableName) entry.tableName = col.tableName;
          axisColumns.push(entry);
        }

        conf.chartType = chartType;

        if (filters) {
          for (const f of filters) {
            if (
              !("columnName" in f && "operation" in f && "filterType" in f && "values" in f && "exclude" in f)
            ) {
              return ToolResponse(
                "Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'."
              );
            }
          }
        }
      } else if (reportType === "summary") {
        if (!summaryConfig) {
          return ToolResponse("summaryConfig is required when reportType is 'summary'.");
        }
        const { groupBy, aggregate } = summaryConfig;

        for (const gb of groupBy) {
          axisColumns.push({
            type: "groupBy",
            columnName: gb.columnName,
            operation: gb.operation,
            tableName: gb.tableName,
          });
        }
        for (const ag of aggregate) {
          if (ag.operation === "actual") {
            return ToolResponse("Invalid operation 'actual' in aggregate. Use 'sum', 'count', etc.");
          }
          axisColumns.push({
            type: "summarize",
            columnName: ag.columnName,
            operation: ag.operation,
            tableName: ag.tableName,
          });
        }
      } else {
        // reportType === "pivot"
        if (!pivotConfig) {
          return ToolResponse("pivotConfig is required when reportType is 'pivot'.");
        }
        if (!pivotConfig.row && !pivotConfig.column && !pivotConfig.data) {
          return ToolResponse(
            "At least one of 'row', 'column', or 'data' must be provided in pivotConfig."
          );
        }

        const requiredKeys = ["columnName", "tableName", "operation"];
        for (const axisKey of ["row", "column", "data"] as const) {
          const axisList = pivotConfig[axisKey];
          if (axisList) {
            if (!Array.isArray(axisList) || axisList.length === 0) {
              return ToolResponse(
                `'${axisKey}' must be a non-empty list with 'columnName', 'tableName', and 'operation'.`
              );
            }
            for (const entry of axisList) {
              if (!requiredKeys.every((k) => k in entry)) {
                return ToolResponse(
                  `Each entry in '${axisKey}' must contain 'columnName', 'tableName', and 'operation'.`
                );
              }
              const defaultOperation =
                axisKey === "row" || axisKey === "column" ? "actual" : "count";
              axisColumns.push({
                type: axisKey,
                columnName: entry.columnName,
                operation: entry.operation || defaultOperation,
                tableName: entry.tableName,
              });
            }
          }
        }

        if (filters) {
          for (const f of filters) {
            if (
              !["columnName", "operation", "filterType", "values", "exclude"].every((k) => k in f)
            ) {
              return ToolResponse(
                "Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'."
              );
            }
          }
        }
      }

      conf.axisColumns = axisColumns;
      if (filters) {
        conf.filters = filters;
      }

      // Validate and add user filters if provided
      if (userFilters && userFilters.length > 0) {
        for (let i = 0; i < userFilters.length; i++) {
          const uf = userFilters[i];
          
          // Check required fields
          if (!uf.columnName) {
            return ToolResponse(`userFilters[${i}] is missing required field 'columnName'.`);
          }
          if (!uf.tableName) {
            return ToolResponse(`userFilters[${i}] ('${uf.columnName}') is missing required field 'tableName'. Unlike static filters, tableName is mandatory for user filters.`);
          }
          if (!uf.operation) {
            return ToolResponse(`userFilters[${i}] ('${uf.columnName}') is missing required field 'operation'.`);
          }

          // Validate compType requirement (required for all operations except 'dateRange')
          if (uf.operation !== "dateRange" && !uf.compType) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'compType' is required for all operations except 'dateRange'. ` +
              `For dimensions and dates use 'singleSelect' or 'multiSelect'. For measures use 'slider' or 'multiSelect'.`
            );
          }

          // Validate behaviour field (not applicable for dateRange or relative operations)
          if ((uf.operation === "dateRange" || uf.operation === "relative") && uf.behaviour) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'behaviour' field cannot be used with '${uf.operation}' operation. Remove the 'behaviour' field.`
            );
          }

          // Validate filterType requirement for measures and date actual/seasonal operations
          const measureOperations = ["sum", "max", "min", "avg", "std", "count", "dc"];
          const dateActualOrSeasonal = uf.operation === "actual" || uf.operation === "seasonal";
          const isMeasureOperation = measureOperations.includes(uf.operation);
          
          if ((isMeasureOperation || dateActualOrSeasonal) && uf.operation !== "dateRange" && uf.operation !== "relative" && !uf.filterType) {
            return ToolResponse(
              `userFilters[${i}] ('${uf.columnName}'): 'filterType' is required for operation '${uf.operation}'. ` +
              `For measures use: 'individualValues', 'range', 'ranking', or 'rankingPct'. ` +
              `For date actual use: 'year', 'quarteryear', 'monthyear', 'weekyear', 'fulldate', 'datetime', 'quarter', 'month', 'week', 'date'. ` +
              `For date seasonal use: 'quarter', 'month', 'week', 'weekday', 'day', 'hour'.`
            );
          }
        }
        
        conf.userFilters = userFilters;
      }

      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          await (workspaceInst as any).updateReport(reportId, conf);
          return ToolResponse(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report '${reportId}' updated successfully.`);
        },
        workspaceId
      );
    } catch (error: any) {
      if ("errorMessage" in error && "errorCode" in error) {
        const { errorMessage, errorCode } = error as { errorMessage: string; errorCode: number };
        if (errorCode === 8166) {
          return ToolResponse(
            errorMessage +
              "\nSupported operations for columns of different types:\n" +
              "  String: actual, count, distinctCount\n" +
              "  Number: measure, dimension, sum, average, min, max, count, distinctCount\n" +
              "  Date:   year, month, week, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount"
          );
        }
      }
      return logAndReturnError(error, "An error occurred while updating the report");
    }
  },
});
