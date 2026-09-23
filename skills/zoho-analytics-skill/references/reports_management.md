# Reports Creation & Management

Reports are visualizations built on top of an existing table or query table in a workspace: charts, summary views, and pivot tables.

**Terminology note:** Data Management and Table Schema Management operations identify a table using `tableId`. Report operations identify the base table using `tableName` instead — pass the table's **name**, not its ID.

---

## Tools Overview

| Tool | Purpose |
|---|---|
| `createReport` | Create a new chart, summary, or pivot report |
| `readReportMetadata` | Read the current design configuration of an existing report |
| `updateReport` | Update (full-replace) the configuration of an existing report |

---

## 1. `createReport`

Creates a new report in the specified workspace.

**Required parameters (all report types):**

| Parameter | Type | Description |
|---|---|---|
| `workspaceId` | string | ID of the workspace to create the report in |
| `tableName` | string | Name of the base table for the report |
| `reportName` | string | Desired name for the new report |
| `reportType` | `"chart"` \| `"summary"` \| `"pivot"` | Type of report to create |

**Type-specific config (provide exactly one matching `reportType`):**

| `reportType` | Required config | Reference |
|---|---|---|
| `chart` | `chartConfig` | [Chart Reports](./charts.md) |
| `summary` | `summaryConfig` | [Summary Reports](./summary.md) |
| `pivot` | `pivotConfig` | [Pivot Reports](./pivot.md) |

**Optional:**

| Parameter | Description |
|---|---|
| `filters` | Restrict the dataset before the report is computed. See [Filters](./filters.md) — load this only when you need to work with static filters. |
| `userFilters` | Interactive filter widgets for report viewers. See [User Filters](./user_filters.md) — load this only when you need to add user-controllable filters. |

**Tool call shape:**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "<chart|summary|pivot>",
        "<chartConfig|summaryConfig|pivotConfig>": { ... },
        "filters": [<filter_objects>]   // optional
    }
)
```

**Important notes:**
- Always provide **exactly one** config object that matches `reportType`.
- The tool performs chart-compatibility validation and returns a detailed error if axis columns and operations don't match the chart type.
- Before adding filters, validate potential filter values using the `queryData` tool to ensure values exist in the data.
- Columns in axis definitions can come from related tables (via lookup relationships) — set `tableName` on each axis column entry when referencing a non-base table.

Load the reference file for your specific report type for the full config shape, valid operations, and examples. Load [Filters](./filters.md) only if you need to work with filters.

---

## 2. `readReportMetadata`

Reads the full design configuration of an existing report. Supports all report types (chart, summary, pivot).

This is a **read-only** operation. Load [Read & Update Reports](./reports_read_update.md) for complete documentation on this tool.

> **Always call `readReportMetadata` before `updateReport`.** The update is a full replacement — knowing the current state is essential to avoid accidentally clearing existing configuration.

---

## 3. `updateReport`

Updates (full-replaces) the configuration of an existing report. Supports all report types (chart, summary, pivot).

Load [Read & Update Reports](./reports_read_update.md) for complete documentation, argument reference, and examples for all three report types.
