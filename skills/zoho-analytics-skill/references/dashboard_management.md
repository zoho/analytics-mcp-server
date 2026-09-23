# Dashboard Management

A **dashboard** in Zoho Analytics is a canvas that assembles multiple reports (charts, pivots, summaries) and other content cards (HTML, images, titles, embedded URLs, user filters) into a single interactive view. Dashboards are identified by a numeric `dashboardId` and belong to a workspace.

---

## Tools Overview

| Tool | Purpose |
|---|---|
| `readDashboardMetadata` | Retrieve the full CONFIG (layout, settings, themes) of an existing dashboard |
| `createDashboard` | Create a new dashboard with a layout, and optionally settings and themes |
| `updateDashboard` | Full-replace update of an existing dashboard's name, layout, settings, or themes |

> **Mandatory workflow for updates:** Always call `readDashboardMetadata` before `updateDashboard`. The update API performs a **full replacement** of each top-level section you provide — it is NOT a field-by-field merge. Read the current config, modify the relevant fields, then PUT the complete modified config back.

---

## 1. `readDashboardMetadata`

Retrieves the complete design configuration of an existing dashboard. Use this before any update operation, or to inspect the current dashboard structure.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the dashboard |
| `dashboardId` | string | Yes | ID of the dashboard to retrieve |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Returns:** A JSON object with the full dashboard CONFIG:
- `displayName` — dashboard name
- `layout` — all cards with positions and type-specific fields
- `settings` — behavior flags (if configured)
- `themes` — visual theme (if configured)

Use the returned `layout`, `settings`, and `themes` objects directly as inputs to `updateDashboard` after making your targeted changes.

**Tool call:**
```
execute_analytics_tool(
    "readDashboardMetadata",
    {
        "workspaceId": "<workspace_id>",
        "dashboardId": "<dashboard_id>"
    }
)
```

**Example:**
```
execute_analytics_tool(
    "readDashboardMetadata",
    {
        "workspaceId": "123456789",
        "dashboardId": "987654321"
    }
)
```

---

## 2. `createDashboard`

Creates a new dashboard in the specified workspace.

**Required parameters:**

| Parameter | Type | Description |
|---|---|---|
| `workspaceId` | string | ID of the workspace to create the dashboard in |
| `displayName` | string | Display name for the dashboard (max 200 chars, must be unique in workspace) |
| `layout` | object | Dashboard layout — a JSON object keyed by string card IDs (e.g. `"1"`, `"2"`). **Must contain at least one VIEW-type card.** |

**Optional parameters:**

| Parameter | Description |
|---|---|
| `settings` | Behavior flags for the dashboard (drill-down, export formats, filters, etc.) |
| `themes` | Visual theme for the dashboard background and cards |
| `orgId` | Organization ID. Defaults to configured `ORGID` if omitted |

**Returns:** The numeric ID of the created dashboard on success.

**Tool call:**
```
execute_analytics_tool(
    "createDashboard",
    {
        "workspaceId": "<workspace_id>",
        "displayName": "<dashboard_name>",
        "layout": { "<card_id>": { <card_object> }, ... },
        "settings": { ... },   // optional
        "themes": { ... }      // optional
    }
)
```

**Minimal example (one VIEW card, no settings/themes):**
```
execute_analytics_tool(
    "createDashboard",
    {
        "workspaceId": "123456789",
        "displayName": "Sales Overview",
        "layout": {
            "1": {
                "type": "VIEW",
                "viewName": "Monthly Revenue Chart",
                "properties": {},
                "width": 40,
                "height": 20,
                "left": 0,
                "top": 0
            }
        }
    }
)
```

→ For complete layout card types, field requirements, and grid rules, load [Dashboard Layout Reference](./dashboard_management_layout.md).  
→ For settings flags and theme configuration, load [Dashboard Settings & Themes Reference](./dashboard_management_themes.md).

---

## 3. `updateDashboard`

Updates an existing dashboard. At least one of `displayName`, `layout`, `settings`, or `themes` must be provided.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workspaceId` | string | Yes | ID of the workspace containing the dashboard |
| `dashboardId` | string | Yes | ID of the dashboard to update |
| `displayName` | string | No | New display name (max 200 chars). Omit to keep existing name |
| `layout` | object | No | **COMPLETE** replacement layout. If provided, the ENTIRE existing layout is replaced. Partial layouts are NOT supported |
| `settings` | object | No | If provided, replaces ALL existing settings |
| `themes` | object | No | If provided, replaces ALL existing theme settings |
| `orgId` | string | No | Organization ID. Defaults to configured `ORGID` if omitted |

**Tool call:**
```
execute_analytics_tool(
    "updateDashboard",
    {
        "workspaceId": "<workspace_id>",
        "dashboardId": "<dashboard_id>",
        "displayName": "<new_name>",      // optional
        "layout": { ... },                // optional — full layout required if provided
        "settings": { ... },              // optional
        "themes": { ... }                 // optional
    }
)
```

→ For layout card types, field requirements, and grid rules, load [Dashboard Layout Reference](./dashboard_management_layout.md).  
→ For settings flags and theme configuration, load [Dashboard Settings & Themes Reference](./dashboard_management_themes.md).

---

## Full Workflow: Read → Modify → Update

**Task:** Add a new chart card to an existing dashboard.

**Step 1 — Read current config:**
```
execute_analytics_tool(
    "readDashboardMetadata",
    {
        "workspaceId": "123456789",
        "dashboardId": "987654321"
    }
)
```

**Step 2 — Inspect the returned JSON.** Note the existing `layout` (all card IDs and positions), `settings`, and `themes`.

**Step 3 — Modify the layout** by adding a new card with a new unique ID (e.g. `"3"`) at a non-overlapping position. Keep all existing cards unchanged.

**Step 4 — Submit the full updated layout:**
```
execute_analytics_tool(
    "updateDashboard",
    {
        "workspaceId": "123456789",
        "dashboardId": "987654321",
        "layout": {
            "1": { <existing card 1 — unchanged> },
            "2": { <existing card 2 — unchanged> },
            "3": {
                "type": "VIEW",
                "viewName": "Regional Sales Chart",
                "properties": {},
                "width": 40,
                "height": 20,
                "left": 40,
                "top": 0
            }
        }
    }
)
```

> Omitting `settings` and `themes` here keeps them unchanged — only the provided top-level keys are replaced.
