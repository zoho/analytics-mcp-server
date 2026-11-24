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

## 2. Get Query Table Details

Fetches the details of a query table, including its SQL query and column structure. Use it to:
- Read the current SQL before editing a query table
- Verify the result after creating or editing a query table
- Get column names, data types, and column IDs for use in lookup relationships, formulas, reports, and dashboards

**Arguments:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | The ID of the workspace containing the query table |
| `queryTableId` | string | Yes | The view ID of the query table (view type `6`). Must not be the ID of a regular table or report |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Tool call:**
```
execute_analytics_tool(
    "getQueryTableDetails",
    {
        "workspaceId": "<workspace_id>",
        "queryTableId": "<query_table_id>",
        "orgId": "<org_id>"
    }
)
```

**Returns:** A JSON object with the query table's details (view name, SQL query, columns).

**Example:**

```
execute_analytics_tool(
    "getQueryTableDetails",
    {
        "workspaceId": "123456789",
        "queryTableId": "987654321"
    }
)
```

---

## 3. Edit a Query Table

Replaces the SQL query that defines an existing query table.

**Arguments:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | The ID of the workspace containing the query table |
| `viewId` | string | Yes | The view ID of the query table to edit (view type `6`). Must not be the ID of a regular table or report |
| `sqlQuery` | string | Yes | The new, complete MySQL-compatible SELECT query. It fully replaces the existing query |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Important Notes:**

1. **Only the SQL can be changed**: The query table's name and other settings cannot be modified with this tool.

2. **Full replacement**: `sqlQuery` replaces the entire existing query, not just part of it. To make a small change, first read the current SQL with `getQueryTableDetails`, modify it, and send the complete new query.

3. **Same SQL rules as creation**: SELECT-only, MySQL syntax, double quotes around names with spaces or special characters, no more than one level of nested sub-queries, and all referenced tables must already exist in the workspace.

4. **Impact on dependents**: Renaming or removing output columns can break reports, formulas, or lookups built on the query table. Verify the schema after editing.

**Recommended workflow:**
1. Call `getQueryTableDetails` to get the current SQL and columns.
2. Build the new SQL from the current one.
3. Call `editQueryTable` with the complete new SQL.
4. Call `getQueryTableDetails` again to confirm the new SQL and columns.

**Tool call:**
```
execute_analytics_tool(
    "editQueryTable",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<query_table_id>",
        "sqlQuery": "<new_mysql_compatible_select_query>",
        "orgId": "<org_id>"
    }
)
```

**Example - Add a column, apply a filter, and include customers with no orders:**

Current SQL: `SELECT c."Customer Name", c.Region, COUNT(o."Order ID") AS order_count, SUM(o.Amount) AS total_revenue FROM Customers c LEFT JOIN Orders o ON c."Customer ID" = o."Customer ID" AND o.Status = 'Closed' GROUP BY c."Customer Name", c.Region;`

```
execute_analytics_tool(
    "editQueryTable",
    {
        "workspaceId": "123456789",
        "viewId": "987654321",
        "sqlQuery": """
            SELECT
                c."Customer Name",
                c.Region,
                COUNT(o."Order ID") AS order_count,
                SUM(o.Amount) AS total_revenue
            FROM Customers c
            LEFT JOIN Orders o
                ON c."Customer ID" = o."Customer ID"
                AND o.Status = 'Closed'
            GROUP BY c."Customer Name", c.Region
        """
    }
)
```

---

## 4. Delete a Query Table

To delete a query table, use the `deleteView` tool documented in [Workspace Management](./workspace_management.md).

---

## Working with Query Tables in Reports

Once a query table is created, it can be used as a base table for charts, pivots, and summary reports — exactly like a regular table. When creating a report, pass the query table's name as the `tableName` parameter in the `createReport` tool.

---

## Performance Considerations

Query tables are materialized views — the results of the SQL query are stored and refreshed periodically (or on-demand, depending on workspace configuration). This makes them faster than running the same SQL query repeatedly, especially for complex joins or aggregations over large datasets.

However, keep in mind:
- Query tables consume storage space in the workspace
- They may not reflect real-time changes to base tables until refreshed
- Very complex queries with many joins or aggregations can be slow to refresh
- Editing the SQL changes the data the query table holds, so it may take a moment to reflect the new results

For simple ad-hoc queries that don't need to be reused, consider using the `queryData` tool instead (documented in [Data Management — Read](./data_management_read.md)).
