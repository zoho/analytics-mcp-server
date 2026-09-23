# User Filters

User filters are interactive filter widgets exposed to viewers of a report. Unlike static filters (see [Filters](./filters.md)), which are pre-applied by the report creator and fixed, user filters allow report viewers to dynamically filter the data themselves through interactive UI controls.

**Key difference:**
- **Static filters** (`filters`): Pre-applied by report creator; viewers see already-filtered data; not changeable by viewers.
- **User filters** (`userFilters`): Interactive widgets (dropdowns, sliders, date pickers) that viewers can adjust to explore different data slices.

---

## When to Use User Filters

Use user filters when:
- You want report viewers to interactively explore data without creating multiple report versions
- You need to provide self-service analytics capabilities
- Different viewers need different data perspectives (e.g., each sales rep viewing their own region)
- You want to enable ad-hoc filtering without modifying the report definition

---

## Adding & Modifying User Filters

User filters are set via the `userFilters` parameter on both `createReport` and `updateReport`.

**⚠️ Full-replace behavior on update:** `updateReport` performs a full replacement — if you omit `userFilters`, all existing user filters are cleared. Always call `readReportMetadata` first, copy the existing `userFilters` array, modify as needed, then re-submit the full array via `updateReport`.
a

---

## User Filter Object Structure

Each entry in the `userFilters` array is an object with the following fields:

### Required Fields

| Field | Type | Description |
|---|---|---|
| `columnName` | string | Column to expose as a user filter |
| `tableName` | string | Table that owns the column. **Always mandatory** (unlike static filters) |
| `operation` | string | Filter operation. Valid values depend on column type — see below |

### Conditional Fields

| Field | Type | When Required | Description |
|---|---|---|---|
| `compType` | string | All operations **except** `dateRange` | UI widget type. See "Component Types" below |
| `filterType` | string | Required for **measures** and **date actual/seasonal** operations | Filter granularity/type. See "Filter Types" below |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `isallval` | boolean | When `true`, defaults to showing all values in the filter widget |
| `values` | array | Available values for the filter widget (strings or numbers) |
| `defaultFilterValues` | array | Values pre-selected when the report first loads (strings) |
| `exclude` | boolean | When `true`, filter excludes selected values instead of including them |
| `behaviour` | string | Value listing behavior: `"ListAllValues"`, `"ListRelevantValues"`, `"ListOnlyRelevantValues"`. **NOT applicable** for `dateRange` or `relative` operations |

---

## Operations by Column Type

### Dimension Columns (String/Categorical)

| Valid `operation` | Component types | filterType needed? |
|---|---|---|
| `actual` | `singleSelect`, `multiSelect` | No |

**Example:**
```json
{
    "columnName": "Region",
    "tableName": "Sales Data",
    "operation": "actual",
    "compType": "multiSelect",
    "isallval": true,
    "behaviour": "ListAllValues"
}
```

---

### Measure Columns (Numeric)

| Valid `operation` values | Component types | filterType needed? |
|---|---|---|
| `sum`, `max`, `min`, `avg`, `std`, `count`, `dc`, `actual` | `slider`, `multiSelect` | **Yes** |

**Filter types:** `individualValues`, `range`, `ranking`, `rankingPct`

**Example — Top-N ranking slider:**
```json
{
    "columnName": "Sales Amount",
    "tableName": "Sales Data",
    "operation": "sum",
    "compType": "slider",
    "filterType": "ranking",
    "values": ["Top 5", "Top 10", "Top 20"],
    "defaultFilterValues": ["Top 10"]
}
```

**Example — Range filter:**
```json
{
    "columnName": "Quantity",
    "tableName": "Sales Data",
    "operation": "actual",
    "compType": "multiSelect",
    "filterType": "range",
    "values": ["100 and below", "101 to 500", "501 and above"],
    "defaultFilterValues": ["101 to 500"]
}
```

---

### Date Columns

| Operation mode | `operation` value | `compType` needed? | `filterType` needed? |
|---|---|---|---|
| Actual (calendar periods) | `actual` | Yes | **Yes** |
| Date range picker | `dateRange` | **No** | No |
| Relative (rolling windows) | `relative` | Yes | No |
| Seasonal (recurring patterns) | `seasonal` | Yes | **Yes** |

#### Date Actual — `filterType` values
`year`, `quarteryear`, `monthyear`, `weekyear`, `fulldate`, `datetime`, `quarter`, `month`, `week`, `date`

**Example — Month/Year selector:**
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "actual",
    "compType": "multiSelect",
    "filterType": "monthyear",
    "values": ["Jan 2024", "Feb 2024", "Mar 2024"],
    "defaultFilterValues": ["Mar 2024"],
    "behaviour": "ListRelevantValues"
}
```

#### Date Range — No compType or filterType needed
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "dateRange"
}
```

#### Date Relative — compType required, filterType not needed
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "relative",
    "compType": "singleSelect",
    "values": ["Last 7 Days", "Last 30 Days", "Last 90 Days"],
    "defaultFilterValues": ["Last 30 Days"]
}
```

#### Date Seasonal — `filterType` values
`quarter`, `month`, `week`, `weekday`, `day`, `hour`

```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "seasonal",
    "compType": "multiSelect",
    "filterType": "month",
    "values": ["Jan", "Feb", "Mar"],
    "behaviour": "ListAllValues"
}
```

---

## Component Types Reference

| `compType` | Description | Applicable To |
|---|---|---|
| `singleSelect` | Dropdown allowing one selection | Dimensions, Dates |
| `multiSelect` | Dropdown allowing multiple selections | Dimensions, Measures, Dates |
| `slider` | Range slider control | Measures |
| *(omit)* | Automatic date range picker | Date with `dateRange` operation only |

---

## Behaviour Field Reference

Controls how filter values are populated in the widget. **Not applicable** for `dateRange` or `relative` operations.

| Value | Description |
|---|---|
| `ListAllValues` | Show all possible values from the column |
| `ListRelevantValues` | Show values relevant to current report context |
| `ListOnlyRelevantValues` | Show only values that produce non-empty results |

---

## Complete Example — Chart with Multiple User Filters

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales Analysis",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "bar",
            "axisColumns": [
                {"type": "xAxis", "columnName": "Product Category", "operation": "actual"},
                {"type": "yAxis", "columnName": "Sales Amount", "operation": "sum"}
            ]
        },
        "userFilters": [
            {
                "columnName": "Region",
                "tableName": "Sales Data",
                "operation": "actual",
                "compType": "multiSelect",
                "isallval": true,
                "behaviour": "ListAllValues"
            },
            {
                "columnName": "Order Date",
                "tableName": "Sales Data",
                "operation": "dateRange"
            },
            {
                "columnName": "Sales Amount",
                "tableName": "Sales Data",
                "operation": "sum",
                "compType": "slider",
                "filterType": "ranking",
                "values": ["Top 5", "Top 10", "Top 20"],
                "defaultFilterValues": ["Top 10"]
            }
        ]
    }
)
```

---

## Best Practices

1. **Always specify `tableName`**: Unlike static filters where tableName is optional, user filters require it in all cases
2. **Read before update**: Call `readReportMetadata` before `updateReport` to retrieve and preserve the existing `userFilters` array
3. **Use appropriate `compType`**: Match the widget type to the data type and user experience needs
4. **Pre-populate sensible defaults**: Use `defaultFilterValues` to provide a good starting view
5. **Consider `behaviour` settings**: For large dimension columns, `ListRelevantValues` improves performance
6. **Validate filter values**: Before creating user filters with specific `values`, query the data using `queryData` to ensure values exist
