# Data Modelling — Table Operations

Use these operations when you need to create a new table, add columns to an existing table, or inspect the schema of a table or query table.

---

## 1. Create a Table

Creates a new table in a workspace with a defined set of columns.

**Arguments:**
- `workspaceId` (required): The ID of the workspace in which to create the table.
- `tableName` (required): The display name for the new table.
- `columnsArr` (required): An array of column definition objects. Each object must include:
  - `columnName` (required): The name of the column.
  - `dataType` (required): The data type. Supported values:
    - `PLAIN` — plain text
    - `NUMBER` — integer numbers
    - `DECIMAL_NUMBER` — decimal numbers
    - `POSITIVE_NUMBER` — non-negative integers
    - `CURRENCY` — monetary values
    - `DATE` — date or datetime
    - `EMAIL` — email address
    - `URL` — web URL

```
execute_analytics_tool(
    "createTable",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<table_name>",
        "columnsArr": [
            { "columnName": "<col_name>", "dataType": "<data_type>" }
        ]
    }
)
```

**Example** — create an Orders table:

```
execute_analytics_tool(
    "createTable",
    {
        "workspaceId": "123456789",
        "tableName": "Orders",
        "columnsArr": [
            { "columnName": "Order ID",    "dataType": "PLAIN" },
            { "columnName": "Customer ID", "dataType": "PLAIN" },
            { "columnName": "Amount",      "dataType": "CURRENCY" },
            { "columnName": "Order Date",  "dataType": "DATE" }
        ]
    }
)
```

---

## 2. Add Columns to a Table

Adds one or more columns to an existing table.

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the table.
- `viewId` (required): The ID of the view (table) to which columns should be added.
- `columns` (required): An array of column definitions. Each column object must include:
  - `columnName` (required): The name of the column.
  - `dataType` (required): The data type. Supported values:
    - `PLAIN` — plain text
    - `MULTI_LINE` — multi-line text
    - `EMAIL` — email address
    - `NUMBER` — integer numbers
    - `POSITIVE_NUMBER` — non-negative integers
    - `DECIMAL_NUMBER` — decimal numbers
    - `CURRENCY` — monetary values
    - `PERCENT` — percentage values
    - `DATE` — date or datetime
    - `BOOLEAN` — true/false values
    - `URL` — web URL
    - `AUTO_NUMBER` — auto-incrementing number
    - `GEO` — geographic location (requires `GEOROLE`)
    - `DURATION` — time duration
  - `isPIIColumn` (optional): Boolean. Marks the column as containing personal data. Defaults to `false`.
  - `GEOROLE` (optional, required when `dataType` is `GEO`): Integer 0-8 specifying the geo location type:
    - `0` — Continent
    - `1` — Country
    - `2` — State/Province
    - `3` — County/District
    - `4` — City
    - `5` — Zip Code
    - `6` — Latitude
    - `7` — Longitude
    - `8` — Airport

**Tool call:**
```
execute_analytics_tool(
    "addColumn",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<table_id>",
        "columns": [
            {
                "columnName": "<column_name>",
                "dataType": "<data_type>",
                "isPIIColumn": false
            }
        ]
    }
)
```

**Example 1 — Add Region and Notes columns:**

```
execute_analytics_tool(
    "addColumn",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "columns": [
            {
                "columnName": "Region",
                "dataType": "PLAIN"
            },
            {
                "columnName": "Notes",
                "dataType": "MULTI_LINE"
            }
        ]
    }
)
```

**Example 2 — Add a GEO column with GEOROLE:**

```
execute_analytics_tool(
    "addColumn",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "columns": [
            {
                "columnName": "Customer City",
                "dataType": "GEO",
                "GEOROLE": 4
            }
        ]
    }
)
```

**Example 3 — Add a PII column (customer email):**

```
execute_analytics_tool(
    "addColumn",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "columns": [
            {
                "columnName": "Customer Email",
                "dataType": "EMAIL",
                "isPIIColumn": true
            }
        ]
    }
)
```

---

## 3. Delete a Column

Deletes a single column from an existing table.

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the table.
- `viewId` (required): The ID of the view (table) from which the column should be deleted.
- `columnId` (required): The ID of the column to delete. Use `getViewDetails` to retrieve column IDs.
- `deleteDependentViews` (optional): Boolean. When `true`, deletes the column even when it has dependent views (reports, query tables, formulas that reference it). When `false` (default), the operation fails if dependent views exist. Use with caution — deleting a column with dependents will also delete those dependent views.

**Tool call:**
```
execute_analytics_tool(
    "deleteColumn",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<table_id>",
        "columnId": "<column_id>",
        "deleteDependentViews": false
    }
)
```

**Example 1 — Delete a column (fails if dependents exist):**

```
execute_analytics_tool(
    "deleteColumn",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "columnId": "555666777"
    }
)
```

**Example 2 — Force delete a column and its dependents:**

```
execute_analytics_tool(
    "deleteColumn",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "columnId": "555666777",
        "deleteDependentViews": true
    }
)
```

> **Warning:** Setting `deleteDependentViews` to `true` will permanently delete all reports, query tables, formulas, and other views that reference this column. Always verify dependents before using this option.

---

## 4. Get Table Schema

Returns the current column definitions (schema) for a table or query table. Use this to discover column IDs and data types before performing operations that require them (e.g., creating lookups).

**Arguments:**
- `viewId` (required): The ID of the table or query table whose schema you want to fetch.

```
execute_analytics_tool(
    "getViewDetails",
    {
        "viewId": "<table_id>"
    }
)
```

**Example:**

```
execute_analytics_tool(
    "getViewDetails",
    {
        "viewId": "987654321"
    }
)
```

> **Tip:** The `column_id` values returned here are what you'll pass as `sourceColumnId` / `targetColumnId` / `columnId` in lookup operations.
