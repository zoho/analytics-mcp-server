# Read & Update Reports

This file documents the `readReportMetadata` and `updateReport` tools. Both support all report types: chart, summary, and pivot.

> **Mandatory workflow:** Always call `readReportMetadata` **before** `updateReport`. The update performs a **full replacement** of axis, filter, and user-filter configuration. Inspect the current state first, modify the desired fields, then submit via `updateReport`.

---

## 1. `readReportMetadata`

Retrieves the full design configuration of an existing report.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the report |
| `reportId` | string | Yes | ID of the report to read |
| `orgId` | string | No | Organization ID. Defaults to the configured `ORGID` if omitted |

**Returns:** A JSON object with the report's complete design configuration, including:
- `title` — report name
- `reportType` — `"chart"`, `"summary"`, or `"pivot"`
- `chartType` — chart type (chart reports only)
- `axisColumns` — full list of axis/groupBy/pivot column definitions
- `filters` — active filters
- `userFilters` — user-level filters (if any)

**Tool call:**
```
execute_analytics_tool(
    "readReportMetadata",
    {
        "workspaceId": "<workspace_id>",
        "reportId": "<report_id>"
    }
)
```

**Example:**
```
execute_analytics_tool(
    "readReportMetadata",
    {
        "workspaceId": "123456789",
        "reportId": "987654321"
    }
)
```

---

## 2. `updateReport`

Updates the configuration of an existing report. This is a **full replacement** — whatever you send becomes the new state. Omitting `filters` clears all existing filters.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the report |
| `reportId` | string | Yes | ID of the report to update |
| `reportType` | `"chart"` \| `"summary"` \| `"pivot"` | Yes | Must match the existing report's type |
| `title` | string | No | New title. Omit to keep the existing title |
| `chartConfig` | object | When `reportType` is `"chart"` | Full chart configuration (see below) |
| `summaryConfig` | object | When `reportType` is `"summary"` | Full summary configuration (see below) |
| `pivotConfig` | object | When `reportType` is `"pivot"` | Full pivot configuration (see below) |
| `filters` | array | No | Filters to apply. **Omitting this clears all existing filters.** See [Filters](./filters.md) |
| `userFilters` | array | No | User filter widgets. **Omitting this clears all existing user filters.** See [User Filters](./user_filters.md) |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Critical rules:**
- Do **not** provide `baseTableName` — it is inferred from the existing report and must not be sent.
- `reportType` must **always** be supplied and must match the existing report type exactly. You cannot change a chart into a pivot via update.
- This is a full config replacement. Always read current metadata first.

---

### Chart Update (`reportType: "chart"`)

`chartConfig` is required. Shape:

```json
{
    "chartType": "<chart_type>",
    "axisColumns": [
        {
            "type": "<xAxis|yAxis|colorAxis|sizeAxis|textAxis>",
            "columnName": "<column_name>",
            "operation": "<operation>",
            "tableName": "<table_name>"   // optional; needed for related-table columns
        }
    ]
}
```

See [Chart Reports](./charts.md) for the full chart type list, valid operations per data type, axis shelf rules, and compatibility notes.

**Example — change a bar chart to a line chart and update its Y-axis aggregate:**
```
execute_analytics_tool(
    "updateReport",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "line",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Order Date", "operation": "monthYear"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"}
            ]
        }
    }
)
```

---

### Summary Update (`reportType: "summary"`)

`summaryConfig` is required. Shape:

```json
{
    "groupBy": [
        {"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}
    ],
    "aggregate": [
        {"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}
    ]
}
```

- `groupBy` requires at least 1 entry.
- `aggregate` requires at least 1 entry. Do **not** use `"actual"` in aggregate operations.
- Every entry (both `groupBy` and `aggregate`) requires its own `tableName`, even when it's the same as the base table.

**Example — change group-by granularity from month to year:**
```
execute_analytics_tool(
    "updateReport",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "reportType": "summary",
        "summaryConfig": {
            "groupBy": [
                {"columnName": "Order Date", "tableName": "Sales Data", "operation": "year"}
            ],
            "aggregate": [
                {"columnName": "Sales Amount", "tableName": "Sales Data", "operation": "sum"},
                {"columnName": "Order ID", "tableName": "Sales Data", "operation": "count"}
            ]
        }
    }
)
```

---

### Pivot Update (`reportType: "pivot"`)

`pivotConfig` is required. At least one of `row`, `column`, or `data` must be provided. Shape:

```json
{
    "row": [
        {"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}
    ],
    "column": [
        {"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}
    ],
    "data": [
        {"columnName": "<column_name>", "tableName": "<table_name>", "operation": "<operation>"}
    ]
}
```

- For `row`/`column`: prefer non-aggregate operations (`actual`, `measure`, `dimension`).
- For `data`: prefer aggregate operations (`sum`, `count`, `average`, `min`, `max`).
- Each entry requires `columnName`, `tableName`, and `operation`.

**Example — add a new data field to an existing pivot:**
```
execute_analytics_tool(
    "updateReport",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "reportType": "pivot",
        "pivotConfig": {
            "row": [
                {"columnName": "Region", "tableName": "Sales Data", "operation": "actual"}
            ],
            "column": [
                {"columnName": "Product Category", "tableName": "Sales Data", "operation": "actual"}
            ],
            "data": [
                {"columnName": "Sales Amount", "tableName": "Sales Data", "operation": "sum"},
                {"columnName": "Quantity", "tableName": "Sales Data", "operation": "sum"}
            ]
        }
    }
)
```

---

## Full Workflow Example

**Task:** Change the Y-axis aggregate of a chart report from `count` to `sum`.

**Step 1 — Read current config:**
```
execute_analytics_tool(
    "readReportMetadata",
    {
        "workspaceId": "123456789",
        "reportId": "987654321"
    }
)
```

**Step 2 — Inspect the returned JSON.** Identify the current `chartType`, `axisColumns`, and `filters`.

**Step 3 — Submit update with the modified field, preserving everything else:**
```
execute_analytics_tool(
    "updateReport",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "bar",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Product Category", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"}
            ]
        },
        "filters": [
            {
                "columnName": "Region",
                "operation": "actual",
                "filterType": "individualValues",
                "values": ["West", "North"],
                "exclude": false
            }
        ]
    }
)
```

> Filters from Step 2 are re-submitted explicitly here to preserve them. If omitted, they would be cleared.
