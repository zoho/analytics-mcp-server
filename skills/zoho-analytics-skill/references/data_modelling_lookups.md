# Data Modelling — Relationships (Lookups)

A **lookup** is a relationship between two tables that connects a column in one table to a matching column in another. It tells Zoho Analytics that these two columns are related, enabling you to:
- Combine data from both tables in reports and dashboards
- Write multi-table aggregate formulas that span related tables

> **Before creating a lookup**, you need the column IDs (not just column names) for both sides of the relationship. Use `getViewDetails` on each table to obtain column IDs from their schemas.

---

## Relationship Types

| Type | Meaning |
|---|---|
| `ONE_TO_ONE` | Each row in the source matches exactly one row in the target |
| `ONE_TO_MANY` | One row in source maps to many rows in target (source = parent, target = child) |
| `MANY_TO_MANY` | Many rows on either side can match many on the other |
| `MANY_TO_ONE` | Automatically converted: source/target are swapped and `ONE_TO_MANY` is applied |

**Direction convention:** The relationship flows **source → target**.
- For `ONE_TO_MANY`: source is the "one" (parent) side; target is the "many" (child) side.
- For `MANY_TO_ONE`: pass it as-is — the tool will auto-swap and treat it as `ONE_TO_MANY`.

---

## 1. Create a Lookup

Creates a lookup relationship between a column in the source table and a column in the target table.

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing both tables.
- `sourceTableId` (required): The ID of the source (parent/one-side) table.
- `sourceColumnId` (required): The ID of the column in the source table to link from.
- `targetTableId` (required): The ID of the target (child/many-side) table.
- `targetColumnId` (required): The ID of the column in the target table to link to.
- `relationshipType` (required): One of `ONE_TO_ONE`, `ONE_TO_MANY`, `MANY_TO_MANY`, `MANY_TO_ONE`.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID` if not provided.

```
execute_analytics_tool(
    "createLookup",
    {
        "workspaceId": "<workspace_id>",
        "sourceTableId": "<source_table_id>",
        "sourceColumnId": "<source_column_id>",
        "targetTableId": "<target_table_id>",
        "targetColumnId": "<target_column_id>",
        "relationshipType": "<ONE_TO_ONE|ONE_TO_MANY|MANY_TO_MANY|MANY_TO_ONE>"
    }
)
```

**Example** — link `Orders.Customer ID` → `Customers.Customer ID` (many orders per customer):

```
execute_analytics_tool(
    "createLookup",
    {
        "workspaceId": "123456789",
        "sourceTableId": "111111111",
        "sourceColumnId": "222222222",
        "targetTableId": "333333333",
        "targetColumnId": "444444444",
        "relationshipType": "ONE_TO_MANY"
    }
)
```

Here `Customers` is the source (one-side) and `Orders` is the target (many-side).

---

## 2. Delete a Lookup

Removes an existing lookup relationship from a specific column in a table.

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the table.
- `viewId` (required): The ID of the table from which to remove the lookup.
- `columnId` (required): The ID of the column whose lookup should be removed.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID` if not provided.

> **Note:** This removes the lookup defined on `columnId` inside `viewId`. If you only know the column name, call `getViewDetails` first to resolve the column ID.

```
execute_analytics_tool(
    "deleteLookup",
    {
        "workspaceId": "<workspace_id>",
        "viewId": "<table_id>",
        "columnId": "<column_id>"
    }
)
```

**Example** — remove the lookup on `Customer ID` in the `Orders` table:

```
execute_analytics_tool(
    "deleteLookup",
    {
        "workspaceId": "123456789",
        "viewId": "333333333",
        "columnId": "444444444"
    }
)
```

---

## Typical Workflow

1. **Get schemas** — call `getViewDetails` on both tables to find column IDs.
2. **Create lookup** — call `createLookup` with the resolved IDs.
3. **Verify** — use reports or multi-table formulas to confirm the relationship works as expected.
4. **Remove if needed** — call `deleteLookup` with the column ID on the side you want to unlink.
