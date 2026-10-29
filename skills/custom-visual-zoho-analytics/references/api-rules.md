# API Rules — Manifest & Runtime APIs

Read this file when writing ZAViz_Manifest.json or calling any ZAViz_ / $ZC / ZCFormatUtil API.

---

## ZAViz_Manifest.json — Top-Level Schema

| Field | Required | Limit | Notes |
|---|---|---|---|
| `name` | yes | 1–50 chars | Display name shown in chart builder |
| `icon` | yes | 1–2000 chars | Relative file path in ZIP or HTTPS URL |
| `dependencies` | no | 0–20 entries, each 1–500 chars | Full CDN URL for each library |
| `structure` | yes | 1–8 shelves | Drop area definitions |
| `settings` | no | — | Flat array or grouped object |

**No extra top-level properties are allowed.** Any unknown key causes an upload failure
(`additional properties not allowed`).

---

## Shelf Schema

```json
{
  "structure": [
    ["Shelf Name", "single|multi", "DIMENSIONAL|MEASURE", ""]
  ]
}
```

Each shelf is exactly 4 elements. Fewer or more elements cause `shelf not 4 elements` error.

### datatype enum

| Value | Use for |
|---|---|
| `"numeric"` | Measures / KPIs |
| `"ordinal"` | Dimensions / categories / text |
| `"time"` | Date / datetime columns |

### operation enum

| Value | Use for |
|---|---|
| `"GROUPBY"` | Dimensions and date columns |
| `"SUM"` | Additive metrics (revenue, count) |
| `"AVG"` | Averaged metrics (rate, score) |
| `"COUNT"` | Row count aggregation |
| `"CONTINUOUS"` | Boxplot / range charts needing raw arrays |

### Total shelves ≤ 8

---

## Date Shelf Template

Add a date shelf whenever the visual involves time comparison, trend, or period filtering:

```json
{
  "structure": [
    ["Date", "single", "DIMENSIONAL", ""]
  ]
}
```

Use `"DIMENSIONAL"` (not `"MEASURE"`) for date shelves. The runtime column `datatype` will
be `"time"` or `"ordinal"` depending on how the user configured the column.

---

## Settings Schema

### Flat vs Grouped

```json
/* Flat */
"settings": [{ "uniqueName": "showLegend", ... }]

/* Grouped (accordion sections) */
"settings": { "Chart": [{ "uniqueName": "showLegend", ... }], "Legend": [...] }
```

Never mix flat and grouped — causes `oneOf settings fail`.

### Setting Item Fields

| Field | Required | Rule |
|---|---|---|
| `uniqueName` | yes | `^[A-Za-z0-9_]+$`, 1–25 chars — no spaces, hyphens, or special chars |
| `type` | yes | One of six types below |
| `label` | yes | 1–25 chars |
| `defaultValue` | yes | Type-dependent (see table below) |
| `options` | conditional | Required for `multipleToggle` and `dropdown` only |

No extra properties on a setting item — causes `additional properties not allowed`.

### Setting Types and Default Value Rules

| Type | `defaultValue` type | `options` | Notes |
|---|---|---|---|
| `checkBox` | `true` or `false` (boolean) | forbidden | Checkbox UI |
| `toggle` | `true` or `false` (boolean) | forbidden | Slider/toggle UI |
| `inputText` | string, max 100 chars | forbidden | Free text input |
| `colorComponent` | `"#RGB"` or `"#RRGGBB"` hex string | forbidden | Color picker |
| `multipleToggle` | string matching one option value | required | Segmented button group |
| `dropdown` | string matching one option value | required | Select dropdown |

Using `"true"` (string) instead of `true` (boolean) causes `boolean expected` upload error.
Using wrong hex format for `colorComponent` causes `color pattern fail`.

### Options Array (for multipleToggle / dropdown)

```json
{
  "uniqueName": "chartType",
  "type": "multipleToggle",
  "label": "Chart Type",
  "defaultValue": "bar",
  "options": ["bar", "line"]
}
```

`defaultValue` must exactly match one of the `value` strings.

---

### Legend Position Setting

When exposing legend placement as a setting, use one of these exact 12 position strings.
ECharts maps these directly; for D3/DOM, translate to flex/absolute placement logic.

```
top-left      top-center      top-right
bottom-left   bottom-center   bottom-right
left-top      left-middle     left-bottom
right-top     right-middle    right-bottom
```

```json
{
  "uniqueName": "legendPosition",
  "type": "dropdown",
  "label": "Legend Position",
  "defaultValue": "top-right",
  "options": [
    "top-left", "top-center", "top-right",
    "bottom-left", "bottom-center", "bottom-right",
    "left-top", "left-middle", "left-bottom",
    "right-top", "right-middle", "right-bottom"
  ]
}
```

In ECharts, split on `-` and map to `{ legend: { orient, left, top } }`:

```js
function legendPos(pos) {
  var p = (pos || 'top-right').split('-');
  var side = p[0], align = p[1] || 'center';
  var isVert = (side === 'left' || side === 'right');
  return {
    orient: isVert ? 'vertical' : 'horizontal',
    left:   side === 'left'   ? 8 : side === 'right'  ? 'right' : align,
    top:    side === 'top'    ? 8 : side === 'bottom'  ? 'bottom' : align
  };
}
```

---

### Settings Wiring Rules

| Rule | Detail |
|---|---|
| **Axis label empty → recover space** | An empty axis label string hides the label AND frees the layout space. Do not render an empty `<text>` element — remove the axis label element entirely and reduce the chart margin/grid inset accordingly. |
| **Multiple axes → separate toggles** | When a visual has two value axes, expose `showLeftAxis` and `showRightAxis` as separate toggles — never combine into one "Show Axes" toggle. Users often want one axis without the other. |
| **Filter style — shared list** | Dropdown and timeline filter controls can share the same raw-sorted unique-value list. Build the list once from raw data, sort by raw value, display formatted labels. Never build separate lists for dropdown vs timeline. |
| **Numeric settings** | `inputText` values arrive as strings. Always `parseInt` or `parseFloat` before passing to a chart API. Guard `NaN` with a fallback default. |
| **Unsupported controls** | Remove any setting whose toggle/change has no visible effect in the current version. Dormant controls confuse users and inflate the settings panel. |

---

## Runtime Settings Normalization

Settings values arrive inconsistently — always normalize before use:

```js
/* Toggle / checkBox: may arrive as boolean, string, or number */
function tog(v, def) {
  if (v === true  || v === 1 || v === "1" || v === "true")  return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return def !== undefined ? def : false;
}

/* Numeric dropdown: always arrives as string from multipleToggle */
var cols = parseInt(getSetting("columns", "3"), 10) || 3;

/* Margin/padding inputText: "top,right,bottom,left" comma string */
function parseMargin(str, def) {
  var parts = String(str || "").split(",").map(function(s) { return parseFloat(s) || 0; });
  if (parts.length === 4) return { top:parts[0], right:parts[1], bottom:parts[2], left:parts[3] };
  if (parts.length === 1 && parts[0]) return { top:parts[0], right:parts[0], bottom:parts[0], left:parts[0] };
  return def || { top:0, right:0, bottom:0, left:0 };
}
```

---

## ZAViz_Utils — Runtime API

### getSuitableStyle(key)

```js
var bg   = ZAViz_Utils.getSuitableStyle('background');       // string
var fg   = ZAViz_Utils.getSuitableStyle('fontColor');        // string
var ax   = ZAViz_Utils.getSuitableStyle('axisColor');        // string
var leg  = ZAViz_Utils.getSuitableStyle('legendColor');      // Array of rgba() strings

// WRONG — this key does not exist:
ZAViz_Utils.getSuitableStyle('backgroundColor')  // returns undefined
```

### getFormattedValue(oneBasedColIndex, rawValue)

```js
// 1-based index mandatory
var label = ZAViz_Utils.getFormattedValue(idx(col) + 1, rawValue);

// WRONG — 0-based (most common bug):
ZAViz_Utils.getFormattedValue(col.dataindex, rawValue)
ZAViz_Utils.getFormattedValue(idx(col), rawValue)
```

Use for ALL visible dates, numbers, durations — axes, labels, tooltips, cards, tables, filter display strings.

### getColumnData(metaData, shelfId)

```js
var cols = ZAViz_Utils.getColumnData(metaData, 'myShelfId');
// Returns array of column objects; empty array if shelf is empty
```

---

## Column Object Structure

> **DIMENSIONAL columns may carry date/time values.**
> A column can be declared `DIMENSIONAL` in the manifest yet still contain raw numeric
> timestamps or `"YYYY-MM-DD"` strings at runtime (when the user drops a Date field onto
> a dimension shelf). Always call `getFormattedValue` before displaying any DIMENSIONAL
> value — never assume it is a plain label string.
>
> ```js
> /* Safe for both string dimensions AND date-as-dimension */
> function displayDim(col, raw) {
>   var i = idx(col);
>   try {
>     return i >= 0 ? ZAViz_Utils.getFormattedValue(i + 1, raw) : String(raw != null ? raw : '');
>   } catch(e) {
>     return String(raw != null ? raw : '');
>   }
> }
> ```

```js
{
  dataindex:    0,      // 0-based position in data row (PRIMARY index source)
  colIndex:     0,      // fallback 1
  columnIndex:  0,      // fallback 2
  __metaOrder:  0,      // fallback 3
  datatype:    "numeric" | "ordinal" | "time",
  columnName:  "Revenue",
}
```

### idx() — Safe Index Resolution

```js
function idx(col) {
  if (!col) return -1;
  var i = col.dataindex !== undefined ? col.dataindex
        : col.colIndex  !== undefined ? col.colIndex
        : col.columnIndex !== undefined ? col.columnIndex
        : col.__metaOrder;
  return Number.isFinite(+i) ? +i : -1;  /* returns -1, never 0, on bad resolve */
}
```

A return of `-1` signals a bad column resolve — guard before use:
```js
var i = idx(col);
if (i < 0) { /* handle missing column */ return; }
var raw = row[i];
```

---

## ZAViz_ActionsAPI — Interactions

### showInteractionMenu(dataPoints, coords)

```js
ZAViz_ActionsAPI.showInteractionMenu(
  [{ 1: rawDimValue, 2: rawMetricValue }],
  { x: evt.clientX, y: evt.clientY }
);

// WRONG — formatted value in payload, or 0-based keys:
[{ 0: formattedLabel }]
```

Always use raw data values in the payload, never formatted strings.

---

### invokeViewUnderlyingData(clicked_data)

Directly triggers the **View Underlying Data** panel for the clicked element —
no context menu is shown; the action fires immediately.

```js
ZAViz_ActionsAPI.invokeViewUnderlyingData(clicked_data);
```

| Parameter | Type | Rule |
|---|---|---|
| `clicked_data` | object | Keys: 1-based column indexes (integer). Values: raw source values — never formatted strings. Same payload shape as `showInteractionMenu`'s `dataPoints`. |

```js
// ECharts click example
chart.on("click", function(params) {
  var row = data[params.dataIndex];
  var cd = {};
  cd[idx(dimCol)    + 1] = rowVal(row, dimCol);
  cd[idx(metricCol) + 1] = rowVal(row, metricCol);
  try { ZAViz_ActionsAPI.invokeViewUnderlyingData(cd); } catch(e) {}
});
```

Use this instead of `showInteractionMenu` when you have a dedicated "View Data" icon/button
on a card or chart element — the user gets instant VUD without seeing the context menu.

---

### invokeExplainData(clicked_data)

Directly triggers the Zoho Analytics AI **Explain Data** feature for the clicked element.

```js
ZAViz_ActionsAPI.invokeExplainData(clicked_data);
```

| Parameter | Type | Rule |
|---|---|---|
| `clicked_data` | object | Same format as `invokeViewUnderlyingData` — 1-based keys, raw values. |

```js
// DOM card click example
card.addEventListener("click", function(e) {
  var cd = {};
  cd[idx(dimCol)    + 1] = rowVal(row, dimCol);
  cd[idx(metricCol) + 1] = rowVal(row, metricCol);
  try { ZAViz_ActionsAPI.invokeExplainData(cd); } catch(e) {}
});
```

Use when you want an "Explain" button alongside a KPI card or data point —
fires immediately without showing the interaction menu.

---

### invokeDrillThrough(clicked_data, view_name)

Directly navigates to a specific **linked Zoho Analytics view** using the clicked context.

```js
ZAViz_ActionsAPI.invokeDrillThrough(clicked_data, view_name);
```

| Parameter | Type | Rule |
|---|---|---|
| `clicked_data` | object | Same format as above — 1-based keys, raw values. |
| `view_name` | string | Exact name of the target Zoho Analytics view / report (case-sensitive). |

```js
// ECharts click — drill to a specific linked report
chart.on("click", function(params) {
  var row = data[params.dataIndex];
  var cd = {};
  cd[idx(dimCol)    + 1] = rowVal(row, dimCol);
  cd[idx(dateCol)   + 1] = rowVal(row, dateCol);
  cd[idx(metricCol) + 1] = rowVal(row, metricCol);
  var targetView = "Sales Detail Report";   // exact view name, case-sensitive
  try { ZAViz_ActionsAPI.invokeDrillThrough(cd, targetView); } catch(e) {}
});
```

Use when the visual has a known, fixed drill destination — avoids showing the context
menu and navigates directly to `view_name`.

---

### Choosing the right interaction API

| Want to… | Use |
|---|---|
| Let user choose from drill / VUD / explain / filter options | `showInteractionMenu(dataPoints, coords)` — requires click coordinates |
| Immediately open the underlying data panel | `invokeViewUnderlyingData(clicked_data)` |
| Immediately launch AI explain for the data point | `invokeExplainData(clicked_data)` |
| Immediately navigate to a specific linked view | `invokeDrillThrough(clicked_data, view_name)` |

**Common rules for all four APIs:**
- `clicked_data` / `dataPoints` keys are always **1-based** integer column indexes
- Values must always be **raw** source values — never `getFormattedValue()` output
- Include all dimensions and measures relevant to the data point for full context
- Wrap every call in `try { … } catch(e) {}` — the API may be unavailable in some embed contexts
- Coordinates (`{ x, y }`) are only needed by `showInteractionMenu`; the three new APIs do **not** take coordinates

---

## $ZC Fallback (when zc.js is declared in manifest)

```js
// Only use when ZAViz_Utils.getFormattedValue is unavailable
var label = $ZC.getFormattedValue(
  col[col.datatype],   // column descriptor object
  rawValue,
  col.datatype
);
```

Never call `ZCFormatUtil` directly.

---

## Common Failures (Full Table)

| Error message | Root cause | Fix |
|---|---|---|
| Additional properties not allowed | Unknown top-level key or extra setting field | Remove the unknown field |
| Invalid manifest format / Not valid JSON | Trailing comma, missing brace, comment, BOM | Lint with `JSON.parse()` |
| Name must be 1–50 characters | `name` too long or empty | Trim to ≤50 chars |
| Label must be 1–25 characters | `label` >25 chars | Trim to ≤25 chars |
| Unique name must be 1–25 characters | `uniqueName` too long | Trim to ≤25 chars |
| Unique name invalid format | Spaces / hyphens / special chars in `uniqueName` | Use `^[A-Za-z0-9_]+$` only |
| `version` field present | `"version"` is not allowed at top level | **Remove** the `version` field — only `name`, `icon`, `structure`, `dependencies`, `settings` are permitted |
| `engine` field present | `"engine"` is not allowed at top level | **Remove** the `engine` field |
| Duplicate shelf id | Two shelves share same `id` | Make all shelf ids unique |
| Duplicate setting id | Two settings share same `id` | Make all setting ids unique |
| Shelf limit exceeded | More than 8 shelves | Combine or remove optional shelves |
| Shelf not 4 elements | Shelf array has 3 or 5 elements | Ensure exactly 4 strings per shelf |
| Cardinality / dataType pattern fail | Typo or trailing space in `single/multi` or `DIMENSIONAL/MEASURE` | Use exact enum strings |
| Invalid datatype | `datatype` not in `numeric / ordinal / time` | Use exact enum string |
| Invalid operation | `operation` not in valid enum | Use exact enum string |
| Boolean expected | Used `"true"` string instead of `true` in checkBox/toggle | Use actual boolean |
| Color pattern fail | Missing `#` or invalid hex in colorComponent | Use `#RGB` or `#RRGGBB` |
| Options required / not allowed | `multipleToggle`/`dropdown` missing options, or other type has options | Match type to options presence |
| OneOf settings fail | Mixed flat array and grouped object | Use one shape consistently |
| Mandatory shelf empty | Required shelf has no column at render time | Add empty-state guard in main.js |
| icon_not_found | Icon path in manifest not present in ZIP | Include icon file in ZIP |
| main_file_not_found | `main.js` not at ZIP root | Ensure main.js is at root, not in a subfolder |
| manifest_file_not_found | `ZAViz_Manifest.json` not at ZIP root | Ensure manifest is at ZIP root |
| File too large | ZIP > 3 MB | Minify JS, remove unused assets |
| Unsupported file type | Extension not in .js/.json/.png/.jpg/.jpeg | Remove disallowed files |
