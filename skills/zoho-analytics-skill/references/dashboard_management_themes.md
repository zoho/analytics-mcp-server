# Dashboard Settings & Themes Reference

This file documents the optional `settings` and `themes` parameters used in `createDashboard` and `updateDashboard`.

> **Full replacement:** When either `settings` or `themes` is provided to `updateDashboard`, it **fully replaces** the existing configuration for that section. To preserve existing values, read the current config via `readDashboardMetadata` first, then re-submit the complete modified object.

---

## Settings

The `settings` object controls dashboard behavior — interactivity, export options, filter behavior, and layout mode. Omit the entire object to keep server defaults.

> **Important:** All boolean settings must use the **string** values `"true"` or `"false"` — not JSON booleans (`true`/`false`), not integers (`1`/`0`), not `"yes"`/`"no"`.

### Settings Reference

| Field | Type | Description |
|---|---|---|
| `allowDrillDown` | `"true"` \| `"false"` | Enables drill-down on chart data points |
| `hideColumnOptions` | `"true"` \| `"false"` | Hides column-level options from dashboard viewers |
| `smartAlignCharts` | `"true"` \| `"false"` | Auto-aligns chart elements for visual consistency |
| `enableSortMenu` | `"true"` \| `"false"` | Shows the sort menu on embedded reports |
| `reportAsFilter` | `"true"` \| `"false"` | Clicking a chart element filters other dashboard cards |
| `showContextualOptions` | `"true"` \| `"false"` | Shows contextual action menus on dashboard cards |
| `allowVUD` | `"true"` \| `"false"` | Enables visual-update drill-down (VUD) for embedded reports |
| `allowInsights` | `"true"` \| `"false"` | Enables AI-powered Insights for embedded reports |
| `fitToWidth` | `"true"` \| `"false"` | Scales embedded reports to fit the card width |
| `enableGlobalUF` | `"true"` \| `"false"` | Enables the global user filter affecting all cards |
| `enableGlobalValueUF` | `"true"` \| `"false"` | Enables value-based global user filters |
| `applyImmediateUF` | `"true"` \| `"false"` | Applies user filter changes immediately without a confirmation click |
| `timeSlicer` | `"true"` \| `"false"` | Enables the time slicer widget on the dashboard |
| `layoutType` | `"web"` \| `"mobile"` | Specifies the target layout viewport |
| `layoutWidth` | string | Sets a fixed layout width in pixels as a string (e.g. `"1280"`) |
| `allowExport` | object | Controls which export formats are available (see below) |

### `allowExport` Sub-object

Each key in `allowExport` must also be the string `"true"` or `"false"`:

| Key | Description |
|---|---|
| `csv` | Allow CSV export |
| `html` | Allow HTML export |
| `excel` | Allow Excel export |
| `pdf` | Allow PDF export |
| `image` | Allow image export |
| `zohoSheet` | Allow export to Zoho Sheet |

### Settings Example

```json
{
    "allowDrillDown": "true",
    "reportAsFilter": "true",
    "fitToWidth": "true",
    "enableGlobalUF": "true",
    "applyImmediateUF": "true",
    "timeSlicer": "false",
    "layoutType": "web",
    "layoutWidth": "1280",
    "allowExport": {
        "csv": "true",
        "excel": "true",
        "pdf": "true",
        "image": "false",
        "zohoSheet": "false"
    }
}
```

---

## Themes

The `themes` object controls the visual appearance of the dashboard background and cards. Omit the entire object to use server defaults.

### Structure

The `themes` object has two required parts:
1. **Background definition** — determined by `type` (`"solid"`, `"gradient"`, or `"image"`). Only the sub-object matching `type` should be present; including multiple background sub-objects raises error 7493.
2. **`card` object** — required for ALL theme types. Defines the visual styling of dashboard cards.

> **Important:** All color fields must be **hex strings** (e.g. `"#333542"`). Passing integers for color fields raises error 8509.

### `type` Field and Background Sub-objects

| `type` value | Required sub-object | Sub-object fields |
|---|---|---|
| `"solid"` | `solid` | `background` (hex color string, e.g. `"#333542"`) |
| `"gradient"` | `gradient` | `startColor` (hex string), `endColor` (hex string) |
| `"image"` | `image` | `url` (image URL string) |

### `card` Object Fields

| Field | Type | Description |
|---|---|---|
| `background` | string | Card background hex color (e.g. `"#3E3F4D"`) |
| `opacity` | number | Card background opacity, `0.0` – `1.0` |
| `blur` | number | Background blur level |
| `radius` | number | Card corner radius in pixels |
| `margin` | number | Card margin in pixels |
| `shadow` | number | Card shadow intensity |
| `border.color` | string | Card border hex color |
| `border.width` | integer | Card border width in pixels |
| `title.border.color` | string | Card title border hex color |

All `card` fields are optional, but the `card` object itself must be present.

---

### Theme Examples

**Solid background:**
```json
{
    "type": "solid",
    "solid": {
        "background": "#333542"
    },
    "card": {
        "background": "#3E3F4D",
        "opacity": 0.9,
        "radius": 8,
        "margin": 4,
        "border": {
            "color": "#6F738E",
            "width": 1
        }
    }
}
```

**Gradient background:**
```json
{
    "type": "gradient",
    "gradient": {
        "startColor": "#1A1B2E",
        "endColor": "#333542"
    },
    "card": {
        "background": "#2E2F40",
        "opacity": 0.85,
        "radius": 6
    }
}
```

**Image background:**
```json
{
    "type": "image",
    "image": {
        "url": "https://example.com/dashboard-bg.jpg"
    },
    "card": {
        "background": "#FFFFFF",
        "opacity": 0.75,
        "blur": 2,
        "radius": 4
    }
}
```

---

## Common Mistakes

| Mistake | Correct approach |
|---|---|
| Using JSON boolean `true` for settings | Use the string `"true"` instead |
| Passing an integer for a color field (e.g. `background: 3355202`) | Use a hex string: `"#333542"` |
| Including `solid`, `gradient`, and `image` sub-objects together | Include only the one matching `type` |
| Omitting the `card` object | `card` is required for all theme types |
| Providing a partial settings object on update | The entire `settings` object is replaced — re-submit all flags you want to preserve |
