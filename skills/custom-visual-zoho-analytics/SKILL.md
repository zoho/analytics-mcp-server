---
name: custom-visual-zoho-analytics
description: |
  Full workflow for creating, fixing, and packaging custom visual plugins for Zoho Analytics.
  Use this skill whenever the user wants to: create a new Zoho Analytics custom visual from
  scratch; fix, update, or version an existing one; debug dark theme, color adaptation,
  layout, or rendering issues in a visual; interpret a screenshot or spec to design drop
  areas and settings; or work with ZAViz_Manifest.json, main.js, or .zip upload files for
  Analytics. Also triggers when a user shares a screenshot of a Zoho Analytics dashboard
  or chart with intent to build something similar. Triggers on phrases like "build a custom
  visual", "create a chart plugin for Zoho", "fix my Analytics visual", "design drop areas",
  or any mention of ZAViz_Manifest, generateCustomVisual, or Zoho Analytics custom extensions.
  Covers the complete workflow: planning → manifest → main.js → ZIP packaging.
---

# Custom Visual for Zoho Analytics

Every Zoho Analytics custom visual is a ZIP file containing `ZAViz_Manifest.json` +
`main.js` (+ icon and optional assets). The runtime calls
`generateCustomVisual(container, data, metaData)` on every render.

## Reference Loading Map

Load each reference file at the phase shown — not all upfront:

| When to load | File | Purpose |
|---|---|---|
| **Phase 1 — Renderer Decision** | `references/dom-layout.md` | Zone layout, CSS injection, card grid, scroll, sticky, popover, ResizeObserver, sparklines, event cleanup — load immediately when Vanilla DOM is chosen |
| **Phase 1 — Multi-panel detected** | `references/multi-visual.md` | generateCustomVisual→refresh() architecture, wide-net multi-shelf, central filter state, KPI panel pipeline, ghost bars, mixed-renderer layout, 3-host-width planning, MTD/QTD period rules — load when spec shows multiple panels or cross-filter |
| **Phase 1 — Visual type match** | `references/visual-patterns.md` | KPI card layouts, hybrid bar+bullet, responsive widget grid, IBCS coloring — load only when the visual matches one of these patterns |
| **Phase 2 — Before manifest** | `references/api-rules.md` | ZAViz_Utils APIs, manifest schema, setting types, normalization helpers, 24-entry Common Failures table |
| **Phase 2 — Manifest syntax check** | `references/manifest-syntax.md` | Per-type setting templates with valid/invalid examples, 28-item syntax checklist, upload-error→fix table, copy-paste manifest template — load before writing and run §07 checklist before saving |
| **Phase 3 — Before main.js** | `references/code-patterns.md` | Helpers, theme, color utils, buildSegments, isPlottable, DuckDB-WASM, Filter Component, Drop Area as Auto-Filter, library CDN table |
| **Phase 3 — Before any value render** | `references/format-rules.md` | Date hard rule (getFormattedValue mandatory), numeric units (KMB/KLC/A), fmtDim pattern, duration tokens, anti-patterns |
| **Load on first gate reached; keep in context** | `references/validation-gates.md` | Phase→Gate map, 7-gate checklist (Gates 0 → 3.5 → 4 → 5 → 5.5 → 6), 50+ entry Quick Mistake Map — stays loaded from first gate through packaging |
| **Debug / fix sessions** | `references/version-learnings.md` | Recurring bugs, ZAVizCommon pitfalls, dark theme / color fixes from all prior versions |

---

## Persona & Mindset

Approach every visual as a **Core Data Analyst / BI Developer / Dashboard Designer**
building for a unified customer view. This shapes every decision:

| Role lens | What it means in practice |
|---|---|
| **Data Analyst** | Ask: what question is this visual answering? Design aggregation and comparison accordingly. |
| **BI Developer** | Think pipeline: WHERE → GROUP BY → AGGREGATE → FORMAT → RENDER. Use DuckDB-WASM when filter/query logic is non-trivial. |
| **Dashboard Designer** | Consider theme, responsive layout, legend placement, dark mode. The visual lives inside a broader dashboard — never fight the surrounding context. |

**Always ask:** which period comparison, ranking, or drill capability would make this
more analytically useful — even if the user didn't mention it?

---

## Phase 1 — Plan

> **New visual?** Follow this phase in order.
> **Fix / correction request?** Run the Renderer Decision Checkpoint first, then jump to **"Correction / Fix Mode"** before continuing to "Define drop areas".

### ⚑ Renderer Decision Checkpoint

**Make this decision FIRST — before designing shelves, settings, or pipeline.**

Scan the screenshot, spec, or description for these signals:

| Signal | Renderer |
|---|---|
| Axes, plot area, legend, data points, curves, scatter | **Chart library** |
| Gauge, radial progress WITH graduated ticks | **Chart library** (ECharts gauge) |
| Segmented/IBCS color lines, deviation area | **Chart library** (ECharts + buildSegments) |
| KPI cards, metric boxes, scorecard | **Vanilla DOM** |
| Kanban board, status columns, card tiles | **Vanilla DOM** |
| Table rows, paginated list, data grid | **Vanilla DOM** |
| Sparklines or mini-bars INSIDE a card | **Vanilla DOM** + inline SVG (dom-layout §16) |
| Gauge / progress bar WITHOUT tick marks | **Vanilla DOM** (SVG arc or CSS bar) |
| Mixed: chart panel + KPI panel side by side | **Chart library** for chart zone; **Vanilla DOM** for panel zone |
| Multiple panels with shared filter state | **Both** — load `multi-visual.md` for architecture |

**If Vanilla DOM is chosen:**
- **→ Read `references/dom-layout.md` NOW** (before designing layout or writing any code)
- Apply the Zone Layout model (§03) as the structural spine
- Skip canvas/DPR patterns; skip `echarts.init`
- Leave the `dependencies` array in the manifest empty (no chart library CDN)

**If multi-panel / dashboard (any renderer):**
- **→ Read `references/multi-visual.md` NOW** — the refresh() architecture and manifest pattern must be decided before shelf design

**If Chart Library is chosen:**
- Continue to "Choose a chart library" below
- Skip dom-layout.md (it applies to DOM rendering only)

### For New Visuals — Extract the visual grammar

From the screenshot or description, identify:
- Chart geometry (line, bar, card, table, kanban, gauge, calendar, etc.)
- Data fields visible → candidate drop areas
- Configurable behaviours (colors, sort, show/hide) → candidate settings
- Interactions (click, drill, filter, VUD, explain) → which action API: `showInteractionMenu` for multi-option context menu OR direct-action APIs (`invokeViewUnderlyingData`, `invokeExplainData`, `invokeDrillThrough`) for dedicated action buttons
- Whether temporal analysis, period comparison, or trend is relevant

#### Correction / Fix Mode

Read the screenshot as a functional diff. Classify the root cause before touching code — patch only the identified layer. Each subsequent screenshot is a diff against current output, not a new spec.

**Step 1 — Map visual evidence to root cause:**

| What you see in the screenshot | Root cause |
|---|---|
| Raw timestamp / epoch number in label, axis, or card | Format issue — missing `getFormattedValue` |
| Wrong value in dropdown or tooltip | Metadata / column resolution issue |
| Correct data, wrong shape (e.g. bar when line expected) | Render geometry issue |
| Overlap between elements, or large unexpected gap | Grid / flex / layout issue |
| Clipped KPI values (text cut off) | Widget sizing / wrapping issue — never use ellipsis on metrics |
| Canvas bleeding outside the container | Host clipping / resize timing issue |
| Digits stacking vertically inside a card | Responsive modeling issue — not a format issue |
| Large blank area near legend or axis | Grid padding / layout issue — not a data issue |
| Independent scale ≠ bullet visual | Grammar issue — bullet requires target-track + actual overlay |
| Bars stretching to full width on last row | Grid `justify-content` not set to `start` |
| Chart collapsed to 0px on first load | ECharts init before flex layout settled |
| Everything correct except dark mode | Theme issue — missing `bgIsDark` / `solidBg` / `cardBg` |

**Step 2 — Classify and patch only that layer:**

| Issue type | Symptom examples | Where to fix |
|---|---|---|
| Data | Wrong values, missing rows, wrong aggregation | Data pipeline, column resolution |
| Formatting | Raw timestamp, wrong units, 0-based index | format-rules.md patterns |
| Geometry | Wrong chart shape, bar vs bullet confusion | Render logic, library config |
| Layout | Overlap, huge gaps, clipped values, banner stretch | CSS, grid, responsive model |
| Lifecycle | Duplicated chart, stale data, accumulated observers | generateCustomVisual entry guards |
| Settings | Toggle has no effect, wrong default | Settings normalization, wiring |

Patch only the identified layer. Do not re-derive the whole visual — apply the smallest safe change.
If shelf structure itself needs to change → continue to "Define drop areas" below.

### Define drop areas — BI-first shelf design

Map each data concept to a shelf entry in `structure`:

```json
["Name", "single|multi", "DIMENSIONAL|MEASURE", ""]
```

**Default shelf checklist for analytical visuals:**

| Shelf | Type | When to include |
|---|---|---|
| Dimension / Category | single DIMENSIONAL | Almost always — groups and labels data |
| **Date Field** | single DIMENSIONAL | **Always consider** — enables period filter, trend, YoY/MoM comparison |
| Metric / Value | single or multi MEASURE | The numeric payload |
| Compare Metric / Target | single MEASURE | When benchmarking or progress rings are relevant |
| Reference Lines | multi MEASURE | Secondary context lines/bars |
| Tooltip Info | multi DIMENSIONAL | Extra context shown on hover only |
| Filter | multi DIMENSIONAL | Fields that drive toolbar dropdowns |

> **BI rule:** A Date field costs one shelf slot but unlocks period filtering, trend
> rendering, and time-based comparison — the most common analytics request after initial
> delivery. Add it proactively unless the visual is explicitly non-temporal.

> **Auto-Filter rule (analytical perspective):** Every DIMENSIONAL and DATE shelf you
> define is a potential in-visual filter source — not just a display axis. When a user
> drops a dimension or date onto a shelf, their intent is to slice data by it. Proactively
> render a filter dropdown from that column's unique values in the data. This means:
>
> - **Date shelf dropped** → automatically render a period selector (single-select, default = latest period)
> - **Primary Dimension dropped** → automatically render a category filter (default = All)
> - **Secondary Dimension dropped** → render a filter if ≥ 2 distinct values exist
> - **Measure / numeric shelf** → never a filter source
>
> This avoids needing a separate "Filter" shelf in the manifest for data already accessible
> through existing shelves. See `references/code-patterns.md` → "Drop Area as Analytical
> Auto-Filter" for the implementation pattern, and "Filter Component — Full Pattern" for
> state persistence, wiring, and pipeline rules.

> **Hybrid visual rule:** If the spec shows a bullet or target-vs-actual section alongside
> bars, it is NOT two bar groups. A bullet section = target track (full-width background) +
> actual value overlay. Misreading this in Phase 1 leads to a structurally wrong visual.
> Load `references/visual-patterns.md` → "Hybrid Bar + Bullet Visual" before planning shelves.

When a Date shelf is included:
- Populate a formatted date dropdown (sorted by raw value, displayed as formatted label)
- Default selection: latest available period
- Resetting the selection resets any drill stack or comparison state

### Choose a chart library

| Visual type | Recommended library | Notes |
|---|---|---|
| Bar / line / area / pie / sunburst / heatmap / gauge | **ECharts 5** | Best default; rich built-in options |
| Color-segmented line, IBCS deviation area | **ECharts 5** | Use buildSegments() — see code-patterns.md |
| Bespoke geometry, network, force graph, geographic | **D3.js** | Full SVG control; use when ECharts layouts don't fit |
| Statistical distribution, small-multiples, faceted views | **Vega-Lite** | Declarative grammar; excellent for faceted analytics |
| Complex interactive data narratives | **Vega** | Full Vega spec for maximum control |
| KPI cards / kanban / widget grid / table | **Vanilla DOM** | No chart library needed |
| Simple canvas pie or bar (lightweight) | **Chart.js** | Only when bundle size matters |

**CDN URLs:**
```
ECharts 5:   https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
D3 v7:       https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js
Vega:        https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js
Vega-Lite:   https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js
Vega-Embed:  https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js
```

> When choosing between D3 and ECharts: if the chart type maps cleanly to an ECharts
> series type, use ECharts (faster to implement, built-in resize/tooltip/theme). Use D3
> when pixel-level control over geometry or animation is required.

### Decide on the data pipeline

For simple visuals (filter one field, sum one metric): built-in JS filtering is enough.

For complex analytics (multi-field filter, group-by + aggregate, date truncation, running
totals, window functions): use **DuckDB-WASM** as an in-browser SQL engine. See
`references/code-patterns.md` → "DuckDB-WASM Pipeline" section.

Use DuckDB-WASM when the visual needs:
- Multi-condition WHERE clauses across several dimension fields
- GROUP BY + SUM / AVG / COUNT on the incoming data array
- Period-over-period (LAG / LEAD window functions)
- Running totals or moving averages
- Top-N ranking queries

### Confirm before coding

Use `AskUserQuestion` to confirm shelf names, settings, and any design ambiguity.
Good questions to ask:
- Does this visual need period comparison or trend over time? (→ add Date shelf)
- What should clicking a data point do? → context menu with choices (`showInteractionMenu`) OR dedicated action buttons (direct `invokeViewUnderlyingData` / `invokeExplainData` / `invokeDrillThrough`)?
- Should the visual respond to dark dashboard themes?
- Are there complex filter or aggregation requirements? (→ consider DuckDB)
- Does the spec show multiple panels / dashboard structure? (→ load multi-visual.md)
- Plan for 3 host widths: wide dashboard / medium tile / narrow embedded — confirm which matter

---


> **Gate 0 — Plan Freeze:** Before moving to Phase 2, run Gate 0 in `references/validation-gates.md`.
> Confirm chart type, renderer, library selection, date shelf decision, and (for KPI visuals) freeze all card-grain and layout decisions.

## Phase 2 — Manifest

> **→ Read `references/api-rules.md` NOW** — manifest schema, setting types, normalization helpers, and Common Failures.
> **→ Read `references/manifest-syntax.md` NOW** — per-type templates, valid/invalid examples, and §07 syntax checklist to run before saving.

Write `ZAViz_Manifest.json`. The checklist below is a **quick pre-flight** — Gate 3 in `references/validation-gates.md` is the full 6-layer validator to run before saving:

```json
{
  "name": "Visual Display Name",
  "icon": "icon.png",
  "dependencies": ["<full CDN URL for every external library>"],
  "structure": [
    ["Drop Area Name", "single|multi", "DIMENSIONAL|MEASURE", ""]
  ],
  "settings": [
    { "uniqueName": "camelCaseKey", "type": "toggle",          "label": "Short Label",  "defaultValue": true },
    { "uniqueName": "chartMode",    "type": "multipleToggle",  "label": "Chart Mode",   "defaultValue": "bar",
      "options": ["bar", "line"] }
  ]
  // Flat array shown — grouped object { "Section": [...] } is also valid but flat is safer.
  // Top-level keys ONLY: name, icon, structure, dependencies, settings — no version, no engine.
}
```

**Manifest validation checklist:**
- [ ] `dependencies` lists every CDN URL (including DuckDB-WASM if used)
- [ ] `structure` entries have exactly 4 elements including trailing `""`
- [ ] `settings` is a flat array `[...]` OR grouped object `{ "Section": [...] }` — never mixed
- [ ] No `version` or `engine` keys at top level — they are **not allowed** and will fail validation
- [ ] Every setting `label` is ≤ 25 characters
- [ ] Every `uniqueName` is camelCase with no spaces
- [ ] `multipleToggle` / `dropdown` entries have `"options": [...]` — items are **plain strings** e.g. `["bar","line"]`, never `{value,label}` objects
- [ ] `defaultValue` type matches the setting type
- [ ] Every `uniqueName` defined here will be read in `main.js` — run Settings Sync check (Gate 4 E2) after writing code to confirm no dead settings or ghost reads

Full setting type reference in `references/api-rules.md`.

---


> **Gates 1–3 — Manifest:** Before saving, run Gates 1, 2, and 3 from
> `references/validation-gates.md`. Common failures: `label` >25 chars, invalid
> `uniqueName` format, wrong `options` type (must be plain strings, not objects),
> forbidden top-level fields — **`version` and `engine` are NOT allowed and will fail validation**.

> **Gate 3.5 — Column Plan:** Before opening `code-patterns.md` or writing any `main.js`,
> run Gate 3.5 in `references/validation-gates.md`. Lock every `dropBoxName` mapping,
> `idx()` fallback chain, multi-shelf sort strategy, and action payload key plan now —
> metadata index errors are the hardest class of bug to retrofit.

## Phase 3 — Code

> **→ Read `references/code-patterns.md` NOW** — helpers, theme, color utils, DuckDB-WASM, filter component, period helpers (MTD/QTD), ECharts init, and library CDN table.
> **→ Read `references/format-rules.md` NOW** — date hard rule, numeric units, fmtDim pattern.
> **→ Read `references/multi-visual.md` NOW** (if multi-panel) — refresh() pattern, panel pipelines, performance rules.

Write `main.js`. Use **ES5 throughout** (no const/let, no arrow functions, no template
literals, no computed property keys) — the platform requires broad browser compatibility.

### Structure

```js
(function () {
  "use strict";

  /* 1. Helpers      — copy from references/code-patterns.md */
  /* 2. Color/theme  — getTheme(), getLegendColors() */
  /* 3. Data pipeline — DuckDB query OR plain JS filter/group */
  /* 4. Render logic — chart build, area fills, DOM layout */

  function generateCustomVisual(container, data, metaData) {
    /* a. Dispose previous instance + clear container DOM */
    /* b. Resolve columns via colsByBox() / colByBox() */
    /* c. Read settings via gs() helper */
    /* d. Call getTheme() */
    /* e. Guard: render no-data state if required shelves are empty */
    /* f. Run data pipeline (DuckDB or plain JS) */
    /* g. Extract display arrays — rowVal() + fmtVal() for every visible value */
    /* h. Build and render chart / DOM */
    /* i. Wire click -> ZAViz_ActionsAPI.showInteractionMenu() (raw payload, 1-based keys) */
    /* j. Wire ResizeObserver -> chart.resize() or redraw */
    /* k. Store { chart, ro } on container.__<prefix>State */
  }

  if (typeof window     !== "undefined") window.generateCustomVisual     = generateCustomVisual;
  if (typeof globalThis !== "undefined") globalThis.generateCustomVisual = generateCustomVisual;
})();
```

### Non-negotiable rules (full list in `references/api-rules.md`)

| Rule | Correct | Wrong |
|---|---|---|
| Background API | `getSuitableStyle('background')` | `getSuitableStyle('backgroundColor')` ✗ |
| Palette API | `getSuitableStyle('legendColor')` → Array | `getChartColors()` ✗ |
| Value format | `getFormattedValue(idx + 1, raw)` — 1-BASED | `getFormattedValue(idx, raw)` ✗ |
| Action payload | raw source values, 1-based keys — for ALL four action APIs | formatted strings or 0-based keys ✗ |
| Direct-action APIs | `invokeViewUnderlyingData(cd)`, `invokeExplainData(cd)`, `invokeDrillThrough(cd, viewName)` — no coordinates | passing `{x,y}` coords to these APIs ✗ |
| Column index | `dataindex → colIndex → columnIndex → __metaOrder` | array position ✗ |
| Disposal | dispose chart + disconnect ResizeObserver on every call | skip on re-render ✗ |
| ECharts data | string ID + separate node registry | object with `_parent` chain ✗ |
| ZIP build | build in `/tmp/`, then copy to project folder | write directly ✗ |

### Theme
`bg = ZAViz_Utils.getSuitableStyle("background")` — NOT 'backgroundColor'.
`bgIsDark(bg, fg)` infers dark mode by luminance, falls back to fg when bg is transparent.
Card surfaces: `solidBg` from dashboard bg + `cardBg = solidBg + 8L`.
Full implementation in `references/code-patterns.md` → getTheme().

### Color-changing lines / IBCS deviation areas
Use `buildSegments()` from `references/code-patterns.md`. It handles crossing-point
interpolation for exact color segment boundaries. Line mode and Area mode both consume
the same segment output.

### DuckDB-WASM data pipeline
When filtering or aggregation is complex, load DuckDB-WASM and run SQL on the data array.
Full initialization pattern and query helpers in `references/code-patterns.md`
→ "DuckDB-WASM Pipeline" section. Add the DuckDB-WASM CDN to `dependencies` in the manifest.

### Vega / Vega-Lite rendering
For faceted or statistical views, build a Vega-Lite spec and embed with vegaEmbed.
Wire theme colors into the spec's `config` block. Use `view.addEventListener('click',...)`
for interactions. Dispose by calling `view.finalize()` on re-render.

---


> **Gates 4–5 — Code:** Before packaging, run Gate 4 (ES5, API, formatting, security),
> Gate 5 (isPlottable guard), and **Gate 5.5 (Design QA)** from `references/validation-gates.md`.
> Gate 5.5 catches visual quality issues (transparency, spacing, raw values, hybrid grammar,
> canvas bleed, responsive behavior) that code review alone misses.
> (Gate 3.5 should already be done — if column plan was skipped, run it now before moving to Gate 4.)
> Use the Quick Mistake Map for symptom-first debugging.

## Phase 4 — Package

```bash
# 0. Run all validation scripts (Gates 3, 4a, 4b) before building ZIP
python <skill-path>/scripts/run_all_validations.py \
  --manifest ZAViz_Manifest.json --js main.js

# 1. Syntax check — must pass before packaging
node --check main.js && echo "SYNTAX OK"

# 2. Build ZIP in /tmp (workspace folder has write permission issues)
cd /tmp
zip -j VisualName_v1.0.zip \
  /path/to/main.js \
  /path/to/ZAViz_Manifest.json \
  /path/to/icon.png

# 3. Copy to project folder
cp /tmp/VisualName_v1.0.zip /path/to/project/folder/

# 4. Validate the ZIP before uploading
python <skill-path>/scripts/validate_zip.py /tmp/VisualName_v1.0.zip

# 5. Write version.txt alongside ZIP
# Include: visual name, renderer, drop areas, settings summary,
#          key behaviours, theme notes, changelog entry
```


> **Gate 6 — Package:** Run Gate 6 checklist from `references/validation-gates.md`
> before uploading: ZIP < 3 MB, no nested dirs, allowed extensions only.

**Output delivery:**
- User has a workspace folder mounted → save ZIP directly there
- No folder in scope → build in /tmp, use present_files so user can download
- Unsure → ask: "Where should I save the ZIP, or would you like to download it?"

After every code change, re-run syntax check and rebuild the ZIP.

---

> The complete reference loading map is at the top of this file.
> Use `references/validation-gates.md` Quick Mistake Map for symptom-first debugging.
