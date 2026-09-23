# Chart Reports

Creates or updates a chart report on top of a table or query table, via `createReport` (with `reportType: "chart"` and `chartConfig`) or `updateReport`.

For `updateReport` usage, see [Read & Update Reports](./reports_read_update.md). This file documents the `chartConfig` shape and valid values applicable to both tools.

---

## `chartConfig` Object

`chartConfig` is required when `reportType` is `"chart"`.

| Field | Type | Required | Description |
|---|---|---|---|
| `chartType` | string | Yes | The chart type to render. See "Supported chart types" below. |
| `axisColumns` | array | Yes | List of axis column definitions. Minimum 1 entry. |

### `axisColumns` entries

Each entry in `axisColumns` is an object:

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | The axis shelf. One of: `xAxis`, `yAxis`, `colorAxis`, `sizeAxis`, `textAxis` |
| `columnName` | string | Yes | Name of the column to place on this axis |
| `operation` | string | Yes | Aggregation or grouping applied to the column. Valid values depend on column data type — see table below |
| `tableName` | string | No | Name of the table the column belongs to. Required when the column comes from a **related table** (via lookup), not the report's base table |

### `operation` values by data type

| Data type | Valid `operation` values |
|---|---|
| String | `actual`, `count`, `distinctCount` |
| Number | `measure`, `dimension`, `sum`, `average`, `min`, `max`, `count`, `distinctCount` |
| Date | `year`, `month`, `week`, `day`, `fullDate`, `dateTime`, `range`, `monthYear`, `quarterYear`, `weekYear`, `count`, `distinctCount` |

---

## Axis Shelf Rules

| Axis shelf | Purpose | Notes |
|---|---|---|
| `xAxis` | Category / dimension axis | Typically a string or date column; use `actual` (string), `dimension` (number), or a date granularity |
| `yAxis` | Measure / value axis | Typically a number column; use an aggregate (`sum`, `count`, etc.) |
| `colorAxis` | Color segmentation | Adds a color dimension or aggregate for chart coloring |
| `sizeAxis` | Bubble size | **Required** for `bubble` and `packed bubble` charts |
| `textAxis` | Label / text overlay | Adds a data label dimension |

---

## Supported Chart Types

`chartType` accepts any of the following values:

**Standard charts:**
`bar`, `horizontal bar`, `stacked bar`, `line`, `area`, `pie`, `ring`, `scatter`, `bubble`, `packed bubble`, `funnel`, `pyramid`, `butterfly`, `combo`, `histogram`

**Advanced / specialty charts:**
`heat map`, `tree map`, `sunburst`, `sankey`, `word cloud`, `web`

**Animated / race charts:**
`race line`, `race bar`, `race bubble`

**Timeline:**
`gantt`

**Geo / map charts:**
`map scatter`, `map filled`, `map bubble`, `map pie`, `geo heat map`

---

## Important Notes

- The tool performs **chart compatibility validation** — it checks whether the axis columns and operations are valid for the chosen `chartType`. If invalid, it returns a detailed error message with guidance.
- `sizeAxis` is **required** for `bubble` and `packed bubble` charts.
- Use `colorAxis` to add a color segmentation dimension or aggregate.
- For a **scatter** chart, `yAxis.operation` can be `actual` (raw values plotted point-by-point). For all other chart types, use an aggregate on `yAxis`.
- For a numeric column on `xAxis` in non-scatter charts, use `dimension` (not an aggregate) to treat it as a category axis.
- Columns can come from **related tables** (via lookup relationships) — set `tableName` on the axis column entry to specify which table it belongs to.
- Before adding filters, validate expected filter values using the `queryData` tool.

---

## Tool Call Shape

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "<chart_type>",
            "axisColumns": [
                {
                    "type": "<xAxis|yAxis|colorAxis|sizeAxis|textAxis>",
                    "columnName": "<column_name>",
                    "operation": "<operation>",
                    "tableName": "<table_name>"   // optional
                }
            ]
        },
        "filters": [<filter_objects>]   // optional — see filters.md
    }
)
```

---

## Examples

**Example 1 — Total sales by product category (bar chart):**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales by Category",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "bar",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Product Category", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"}
            ]
        }
    }
)
```

**Example 2 — Monthly sales trend (line chart with date granularity):**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Monthly Sales Trend",
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

**Example 3 — Sales vs. discount as a scatter plot (raw values):**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales vs Discount",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "scatter",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Discount", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "actual"}
            ]
        }
    }
)
```

**Example 4 — Bubble chart with size axis (sales, orders, profit):**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales Bubble Chart",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "bubble",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Product Category", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"},
                {"type": "sizeAxis", "columnName": "Quantity", "operation": "sum"}
            ]
        }
    }
)
```

**Example 5 — Sales by region and category with color segmentation:**
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales by Region & Category",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "bar",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Region", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"},
                {"type": "colorAxis", "columnName": "Product Category", "operation": "actual"}
            ]
        }
    }
)
```
