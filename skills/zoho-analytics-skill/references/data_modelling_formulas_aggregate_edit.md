# Aggregate Formulas — Edit

Updates the expression or description of an existing aggregate formula.

> **Pre-step:** Use `listAggregateFormulas` to find the `formulaId` of the formula you want to edit before calling this tool.

## Tool: `editAggregateFormula`

### Arguments

- `workspaceId` (required): The ID of the workspace.
- `formulaId` (required): The ID of the aggregate formula to edit. Obtain this from `listAggregateFormulas`.
- `expression` (required): The new SQL aggregate expression.
  - Must be MySQL-compatible.
  - Column/table names in double quotes, literal strings in single quotes.
  - Must still evaluate to a single aggregated value.
- `description` (optional): A new description for the formula.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

### Tool Call

```
execute_analytics_tool(
    "editAggregateFormula",
    {
        "workspaceId": "<workspace_id>",
        "formulaId": "<formula_id>",
        "expression": "<new_aggregate_expression>",
        "description": "<new_description>"
    }
)
```

### Returns

A success message confirming the formula was updated, e.g.:
`Aggregate formula (ID: 111111111) updated successfully.`

---

## Examples

Example — update the expression and add a description:

```
execute_analytics_tool(
    "editAggregateFormula",
    {
        "workspaceId": "123456789",
        "formulaId": "111111111",
        "expression": "SUM(IF(\"Status\" = 'Closed', \"Revenue\", 0))",
        "description": "Sum of revenue from closed deals only"
    }
)
```

Example — update only the expression (no description change):

```
execute_analytics_tool(
    "editAggregateFormula",
    {
        "workspaceId": "123456789",
        "formulaId": "111111111",
        "expression": "SUM(\"Revenue\") / NULLIF(COUNT(DISTINCT \"CustomerID\"), 0)"
    }
)
```
