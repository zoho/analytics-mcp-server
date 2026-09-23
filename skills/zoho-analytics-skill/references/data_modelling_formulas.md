# Data Modelling — Formulas & Derived Columns

Zoho Analytics supports two distinct types of formula-based computed fields that extend a table's data without modifying the underlying raw data:

| Type | Scope | Returns | Use for |
|---|---|---|---|
| **Aggregate Formula** | Workspace or table | A single aggregated value (e.g. SUM, COUNT, AVG) | KPI tiles, measure fields in reports, running totals |
| **Custom Formula Column** | Table (row-level) | A scalar value per row | Derived fields, conditional flags, computed metrics per record |

**Key distinction:**
- An **aggregate formula** collapses many rows into one value (like `SUM("Revenue")`). It's a measure used across a whole dataset or report.
- A **custom formula column** is computed row-by-row, like adding a new column to the table (like `"Price" * "Quantity"`). It appears as a regular column in the table.

---

## When to use which

**Use Aggregate Formulas when:**
- The user asks for a reusable measure (e.g. "total revenue", "average order value", "count of active customers")
- You need a KPI or summary metric available across reports
- The formula returns one value across many rows

**Use Custom Formula Columns when:**
- The user wants a new derived column on a table (e.g. "profit margin per order", "full name from first + last name")
- The formula is row-level and returns one value per record
- The result should appear as a column that can be filtered, sorted, or used as a dimension in reports

---

## Reference Files

For detailed tool usage, parameters, and examples, load the appropriate reference:

- **Aggregate Formulas** (list, add, edit): [data_modelling_formulas_aggregate.md](./data_modelling_formulas_aggregate.md)
- **Custom Formula Columns** (list, add, edit, delete): [data_modelling_formulas_custom_columns.md](./data_modelling_formulas_custom_columns.md)

---

## Expression Syntax Rules (applies to both types)

- Enclose **column and table names** in **double quotes**: `"Revenue"`, `"Orders"."Amount"`
- Enclose **literal string values** in **single quotes**: `'Active'`, `'2024-01-01'`
- Expressions are **MySQL-compatible**
- For **multi-table formulas** (only in aggregate formulas), use fully qualified names: `"TableName"."ColumnName"`
- Do **not** mix aggregate and row-level logic in the same expression
