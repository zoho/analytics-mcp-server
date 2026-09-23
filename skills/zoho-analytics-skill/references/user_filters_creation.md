# User Filters — Creation

This reference covers the detailed syntax and configuration for adding user filters when creating a new report using the `createReport` tool.

---

## User Filter Object Structure

Each entry in the `userFilters` array is an object with the following fields:

### Required Fields (All User Filters)

| Field | Type | Description |
|---|---|---|
| `columnName` | string | Column to expose as a user filter |
| `tableName` | string | Table that owns the column. **Unlike static filters, this is always mandatory** |
| `operation` | string | Filter operation. Valid values depend on column type — see below |

### Conditional Fields

| Field | Type | When Required | Description |
|---|---|---|
| `compType` | string | All operations **except** `dateRange` | UI widget type. See "Component Types" below |
| `filterType` | string | Required for **measures** and **date actual/seasonal** operations | Filter granularity/type. See "Filter Types" below |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `isallval` | boolean | When `true`, defaults to showing all values in the filter widget |
| `values` | array | Available values for the filter widget (strings or numbers). Pre-populates the widget options |
| `defaultFilterValues` | array | Values pre-selected when the report first loads (strings) |
| `exclude` | boolean | When `true`, filter excludes selected values instead of including them |
| `behaviour` | string | Value listing behavior: `"ListAllValues"`, `"ListRelevantValues"`, `"ListOnlyRelevantValues"`. **NOT applicable** for `dateRange` or `relative` operations |

---

## Operations by Column Type

### Dimension Columns (String/Categorical)

| Column Type | Valid `operation` Values |
|---|---|
| String/Dimension | `actual` |

**Component types:** `singleSelect`, `multiSelect`

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

| Column Type | Valid `operation` Values |
|---|---|
| Number/Measure | `sum`, `max`, `min`, `avg`, `std`, `count`, `dc`, `actual` |

**Component types:** `slider`, `multiSelect`

**Filter types (required):** `individualValues`, `range`, `ranking`, `rankingPct`

**Example — Top N slider:**
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

| Operation Mode | Valid `operation` Values | Description |
|---|---|---|
| Actual (Calendar) | `actual` | Filter by specific calendar dates/periods |
| Date Range | `dateRange` | Continuous date range selector |
| Relative | `relative` | Rolling windows from today (e.g., "Last 30 Days") |
| Seasonal | `seasonal` | Recurring patterns ignoring year (e.g., "Every January") |

**Component types:** `singleSelect`, `multiSelect` (not needed for `dateRange`)

#### Date Actual Operation

When `operation` is `actual`, `filterType` is **required** and defines the calendar granularity:

**Filter types:** `year`, `quarteryear`, `monthyear`, `weekyear`, `fulldate`, `datetime`, `quarter`, `month`, `week`, `date`

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

**Example — Year selector:**
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "actual",
    "compType": "singleSelect",
    "filterType": "year",
    "isallval": false,
    "values": ["2023", "2024"]
}
```

#### Date Range Operation

When `operation` is `dateRange`:
- **compType is NOT required** (date range picker is implied)
- **filterType is NOT required**
- **behaviour is NOT applicable** (do not include)

**Example:**
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "dateRange"
}
```

#### Date Relative Operation

When `operation` is `relative`:
- **compType is required**
- **filterType is NOT required**
- **behaviour is NOT applicable** (do not include)

**Example:**
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

#### Date Seasonal Operation

When `operation` is `seasonal`, `filterType` is **required** and defines the recurring pattern:

**Filter types:** `quarter`, `month`, `week`, `weekday`, `day`, `hour`

**Example — Monthly seasonal pattern:**
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
| (none) | Automatic date range picker | Date with `dateRange` operation only |

---

## Behaviour Field Reference

Controls how filter values are populated in the widget. **Not applicable** for `dateRange` or `relative` operations.

| Value | Description |
|---|---|
| `ListAllValues` | Show all possible values from the column |
| `ListRelevantValues` | Show values relevant to current report context |
| `ListOnlyRelevantValues` | Show only values that produce non-empty results |

---

## Using User Filters with createReport

Add `userFilters` array alongside your report config:

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "<chart|summary|pivot>",
        "<chartConfig|summaryConfig|pivotConfig>": { ... },
        "userFilters": [<user_filter_objects>]
    }
)
```

### Complete Example — Chart with Multiple User Filters

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Sales Data",
        "reportName": "Sales Analysis with User Filters",
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

## Validation and Error Handling

The tool validates user filters and returns detailed error messages:

**Missing required fields:**
- If `columnName`, `tableName`, or `operation` is missing, you'll get: `"userFilters[N] is missing required field 'columnName'"`

**Missing compType:**
- If `compType` is missing (except for `dateRange`), you'll get: `"compType is required for all operations except 'dateRange'. For dimensions and dates use 'singleSelect' or 'multiSelect'. For measures use 'slider' or 'multiSelect'."`

**Missing filterType:**
- If `filterType` is missing for measures or date actual/seasonal operations, you'll get detailed guidance on valid filterType values for that operation

**Invalid behaviour:**
- If `behaviour` is used with `dateRange` or `relative` operations, you'll get: `"behaviour field cannot be used with 'dateRange' operation. Remove the 'behaviour' field."`

---

## Best Practices

1. **Always specify tableName**: Unlike static filters where tableName is optional, user filters require it in all cases
2. **Use appropriate compType**: Match the widget type to the data type and user experience needs
3. **Pre-populate sensible defaults**: Use `defaultFilterValues` to provide a good starting view
4. **Consider behaviour settings**: For large dimension columns, `ListRelevantValues` improves performance
5. **Combine with static filters**: Use static filters for data security/restrictions, user filters for exploration
6. **Test filter values**: Before creating user filters, query the data to understand available values using the `queryData` tool
