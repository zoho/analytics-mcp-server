# Reports Management

Reports are visualizations built on top of an existing table or query table in a workspace: charts, summary views, and pivot tables.

**Terminology note:** Data Management and Table Schema Management operations identify a table using `tableId` (viewId). Report operations identify the base table using `tableName` — pass the table's **name**, not its ID.

---

## Tools Overview

| Tool | Purpose |
|---|---|
| `createReport` | Create a new chart, summary, or pivot report |
| `readReportMetadata` | Read the current design configuration of an existing report |
| `updateReport` | Update (full-replace) the configuration of an existing report |

> **Mandatory workflow for updates:** Always call `readReportMetadata` before `updateReport`. The update performs a **full replacement** of axis, filter, and user-filter configuration — inspect the current state first, modify the desired fields, then submit via `updateReport`.

---

## 1. `createReport`

Creates a new report in the specified workspace.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace to create the report in |
| `tableName` | string | Yes | Name of the base table for the report |
| `reportName` | string | Yes | Desired name for the new report |
| `reportType` | `"chart"` \| `"summary"` \| `"pivot"` | Yes | Type of report to create |
| `chartConfig` | object | When `reportType` is `"chart"` | Full chart configuration |
| `summaryConfig` | object | When `reportType` is `"summary"` | Full summary configuration |
| `pivotConfig` | object | When `reportType` is `"pivot"` | Full pivot configuration |
| `filters` | array | No | Static filters — restrict dataset before report is computed. See [Filters](./filters.md) |
| `userFilters` | array | No | Interactive filter widgets for report viewers. See [User Filters](./user_filters.md) |

Always provide **exactly one** config object matching `reportType`. Load the type-specific reference only when needed:

| `reportType` | Config key | Reference |
|---|---|---|
| `chart` | `chartConfig` | [Chart Reports](./charts.md) |
| `summary` | `summaryConfig` | [Summary Reports](./summary.md) |
| `pivot` | `pivotConfig` | [Pivot Reports](./pivot.md) |

**Tool call shape:**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "<chart|summary|pivot>",
        "<chartConfig|summaryConfig|pivotConfig>": { ... }
    }
)
```

**Important notes:**
- The tool performs chart-compatibility validation and returns a detailed error if axis columns and operations don't match the chart type.
- Columns in axis definitions can come from related tables (via lookup relationships) — set `tableName` on each axis column entry when referencing a non-base table.
- Before adding static filters, validate values using `queryData` to ensure they exist in the data.

---

## 2. `readReportMetadata`

Retrieves the full design configuration of an existing report. This is a **read-only** operation. Supports all report types.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the report |
| `reportId` | string | Yes | ID of the report to read |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Returns:** A JSON object with the complete design configuration, including:
- `title` — report name
- `reportType` — `"chart"`, `"summary"`, or `"pivot"`
- `chartType` — chart type (chart reports only)
- `axisColumns` — full list of axis/groupBy/pivot column definitions
- `filters` — active static filters
- `userFilters` — user filter widgets (if any)

**Tool call:**
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

## 3. `updateReport`

Updates (full-replaces) the configuration of an existing report. Supports all report types.

**⚠️ Critical:** This is a full replacement. Omitting `filters` clears all filters. Omitting `userFilters` clears all user filters. Always read current metadata first.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the report |
| `reportId` | string | Yes | ID of the report to update |
| `reportType` | `"chart"` \| `"summary"` \| `"pivot"` | Yes | Must match the existing report's type — cannot change report type via update |
| `title` | string | No | New title. Omit to keep the existing title |
| `chartConfig` | object | When `reportType` is `"chart"` | Full chart configuration |
| `summaryConfig` | object | When `reportType` is `"summary"` | Full summary configuration |
| `pivotConfig` | object | When `reportType` is `"pivot"` | Full pivot configuration |
| `filters` | array | No | **Omitting clears all existing filters.** See [Filters](./filters.md) |
| `userFilters` | array | No | **Omitting clears all existing user filters.** See [User Filters](./user_filters.md) |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Additional rules:**
- Do **not** provide `baseTableName` — it is inferred from the existing report.
- Config structure for each report type is identical to `createReport` — same fields, same validation.

---

### Chart Config (`reportType: "chart"`)

`chartConfig` shape:
```json
{
    "chartType": "<chart_type>",
    "axisColumns": [
        {
            "type": "<xAxis|yAxis|colorAxis|sizeAxis|textAxis>",
            "columnName": "<column_name>",
            "operation": "<operation>",
            "tableName": "<table_name>"
        }
    ]
}
```

Operations by data type:
- String: `actual`, `count`, `distinctCount`
- Number: `measure`, `dimension`, `sum`, `average`, `min`, `max`, `count`, `distinctCount`
- Date: `year`, `month`, `week`, `day`, `fullDate`, `dateTime`, `range`, `monthYear`, `quarterYear`, `weekYear`, `count`, `distinctCount`

See [Chart Reports](./charts.md) for the full chart type list, axis shelf rules, and compatibility notes.

**Example — change a bar chart to a line chart:**
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

### Summary Config (`reportType: "summary"`)

`summaryConfig` shape:
```json
{
    "groupBy": [
        {"columnName": "<column>", "tableName": "<table>", "operation": "<operation>"}
    ],
    "aggregate": [
        {"columnName": "<column>", "tableName": "<table>", "operation": "<operation>"}
    ]
}
```

- `groupBy` requires at least 1 entry.
- `aggregate` requires at least 1 entry. Do **not** use `"actual"` in aggregate operations.
- Every entry requires its own `tableName`, even when it's the same as the base table.

**Example:**
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

### Pivot Config (`reportType: "pivot"`)

`pivotConfig` shape — at least one of `row`, `column`, or `data` must be provided:
```json
{
    "row": [{"columnName": "<col>", "tableName": "<table>", "operation": "<operation>"}],
    "column": [{"columnName": "<col>", "tableName": "<table>", "operation": "<operation>"}],
    "data": [{"columnName": "<col>", "tableName": "<table>", "operation": "<operation>"}]
}
```

- For `row`/`column`: prefer non-aggregate operations (`actual`, `measure`, `dimension`).
- For `data`: prefer aggregate operations (`sum`, `count`, `average`, `min`, `max`).

---

## Full Update Workflow Example

**Task:** Change the Y-axis aggregate from `count` to `sum` on a chart, preserving its existing filters.

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

**Step 2 — Inspect the returned JSON.** Note the current `chartType`, `axisColumns`, `filters`, and `userFilters`.

**Step 3 — Submit update with the modified field, re-submitting everything else to preserve it:**
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

> Filters from Step 2 are re-submitted explicitly to preserve them. Omitting them would clear them.
