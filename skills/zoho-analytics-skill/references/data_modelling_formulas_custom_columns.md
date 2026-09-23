# Data Modelling — Custom Formula Columns

Custom formula columns (also called formula columns or derived columns) add a **new computed column** to a table. Unlike aggregate formulas which return a single summary value, a formula column is evaluated **row-by-row** — it produces one value per record, just like any other column in the table.

Formula columns appear as regular columns and can be used as dimensions, filter criteria, or in further expressions.

> **Not sure which formula type to use?** See [data_modelling_formulas.md](./data_modelling_formulas.md) for a comparison with aggregate formulas.

**Expression rules:**
- Enclose column/table names in **double quotes**: `"Price"`, `"First Name"`
- Enclose literal string values in **single quotes**: `'Active'`, `'2024-01-01'`
- Expressions are **MySQL-compatible**
- The expression must return a **scalar (row-level) value** — do not use aggregate functions like `SUM()` or `COUNT()` here
- Formula columns are always scoped to a specific table — `tableId` is always required


## 1. List Custom Formula Columns

Returns all custom formula columns defined on a specific table. Use this to discover existing formula columns and their IDs before creating, editing, or referencing them.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table whose formula columns should be listed.
- `formulaNameContainsStr` (optional): Case-insensitive filter — returns only formula columns whose names contain this string.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "listCustomFormulaColumns",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "formulaNameContainsStr": "<name_filter>"
    }
)
```

Example — list all formula columns on a table:

```
execute_analytics_tool(
    "listCustomFormulaColumns",
    {
        "workspaceId": "123456789",
        "tableId": "987654321"
    }
)
```

Example — filter by name:

```
execute_analytics_tool(
    "listCustomFormulaColumns",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaNameContainsStr": "profit"
    }
)
```

Sample response:
```json
[
    {
        "formulaId": "333333333",
        "formulaName": "Profit Margin",
        "expression": "(\"Revenue\" - \"Cost\") / \"Revenue\" * 100",
        "description": "Profit margin as a percentage",
        "tableName": "Orders"
    },
    {
        "formulaId": "444444444",
        "formulaName": "Full Name",
        "expression": "CONCAT(\"First Name\", ' ', \"Last Name\")",
        "description": "",
        "tableName": "Customers"
    }
]
```


## 2. Add a Custom Formula Column

Creates a new formula column on a specific table. The column becomes immediately available in the table schema and can be used in reports.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table in which to create the formula column.
- `formulaName` (required): The display name of the new formula column.
- `expression` (required): The SQL SELECT clause expression (row-level). Must return a scalar value per record.
- `description` (optional): A brief description of what the column represents.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "addCustomFormulaColumn",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "formulaName": "<column_name>",
        "expression": "<row_level_expression>",
        "description": "<description>"
    }
)
```

Example — multiply two columns:

```
execute_analytics_tool(
    "addCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Total Price",
        "expression": "\"Price\" * \"Quantity\"",
        "description": "Total price calculated as Price × Quantity"
    }
)
```

Example — conditional column (active/inactive flag):

```
execute_analytics_tool(
    "addCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Is Active",
        "expression": "IF(\"Status\" = 'Active', 1, 0)"
    }
)
```

Example — concatenate columns:

```
execute_analytics_tool(
    "addCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "876543210",
        "formulaName": "Full Name",
        "expression": "CONCAT(\"First Name\", ' ', \"Last Name\")",
        "description": "Full name by combining First Name and Last Name"
    }
)
```

Example — handle nulls with IFNULL:

```
execute_analytics_tool(
    "addCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Adjusted Revenue",
        "expression": "IFNULL(\"Revenue\", 0)"
    }
)
```

Returns: A success message with the created formula column's ID.


## 3. Edit a Custom Formula Column

Updates the expression or description of an existing formula column. Use `listCustomFormulaColumns` first to find the `formulaId`.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table that owns the formula column.
- `formulaId` (required): The ID of the formula column to edit. Obtain this from `listCustomFormulaColumns`.
- `expression` (required): The new SQL SELECT clause expression (row-level).
- `description` (optional): A new description for the formula column.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "editCustomFormulaColumn",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "formulaId": "<formula_id>",
        "expression": "<new_expression>",
        "description": "<new_description>"
    }
)
```

Example:

```
execute_analytics_tool(
    "editCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaId": "333333333",
        "expression": "(\"Revenue\" - \"Cost\") / NULLIF(\"Revenue\", 0) * 100",
        "description": "Profit margin, safe against division by zero"
    }
)
```

Returns: A success message confirming the formula column was updated.


## 4. Delete a Custom Formula Column

Permanently removes a formula column from a table. This operation is **irreversible**.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table that owns the formula column.
- `formulaId` (required): The ID of the formula column to delete. Obtain this from `listCustomFormulaColumns`.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

Important Notes:
- Confirm the correct `formulaId` before proceeding — deletion cannot be undone.
- Use `listCustomFormulaColumns` to verify the formula's name and ID before deleting.

```
execute_analytics_tool(
    "deleteCustomFormulaColumn",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "formulaId": "<formula_id>"
    }
)
```

Example:

```
execute_analytics_tool(
    "deleteCustomFormulaColumn",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaId": "333333333"
    }
)
```

Returns: A success message confirming the formula column was deleted.
