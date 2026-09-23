# Pivot Reports

Creates or updates a pivot table — a multidimensional data summary with rows, columns, and data fields — on top of a table or query table, via `createReport` (with `reportType: "pivot"` and `pivotConfig`) or `updateReport`.

For `updateReport` usage, see [Reports Management](./reports_management.md). This file documents the `pivotConfig` shape and valid values applicable to both tools.

## Create Pivot

Arguments (passed to `createReport`):
- workspaceId (required): The ID of the workspace to create the report in.
- tableName (required): Name of the base table for the report.
- reportName (required): Desired name for the report.
- reportType (required): Must be `"pivot"`.
- pivotConfig (required): Object —
  - row (optional): List of objects — `columnName` (required), `tableName` (required), `operation` (required).
  - column (optional): List of objects — same shape as `row`.
  - data (optional): List of objects — same shape as `row`.
  - At least one of `row`, `column`, or `data` must be provided — all three are individually optional, but an empty `pivotConfig` with none of them set is not valid.
- filters (optional): List of filter objects — see [Filters](./filters.md).

## Important notes

- Valid `operation` values depend on the column's data type:
  - String: `actual`, `count`, `distinctCount`
  - Number: `measure`, `dimension`, `sum`, `average`, `min`, `max`, `count`
  - Date: `year`, `month`, `week`, `day` (note: unlike Create Summary's `groupBy`, `quarter` and other date-part operations are not valid here)
- For `row`/`column` entries, prefer non-aggregate operations (`actual`, `measure`, `dimension`) — these define the pivot's grouping axes, not its computed values.
- For `data` entries, prefer aggregate operations (`sum`, `count`, `average`, `min`, `max`) — these are the values being summarized.
- As with Create Summary (and unlike Create Chart), every `row`/`column`/`data` entry requires its own `tableName` — see [Summary](./summary.md) and [Charts](./charts.md).

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "pivot",
        "pivotConfig": {
            "row": [{"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}],
            "column": [{"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}],
            "data": [{"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}]
        },
        "filters": [<filter_objects>]
    }
)
```

Example — sales by region (rows) and month (columns):
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales Pivot by Region and Month",
        "reportType": "pivot",
        "pivotConfig": {
            "row": [
                {"columnName": "Region", "tableName": "Sales Data", "operation": "actual"}
            ],
            "column": [
                {"columnName": "Order Date", "tableName": "Sales Data", "operation": "month"}
            ],
            "data": [
                {"columnName": "Sales Amount", "tableName": "Sales Data", "operation": "sum"}
            ]
        }
    }
)
```