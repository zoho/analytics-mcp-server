# User Filters — Operations

This reference covers operations for managing user filters on existing reports: listing, adding, updating, and deleting user filters.

---

## Overview

User filters can be managed in two ways:

1. **Individual operations** — Use dedicated tools to list, add, update, or delete specific user filters
2. **Bulk replacement** — Use `updateReport` to replace all user filters at once (full-replace pattern)

**Important:** The `updateReport` tool performs a full replacement of the entire report configuration, including user filters. If you use `updateReport` and omit the `userFilters` field, all existing user filters will be cleared.

---

## 1. List User Filters

Retrieves all user filters currently configured on a report.

**Tool:** `listUserFilters`

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the report
- `reportId` (required): The ID of the report whose user filters you want to list
- `orgId` (optional): Organization ID. Defaults to configured `ORGID` if omitted

**Returns:** An array of user filter objects with their full configuration (columnName, tableName, operation, compType, filterType, values, etc.)

**Tool call:**
```
execute_analytics_tool(
    "listUserFilters",
    {
        "workspaceId": "<workspace_id>",
        "reportId": "<report_id>"
    }
)
```

**Example:**
```
execute_analytics_tool(
    "listUserFilters",
    {
        "workspaceId": "123456789",
        "reportId": "987654321"
    }
)
```

**Use this when:**
- You need to inspect what user filters are currently on a report
- You're planning to add or modify user filters and need to understand the current state
- You want to verify that user filters were successfully added/updated

---

## 2. Add a User Filter

Adds a new user filter to an existing report without affecting other user filters already on the report.

**Tool:** `addUserFilter`

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the report
- `reportId` (required): The ID of the report to add the user filter to
- `userFilter` (required): A user filter object. Must include all required fields for the filter type (see [User Filters — Creation](./user_filters_creation.md) for complete field reference)
- `orgId` (optional): Organization ID. Defaults to configured `ORGID` if omitted

**Tool call:**
```
execute_analytics_tool(
    "addUserFilter",
    {
        "workspaceId": "<workspace_id>",
        "reportId": "<report_id>",
        "userFilter": {
            "columnName": "<column_name>",
            "tableName": "<table_name>",
            "operation": "<operation>",
            "compType": "<component_type>",
            ...
        }
    }
)
```

**Example 1 — Add a region dropdown filter:**
```
execute_analytics_tool(
    "addUserFilter",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "userFilter": {
            "columnName": "Region",
            "tableName": "Sales Data",
            "operation": "actual",
            "compType": "multiSelect",
            "isallval": true
        }
    }
)
```

**Example 2 — Add a date range picker:**
```
execute_analytics_tool(
    "addUserFilter",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "userFilter": {
            "columnName": "Order Date",
            "tableName": "Sales Data",
            "operation": "dateRange"
        }
    }
)
```

**Example 3 — Add a top-N ranking slider:**
```
execute_analytics_tool(
    "addUserFilter",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "userFilter": {
            "columnName": "Sales Amount",
            "tableName": "Sales Data",
            "operation": "sum",
            "compType": "slider",
            "filterType": "ranking",
            "values": ["Top 5", "Top 10", "Top 20"],
            "defaultFilterValues": ["Top 10"]
        }
    }
)
```

---

## 3. Update a User Filter

Modifies an existing user filter on a report. You must specify which user filter to update by providing its `columnName` and `tableName`, then provide the complete new configuration.

**Tool:** `updateUserFilter`

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the report
- `reportId` (required): The ID of the report containing the user filter to update
- `columnName` (required): The column name of the user filter to update (identifier)
- `tableName` (required): The table name of the user filter to update (identifier)
- `userFilter` (required): The complete new user filter configuration (will replace the existing one)
- `orgId` (optional): Organization ID. Defaults to configured `ORGID` if omitted

**Tool call:**
```
execute_analytics_tool(
    "updateUserFilter",
    {
        "workspaceId": "<workspace_id>",
        "reportId": "<report_id>",
        "columnName": "<column_name>",
        "tableName": "<table_name>",
        "userFilter": {
            "columnName": "<column_name>",
            "tableName": "<table_name>",
            "operation": "<new_operation>",
            "compType": "<new_component_type>",
            ...
        }
    }
)
```

**Example — Change a multiSelect to singleSelect:**
```
execute_analytics_tool(
    "updateUserFilter",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "columnName": "Region",
        "tableName": "Sales Data",
        "userFilter": {
            "columnName": "Region",
            "tableName": "Sales Data",
            "operation": "actual",
            "compType": "singleSelect",
            "isallval": false,
            "values": ["North", "South", "East", "West"],
            "defaultFilterValues": ["North"]
        }
    }
)
```

---

## 4. Delete a User Filter

Removes a user filter from a report.

**Tool:** `deleteUserFilter`

**Arguments:**
- `workspaceId` (required): The ID of the workspace containing the report
- `reportId` (required): The ID of the report containing the user filter to delete
- `columnName` (required): The column name of the user filter to delete
- `tableName` (required): The table name of the user filter to delete
- `orgId` (optional): Organization ID. Defaults to configured `ORGID` if omitted

**Tool call:**
```
execute_analytics_tool(
    "deleteUserFilter",
    {
        "workspaceId": "<workspace_id>",
        "reportId": "<report_id>",
        "columnName": "<column_name>",
        "tableName": "<table_name>"
    }
)
```

**Example:**
```
execute_analytics_tool(
    "deleteUserFilter",
    {
        "workspaceId": "123456789",
        "reportId": "987654321",
        "columnName": "Region",
        "tableName": "Sales Data"
    }
)
```

---

## 5. Bulk User Filter Replacement via updateReport

The `updateReport` tool can replace all user filters at once. This is useful when making multiple changes simultaneously.

**⚠️ Critical:** If you use `updateReport` and omit the `userFilters` field, all existing user filters will be cleared.

For the complete read-modify-write workflow with examples, see [Reports Read & Update](./reports_read_update.md).

---

## Choosing the Right Approach

| Task | Best Tool |
|------|-----------|
| Inspect existing user filters | `listUserFilters` |
| Add one user filter to existing report | `addUserFilter` |
| Modify one user filter | `updateUserFilter` |
| Remove one user filter | `deleteUserFilter` |
| Add/remove/modify multiple user filters at once | `updateReport` (with read-modify-write workflow) |
| Change report structure AND user filters together | `updateReport` (with read-modify-write workflow) |

---

## Best Practices

1. **Read before bulk update**: Always call `readReportMetadata` before using `updateReport` to avoid losing existing configuration
2. **Use individual operations for single changes**: When adding/updating/deleting a single user filter, prefer the dedicated tools (`addUserFilter`, `updateUserFilter`, `deleteUserFilter`) over `updateReport`
3. **List to verify**: Call `listUserFilters` after operations to confirm changes were applied correctly
4. **Match column and table identifiers**: When updating or deleting, ensure `columnName` and `tableName` exactly match the existing user filter (case-sensitive)
5. **Validate filter configuration**: Before adding/updating, verify that required fields are present for the operation and column type (see [User Filters — Creation](./user_filters_creation.md))
