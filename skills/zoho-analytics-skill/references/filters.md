# Report Filters

Filters restrict the underlying data before a report is computed. The `filters` argument is optional on both `createReport` and `updateReport` calls — all report types (chart, summary, pivot) share this exact same filter structure.

> **Important for `updateReport`:** The update is a **full replacement**. If you omit `filters` in an `updateReport` call, all existing filters are cleared. Always re-submit existing filters you wish to keep (read them first via `readReportMetadata` — see [Read & Update Reports](./reports_read_update.md)).

## Filter object structure

Each entry in `filters` is an object:
- tableName (optional): Table the filtered column belongs to. Omit when the column is on the report's base table.
- columnName (required): Column to filter on.
- operation (required): The function applied to the column for filtering purposes. Valid values depend on the column's data type — see below.
- filterType (required): The type of filter being applied. Valid values depend on the column's data type — see below.
- values (required): Array of string values used by the filter. The expected format depends on `filterType` — see the examples table below.
- exclude (required): Boolean. `true` excludes rows matching `values`; `false` includes only rows matching `values`.

## `operation` values by data type

| Data type | Accepted `operation` values |
|---|---|
| String | actual, count, distinctCount |
| Numeric | measure, dimension, range, actual, sum, min, max, average, stdDev, median, mode, count, variance, distinctCount |
| Date | actual, seasonal, relative |

For Date columns, `operation` selects the filtering *mode*: `actual` for a specific calendar value (a date, month, year...), `seasonal` for a recurring pattern that ignores the year (e.g. every January, every Monday), or `relative` for a rolling window measured from today (e.g. "Last 2 Weeks"). This mode determines which `filterType` values are valid and how `values` should be formatted — see the tables below.

## `filterType` values by data type

| Data type | Accepted `filterType` values |
|---|---|
| Numeric | individualValues, range, ranking, rankingPct |
| Date | year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount |
| String | individualValues (paired with `operation: actual` for an exact-value match) |

Note: the source API reference does not give a separate breakdown of `filterType` for String columns. `individualValues` is the standard choice for string equality/inclusion filters — it's the same filter type used for numeric individual-value matches, just applied to a string column.

## `values` format by `filterType`

The shape of each entry in `values` depends on `filterType`:

| filterType | Example `values` entries |
|---|---|
| ranking | "Top 2", "Top 5" |
| rankingPct | (percentile-based ranking, e.g. top X%) |
| range (numeric) | "100000 and below", "200000 to 300000", "500000 and above" |
| individualValues | "20.97", "700.59" (numeric), or the raw string(s) to match for a String column |
| year — date, actual | "2012", "2013" |
| monthYear — date, actual | "Aug 2012", "Jan 2013" |
| weekYear — date, actual | "W03 2012", "W02 2012" |
| quarterYear — date, actual | "Q1 2012", "Q2 2013" |
| fullDate / actual — date, actual | "10 Mar 2012", "11 Mar 2012" |
| dateTime — date, actual | "10 Mar 2012 10:00:00", "11 Mar 2012 11:00:00" |
| dateRange — date, actual | "from 10 Dec 2013 00:00:00", "10 Mar 2012 00:00:00 to 10 Dec 2012 00:00:00", "to 11 Mar 2013 00:00:00" |
| quarter — date, seasonal | "Q1", "Q2" |
| month — date, seasonal | "Jan", "Feb" |
| week — date, seasonal | "Week 2", "Week 3", "Week 4" |
| weekDay — date, seasonal | "Sun", "Mon" |
| day — date, seasonal | "01", "02" |
| hour — date, seasonal | "10", "11", "13" |
| year — date, relative | "This Year", "Next Year", "Last Year", "Last 2 Years" |
| month — date, relative | "This Month", "Next Month", "Last Month", "Last 2 Months" |
| week — date, relative | "This Week", "Next Week", "Last Week", "Last 2 Weeks" |
| hour — date, relative | "This Hour", "Next Hour", "Last 1 Hour", "Last 2 Hour" |

## Examples

String column, exact-value match:
```json
{
    "tableName": "Sales Data",
    "columnName": "Region",
    "operation": "actual",
    "filterType": "individualValues",
    "values": ["West", "North"],
    "exclude": false
}
```

Date column, rolling relative window:
```json
{
    "tableName": "Sales Data",
    "columnName": "Order Date",
    "operation": "relative",
    "filterType": "week",
    "values": ["Last 2 Weeks"],
    "exclude": false
}
```

Numeric column, top-N ranking:
```json
{
    "tableName": "Sales Data",
    "columnName": "Sales Amount",
    "operation": "sum",
    "filterType": "ranking",
    "values": ["Top 5"],
    "exclude": false
}
```

## Using filters in a report

`filters` is passed alongside the report's config object in `createReport` or `updateReport`:
```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "reportName": "<report_name>",
        "reportType": "<chart|summary|pivot>",
        "chartConfig|summaryConfig|pivotConfig": { ... },
        "filters": [<filter_objects>]
    }
)
```

For `updateReport`, pass `filters` alongside the report config in the same way. Omitting it clears all existing filters — re-submit any filters you want to preserve.
