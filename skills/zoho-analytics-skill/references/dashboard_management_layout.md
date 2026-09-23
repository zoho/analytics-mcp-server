# Dashboard Layout Reference

The `layout` parameter in `createDashboard` and `updateDashboard` defines what cards appear on the dashboard and where they are positioned. It is a JSON **object keyed by string card IDs** (e.g. `"1"`, `"2"`, `"3"`). Each value is a card object.

---

## Grid System

- The grid is **80 units wide**. Every card must satisfy: `left + width ≤ 80`.
- There is no fixed height limit — cards stack vertically.
- All positional values (`width`, `height`, `left`, `top`) must be **plain integers**.
- **Cards must not overlap** on the grid.
- A dashboard may contain at most **100 cards**.
- At least **one VIEW-type card** is required.

---

## Common Fields (Required for ALL card types)

| Field | Type | Constraint | Description |
|---|---|---|---|
| `type` | string | One of the 6 types below | Card type |
| `width` | integer | ≥ 2 | Card width in grid units |
| `height` | integer | ≥ 2 | Card height in grid units |
| `left` | integer | ≥ 0; `left + width ≤ 80` | Horizontal offset from left edge (0-based) |
| `top` | integer | ≥ 0 | Vertical offset from top of canvas (0-based) |

---

## Card Types

### `VIEW` — Embed an existing report

Embeds a report (chart, pivot, summary) that already exists in the workspace.

**Additional required fields:**

| Field | Type | Description |
|---|---|---|
| `viewName` | string | The **display name** of an existing report in this workspace. Must match exactly (case-sensitive). |
| `properties` | object | Display overrides for the embedded report. Can be an empty object `{}`. |

**Example:**
```json
{
    "type": "VIEW",
    "viewName": "Monthly Revenue Chart",
    "properties": {},
    "width": 40,
    "height": 20,
    "left": 0,
    "top": 0
}
```

---

### `HTML` — Custom HTML content

Displays arbitrary HTML markup inside the card.

**Additional required fields:**

| Field | Type | Description |
|---|---|---|
| `content` | string | Raw HTML markup. Must not be null or empty. |

**Example:**
```json
{
    "type": "HTML",
    "content": "<p style='color:#fff;font-size:14px;'>Q3 2026 results are in.</p>",
    "width": 20,
    "height": 8,
    "left": 40,
    "top": 0
}
```

---

### `TITLE` — Heading / label card

Displays a text or HTML heading on the dashboard.

**Additional required fields:**

| Field | Type | Description |
|---|---|---|
| `content` | string | Text or HTML heading string. Must not be null or empty. |

**Example:**
```json
{
    "type": "TITLE",
    "content": "Sales Performance Dashboard",
    "width": 80,
    "height": 5,
    "left": 0,
    "top": 0
}
```

---

### `IMAGE` — Display an image

Displays a static image on the dashboard.

**Additional required fields:**

| Field | Type | Description |
|---|---|---|
| `content` | string | Image URL or base64 data URI. Must not be null or empty. |

**Example:**
```json
{
    "type": "IMAGE",
    "content": "https://example.com/logo.png",
    "width": 15,
    "height": 8,
    "left": 65,
    "top": 0
}
```

---

### `EMBED` — Embed external URL or iframe

Embeds an external URL or iframe HTML inside the card.

**Additional required fields:**

| Field | Type | Description |
|---|---|---|
| `content` | string | Embed URL or iframe HTML string. Must not be null or empty. |

**Example:**
```json
{
    "type": "EMBED",
    "content": "https://example.com/live-status",
    "width": 30,
    "height": 15,
    "left": 50,
    "top": 20
}
```

---

### `USERFILTERS` — Interactive filter panel

Renders an interactive filter panel that allows dashboard viewers to filter all VIEW cards simultaneously. No additional fields are required beyond the positional ones.

**Example:**
```json
{
    "type": "USERFILTERS",
    "width": 20,
    "height": 30,
    "left": 60,
    "top": 5
}
```

---

## Grid Constraint Rules (Summary)

| Rule | Detail |
|---|---|
| Grid width | 80 units. `left + width ≤ 80` for every card |
| Minimum card size | `width ≥ 2`, `height ≥ 2` |
| No overlaps | Cards must not occupy overlapping grid cells |
| Max cards | 100 per dashboard |
| At least one VIEW | Dashboard must have ≥ 1 VIEW-type card |
| Integer positions | `width`, `height`, `left`, `top` must all be integers |

Violations of these rules cause 4xx API errors (e.g. `INVALID_LAYOUT_JSON`, `VIEWS_NOT_FOUND`).

---

## Complete Layout Example

A dashboard with a title bar, a USERFILTERS panel, and two VIEW cards:

```json
{
    "1": {
        "type": "TITLE",
        "content": "Executive Sales Dashboard",
        "width": 80,
        "height": 5,
        "left": 0,
        "top": 0
    },
    "2": {
        "type": "USERFILTERS",
        "width": 20,
        "height": 40,
        "left": 60,
        "top": 5
    },
    "3": {
        "type": "VIEW",
        "viewName": "Monthly Revenue Chart",
        "properties": {},
        "width": 40,
        "height": 20,
        "left": 0,
        "top": 5
    },
    "4": {
        "type": "VIEW",
        "viewName": "Regional Sales Breakdown",
        "properties": {},
        "width": 40,
        "height": 20,
        "left": 40,
        "top": 5
    }
}
```

> **For `updateDashboard`:** Always provide the COMPLETE layout (all cards), not just changed cards. Partial layouts replace the existing layout with only the cards you supply, removing all others.
