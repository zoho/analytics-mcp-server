# Data Management — Row-Level Writes

Use these operations when you need to insert, modify, or remove individual rows in a table. For reading or exporting data, see [data_management_read.md](./data_management_read.md).

**When to use row-level writes vs. bulk import:**
- Use `addRow` for inserting a **single new row** interactively.
- Use `importData` (in data_management_read.md) for **bulk-inserting** many rows at once from a file or JSON array.
- Use `updateRows` to **modify** existing rows that match specific criteria.
- Use `deleteRows` to **remove** rows that match specific criteria.

---

## 1. Add Row

Adds a single new row to the specified table.

**Arguments:**
- `workspaceId` (required): The ID of the workspace where the table is located.
- `tableId` (required): The ID of the table to which the row will be added.
- `columns` (required): A dictionary (key-value pairs) where each key is a column name and each value is the value to set for that column in the new row. All values must be strings.

**Important Notes:**
- Column names must exactly match the column names defined in the target table.
- Only provide columns you want to set; omitted columns will receive their default value (usually null).
- For inserting many rows at once, prefer `importData` for efficiency.

**Returns:** A success confirmation message, or an error message if the operation fails.

```
execute_analytics_tool(
    "addRow",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "columns": {
            "<column_name>": "<value>",
            "<column_name>": "<value>"
        }
    }
)
```

**Example:**

```
execute_analytics_tool(
    "addRow",
    {
        "workspaceId": "123456789",
        "tableId": "456789123",
        "columns": {
            "Order ID": "ORD-005",
            "Customer ID": "CUST-99",
            "Amount": "320.00",
            "Order Date": "2024-07-15",
            "Region": "West"
        }
    }
)
```

**Sample response:**
```
Row added successfully.
```

---

## 2. Update Rows

Updates one or more rows in the specified table that match a given criteria expression.

**Arguments:**
- `workspaceId` (required): The ID of the workspace where the table is located.
- `tableId` (required): The ID of the table whose rows will be updated.
- `columns` (required): A dictionary of column names and their new values to apply to all matching rows. All values must be strings.
- `criteria` (required): A criteria expression string that identifies which rows to update. Only rows matching this expression will be modified.

**Criteria Expression Format:**
- Use the pattern: `"TableName"."ColumnName"='value'`
- Enclose both the table name and the column name in **double quotes**.
- String values must be wrapped in **single quotes**.
- Combine multiple conditions with `AND` or `OR`.

**Important Notes:**
- The criteria must target the table by its display name (not its ID).
- All rows that satisfy the criteria will be updated — verify your criteria is specific enough to avoid unintended changes.
- To find matching rows before updating, run a `queryData` SELECT with the same criteria first.

**Returns:** A success confirmation message, or an error message if the operation fails.

```
execute_analytics_tool(
    "updateRows",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "columns": {
            "<column_name>": "<new_value>"
        },
        "criteria": "\"<TableName>\".\"<ColumnName>\"='<match_value>'"
    }
)
```

**Example — update the Region for a specific order:**

```
execute_analytics_tool(
    "updateRows",
    {
        "workspaceId": "123456789",
        "tableId": "456789123",
        "columns": {
            "Region": "East",
            "Amount": "450.00"
        },
        "criteria": "\"Orders\".\"Order ID\"='ORD-005'"
    }
)
```

**Example — update multiple columns using AND condition:**

```
execute_analytics_tool(
    "updateRows",
    {
        "workspaceId": "123456789",
        "tableId": "456789123",
        "columns": {
            "Status": "Shipped"
        },
        "criteria": "\"Orders\".\"Region\"='West' AND \"Orders\".\"Amount\">'300'"
    }
)
```

**Sample response:**
```
Rows updated successfully.
```

---

## 3. Delete Rows

Deletes one or more rows from the specified table that match a given criteria expression.

**Arguments:**
- `workspaceId` (required): The ID of the workspace where the table is located.
- `tableId` (required): The ID of the table from which rows will be deleted.
- `criteria` (required): A criteria expression string that identifies which rows to delete. Only rows matching this expression will be removed.

**Criteria Expression Format:**
- Use the pattern: `"TableName"."ColumnName"='value'`
- Enclose both the table name and the column name in **double quotes**.
- String values must be wrapped in **single quotes**.
- Combine multiple conditions with `AND` or `OR`.

**Important Notes:**
- The criteria must target the table by its display name (not its ID).
- **All rows matching the criteria will be permanently deleted.** Double-check the criteria before executing.
- To preview which rows will be affected, run a `queryData` SELECT with the same criteria first.
- There is no undo — deletions are permanent.

**Returns:** A success confirmation message, or an error message if the operation fails.

```
execute_analytics_tool(
    "deleteRows",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "criteria": "\"<TableName>\".\"<ColumnName>\"='<match_value>'"
    }
)
```

**Example — delete a specific order:**

```
execute_analytics_tool(
    "deleteRows",
    {
        "workspaceId": "123456789",
        "tableId": "456789123",
        "criteria": "\"Orders\".\"Order ID\"='ORD-005'"
    }
)
```

**Example — delete all orders from a region:**

```
execute_analytics_tool(
    "deleteRows",
    {
        "workspaceId": "123456789",
        "tableId": "456789123",
        "criteria": "\"Orders\".\"Region\"='East'"
    }
)
```

**Sample response:**
```
Rows deleted successfully.
```
