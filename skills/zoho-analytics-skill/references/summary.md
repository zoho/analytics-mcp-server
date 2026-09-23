# Summary Reports

Creates or updates a summary view — a grouped aggregate report with group-by and aggregate logic — on top of a table or query table, via `createReport` (with `reportType: "summary"` and `summaryConfig`) or `updateReport`.

For `updateReport` usage, see [Read & Update Reports](./reports_read_update.md). This file documents the `summaryConfig` shape and valid values applicable to both tools.

## Create Summary

Arguments (passed to `createReport`):
- workspaceId (required): The ID of the workspace to create the report in.
- tableName (required): Name of the base table for the report.
- reportName (required): Desired name for the report.
- reportType (required): Must be `"summary"`.
- summaryConfig (required): Object —
  - groupBy (required, minimum 1 entry): List of objects — `columnName` (required), `tableName` (required), `operation` (required).
  - aggregate (required, minimum 1 entry): List of objects — `columnName` (required), `tableName` (required), `operation` (required).
- filters (optional): List of filter objects — see [Filters](./filters.md).

## Important notes

- Valid `groupBy` operations depend on the column's data type:
  - Date: `year`, `quarterYear`, `monthYear`, `weekYear`, `fullDate`, `dateTime`, `range`, `quarter`, `month`, `week`, `weekDay`, `day`, `hour`, `count`, `distinctCount`
  - String: `actual`, `count`, `distinctCount`
  - Number: `measure`, `dimension`, `sum`, `average`, `min`, `max`, `count`, `distinctCount`
- Valid `aggregate` operations are `sum`, `count`, `average`, `min`, `max`. Never use `actual` in `aggregate` — every aggregate entry must produce a computed value, not the raw column; the tool rejects `actual` here explicitly.
- Unlike Chart reports (see [Charts](./charts.md)), every `groupBy` and `aggregate` entry requires its own `tableName`, even when it's the same as the report's base `tableName` — supply it explicitly on each entry.

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "summary",
        "summaryConfig": {
            "groupBy": [{"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}],
            "aggregate": [{"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}]
        },
        "filters": [<filter_objects>]
    }
)
```

Example — total sales and order count by region:
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales Summary by Region",
        "reportType": "summary",
        "summaryConfig": {
            "groupBy": [
                {"columnName": "Region", "tableName": "Sales Data", "operation": "actual"}
            ],
            "aggregate": [
                {"columnName": "Sales Amount", "tableName": "Sales Data", "operation": "sum"},
                {"columnName": "Order ID", "tableName": "Sales Data", "operation": "count"}
            ]
        }
    }
)
```