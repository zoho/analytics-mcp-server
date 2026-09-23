# Folder Management

Folders are used to organize views (tables, reports, dashboards) within a workspace. Use folder operations when the user wants to create, rename, delete, or list folders, or when they want to move views into a folder for better structure.

**Nesting rules:** Zoho Analytics supports exactly **2 levels** of folder nesting — root-level folders (level 1) and sub-folders (level 2). Sub-folders cannot contain further nested folders.

**Typical workflow for organizing a workspace:**
1. `getFolders` — check what folders already exist
2. `createFolder` — create a new folder (or sub-folder)
3. `moveViewsToFolder` — move views into the folder
4. Use `searchViews` (see [Workspace Management](./workspace_management.md)) to look up view IDs when needed.


## 1. List Folders

Returns all folders in a workspace, including their IDs, names, descriptions, nesting level, and default status. **Always call this first** before creating, renaming, moving, or deleting folders — you need the folder IDs.

Arguments:
- `workspaceId` (required): The ID of the workspace to list folders from.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "getFolders",
    {
        "workspaceId": "<workspace_id>"
    }
)
```

Example:

```
execute_analytics_tool(
    "getFolders",
    {
        "workspaceId": "123456789"
    }
)
```

Sample response:
```json
[
    {
        "folderId": "111111111",
        "folderName": "Sales Reports",
        "folderDesc": "All sales-related reports and dashboards",
        "isDefault": false,
        "parentFolderId": null
    },
    {
        "folderId": "222222222",
        "folderName": "Q1 Breakdown",
        "folderDesc": "Q1 sub-reports",
        "isDefault": false,
        "parentFolderId": "111111111"
    }
]
```


## 2. Create a Folder

Creates a new folder within a workspace. Omit `parentFolderId` for a root-level folder; provide it to create a sub-folder under an existing root-level folder.

Arguments:
- `workspaceId` (required): The ID of the workspace where the folder will be created.
- `folderName` (required): Display name for the new folder.
- `folderDesc` (optional): A brief description of the folder's purpose.
- `parentFolderId` (optional): The ID of the parent (root-level) folder. Provide this only when creating a sub-folder. Use `getFolders` to obtain the parent folder ID. Only 1 level of sub-folders is allowed — the parent must be a root-level folder.
- `makeDefaultFolder` (optional): Set to `true` to make this folder the default. Defaults to `false`.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "createFolder",
    {
        "workspaceId": "<workspace_id>",
        "folderName": "<folder_name>",
        "folderDesc": "<description>",
        "parentFolderId": "<parent_folder_id>",
        "makeDefaultFolder": false
    }
)
```

Example — create a root-level folder:

```
execute_analytics_tool(
    "createFolder",
    {
        "workspaceId": "123456789",
        "folderName": "Sales Reports",
        "folderDesc": "All sales-related reports and dashboards"
    }
)
```

Example — create a sub-folder under an existing root folder:

```
execute_analytics_tool(
    "createFolder",
    {
        "workspaceId": "123456789",
        "folderName": "Q1 Breakdown",
        "folderDesc": "Quarter 1 detailed reports",
        "parentFolderId": "111111111"
    }
)
```

Returns: A success message with the new folder's ID.


## 3. Rename a Folder

Renames an existing folder. The folder ID remains unchanged; only the display name is updated.

Arguments:
- `workspaceId` (required): The ID of the workspace containing the folder.
- `folderId` (required): The ID of the folder to rename. Use `getFolders` to obtain this.
- `newFolderName` (required): The new display name for the folder.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "renameFolder",
    {
        "workspaceId": "<workspace_id>",
        "folderId": "<folder_id>",
        "newFolderName": "<new_name>"
    }
)
```

Example:

```
execute_analytics_tool(
    "renameFolder",
    {
        "workspaceId": "123456789",
        "folderId": "111111111",
        "newFolderName": "Revenue Reports"
    }
)
```


## 4. Move Views into a Folder

Moves one or more views (tables, reports, dashboards) into a specified folder. You can move multiple views at once.

Arguments:
- `workspaceId` (required): The ID of the workspace containing both the views and the target folder.
- `folderId` (required): The ID of the folder to move views into. Use `getFolders` to obtain this.
- `viewIds` (required): An array of view IDs to move. Use `searchViews` (see [Workspace Management](./workspace_management.md)) to look up view IDs.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

```
execute_analytics_tool(
    "moveViewsToFolder",
    {
        "workspaceId": "<workspace_id>",
        "folderId": "<folder_id>",
        "viewIds": ["<view_id_1>", "<view_id_2>"]
    }
)
```

Example — move two reports into a folder:

```
execute_analytics_tool(
    "moveViewsToFolder",
    {
        "workspaceId": "123456789",
        "folderId": "111111111",
        "viewIds": ["987654321", "876543210"]
    }
)
```


## 5. Delete a Folder

Deletes a folder from a workspace. **The folder must be empty before deletion** — move all views out first using `moveViewsToFolder`.

Arguments:
- `workspaceId` (required): The ID of the workspace containing the folder.
- `folderId` (required): The ID of the folder to delete. Use `getFolders` to obtain this.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

Important Notes:
- If the folder still contains views, the operation will fail. Move views out first.
- This operation is irreversible.

```
execute_analytics_tool(
    "deleteFolder",
    {
        "workspaceId": "<workspace_id>",
        "folderId": "<folder_id>"
    }
)
```

Example:

```
execute_analytics_tool(
    "deleteFolder",
    {
        "workspaceId": "123456789",
        "folderId": "111111111"
    }
)
```


## Common Workflow: Reorganize a Workspace

```
# Step 1: Discover existing folders
execute_analytics_tool("getFolders", { "workspaceId": "123456789" })

# Step 2: Find the views to move
execute_analytics_tool("searchViews", { "workspaceId": "123456789", "viewContainsStr": "sales" })

# Step 3: Create a new folder
execute_analytics_tool("createFolder", { "workspaceId": "123456789", "folderName": "Sales Reports" })
# → Returns folderId: "111111111"

# Step 4: Move views into the folder
execute_analytics_tool("moveViewsToFolder", {
    "workspaceId": "123456789",
    "folderId": "111111111",
    "viewIds": ["987654321", "876543210"]
})
```
