---
name: zoho-analytics-skill
description: Interact with Zoho Analytics BI & Analytics platform to manage workspaces, tables, data, relationships, formulas, visualizations, and metadata. Supports OAuth 2.0 authentication with automatic token refresh.
---

# Zoho Analytics

Zoho Analytics is a business intelligence and analytics platform. This skill provides comprehensive access to the Zoho Analytics operations for managing workspaces, tables, data, relationships, formulas, visualizations, and metadata.


This skill provides programmatic access to the Zoho Analytics Operations, enabling:
- Workspace lifecycle management
- Table and schema operations
- Data import/export
- SQL-based query tables
- Relationships and formulas
- Charts, pivots, dashboards, and metadata


## How This Skill Interacts with Zoho Analytics

All interactions with Zoho Analytics use **code mode**, through two MCP tools provided by the Zoho Analytics MCP server:

- `get_signature`: returns the TypeScript signature of each operation (arguments and the exact type of the returned `data`).
- `execute_code`: runs JavaScript in a sandbox where every operation is an async function, `await tools.<toolName>(args)`.

Authentication (OAuth 2.0, including token refresh) is handled by the server. You never provide credentials.

**How to use this skill:**
1. Find the operation you need in the sections below and open its reference file for the tool name, arguments and examples.
2. Call `get_signature` with the camelCase tool names you plan to use.
3. Call `execute_code` and invoke the operations as `await tools.<toolName>(args)`. Chain, loop and batch as needed in one call.

Always read [Code Mode](./references/code_mode.md) first: it covers how to write the code, result handling, errors, sandbox limits and examples.

### Response Format

Inside `execute_code`, every operation resolves with the same envelope:

```json
{
    "status": "success",
    "messages": ["Helpful notes, hints and warnings, e.g. suggested next steps"],
    "errors": [],
    "data": { }
}
```

- `messages`: read these. They contain hints, warnings and notices such as truncated results.
- `data`: the operation's result (`null` for operations that have nothing to return, such as deletes and updates). The reference files list the `data` fields of each operation, for example `data.workspaceId` for `createWorkspace`. Created IDs are always returned in `data`, never embedded in a message.
- A failed operation does not resolve: the call **rejects** with an `Error` carrying `errors` (`{ message, code?, path? }`) and `messages`. See [Code Mode](./references/code_mode.md#errors).

## Operation Categories

### Workspace Management

A workspace is a collection of related tables, query tables (views), charts, etc.

Workspace APIs are used when you need to:
- Create, copy, rename, or delete workspaces
- Fetch workspace-level metadata
- list views/objects in the workspace


Different types of Views/Objects in a workspace are:
- Tables (Ordinary Tables)
- Query Tables (SQL-based materialized views) - These are materialized views created using SQL queries, on top of existing base tables in the workspace.
- Reports
    - Charts
    - Pivot Tables
    - Summary Views

Refer to [Workspace Management](./references/workspace_management.md) for all available workspace operations that can be performed.

### Folder Management

Folders organize views (tables, reports, dashboards) within a workspace. Zoho Analytics supports 2 levels of nesting — root-level folders and one level of sub-folders.

If you need to:
- List existing folders and their IDs
- Create a new folder or sub-folder inside a workspace
- Rename a folder
- Move views (tables, reports, dashboards) into a folder
- Delete an empty folder

Refer to [Folder Management](./references/folder_management.md) for all available folder operations.

### Data Modelling

Data Modelling covers all structural operations in Zoho Analytics — how data is stored, shaped, and related across tables.

If you need to perform any operations such as:
- Creating a new table or adding/removing columns
- Getting the schema/structure of a table or query table
- Defining lookup relationships (foreign-key links) between tables
- Creating SQL-based query tables (materialized views)
- Creating aggregate formulas (KPI measures) or custom formula columns (row-level derived fields)

Refer to [Data Modelling](./references/data_modelling.md) which will guide you to the appropriate detailed reference.


### Data Management

These operations are concerned with reading from and writing to the actual data rows within tables.

If you need to perform any of the following:
- **Query data** — run a SQL SELECT to answer questions or retrieve records from tables/query tables
- **Export data** — export a view (table, report, query table) to a CSV file
- **Import data** — bulk-import rows into a table from a JSON array or a local CSV/JSON file
- **Add a row** — insert a single new row into a table
- **Update rows** — modify existing rows that match a given criteria
- **Delete rows** — remove rows that match a given criteria

Refer to [Data Management](./references/data_management.md) for the appropriate operation.


### Reports and Dashboards

Reports and dashboards are the visualization and presentation layer of Zoho Analytics.

#### Reports

Reports are **single visualizations** built on a table or query table:
- **Charts** — visualizations such as bar, line, pie, scatter, maps, and 30+ other types
- **Pivot Tables** — multidimensional summaries with rows, columns, and aggregations
- **Summary Views** — grouped aggregates using group-by and aggregation

Reports are standalone workspace objects that can be viewed independently or embedded in dashboards.

#### Dashboards

Dashboards are **composite views** that combine reports and content on a single canvas:
- **Report cards** — embed charts, pivots, or summary views
- **HTML cards** — display custom HTML
- **Title cards** — headings and section dividers
- **Image cards** — display images via URL or base64
- **Embed cards** — embed external URLs or iframes
- **User filter panels** — interactive filters controlling dashboard cards

#### When to Navigate

| If you need to: | Load: |
|---|---|
| Create, read or update a chart, pivot, or summary report | [Reports Management](./references/reports_management.md) |
| Create, read, or update dashboards | [Dashboard Management](./references/dashboard_management.md) |