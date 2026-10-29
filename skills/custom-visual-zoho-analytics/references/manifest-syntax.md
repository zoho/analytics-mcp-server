# Manifest Syntax Reference — ZAViz_Manifest.json

**Load this file at Phase 2 (before writing the manifest) and whenever a manifest
upload error occurs.** Use the §07 Syntax Checklist before saving; use §08 Failure
Lookup to diagnose upload errors by exact error message.

---

## §01 — Top-Level Schema

```json
{
  "name":         "...",
  "icon":         "...",
  "dependencies": ["..."],
  "structure":    [["...", "...", "...", "..."]],
  "settings":     { }
}
```

| Field | Required | Type | Constraint |
|---|---|---|---|
| `name` | yes | string | 1–50 chars |
| `icon` | yes | string | 1–2000 chars; relative filename or HTTPS URL |
| `structure` | yes | array | 1–8 shelves; each shelf is **exactly 4 strings** |
| `dependencies` | no | string[] | 0–20 entries; each 1–500 chars |
| `settings` | no | array OR object | flat list or grouped accordion — never mixed |

**No extra top-level keys are allowed.** Any unknown key causes `additional properties not allowed`.

---

## §02 — Structure: Drop Areas

Each shelf entry is exactly 4 strings:

```json
["Shelf Display Name", "single|multi", "DIMENSIONAL|MEASURE", "operations"]
```

| Position | Meaning | Valid values |
|---|---|---|
| 0 | Display name | 1–100 chars, unique across all shelves |
| 1 | Cardinality | `"single"` or `"multi"` (case-insensitive) |
| 2 | Data type | `"DIMENSIONAL"` or `"MEASURE"` (case-insensitive) |
| 3 | Operations | `""` for normal, `"CONTINUOUS"` for range shelves, or comma list e.g. `"sum,avg,count"` |

**Valid examples:**
```json
["Category",  "single", "DIMENSIONAL", ""],
["Values",    "multi",  "MEASURE",     ""],
["Date",      "single", "DIMENSIONAL", ""],
["Breakdown", "multi",  "DIMENSIONAL", ""],
["BoxValues", "multi",  "MEASURE",     "CONTINUOUS"]
```

**Invalid — will fail upload:**
```json
["Values", "MULTI", "measure", ""],      // ✗ wrong case (must be lowercase for cardinality)
["Values", "multi", "Measure", ""],      // ✗ wrong case (MEASURE must be uppercase)
["Values", "multi", "MEASURE"],          // ✗ only 3 elements — needs trailing ""
["Values", "multi", "MEASURE", "", ""]   // ✗ 5 elements — must be exactly 4
```

---

## §03 — Settings: Flat vs Grouped

Pick **one shape** and use it throughout. Never mix.

**Flat (no accordion sections):**
```json
"settings": [
  { "uniqueName": "showLegend", "type": "toggle", "label": "Show Legend", "defaultValue": true },
  { "uniqueName": "chartColor",  "type": "colorComponent", "label": "Chart Color", "defaultValue": "#6366f1" }
]
```

**Grouped (accordion sections):**
```json
"settings": {
  "Chart": [
    { "uniqueName": "showLegend", "type": "toggle", "label": "Show Legend", "defaultValue": true }
  ],
  "Colors": [
    { "uniqueName": "chartColor", "type": "colorComponent", "label": "Chart Color", "defaultValue": "#6366f1" }
  ]
}
```

**Mixed — will fail upload:**
```json
"settings": {
  "Chart": [ ... ],
  "uniqueName": "standalone"    // ✗ oneOf fail — can't have a bare setting and a group
}
```

---

## §04 — Setting Item Rules

Every setting item has exactly these fields:

| Field | Required | Constraint |
|---|---|---|
| `uniqueName` | yes | `^[A-Za-z0-9_]+$`, 1–25 chars — **no spaces, hyphens, dots** |
| `type` | yes | One of six types (see §05) |
| `label` | yes | 1–25 chars — shown in the settings panel |
| `defaultValue` | yes | Type-dependent (see §05) |
| `options` | conditional | Required for `multipleToggle`/`dropdown` only; forbidden for all others |

No extra fields are allowed on a setting item.

**uniqueName rules:**
```
✓  showLegend    chartType    cardMinWidth    show_border
✗  show-legend   (hyphen not allowed)
✗  show legend   (space not allowed)
✗  show.legend   (dot not allowed)
✗  thisUniqueNameIsWayTooLong123   (>25 chars)
```

---

## §05 — All Six Setting Types: Templates + Valid/Invalid Examples

### checkBox

Toggle with checkbox UI. `defaultValue` must be a **boolean literal**.

```json
{ "uniqueName": "showGrid",    "type": "checkBox", "label": "Show Grid",   "defaultValue": true  }
{ "uniqueName": "hideBorder",  "type": "checkBox", "label": "Hide Border", "defaultValue": false }
```

❌ Invalid:
```json
{ "uniqueName": "showGrid", "type": "checkBox", "label": "Show Grid", "defaultValue": "true"  }
//                                                                                       ↑ string — must be boolean
```

---

### toggle

Slider/switch UI. Same rules as checkBox.

```json
{ "uniqueName": "showLegend", "type": "toggle", "label": "Show Legend", "defaultValue": true }
```

❌ Invalid:
```json
{ "uniqueName": "showLegend", "type": "toggle", "label": "Show Legend", "defaultValue": 1 }
//                                                                                        ↑ number — must be boolean
```

---

### inputText

Free text input. `defaultValue` must be a string ≤ 100 chars. No `options`.

```json
{ "uniqueName": "chartTitle",  "type": "inputText", "label": "Chart Title",   "defaultValue": ""       }
{ "uniqueName": "cardMargin",  "type": "inputText", "label": "Card Margin",   "defaultValue": "8,8,8,8" }
{ "uniqueName": "cardMinWidth","type": "inputText", "label": "Min Card Width","defaultValue": "160"    }
```

❌ Invalid:
```json
{ "uniqueName": "n", "type": "inputText", "label": "Title", "defaultValue": 0 }
//                                                                             ↑ number — must be string
```

---

### colorComponent

Color picker. `defaultValue` must be `"#RGB"` or `"#RRGGBB"` hex string. No `options`.

```json
{ "uniqueName": "accentColor", "type": "colorComponent", "label": "Accent Color", "defaultValue": "#6366f1" }
{ "uniqueName": "negColor",    "type": "colorComponent", "label": "Neg Color",    "defaultValue": "#ef4444" }
```

❌ Invalid:
```json
{ "uniqueName": "color1", "type": "colorComponent", "label": "Color", "defaultValue": "red"       }
//                                                                                     ↑ no # prefix
{ "uniqueName": "color2", "type": "colorComponent", "label": "Color", "defaultValue": "#gg0000"   }
//                                                                                     ↑ invalid hex
{ "uniqueName": "color3", "type": "colorComponent", "label": "Color", "defaultValue": "#12345678" }
//                                                                                     ↑ 8 digits — only 3 or 6
```

---

### multipleToggle

Segmented button group. `options` is required. **Each option must be a plain string — not an object.**
`defaultValue` must exactly match one of the option strings (case-sensitive).
At runtime: `metaData.customSettings.settingName` returns the selected string directly — compare with `=== "bar"`, not `=== "bar".value`.

```json
{
  "uniqueName": "chartType",
  "type":        "multipleToggle",
  "label":       "Chart Type",
  "defaultValue":"bar",
  "options": ["bar", "line", "area"]
}
```

❌ Invalid:
```json
{
  "uniqueName":  "chartType",
  "type":        "multipleToggle",
  "label":       "Chart Type",
  "defaultValue":"Bar",
  "options": ["bar", "line"]
}
// ↑ "Bar" ≠ "bar" — case mismatch in defaultValue

{
  "uniqueName":  "chartType",
  "type":        "multipleToggle",
  "label":       "Chart Type",
  "defaultValue":"bar",
  "options": [{ "value": "bar", "label": "Bar" }]
}
// ↑ WRONG — options items must be plain strings, not {value, label} objects

{
  "uniqueName":  "chartType",
  "type":        "multipleToggle",
  "label":       "Chart Type",
  "defaultValue":"bar"
}
// ↑ options array missing entirely
```

---

### dropdown

Select dropdown. Same rules as `multipleToggle`. **Each option must be a plain string — not an object.**

```json
{
  "uniqueName": "legendPos",
  "type":       "dropdown",
  "label":      "Legend Position",
  "defaultValue":"top-right",
  "options": ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]
}
```

❌ Invalid:
```json
{
  "uniqueName":  "legendPos",
  "type":        "dropdown",
  "label":       "Legend Position",
  "defaultValue":"top-right",
  "options":     "top-left,top-right"
}
// ↑ string — options must be a JSON array

{
  "uniqueName":  "legendPos",
  "type":        "dropdown",
  "label":       "Legend Position",
  "defaultValue":"top-right",
  "options": [{ "value": "top-left", "label": "Top Left" }]
}
// ↑ WRONG — options items must be plain strings, not {value, label} objects
```

---

## §06 — Runtime Settings Normalization

Settings values can arrive as native or string-coerced types. Always normalize before use:

```js
/* toggle / checkBox — may arrive as true, "true", 1, "1" */
function tog(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

/* inputText numeric — arrives as string "160" */
function toInt(v, fallback) {
  var n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}
function toFloat(v, fallback) {
  var n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

/* inputText margin — "top,right,bottom,left" */
function parseMargin(str, def) {
  def = def || { top:8, right:8, bottom:8, left:8 };
  if (!str) return def;
  var p = String(str).split(',').map(function(s) { return parseInt(s.trim(), 10); });
  if (p.some(isNaN)) return def;
  return { top: p[0]||0, right: p[1]||0, bottom: p[2]||0, left: p[3]||0 };
}

/* colorComponent — may arrive without # or as theme variable */
function safeColor(v, fallback) {
  if (!v || typeof v !== 'string') return fallback;
  v = v.trim();
  return /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(v) ? v : fallback;
}

/* Usage */
var gs = function(key) { return ZAViz_Utils.getSetting(key); };
var showLegend   = tog(gs('showLegend'));
var cardMinWidth = toInt(gs('cardMinWidth'), 160);
var accent       = safeColor(gs('accentColor'), '#6366f1');
var margin       = parseMargin(gs('cardMargin'));
```

---

## §07 — Manifest Syntax Checklist

Run every item before saving `ZAViz_Manifest.json`:

**Top level**
- [ ] Only allowed keys: `name`, `icon`, `structure`, `dependencies`, `settings`
- [ ] `name` is 1–50 chars
- [ ] `icon` filename matches actual file in ZIP
- [ ] `dependencies` is an array of strings (not an object, not a bare string)
- [ ] Total shelves ≤ 8

**Structure (drop areas)**
- [ ] Each shelf array has exactly 4 elements
- [ ] Position 1 is `"single"` or `"multi"` (lowercase)
- [ ] Position 2 is `"DIMENSIONAL"` or `"MEASURE"` (uppercase)
- [ ] Position 3 is `""`, `"CONTINUOUS"`, or a valid comma-list
- [ ] No duplicate shelf display names

**Settings shape**
- [ ] Settings is either a flat array OR a grouped object — never both
- [ ] If grouped: every group key maps to an array (not a bare setting item)

**Each setting item**
- [ ] Only allowed fields: `uniqueName`, `type`, `label`, `defaultValue`, `options`
- [ ] `uniqueName` matches `^[A-Za-z0-9_]+$` — no spaces, hyphens, dots
- [ ] `uniqueName` is 1–25 chars
- [ ] `uniqueName` is unique across the entire settings definition
- [ ] `label` is 1–25 chars
- [ ] `type` is one of: `checkBox`, `toggle`, `inputText`, `colorComponent`, `multipleToggle`, `dropdown`
- [ ] `defaultValue` type matches the setting type (see §05)
- [ ] `options` present for `multipleToggle`/`dropdown`; absent for all other types
- [ ] Every `options` item is a **plain string** — `{value, label}` objects will fail validation
- [ ] `defaultValue` exactly matches one of the `options` strings (case-sensitive) for `multipleToggle`/`dropdown`
- [ ] `colorComponent` default starts with `#` and is 3 or 6 hex digits

**JSON syntax**
- [ ] No trailing commas (after last array item or object property)
- [ ] No JavaScript comments (`//` or `/* */`)
- [ ] No BOM character at file start
- [ ] Validate with `JSON.parse(fs.readFileSync('ZAViz_Manifest.json','utf8'))` or online linter

---

## §08 — Upload Error → Root Cause → Fix

| Upload error message | Root cause | Fix |
|---|---|---|
| `additional properties not allowed` | Unknown key at top level or on a setting item | Remove the unknown key; check for typos |
| `Not valid JSON` / `Invalid manifest format` | Trailing comma, comment, missing brace, BOM | Lint with `JSON.parse()`; remove all comments |
| `name must be 1-50 characters` | `name` empty or >50 chars | Trim to ≤50 chars |
| `label must be 1-25 characters` | `label` on a setting is empty or >25 chars | Trim to ≤25 chars |
| `uniqueName must be 1-25 characters` | `uniqueName` too long | Trim to ≤25 chars |
| `uniqueName invalid format` | Space, hyphen, dot, or special char in `uniqueName` | Use `^[A-Za-z0-9_]+$` only |
| `boolean expected` | `"true"` / `"false"` string instead of `true` / `false` boolean | Remove quotes from boolean value |
| `color pattern fail` | Missing `#`, 8-digit hex, or non-hex string in `colorComponent` default | Use `"#RGB"` or `"#RRGGBB"` format |
| `options required` | `multipleToggle` or `dropdown` missing `options` array | Add `"options": ["value1", "value2"]` — plain strings, not objects |
| `options not allowed` | Non-toggle/dropdown type has `options` field | Remove `options` from that setting item |
| `oneOf settings fail` | Flat array items mixed with grouped object keys | Pick one shape; convert all settings to same format |
| `structure > 8` | More than 8 shelves | Combine or remove optional shelves |
| `shelf not 4 elements` | Shelf array has 3 or 5 elements | Ensure exactly 4 strings per shelf |
| `cardinality/dataType pattern fail` | Typo or wrong case in cardinality/datatype | `"single"`/`"multi"` lowercase; `"DIMENSIONAL"`/`"MEASURE"` uppercase |
| `Duplicate shelf id` | Two shelves share the same display name | Make all shelf names unique |
| `Duplicate setting id` | Two settings share the same `uniqueName` | Rename the duplicate |
| `icon_not_found` | Icon path in manifest not present in ZIP | Include icon file at ZIP root |
| `main_file_not_found` | `main.js` missing or inside a subfolder | Ensure `main.js` is at ZIP root |
| `manifest_file_not_found` | `ZAViz_Manifest.json` missing or in a subfolder | Ensure manifest is at ZIP root |
| `File too large` | ZIP > 3 MB | Minify JS; remove unused assets |
| `Unsupported file type` | Extension outside `.js .json .png .jpg .jpeg` | Remove disallowed files |
| `version is not defined in the schema` | `"version"` key added to manifest top level | **Remove** the `version` field — it is not allowed |
| `engine is not defined in the schema` | `"engine"` key added to manifest top level | **Remove** the `engine` field — it is not allowed |

---

## §09 — Complete Manifest Template (Copy-Paste)

Covers the most common visual configuration. Remove settings sections not needed.

```json
{
  "name": "My Visual Name",
  "icon": "icon.png",
  "dependencies": [
    "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"
  ],
  "structure": [
    ["Category",  "single", "DIMENSIONAL", ""],
    ["Date",      "single", "DIMENSIONAL", ""],
    ["Value",     "single", "MEASURE",     ""],
    ["Breakdown", "multi",  "DIMENSIONAL", ""]
  ],
  "settings": [
    { "uniqueName": "chartType",      "type": "multipleToggle", "label": "Chart Type",      "defaultValue": "bar",
      "options": ["bar", "line"] },
    { "uniqueName": "showDataLabels", "type": "toggle",         "label": "Data Labels",     "defaultValue": false },
    { "uniqueName": "showLegend",     "type": "toggle",         "label": "Show Legend",     "defaultValue": true  },
    { "uniqueName": "legendPos",      "type": "dropdown",       "label": "Legend Position", "defaultValue": "top-right",
      "options": ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] },
    { "uniqueName": "accentColor",    "type": "colorComponent", "label": "Accent Color",    "defaultValue": "#6366f1" },
    { "uniqueName": "cardMinWidth",   "type": "inputText",      "label": "Min Card Width",  "defaultValue": "160" },
    { "uniqueName": "cardMaxWidth",   "type": "inputText",      "label": "Max Card Width",  "defaultValue": "320" },
    { "uniqueName": "cardMargin",     "type": "inputText",      "label": "Card Margin",     "defaultValue": "8,8,8,8" },
    { "uniqueName": "showBorder",     "type": "checkBox",       "label": "Show Border",     "defaultValue": true  }
  ]
}
```
> **Note:** Flat array is shown here as it is the safest format. Grouped object `{ "Section": [...] }` is also supported but introduces a `oneOf` validation path — both forms must follow all the same per-item rules above.

