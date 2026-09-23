# Data Modelling — Aggregate Formulas

Aggregate formulas are reusable named expressions that return a **single aggregated value** across rows of a table (e.g. `SUM("Revenue")`, `COUNT("OrderID")`, `AVG("Salary")`). They act like measures — you define them once on a table and they become available for use in reports built on that table.

**Expression rules:**
- Enclose column/table names in **double quotes**: `"Revenue"`, `"Orders"."Amount"`
- Enclose literal string values in **single quotes**: `'Active'`
- Expressions are **MySQL-compatible**
- The expression **must always return a single aggregate value** — do not write a row-level expression here
- **Single-table formulas**: Reference columns from one table only (e.g., `SUM("Amount")`)
- **Multi-table aggregate formulas**: Reference columns from **2+ different tables** connected via lookup relationships (e.g., `SUM("Orders"."Amount" * "Customers"."Factor")`). These formulas:
  a) Must use fully qualified names: `"TableName"."ColumnName"`
  b) Must be created on the **childmost table** in the lookup chain (the table furthest from the parent in the relationship hierarchy)
  c) Can traverse multiple levels of lookups (e.g., OrderItems → Orders → Customers)


## 1. List Aggregate Formulas

Returns aggregate formulas defined in a workspace or on a specific table. Use this to discover existing formulas and their IDs before creating new ones or referencing them.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `viewId` (optional): The ID of a specific table/view. If provided, returns only formulas for that table. If omitted, returns all aggregate formulas across the entire workspace.
- `formulaNameContainsStr` (optional): Case-insensitive filter — returns only formulas whose names contain this string.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

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

Sample response:
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


## 2. Add an Aggregate Formula

Creates a new aggregate formula on a specific table. Once created, the formula is available as a measure in reports built on that table.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `tableId` (required): The ID of the table on which to create the aggregate formula.
- `formulaName` (required): The display name of the new aggregate formula.
- `expression` (required): The SQL aggregate expression. Must return a single aggregated value.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

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

Example — simple sum:

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

Example — multi-table aggregate across two tables (lookup relationship must exist):

```
// Scenario: Calculate total revenue factoring in customer-specific discount
// Tables: Customers (parent) ← Orders (child, has CustomerID lookup to Customers)
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

Example — multi-table aggregate across three tables (multi-level lookup chain):

```
// Scenario: Calculate weighted order value across a 3-table lookup chain
// Tables: Customers (parent) ← Orders (child) ← OrderItems (grandchild)
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

> **Understanding childmost table**: In a lookup chain like `Customers → Orders → OrderItems`, the childmost table is `OrderItems` because it's the target (child side) of the relationship. Aggregations roll up data from the child perspective through the entire lookup hierarchy, giving the child access to all parent table columns.

Returns: A success message with the created formula's ID.


## 3. Edit an Aggregate Formula

Updates the expression or description of an existing aggregate formula. Use `listAggregateFormulas` first to find the `formulaId`.

Arguments:
- `workspaceId` (required): The ID of the workspace.
- `formulaId` (required): The ID of the aggregate formula to edit. Obtain this from `listAggregateFormulas`.
- `expression` (required): The new SQL aggregate expression.
- `description` (optional): A new description for the formula.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

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

Example — update the expression and description:

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

Returns: A success message confirming the formula was updated.
