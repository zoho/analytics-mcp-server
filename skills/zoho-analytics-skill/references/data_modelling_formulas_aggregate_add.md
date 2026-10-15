# Aggregate Formulas — Add

Creates a new aggregate formula on a specific table. Once created, the formula is available as a measure in reports built on that table.

## Tool: `addAggregateFormula`

### Arguments

- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table on which to create the aggregate formula.
- `formulaName` (required): The display name of the new aggregate formula.
- `expression` (required): The SQL expression that evaluates to a single aggregated value.
  - Must be MySQL-compatible.
  - Column/table names in double quotes, literal strings in single quotes.
  - Can include nested expressions and multiple aggregate functions combined into one scalar.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

### Tool Call

```
execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "<workspace_id>",
        "tableId": "<table_id>",
        "formulaName": "<formula_name>",
        "expression": "<aggregate_expression>"
    }
)
```

### Returns

A success message with the created formula's ID, e.g.:
`Aggregate formula 'Total Revenue' created successfully. Formula ID: 111111111`

---

## Examples

### Simple aggregates

Example — sum of a column:

```
execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Total Revenue",
        "expression": "SUM(\"Revenue\")"
    }
)
```

Example — conditional aggregate (revenue from active customers only):

```
execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Active Customer Revenue",
        "expression": "SUM(IF(\"Status\" = 'Active', \"Revenue\", 0))"
    }
)
```

### KPI / Ratio expressions

Example — average revenue per distinct customer with divide-by-zero protection:

```
execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Revenue per Customer",
        "expression": "SUM(\"Revenue\") / NULLIF(COUNT(DISTINCT \"CustomerID\"), 0)"
    }
)
```

Example — nested expression inside SUM (clamp negatives to 0, then round total):

```
execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",
        "formulaName": "Rounded Positive Revenue",
        "expression": "ROUND(SUM(IF(\"Revenue\" < 0, 0, COALESCE(\"Revenue\", 0))), 2)"
    }
)
```

### Multi-table aggregate formulas

Multi-table aggregate formulas reference columns from two or more tables connected via lookup relationships. Key rules:
- Use fully qualified column names: `"TableName"."ColumnName"`
- Create the formula on the **childmost table** in the lookup chain (the table furthest from the parent)

Example — two-table lookup (Orders is child of Customers):

```
// Scenario: Total revenue factoring in customer-specific discount
// Lookup: Customers (parent) ← Orders (child, has CustomerID lookup to Customers)
// Formula is created on the CHILDMOST table (Orders)

execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "987654321",  // Orders table ID (childmost)
        "formulaName": "Discounted Revenue per Customer",
        "expression": "SUM(\"Orders\".\"Amount\" * \"Customers\".\"DiscountMultiplier\")"
    }
)
```

Example — three-table lookup chain (OrderItems is grandchild):

```
// Scenario: Weighted order value across a 3-table lookup chain
// Lookup chain: Customers (parent) ← Orders (child) ← OrderItems (grandchild)
// Formula is created on the CHILDMOST table (OrderItems)

execute_analytics_tool(
    "addAggregateFormula",
    {
        "workspaceId": "123456789",
        "tableId": "555555555",  // OrderItems table ID (childmost)
        "formulaName": "Total Customer Value with Loyalty",
        "expression": "SUM(\"OrderItems\".\"Quantity\" * \"OrderItems\".\"UnitPrice\" * \"Customers\".\"LoyaltyFactor\")"
    }
)
```

> **Understanding "childmost table":** In a lookup chain like `Customers → Orders → OrderItems`, the childmost table is `OrderItems` because it is the deepest target (child side) of the relationship. Aggregations roll up data from the child perspective through the entire hierarchy, giving the child formula access to all parent table columns.
