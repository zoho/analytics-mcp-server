# Validation Gates — Progressive Disclosure Checklist

Run each gate in order before moving to the next phase. A failed gate in an earlier phase always costs more to fix than running the check now.

## Phase → Gate Map

| Phase | Gates to run | Trigger |
|---|---|---|
| Phase 1 — Plan | **Gate 0** | Before writing manifest or code |
| Phase 2 — Manifest | **Gates 1, 2, 3** | After drafting manifest, before saving |
| Phase 2→3 Bridge | **Gate 3.5** | After manifest passes Gate 3, before opening code-patterns.md |
| Phase 3 — Code | **Gates 4, 5, 5.5** | After writing main.js, before packaging |
| Phase 4 — Package | **Gate 6** | Before uploading ZIP |

---

## Gate 0 — Plan Freeze (Spec · Library · Pre-Code Decisions)

Before writing any code or manifest:

- [ ] Chart type identified (bar, line, scatter, KPI, calendar, network, …)
- [ ] Axes and encoding channels mapped (X=category, Y=metric, Color=series, etc.)
- [ ] Required metrics count known (e.g., KPI needs Measure + Compare + Date)
- [ ] Interaction needed? (drill-down, filter, cross-visual, tooltip only)
- [ ] **Renderer decided**: Chart library (axes/plot/legend) vs **Vanilla DOM** (cards/kanban/table/KPI) — see SKILL.md Renderer Decision Checkpoint
- [ ] If Vanilla DOM: `references/dom-layout.md` noted for Phase 3; no chart library CDN in dependencies
- [ ] **Multi-panel check**: if spec shows multiple panels or cross-filter → `references/multi-visual.md` loaded; refresh() architecture planned before manifest
- [ ] Library selected: ECharts (default) / D3 / Vega-Lite / Vanilla DOM / DuckDB-WASM filter
- [ ] Dark theme handling confirmed (bgIsDark() + solidBg + cardBg required)
- [ ] Date shelf required? If chart involves comparison or time trend → YES
- [ ] ES5-only constraint acknowledged (no const/let/arrow/template literals)

**Library selection — answer before picking:**
- [ ] Standard chart type (bar/line/pie/gauge) → ECharts unless there's a specific reason not to
- [ ] Dense or outside-plot labels needed → verify the chosen library handles this reliably
- [ ] Interaction type needed: context menu (drill/VUD/explain/filter via `showInteractionMenu`) OR direct-action buttons (`invokeViewUnderlyingData`, `invokeExplainData`, `invokeDrillThrough`) — chosen library exposes raw point context and click coordinates
- [ ] Canvas vs SVG vs DOM → matched to the sizing and layout behaviour the visual requires
- [ ] CSP/ZIP safe → no runtime `fetch`/XHR/WebSocket; all dependencies declared in manifest
- [ ] Library choice documented in plan notes — never picked randomly

**For KPI / widget visuals — freeze these before coding:**
- [ ] Card grain decided: By-Dimension OR Total
- [ ] Title rule decided: Dimension label OR `{formatted period} — {metric name}`
- [ ] Comparison formula decided: Metric 2 / Previous Period / Previous Year
- [ ] Layout grammar decided: current+indicator / delta / run-rate bars / progress track
- [ ] Responsive sizing planned: min/max card width, 3→2→1 column breakpoints, scale-down threshold
- [ ] Sparkline type decided: line / area / bar (if included)
- [ ] Settings list finalised: only include controls that are fully wired

---

## Gate 1 — Drop Areas / Manifest Structure

After drafting `ZAViz_Manifest.json`:

- [ ] `name`: 1–50 chars
- [ ] `label`: 1–25 chars (NOT 20)
- [ ] `uniqueName`: matches `^[A-Za-z0-9_]+$`, 1–25 chars
- [ ] Total shelves ≤ 8
- [ ] Date shelf present when comparison/trend is needed
  - `"datatype": "time"`, `"operation": "GROUPBY"`, `"mandatory": false`
- [ ] Numeric shelves: `"datatype": "numeric"`, operation = SUM/AVG/COUNT
- [ ] Dimension shelves: `"datatype": "ordinal"`, `"operation": "GROUPBY"`
- [ ] Boxplot/range shelves that need raw arrays: `"operation": "CONTINUOUS"`

Common Failures quick-check (see Gate 3 for full table).

> **Column plan is a Phase 2→3 bridge gate — run Gate 3.5 after manifest passes Gate 3, before writing main.js.**

---

## Gate 2 — Settings

After drafting settings array in manifest:

- [ ] Each setting has a unique `uniqueName` within the visual
- [ ] `defaultValue` type matches the setting type: `inputText` → string; `checkBox`/`toggle` → boolean; `colorComponent` → `"#RGB"` or `"#RRGGBB"`; `multipleToggle`/`dropdown` → string matching one option
- [ ] `multipleToggle` / `dropdown`: `options` is a plain **string array** e.g. `["bar","line"]` — `{value,label}` objects will fail validation
- [ ] `defaultValue` for `multipleToggle`/`dropdown` exactly matches one of the `options` strings (case-sensitive)
- [ ] No setting key conflicts with reserved Zoho keys
- [ ] Chart-type toggle present when visual supports multiple layouts
- [ ] Locale/unit setting present when showing currency or large numbers
- [ ] Color override setting provided when brand color matters
- [ ] `getSetting(id, default)` helper planned; settings never accessed raw
- [ ] **No `version` or `engine` keys** added to the manifest — only `name`, `icon`, `structure`, `dependencies`, `settings` are allowed at top level
- [ ] **Settings Sync forward ref:** Write the complete list of `uniqueName` values now. After writing `main.js`, run the Settings Sync check in **Gate 4 Layer E2** to confirm every manifest setting is read in code and every code read exists in the manifest.

```js
function getSetting(id, def) {
  try {
    var v = metaData.get ? metaData.get(id) : (metaData[id] !== undefined ? metaData[id] : def);
    return (v !== undefined && v !== null && v !== "") ? v : def;
  } catch(e) { return def; }
}
```

---

## Gate 3 — Manifest Validation Layer

> **Run `references/manifest-syntax.md` §07 Syntax Checklist in full before saving.**
> The checks below are the gate summary — §07 is the detailed per-item validator.

### Layer 1 — JSON Syntax

- [ ] File parses as valid JSON: run `JSON.parse(content)` — no trailing commas, no `//` or `/* */` comments, no BOM
- [ ] No extra top-level keys beyond: `name`, `icon`, `structure`, `dependencies`, `settings`

### Layer 2 — Top-Level Fields

- [ ] `name`: string, 1–50 chars
- [ ] `icon`: filename matches a file actually included in the ZIP
- [ ] `dependencies`: array of strings (not object, not bare string); each URL 1–500 chars; ≤ 20 entries
- [ ] `structure`: 1–8 shelves; each shelf is **exactly 4 strings**
- [ ] **No `version` field** — not part of the schema; causes `additional properties not allowed`
- [ ] **No `engine` field** — not part of the schema; causes `additional properties not allowed`

### Layer 3 — Structure (Drop Areas)

- [ ] Position 1 (cardinality): `"single"` or `"multi"` — **lowercase**
- [ ] Position 2 (data type): `"DIMENSIONAL"` or `"MEASURE"` — **uppercase**
- [ ] Position 3 (operations): `""`, `"CONTINUOUS"`, or valid comma-list
- [ ] No duplicate shelf display names

### Layer 4 — Settings Shape

- [ ] Settings is **either** a flat array **or** a grouped object — never mixed (`oneOf` fail otherwise)
- [ ] If grouped: every group value is an array of setting items, not a bare item

### Layer 5 — Per-Setting Item

- [ ] Only allowed fields: `uniqueName`, `type`, `label`, `defaultValue`, `options`
- [ ] `uniqueName`: matches `^[A-Za-z0-9_]+$`, 1–25 chars, unique across all settings
- [ ] `type`: exactly one of `checkBox`, `toggle`, `inputText`, `colorComponent`, `multipleToggle`, `dropdown`
- [ ] `label`: 1–25 chars
- [ ] `defaultValue` type matches the setting type:
  - `checkBox` / `toggle` → **boolean** (`true` or `false`, not `"true"`)
  - `inputText` → **string** ≤ 100 chars (not a number)
  - `colorComponent` → `"#RGB"` or `"#RRGGBB"` hex string
  - `multipleToggle` / `dropdown` → string exactly matching one of the `options` strings
- [ ] `options` present for `multipleToggle` / `dropdown`; **absent** for all other types
- [ ] Every `options` item is a **plain string** — `{value,label}` objects will fail with "object found, string expected"
- [ ] `defaultValue` exactly matches one of the `options` strings (case-sensitive)

### Layer 6 — Runtime Normalization Wired

- [ ] `toggle` / `checkBox` values normalized via `tog()` before use
- [ ] `inputText` numeric values parsed with `parseInt` / `parseFloat` + `NaN` fallback
- [ ] `colorComponent` values validated with hex-pattern guard before passing to CSS/chart
- [ ] `inputText` margin values parsed with `parseMargin()` helper

### Upload Error → Fix (quick lookup)

| Error message | Fix |
|---|---|
| `additional properties not allowed` | Remove unknown key from top level or setting item |
| `Not valid JSON` | Remove trailing commas and comments; lint with `JSON.parse()` |
| `boolean expected` | Change `"true"` / `"false"` string to `true` / `false` boolean |
| `color pattern fail` | Use `"#RGB"` or `"#RRGGBB"` — no other format accepted |
| `options required` | Add `"options":[...]` to `multipleToggle` / `dropdown` setting |
| `options not allowed` | Remove `options` field from non-toggle/dropdown setting type |
| `oneOf settings fail` | Settings is mixing flat array items with grouped object keys — pick one shape |
| `uniqueName invalid format` | Remove spaces, hyphens, dots; use `^[A-Za-z0-9_]+$` only |
| `cardinality/dataType pattern fail` | Check case: cardinality lowercase, data type uppercase |
| `shelf not 4 elements` | Count shelf array elements — must be exactly 4 strings |
| `Duplicate setting id` | Rename duplicate `uniqueName` |
| `icon_not_found` | Verify icon filename matches file in ZIP exactly (case-sensitive) |
| `manifest_file_not_found` | Move `ZAViz_Manifest.json` to ZIP root — not in a subfolder |

> Full error table with all causes in `references/manifest-syntax.md` §08.

**Run the manifest validation script before saving:**
```bash
python <skill-path>/scripts/validate_manifest.py
# or with explicit path:
python <skill-path>/scripts/validate_manifest.py --manifest ZAViz_Manifest.json
```
Covers all 5 layers above. Exit code 0 = safe to continue; 1 = fix errors first.

> **Manifest passed all 6 layers? → Proceed to Gate 3.5 (Column Plan) before opening `code-patterns.md`.**

---

## Gate 3.5 — Column Plan (Pre-Coding Bridge)

Run this after manifest passes Gate 3 and **before** opening `references/code-patterns.md` or writing any `main.js`. This is the hardest class of bug to retrofit — metadata index errors corrupt the entire data pipeline.

Map every shelf to code BEFORE writing a single line of `main.js`:

- [ ] Every shelf's `dropBoxName` string written down — columns resolved by `dropBoxName`, **never by array position**
- [ ] `idx()` helper planned with full fallback chain: `dataindex → colIndex → columnIndex → __metaOrder`; returns `-1` on failure, never `-1`-from-silent-undefined
- [ ] Multi-shelf sort strategy decided: columns sorted by resolved index after `dropBoxName` filter — ensures stable series/legend order after user removes and re-drops a column
- [ ] Interaction key plan locked: ALL four action APIs (`showInteractionMenu`, `invokeViewUnderlyingData`, `invokeExplainData`, `invokeDrillThrough`) use the same payload — **1-based** integer column index keys, **raw** unformatted values
- [ ] For `invokeDrillThrough`: target `view_name` string identified — exact Zoho Analytics view name, case-sensitive
- [ ] Direct-action APIs (`invokeViewUnderlyingData`, `invokeExplainData`, `invokeDrillThrough`) do **not** require coordinates; `showInteractionMenu` requires `{ x, y }` from the click event
- [ ] Raw vs display separation confirmed: raw values for filter / sort / group / action payload; `getFormattedValue` only for display
- [ ] `isPlottable(col, dateColIdx)` guard planned for any shelf where series auto-detection runs (prevents date/dimension columns becoming chart series)
- [ ] Click coordinate source confirmed per library: ECharts → `event.event.pageX/Y`; Plotly → `data.event.pageX/Y`; Highcharts → `chart.pointer.normalize(e)` → `e.pageX/Y`; ZC / DOM → `event.pageX/Y`

---

## Gate 4 — main.js Code Review

Before packaging. Run layers in order — a failure in an earlier layer often causes false positives in later ones.

**Layer A — Data**
- [ ] `data` and `metaData` read fresh from parameters on every `generateCustomVisual` call — never cached in a closure or module-level variable
- [ ] Column objects resolved by `dropBoxName`, not by assumed array position
- [ ] `idx(col)` used for all row access: `data[rowIndex][idx(col)]`
- [ ] Row index bounds checked: `idx(col) >= 0` before use; `-1` treated as unresolved, not first column

**Layer B — Filter / Sort**
- [ ] Raw values drive all filtering, sorting, and grouping — formatted labels never used as filter keys
- [ ] Date filter stores `{ raw, label }` pairs: raw for filter/sort, label for display only
- [ ] Filter state validated against current data on each entry: stale values removed

**Layer C — Group / Aggregate Pipeline**
- [ ] Pipeline order enforced: `WHERE (filter rows) → GROUP BY → AGGREGATE → FORMAT → RENDER`
- [ ] Aggregation runs on filtered rows, never on pre-formatted display values
- [ ] Missing previous period returns `[]` and shows empty state — never substitutes all rows
- [ ] `null` / `undefined` dimension values handled: displayed as `"(Blank)"`, compared with `=== null`

**Layer D — Render**
- [ ] Old chart instance disposed before re-render (`echarts.dispose`, `chart.destroy`, etc.)
- [ ] `container.innerHTML = ""` clears DOM at the top of `generateCustomVisual`
- [ ] Canvas / chart measured after layout settles (`setTimeout(fn,0)` or `requestAnimationFrame`)
- [ ] DPR applied to ALL canvas contexts (ECharts init and any native canvas elements)
- [ ] ResizeObserver and animation frames disconnected / cancelled before re-render

**Layer E — Settings**

**E1 — Individual setting validation**
- [ ] Empty `inputText` value hides the associated element AND reclaims its layout space
- [ ] `toggle` / `checkBox` normalised through `tog()` — `"false"`, `"0"`, `0` all resolve to `false`
- [ ] `"false"` / `0` for a toggle removes ALL associated rendering (color, indicator, border, label) — not just some
- [ ] Numeric settings parsed with `parseInt` / `parseFloat` before passing to any API
- [ ] `colorComponent` values validated with hex pattern before use — invalid color falls back to theme default
- [ ] No settings control remains in the manifest whose change has no visible effect

**E2 — Settings Sync: manifest definition ↔ main.js implementation**

This is the most common source of a broken settings panel: a control appears in the UI but changing it does nothing because the code never reads it (dead setting), or the code reads a key that was never declared in the manifest (ghost read, silently returns `undefined`).

Run the validation script from the visual's project folder:

```bash
python <skill-path>/scripts/validate_settings_sync.py
# or with explicit paths:
python <skill-path>/scripts/validate_settings_sync.py \
  --manifest ZAViz_Manifest.json --js main.js
```

The script runs three checks and exits non-zero on any failure:

| Check | What it catches |
|---|---|
| **Dead settings** | `uniqueName` in manifest but no `customSettings.<name>` read in `main.js` — user sees the control, changing it does nothing |
| **Ghost reads** | `customSettings.<key>` read in `main.js` but no matching `uniqueName` in manifest — key always returns `undefined` |
| **Default mismatches** | `defaultValue` in manifest differs from the fallback passed to `getSetting()` in code — visual behaves differently on first load vs. after user edits the setting |

Fix every error the script reports before moving to Gate 6 (package). Warnings (direct `customSettings.x` reads without a `getSetting()` wrapper) are not blocking but should be addressed for robustness.

**ES5 compliance + Security + API correctness — run the code validation script:**
```bash
python <skill-path>/scripts/validate_code.py
# or with explicit path:
python <skill-path>/scripts/validate_code.py --js main.js
```
Covers all three check groups below. Exit code 0 = clean; 1 = fix errors first.

**ES5 compliance**
- [ ] No `const` / `let` — use `var`
- [ ] No arrow functions `() =>` — use `function()`
- [ ] No template literals — use string concatenation
- [ ] No `class` keyword
- [ ] No destructuring, spread (`...`), or default parameters
- [ ] No `import`/`export` statements

**API correctness**
- [ ] `ZAViz_Utils.getSuitableStyle('background')` — string param (NOT 'backgroundColor')
- [ ] `ZAViz_Utils.getSuitableStyle('legendColor')` — returns Array
- [ ] `ZAViz_Utils.getFormattedValue(1BasedIdx, raw)` — 1-based, not 0-based
- [ ] `showInteractionMenu(dataPoints, coords)` — raw values, 1-based keys; coords from real click event
- [ ] `invokeViewUnderlyingData(clicked_data)` — same payload format; no coordinates; wrapped in try/catch
- [ ] `invokeExplainData(clicked_data)` — same payload format; no coordinates; wrapped in try/catch
- [ ] `invokeDrillThrough(clicked_data, view_name)` — same payload format; `view_name` is exact view name string (case-sensitive); no coordinates; wrapped in try/catch
- [ ] Click event coordinates sourced correctly for `showInteractionMenu`: ECharts → `event.event.pageX/Y`; Plotly → `data.event.pageX/Y`; Highcharts → normalized `e.pageX/Y`; DOM click → `event.pageX/Y`
- [ ] `getSuitableStyle('fontColor')` used for text color; `getSuitableStyle('background')` for dark/light detection; `getSuitableStyle('legendColor')` for palette array

**Column resolution**
- [ ] `idx()` uses fallback chain: `dataindex → colIndex → columnIndex → __metaOrder`
- [ ] `isPlottable(col, dateColIdx)` guard applied before numeric operations

**Date Formatting (hard rule)**
- [ ] Every date value shown to the user calls `ZAViz_Utils.getFormattedValue(idx(col) + 1, raw)` — no exceptions
- [ ] This applies to ALL operation types: YEAR, QUARTER, MONTH, WEEK, WEEKDAY, DATE, HOUR, MINUTE, SECOND
- [ ] This applies to ALL fiscal year and start-month configurations — never replicated in main.js
- [ ] No hardcoded year/month/quarter construction (e.g., `year + "-" + month`, `"Q" + q`)
- [ ] No fiscal month shift arithmetic (e.g., `(month - startMonth + 12) % 12`)
- [ ] No `"FY " + year` label construction — the platform owns fiscal label patterns
- [ ] Date filter dropdown uses `fmtDim()`: raw for sort/filter, label from `getFormattedValue` for display
- [ ] Sorted by raw value, not by label string

**Numeric Formatting**
- [ ] All visible numbers pass through `getFormattedValue`
- [ ] No hardcoded unit formatting when Auto selected (no `v/1e6 + "M"` etc.)

**Filter Component**
- [ ] Filter state stored on `container.__myState.filters` — not in a module-level variable
- [ ] On re-render entry: saved filter values validated against current data; stale values deleted
- [ ] Filter change events call internal `renderChart()` — **not** `generateCustomVisual` directly
- [ ] Filter pipeline: raw rows filtered BEFORE `groupBy`/`aggregate` — never after
- [ ] Empty shelf (no column dropped) → filter control hidden or not rendered
- [ ] Date column auto-filter: default selection = latest raw period; fallback if data has only one period
- [ ] Dimension filter null values: displayed as `"(Blank)"`, compared with `=== null` not `=== "null"`
- [ ] Multi-select filter (if used): OR within field, AND across fields
- [ ] "All" option clears the field from active filters — does not filter rows
- [ ] DuckDB SQL filter values: single quotes escaped with `''` before interpolation

**Lifecycle & concurrency**
- [ ] `_busy` / `_running` guard prevents concurrent renders
- [ ] `container.innerHTML = ""` clears previous render at top of function
- [ ] Chart instance disposed before re-render (`echarts.dispose` or equivalent)

**Security**
- [ ] No `fetch(` calls
- [ ] No `XMLHttpRequest` usage
- [ ] No `eval(` or `Function(` (dynamic code execution)
- [ ] No `localStorage`, `sessionStorage`, or `indexedDB`
- [ ] No `WebSocket` or `EventSource`
- [ ] No `window.top`, `window.parent`, or `window.opener` access
- [ ] No `document.cookie` access
- [ ] No `window.open(` or `window.location` navigation
- [ ] No `alert(`, `confirm(`, or `prompt(` calls
- [ ] No `<object>`, `<embed>`, or `<iframe>` elements injected
- [ ] No external CDN loads at runtime (all deps declared in manifest before upload)
- [ ] No external CDN loads at runtime

**Multi-Visual / Dashboard (multi-panel path only)**
- [ ] `generateCustomVisual` builds DOM skeleton ONCE — never re-builds skeleton on filter changes
- [ ] All filter events call internal `refresh()` — never `generateCustomVisual` directly
- [ ] Wide-net multi-shelf used: `["Dimensions","multi","DIMENSIONAL",""]` + `["Measures","multi","MEASURE",""]`
- [ ] Multi-shelf columns sorted by resolved metadata index after `dropBoxName` filter (stable series order)
- [ ] Central `state.filters` object — raw values stored, formatted labels displayed
- [ ] Stale filter values validated against current data on each `generateCustomVisual` entry
- [ ] Skip-own-field applied in filter panel option rendering
- [ ] KPI card panel runs its own filter→aggregate→delta pipeline (not just a display element)
- [ ] KPI Total cards ignore Dimension grouping; By-Dimension cards group on Dimension column
- [ ] Missing previous period: returns `[]` and shows empty delta — never substitutes all rows
- [ ] MTD/QTD windows use day-of-month/day-of-quarter comparison, not full month/quarter rows
- [ ] ECharts panels initialized with explicit `clientWidth`/`clientHeight` fallbacks after `setTimeout(fn,0)`
- [ ] Chart animations disabled during `refresh()` re-renders; enabled on first render only
- [ ] DuckDB ingest batched in chunks (≤10,000 rows per insert) — not row by row
- [ ] 3-host-width behavior defined: wide (≥900px) / medium (480–900px) / narrow (<480px)
- [ ] KPI card click sends raw `Dimension`/`date`/`metric` payloads (1-based indexes, raw values)

**DOM Rendering (Vanilla DOM path only)**
- [ ] Root container has `position:relative; width:100%; height:100%; overflow:hidden; display:flex; flex-direction:column`
- [ ] CSS injected via idempotent `injectCSS(scopeId, css)` — removes previous `<style>` before injecting new one
- [ ] Zone layout applied: fixed zones use `flex:0 0 auto`; content zone uses `flex:1 1 auto; min-height:0; overflow:auto`
- [ ] Available height measured by reading `offsetHeight` values in one batch — no read/write interleaving
- [ ] `container.innerHTML = ""` clears DOM at top of render; previous cleanup functions run first
- [ ] All event listeners and ResizeObserver registered in `state.cleanup` array; run at next render entry
- [ ] `textContent` used for all data values — `innerHTML` only for static HTML structure, never raw data
- [ ] KPI/metric values: NOT truncated with `text-overflow:ellipsis`; use word-break or scale instead
- [ ] DOM bulk inserts use `DocumentFragment` when appending more than ~5 elements
- [ ] CSS `transition` used for animations; no `setInterval` for visual transitions
- [ ] Empty state shown (centered message) when required shelf has no column dropped

**Layout**
- [ ] `container.style.width` and `container.style.height` respected
- [ ] No hardcoded pixel dimensions for chart container
- [ ] Responsive: chart resizes when container changes

---

## Gate 5 — isPlottable Guard

Mandatory when visual has auto-detected series (data has unknown column count):

```js
/* Prevents date / dimension columns from becoming chart series */
function isPlottable(col, dateColIdx) {
  return col.datatype === "numeric" && idx(col) !== dateColIdx;
}

/* Usage */
var series = [];
for (var i = 0; i < cols.length; i++) {
  if (!isPlottable(cols[i], dateColIdx)) continue;
  series.push(buildSeries(cols[i], data));
}
```

Gate checks:
- [ ] `isPlottable` defined and applied before any series loop
- [ ] Date column excluded even when `datatype` is reported as `"numeric"` (use `dateColIdx` guard)
- [ ] Dimension/ordinal columns excluded from numeric aggregation
- [ ] Empty `series` triggers empty-state message, not broken chart

---

## Gate 5.5 — Design QA (Pre-Delivery Visual Check)

Run this before packaging. These checks catch presentation issues that code review misses.

**Root and background**
- [ ] Root container has `margin:0; padding:0; width:100%; height:100%; box-sizing:border-box`
- [ ] Root, card, and table backgrounds are **transparent** — not white or hardcoded colors
- [ ] Parent dashboard background shows through correctly in both light and dark mode

**Value display**
- [ ] Every visible value (label, axis, tooltip, card, table cell) passes through `getFormattedValue`
- [ ] No raw timestamps (`1704067200000`) visible anywhere
- [ ] No raw numeric column indexes visible in labels
- [ ] DIMENSIONAL columns that contain dates/times also pass through `getFormattedValue`

**Action payloads**
- [ ] All `showInteractionMenu` payloads use **raw** values (not formatted strings)
- [ ] `dataPoints` keys are 1-based column indexes (not 0-based, not field names)

**Layout**
- [ ] Legend, filter bar, and widgets do not overlap chart area, axes, or data labels
- [ ] No unexpected large gaps between sections (check grid/flex padding)
- [ ] Spacing follows hierarchy: 12px section / 8px component / 4px micro
- [ ] Font sizes: 13px for main labels, 12px for data labels / ticks / legend

**Hybrid visual grammar**
- [ ] Bullet section = target track (full-width background) + actual overlay — NOT two bar groups
- [ ] Each visual region preserves its intended geometry (bar stays bar, bullet stays bullet)

**Data labels**
- [ ] Data labels that cannot fit cleanly are suppressed — not truncated with ellipsis
- [ ] KPI metric values never use `text-overflow:ellipsis` — wrap or scale instead

**Canvas / chart rendering**
- [ ] Canvas does not bleed outside the container host
- [ ] ECharts / canvas is initialized after layout settles (no 0px-width chart)
- [ ] DPR applied correctly: CSS size ≠ bitmap size on retina displays

**Repeated renders**
- [ ] Re-triggering `generateCustomVisual` produces a clean re-render (no duplicate charts)
- [ ] ResizeObserver, RAF, and event listeners are disconnected before each re-render

**Responsive**
- [ ] Tested at wide (900px+), medium (480–900px), and narrow (<480px) container widths
- [ ] No text wrapping or overflow at any tested width

**Theme and color**
- [ ] Visual does NOT paint its own panel/tile/card background — parent dashboard owns background color
- [ ] `getSuitableStyle('background')` used for dark/light detection — not a hardcoded color check
- [ ] KPI Total card title uses formatted active period + metric name — not "Total", "Value", or any generic string
- [ ] `toggle: false` removes ALL semantic coloring AND indicators (arrows, color bars, IBCS fills) together — partial removal is a bug
- [ ] Legend uses one of the 12 valid positions (top-/bottom-/left-/right- + left/center/right or top/middle/bottom)
- [ ] Native `<select>`/`<input>` controls use platform `controlBg` fill — all other surfaces transparent
- [ ] IBCS / comparison coloring: favorable variance = green, unfavorable = red, neutral = gray — all three must be applied or removed together; never mix partial removal
- [ ] Period comparison labels use "Current" / "Previous" — not vague "Compare" or "Value"
- [ ] Metric comparison labels use the actual dropped field names — not generic "Metric 1" / "Metric 2"
- [ ] Layout 2 (KPI delta mode) shows Difference from **or** % Difference from the comparison — never repeats the current value

**Interactions**
- [ ] Every clickable element passes raw values (not formatted) to any action API
- [ ] `dataPoints`/`clicked_data` keys are 1-based column indexes — verified, not assumed
- [ ] Click coordinates come from the actual event object (`event.pageX/Y`) for `showInteractionMenu` — not hardcoded `{x:0,y:0}`
- [ ] Direct-action buttons (`invokeViewUnderlyingData`, `invokeExplainData`, `invokeDrillThrough`) use `e.stopPropagation()` to prevent card/chart click from also firing
- [ ] `invokeDrillThrough` `view_name` is the correct exact view name — not a display label or variable name

---

## Gate 6 — Package

**Run the ZIP validation script before uploading:**
```bash
python <skill-path>/scripts/validate_zip.py MyVisual.zip
```
Covers all structural, extension, forbidden-keyword, and size checks below.

**Run the full suite (all gates in one command):**
```bash
python <skill-path>/scripts/run_all_validations.py \
  --manifest ZAViz_Manifest.json --js main.js --zip MyVisual.zip
```

Before uploading ZIP:

- [ ] ZIP contains exactly: `ZAViz_Manifest.json` + `main.js` (+ optional icon .png/.jpg)
- [ ] Total ZIP size < 3 MB
- [ ] File count ≤ 5 (manifest + main.js + icon + up to 2 optional assets)
- [ ] No nested directories inside ZIP (files at root of ZIP)
- [ ] No `..` path components in any ZIP entry — prevents Zip Slip / path traversal
- [ ] No `.DS_Store`, `.git`, `node_modules`, or editor config files included
- [ ] Allowed extensions only: `.js`, `.json`, `.png`, `.jpg`, `.jpeg`
- [ ] `main.js` exports `generateCustomVisual` as a named function (not arrow, not class)
- [ ] Dependency loading order correct: Highcharts core script declared **before** any Highcharts module scripts; Observable Plot declared **after** D3; Cytoscape DAG layout needs `dagre` + cytoscape-dagre plugin declared in order
- [ ] `main.js` scanned for forbidden keywords: `fetch(`, `XMLHttpRequest`, `eval(`, `Function(`, `localStorage`, `sessionStorage`, `indexedDB`, `WebSocket`, `window.top`, `window.parent`, `window.open(`, `document.cookie`, `alert(`, `<object`, `<embed`, `<iframe`
- [ ] Final smoke-test: drag-drop ZIP to Zoho Analytics custom visual uploader → no error dialog

---

## Quick Mistake Map

| Symptom | Most likely cause | Gate |
|---|---|---|
| Blank white canvas in dark mode | Missing bgIsDark / solidBg pattern | 4 |
| All columns charted as series (including dates) | Missing isPlottable guard | 5 |
| DOM card heights collapse to 0 | Content zone missing `min-height:0` on flex child | 4 |
| Cards scroll past bottom of container | Content zone missing `overflow:auto` or not bounded by flex | 4 |
| Sticky header scrolls with content | `overflow` not set on the direct scroll parent of sticky element | 4 |
| CSS styles accumulate on re-render | `injectCSS` not removing old `<style>` by ID before injecting | 4 |
| Event listeners fire multiple times per click | Not registering listeners in `state.cleanup`; old listeners not removed | 4 |
| ResizeObserver fires infinitely | Observer callback resizes element it is observing; use content zone, not root | 4 |
| Overlay / popover appears under toolbar | Z-index not following hierarchy (content=1, toolbar=10, popover=100) | 4 |
| Click-outside closes overlay immediately | `addEventListener` called synchronously without `setTimeout(fn, 0)` delay | 4 |
| KPI value shows "12..." instead of full number | `text-overflow:ellipsis` applied to metric element — never truncate KPI values | 4 |
| Card grid last row stretches to fill width | `justify-content:start` missing on grid container (default is `stretch`) | 4 |
| DOM visual re-renders with chart library dependencies in manifest | `dependencies` not emptied after switching to Vanilla DOM path | 2 |
| Filter change causes full skeleton rebuild (flicker, lost scroll) | `generateCustomVisual` called from filter event — must call `refresh()` instead | 4 |
| Series order changes when user removes/re-drops column | Multi-shelf columns not sorted by resolved index after `dropBoxName` filter | 4 |
| Previous-period delta shows wrong value (not empty) | Missing period falls back to all rows instead of returning `[]` | 4 |
| KPI comparison shows Infinity / NaN | Division by zero in delta not guarded; or empty compare period used | 4 |
| Chart renders at 0px width on first load | ECharts init called before flex layout settles — use `setTimeout(fn,0)` | 4 |
| Filter-change re-renders animate heavily, feel sluggish | ECharts `animation:true` on every `refresh()` — disable after first render | 4 |
| DuckDB ingest blocks UI for seconds | Rows inserted one at a time instead of batched chunks | 4 |
| Narrow embedded host: panels overflow or text wraps badly | No narrow-mode layout path defined — 3-host-width planning skipped | 1 |
| Dropdown filter shows metric/numeric values | Metadata index lookup incorrect — dimension and measure columns mixed up | 4 |
| Visual paints white or coloured background in dark mode | Root / card / table has hardcoded background — must be transparent; parent owns background | 5.5 |
| Toggle false still colours bars or shows indicators | `"false"` / `0` not normalised to boolean `false` before render condition check | 4 |
| Library picked does not support outside labels | Library selection skipped the "dense labels?" question — revisit at Gate 0 | 0 |
| `showInteractionMenu` payload has formatted values | Action payload built from display strings not raw row values | 4 |
| KPI card click coordinates are 0,0 | `{x:0,y:0}` hardcoded instead of reading `event.pageX/Y` | 4 |
| Settings change has no visible effect | Dead setting — `uniqueName` in manifest but never read in `main.js`; run Gate 4 E2 Settings Sync check | 4 |
| Setting always behaves as if it has the defaultValue | Ghost read — `customSettings.<key>` accessed in code but that `uniqueName` was never declared in manifest; key silently returns `undefined` | 4 |
| Setting works on first load but breaks after user edits it | `defaultValue` in manifest differs from the fallback in `getSetting()` — they must be identical | 4 |
| Axis label hides but leaves blank space | Empty label removes text but not the space — must also collapse the margin/grid inset | 4 |
| `getFormattedValue` returns raw timestamp for DIMENSIONAL date column | DIMENSIONAL column contains date but `displayValue()` not used — always call `getFormattedValue` for all DIMENSIONAL values | 4 |
| Total card title shows "Total" | Active formatted period + Metric 1 name not composed for Total card title | 5.5 |
| Wrong axis/tooltip labels | 0-based index passed to getFormattedValue | 4 |
| `version is not defined in the schema` on upload | `version` field added to manifest top level — not allowed | 1/3 |
| `engine is not defined in the schema` on upload | `engine` field added to manifest top level — not allowed | 1/3 |
| `object found, string expected` on options items | `options` contains `{value,label}` objects — must be plain strings `["bar","line"]` | 2/3 |
| `oneOf settings fail` with correct individual items | `options` items are objects not strings, causing both oneOf branches to fail | 2/3 |
| "Invalid manifest format" on upload | JSON parse error | 3 |
| "Label must be 1–25 characters" | label field >25 chars | 1/3 |
| Upload fails silently | ZIP >3MB or disallowed file type | 6 |
| Filter shows raw timestamps instead of dates | fmtDim not applied to date column | 4 |
| Previous period is always empty | Filter comparing formatted label, not raw value | 4 |
| Chart flickers on every data update | No _busy guard; dispose not called | 4 |
| showInteractionMenu has no effect | Using formatted value in payload instead of raw | 4 |
| Drill-down fires on wrong row | Column keys in payload are 0-based | 4 |
| Settings return undefined | metaData accessor not wrapped in getSetting() | 2 |
| Visual works locally, breaks in Zoho | Used const/let/arrow — ES5 violation | 4 |
| Large numbers show as 1000000 not 1M | Custom unit logic bypasses Auto; use getFormattedValue | 4 |
| Fiscal year label wrong | Hardcoded month shift in main.js | 4 |
| YEAR shows "2024" when user expects "FY 2024-25" | Custom year label instead of getFormattedValue | 4 |
| QUARTER label mismatches filter chip | Constructed "Q"+q string instead of getFormattedValue | 4 |
| Date filter sorted alphabetically instead of chronologically | Sorted by formatted label — sort by raw value | 4 |
| Period filter shows raw timestamp numbers | fmtDim not applied; raw passed directly to display | 4 |
| Chart does not resize | Hardcoded pixel dimensions on container | 4 |
| DuckDB query returns stale data | Missing await; forgot to reinitialise on each render | 4 |
| Vega-Lite spec renders at wrong size | Missing container width/height in spec config | 4 |
| Cross-visual filter not cleared | Central state not reset before new filter apply | 4 |
| ZIP upload: unsupported file type error | .ts/.css/.html included in ZIP | 6 |
| Legend/series order changes after re-drop | Sort shelf columns by resolved index after `dropBoxName` filter | 4 |
| Previous period shows all data or fake zeros | Null previous period must return `[]` — never fall back to all rows | 4 |
| Chart duplicates or overlaps on update | Dispose instance and rebuild DOM on every `generateCustomVisual` call | 4 |
| Canvas text or size mismatch | Measure CSS pixels + DPR; set bitmap size separately from CSS size | 4 |
| Chart bleeds into sibling widget panel | `overflow:hidden` on chart host; resize after flex/grid layout settles | 4 |
| Huge gap between legend and chart | Remove `%` grid padding; use `containLabel:true` + fixed pixel left pad | 4 |
| Hybrid visual renders as generic bars | Each section needs its own grammar — bullet ≠ two bar groups | 1 |
| Title or subtitle shows in settings by default | Omit unless user explicitly requested them in the spec | 2 |
| Visual paints an unwanted background color | Remove root background styling — parent dashboard owns the background | 4 |
| Toggle false still renders indicators or semantic colors | Normalize `"false"`/`0` → boolean false; IBCS toggle must remove ALL semantic coloring | 4 |
| Single KPI card stretches into a wide banner | Bound `cardMinWidth`/`cardMaxWidth`; grid `justify-content:start` | Visual patterns |
| KPI wraps or collapses when container is narrow | Scale inner layout with CSS transform from `min-width`, not reflowing | Visual patterns |
| Total card title shows "Total" or generic text | Use active formatted period + Metric 1 name (see visual-patterns.md) | Visual patterns |
| Layout 2 repeats the current value | Render Difference from / % Difference from, not the current value | Visual patterns |
| Filter selection lost on dashboard refresh | Filter state stored in module scope, not on `container.__myState` | 4 |
| Filter change re-initialises entire visual | Filter event calls `generateCustomVisual` directly — call `renderChart()` instead | 4 |
| Filter shows All data after stale period selected | Saved filter value not validated against new data; always check value exists before restoring | 4 |
| Filter applied after aggregation shows wrong totals | WHERE filter must run on raw rows before GROUP BY — not on aggregated result | 4 |
| Null dimension values missing from dropdown | `extractFilterOptions` key collision: use `"__NULL__"` sentinel for null raw values | 4 |
| IBCS arrows visible but toggle:false | IBCS toggle not fully wired — must remove arrows, semantic colors, AND fills together | 5.5 |
| Period comparison label says "Compare" or "Value" | Rename labels to "Current" / "Previous" — vague labels confuse users | 5.5 |
| Metric comparison label says "Metric 1" / "Metric 2" | Use actual dropped field column names for comparison labels | 5.5 |
| Layout 2 KPI card repeats current value | Should show Difference from or % Difference from — not a copy of current | 5.5 |
| Highcharts module fails to load | Core script not declared before module scripts in dependencies | 3/6 |
| Observable Plot fails with undefined error | D3 not declared before Observable Plot in dependencies | 3/6 |
| Click handler coords land on wrong position | Library-specific coord extraction missed — use `event.event.pageX/Y` for ECharts, `data.event` for Plotly | 4 |
| `getSuitableStyle` returns undefined | Wrong key string — use `'background'` not `'backgroundColor'`; `'fontColor'` not `'color'` | 4 |
| `invokeViewUnderlyingData` / `invokeExplainData` shows nothing | Called with formatted values instead of raw; or payload keys are 0-based | 4 |
| `invokeDrillThrough` navigates to wrong view or fails silently | `view_name` string has wrong case or extra spaces — must match exact view name in Zoho Analytics | 4 |
| Card click fires both card action and icon action | Missing `e.stopPropagation()` on icon click handler | 4 |
| Direct-action API called with coordinates argument | `invokeViewUnderlyingData`/`invokeExplainData`/`invokeDrillThrough` do not accept coordinates — remove the coords argument | 4 |
| Visual deleted while in use | Cannot delete a custom visual while it is referenced by a saved report — remove the report reference first | 6 |
