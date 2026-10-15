# Aggregate Formulas — List

Returns aggregate formulas defined in a workspace or on a specific table. Use this to discover existing formulas and their IDs before creating, editing, or deleting them.

## Tool: `listAggregateFormulas`

### Arguments

- `workspaceId` (required): The ID of the workspace.
- `viewId` (optional): The ID of a specific table/view. If provided, returns only formulas for that table. If omitted, returns all aggregate formulas across the entire workspace.
- `formulaNameContainsStr` (optional): Case-insensitive filter — returns only formulas whose names contain this string.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

### Tool Call

```
execute_analytics_tool(
    "listAggregateFormulas",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<table_id>",
        "formulaNameContainsStr": "<name_filter>"
    }
)
```

### Examples

Example — list all aggregate formulas in a workspace:

```
execute_analytics_tool(
    "listAggregateFormulas",
    {
        "workspaceId": "123456789"
    }
)
```

Example — list formulas on a specific table, filtered by name:

```
execute_analytics_tool(
    "listAggregateFormulas",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "formulaNameContainsStr": "revenue"
    }
)
```

### Sample Response

```json
[
    {
        "formulaId": "111111111",
        "formulaName": "Total Revenue",
        "expression": "SUM(\"Revenue\")",
        "description": "Sum of all revenue",
        "subType": "DECIMAL_NUMBER",
        "tableName": "Orders"
    },
    {
        "formulaId": "222222222",
        "formulaName": "Avg Order Value",
        "expression": "AVG(\"Amount\")",
        "description": "",
        "subType": "DECIMAL_NUMBER",
        "tableName": "Orders"
    }
]
```

Each formula object contains:
- `formulaId`: Unique identifier — required for edit and delete operations.
- `formulaName`: Display name of the formula.
- `expression`: The SQL aggregate expression.
- `description`: Description of the formula (empty string if not set).
- `subType`: Data sub-type of the result (e.g. `DECIMAL_NUMBER`).
- `tableName`: Name of the table the formula belongs to.
