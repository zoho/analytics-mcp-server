# Data Modelling — Aggregate Formulas

Aggregate formulas are reusable named expressions that return a **single aggregated value** across rows of a table (e.g. `SUM("Revenue")`, `COUNT("OrderID")`, `AVG("Salary")`). They act like measures — you define them once on a table and they become available for use in reports built on that table.

## Expression Rules

- Enclose column/table names in **double quotes**: `"Revenue"`, `"Orders"."Amount"`
- Enclose literal string values in **single quotes**: `'Active'`
- Expressions are **MySQL-compatible**
- The expression **must always evaluate to a single aggregated value** (scalar result)
- Complex nested expressions are valid as long as the final result is a single value:
  - Conditional aggregation: `SUM(IF("Status"='Closed', "Revenue", 0))`
  - KPI ratio: `SUM("Revenue") / NULLIF(COUNT(DISTINCT "CustomerID"), 0)`
  - Nested functions: `ROUND(SUM(COALESCE("Amount", 0)), 2)`
- **Not valid**: Row-level expressions without an aggregate wrapper (e.g. `"Amount" * 0.18`), or expressions returning multiple rows

## Multi-Table Aggregate Formulas

Aggregate formulas can reference columns from **multiple tables** connected via lookup relationships:
- Use fully qualified column names: `"TableName"."ColumnName"`
- Create the formula on the **childmost table** in the lookup chain

---

## Operations

Based on what you need to do, load the relevant reference file:

| Intent | Reference File |
|---|---|
| Discover or search existing aggregate formulas | [data_modelling_formulas_aggregate_list.md](./data_modelling_formulas_aggregate_list.md) |
| Create a new aggregate formula | [data_modelling_formulas_aggregate_add.md](./data_modelling_formulas_aggregate_add.md) |
| Update an existing aggregate formula's expression or description | [data_modelling_formulas_aggregate_edit.md](./data_modelling_formulas_aggregate_edit.md) |
| Delete an aggregate formula | [data_modelling_formulas_aggregate_delete.md](./data_modelling_formulas_aggregate_delete.md) |
