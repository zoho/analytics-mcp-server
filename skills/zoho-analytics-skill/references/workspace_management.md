# Workspace Management

Workspaces are the top-level containers in Zoho Analytics, similar to databases. They hold all related tables, query tables, charts, dashboards, and other objects. Use these operations to manage the workspace lifecycle and the views/objects within a workspace.

**Terminology note:** In Zoho Analytics, an ordinary Table *is* a type of View (view type 0). The operations below use "view" broadly - it covers tables, query tables, charts, pivots, dashboards, and so on. When an operation targets a specific table, pass its ID as the `viewId`.

> **Looking for folder operations?** Organizing views into folders within a workspace is covered separately — see [Folder Management](./folder_management.md).


## 1. Create a Workspace

Creates a new workspace.

Arguments:
- workspaceName (required): The display name of the new workspace.

**Returns (`data`):** `{ "workspaceId": string }`

```js
return await tools.createWorkspace({
    "workspaceName": "<workspace_name>"
})
```

Example:

```js
return await tools.createWorkspace({
    "workspaceName": "Sales Analytics"
})
```


## 2. List Workspaces

Returns a list of workspaces accessible to the authenticated user.

Arguments:
- includeSharedWorkspaces (optional): When `true`, includes workspaces shared with the user in addition to workspaces the user owns. Defaults to `false`. Only enable when shared workspaces are relevant to the task - enabling it unnecessarily increases response time when many shared workspaces exist.
- containsStr (optional): Case-insensitive filter; returns only workspaces whose names contain the specified string (e.g. `"sales"` matches `"Sales Analytics"` and `"Global Sales Data"`).

**Returns (`data`):** `{ workspaces: Workspace[], count: number }` (at most 20). Each `Workspace` has `workspaceId`, `workspaceName` and `owned`.

```js
return await tools.getWorkspaceList({
    "includeSharedWorkspaces": <true/false>,
    "containsStr": "<string_to_filter_workspaces_based_on_name>"
})
```

Example:

```js
return await tools.getWorkspaceList({
    "includeSharedWorkspaces": true,
    "containsStr": "Sales"
})
```


## 3. List Views/Objects in a Workspace

Returns up to 20 views/objects within a workspace. Use the optional filters to narrow results to the types or names that are relevant to the current task.

Arguments:
- workspaceId (required): The unique identifier of the workspace. Obtain this from `getWorkspaceList`.
- allowedViewTypesIds (optional): Array of numeric view type IDs to restrict which kinds of objects are returned. Supported values:
  - `0` - Table
  - `2` - Chart
  - `3` - Pivot Table
  - `4` - Summary View
  - `6` - Query Table
  - `7` - Dashboard

  Defaults to `[0, 6]` (tables and query tables) if omitted.
- viewContainsStr (optional): Case-insensitive string filter on view names.

**Returns (`data`):** `{ views: ViewSummary[], count: number }`. Each `ViewSummary` has `viewId`, `viewName` and `viewDesc`.

Important Notes:
- At most 20 views are returned per call. When a workspace has many views and only some are relevant, use paginated calls and write intermediate results to a temp file; return the top relevant matches once identified.

```js
return await tools.searchViews({
    "workspaceId": "<workspace_id>",
    "allowedViewTypesIds": [0, 6],
    "viewContainsStr": "<name_filter>"
})
```

Example:

```js
return await tools.searchViews({
    "workspaceId": "123456789",
    "allowedViewTypesIds": [0, 2],
    "viewContainsStr": "sales"
})
```


## 4. Delete a View

Deletes a view (table, report, dashboard, or any other object) from a workspace. This operation is irreversible - confirm you have the correct `viewId` before calling it.

Arguments:
- workspaceId (required): The ID of the workspace that contains the view to delete.
- viewId (required): The ID of the view to delete. Use `searchViews` to look up the ID if you don't already have it.
- orgId (optional): The ID of the organization to which the workspace belongs. Defaults to the configured `ORGID` if not provided. Required when working with views in a shared/org workspace that differs from the default org.

**Returns (`data`):** `null`; the confirmation is in `messages`.

```js
return await tools.deleteView({
    "workspaceId": "<workspace_id>",
    "viewId": "<view_id>",
    "orgId": "<org_id>"
})
```

Example:

```js
return await tools.deleteView({
    "workspaceId": "123456789",
    "viewId": "987654321"
})
```


