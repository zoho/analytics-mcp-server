# Data Modelling — Query Tables

Query tables are SQL-based materialized views built on top of existing base tables in a workspace. They allow you to pre-join, filter, aggregate, or transform data from base tables into a reusable named view without writing raw SQL queries every time you need the data.

A query table behaves like a regular table for reporting and querying purposes, but its data is derived from the SQL definition rather than stored directly.

---

## When to Use Query Tables

Use query tables when you need to:
- Combine data from multiple related tables using JOIN operations
- Pre-filter large datasets to a relevant subset (e.g., "Orders from last year")
- Pre-aggregate data for performance (e.g., "Monthly revenue by region")
- Create derived columns using SQL expressions without adding formula columns to base tables
- Simplify complex queries by encapsulating them into a named view that can be referenced in reports

Query tables are view type `6` in Zoho Analytics. They appear alongside regular tables when you list views in a workspace.

---

## 1. Create a Query Table

Creates a new query table in a workspace using a SQL SELECT query.

**Arguments:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | The ID of the workspace in which to create the query table |
| `tableName` | string | Yes | The display name for the new query table |
| `query` | string | Yes | A valid MySQL-compatible SELECT query referencing existing tables in the workspace |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Important Notes:**

1. **Table references**: The query must reference tables that already exist in the workspace. The tool will fail if a referenced table doesn't exist.

2. **Quoting rules**: Use double quotes around table or column names that contain spaces or special characters:
   - ✅ Correct: `SELECT "Order Date", "Customer ID" FROM Orders`
   - ❌ Incorrect: `SELECT Order Date, Customer ID FROM Orders`

3. **Nested queries**: Do not use more than one level of nested sub-queries. Excessive nesting is not supported.

4. **SELECT-only**: Only SELECT queries are allowed. INSERT, UPDATE, DELETE, CREATE, DROP, and other DDL/DML statements are not permitted.

5. **MySQL syntax**: Use MySQL-compatible SQL. The same rules that apply to the `queryData` tool apply here.

**Tool call:**
```
execute_analytics_tool(
    "createQueryTable",
    {
        "workspaceId": "<workspace_id>",
        "tableName": "<query_table_name>",
        "query": "<mysql_compatible_select_query>",
        "orgId": "<org_id>"
    }
)
```

**Example 1 — Monthly Revenue Summary:**

```
execute_analytics_tool(
    "createQueryTable",
    {
        "workspaceId": "123456789",
        "tableName": "Monthly Revenue Summary",
        "query": "SELECT DATE_FORMAT(\"Order Date\", '%Y-%m') AS month, SUM(Amount) AS total_revenue FROM Orders GROUP BY month ORDER BY month"
    }
)
```

**Example 2 — Join Orders and Customers:**

```
execute_analytics_tool(
    "createQueryTable",
    {
        "workspaceId": "123456789",
        "tableName": "Orders with Customer Details",
        "query": "SELECT o.\"Order ID\", o.\"Order Date\", o.Amount, c.\"Customer Name\", c.Region FROM Orders o INNER JOIN Customers c ON o.\"Customer ID\" = c.\"Customer ID\""
    }
)
```

**Example 3 — Filtered View (Last Year Orders):**

```
execute_analytics_tool(
    "createQueryTable",
    {
        "workspaceId": "123456789",
        "tableName": "Last Year Orders",
        "query": "SELECT * FROM Orders WHERE \"Order Date\" >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)"
    }
)
```

**Example 4 — Aggregated by Region:**

```
execute_analytics_tool(
    "createQueryTable",
    {
        "workspaceId": "123456789",
        "tableName": "Revenue by Region",
        "query": "SELECT Region, COUNT(*) AS order_count, SUM(Amount) AS total_revenue, AVG(Amount) AS avg_order_value FROM Orders GROUP BY Region"
    }
)
```

---

## 2. Get Query Table Schema

To retrieve the column definitions (schema) of a query table after creation, use the same `getViewDetails` tool documented in [Table Operations](./data_modelling_tables.md).

**Tool call:**
```
execute_analytics_tool(
    "getViewDetails",
    {
        "viewId": "<query_table_id>"
    }
)
```

The response includes column names, data types, and column IDs — just like for regular tables. You can then use these column IDs in lookup relationships, formulas, reports, and dashboards.

---

## 3. Delete a Query Table

To delete a query table, use the `deleteView` tool documented in [Workspace Management](./workspace_management.md).

**Tool call:**
```
execute_analytics_tool(
    "deleteView",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<query_table_id>"
    }
)
```

---

## Working with Query Tables in Reports

Once a query table is created, it can be used as a base table for charts, pivots, and summary reports — exactly like a regular table. When creating a report, pass the query table's name as the `tableName` parameter in the `createReport` tool.

**Example — Create a chart from a query table:**

```
execute_analytics_tool(
    "createReport",
    {
        "workspaceId": "123456789",
        "tableName": "Monthly Revenue Summary",
        "reportName": "Revenue Trend Chart",
        "reportType": "chart",
        "chartConfig": {
            "chartType": "line",
            "axisColumns": [
                {
                    "type": "xAxis",
                    "columnName": "month",
                    "operation": "actual"
                },
                {
                    "type": "yAxis",
                    "columnName": "total_revenue",
                    "operation": "measure"
                }
            ]
        }
    }
)
```

---

## Performance Considerations

Query tables are materialized views — the results of the SQL query are stored and refreshed periodically (or on-demand, depending on workspace configuration). This makes them faster than running the same SQL query repeatedly, especially for complex joins or aggregations over large datasets.

However, keep in mind:
- Query tables consume storage space in the workspace
- They may not reflect real-time changes to base tables until refreshed
- Very complex queries with many joins or aggregations can be slow to refresh

For simple ad-hoc queries that don't need to be reused, consider using the `queryData` tool instead (documented in [Data Management — Read](./data_management_read.md)).
