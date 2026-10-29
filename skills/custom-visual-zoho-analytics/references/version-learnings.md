# Version Learnings — Recurring Corrections

Condensed from production version histories across all visuals.
Each entry = a real bug that shipped, then had to be corrected.
Use this to avoid repeating the same mistakes.

---

## API Corrections

| Visual | Incorrect | Correct | Effect if wrong |
|---|---|---|---|
| All visuals | `getSuitableStyle('backgroundColor')` | `getSuitableStyle('background')` | Returns wrong/null value; dark detection breaks |
| Sunburst v1.2/v1.3 | `ZAViz_Utils.getChartColors()` | `ZAViz_Utils.getSuitableStyle('legendColor')` | Function does not exist; crashes |
| Formatting all | `getFormattedValue(0-based, raw)` | `getFormattedValue(1-based, raw)` | Off-by-one; wrong column formatted |
| `ZAVizCommon.getBackgroundColor()` | Calls `getSuitableStyle('backgroundColor')` internally — **wrong key** | Call `ZAViz_Utils.getSuitableStyle('background')` directly | Returns `undefined`; dark theme detection silently breaks; filter/card backgrounds wrong |

**Mnemonic:** `getSuitableStyle` takes `'background'`, `'fontColor'`, or `'legendColor'` — nothing else.

**`ZAVizCommon` utility note:** The `ZAVizCommon` namespace (`Custom_Visual_CommonUtils.js`) provides useful helpers — `getColumnByDropBox`, `getDimensionColumns`, `getMeasureColumns`, `groupByColumn`, `getSetting`, `getFormattedValue`. Use them when they are declared in the manifest `dependencies`. However, **do not use `ZAVizCommon.getBackgroundColor()`** — it calls the wrong API key internally. Use `ZAViz_Utils.getSuitableStyle('background')` directly for all background/theme detection.

---

## Color Utilities

### hexToHsl must handle rgba() strings
Analytics `getSuitableStyle('legendColor')` returns `rgba(r,g,b,a)` format, not `#rrggbb`.
A hex-only parser will return `null`, causing downstream crashes.
**Always** add an rgba regex branch before the hex branch.

```js
// Wrong — crashes when legendColor returns rgba():
var m = /^#([0-9a-f]{6})$/.exec(hex);

// Correct — handle both:
var rm = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(v);
if (rm) { ... } else { /* try hex */ }
```

### PALETTE vs PALETTE_FALLBACK (Sunburst v1.5)
Variable renamed across refactor but not all usages updated — `monoShades()` still referenced
the old name `PALETTE`, causing a runtime crash.
**Fix:** always reference `PALETTE_FALLBACK` consistently; or use a single name throughout.

### Dark theme: never hardcode surface colors
Wrong: `cardBg = "#1e293b"` (only works on one specific dark theme).
Correct: `solidBg` derived from `getSuitableStyle('background')`, then `cardBg = solidBg + 8L`.

---

## ECharts-Specific Issues

### Circular reference crash (Sunburst v1.1)
Putting a live tree node reference (`_sbNode: treeNode`) inside ECharts option `data` causes
ECharts' internal deep-clone to traverse `_parent` chains → stack overflow / infinite loop.

**Rule:** Never put objects with `_parent`, `_map`, or other cyclic chains in ECharts option data.
**Fix:** Assign `node._id = "n" + counter` strings during tree build; store flat `nodeMap` registry;
eNodes carry `id: node._id` (plain string) only.

### Canvas bleed outside flex cell (Bullet and Stacked Bar v1.3)
ECharts initialises its canvas **before** the flex layout settles, then paints beyond its
intended bounds.
**Fix:** `overflow:hidden` on the chart wrapper element. Always add this.

### Grid gap caused by percentage padding (Bullet and Stacked Bar v1.4.1)
`grid.left:"24%"` on a wide container creates a huge blank area.
**Fix:** use fixed pixel values or `containLabel:true` with a small fixed left pad.

---

## Column Index Bugs

### Wrong data shown in controls (Bullet Bar / Bullet and Stacked Bar v1.1)
Date Filter dropdown showed metric values because row access used a static array index
instead of the resolved metadata index.
**Fix:** always use `idx(col)` fallback chain: `dataindex → colIndex → columnIndex → __metaOrder`.

### Drop-area order unstable after re-drop (Bullet and Stacked Bar v1.2)
`metaData.columns` arrival order doesn't reflect the user's shelf order after remove + re-drop.
**Fix:** after filtering by `dropBoxName`, sort by resolved index before assigning series/legend.

---

## Theme / Background

### Native select unreadable on dark dashboard (Timeline KPI Table v1.3.2)
Transparent root looks fine for cards, but native `<select>` controls have no visible background
on a dark parent — text becomes invisible.
**Fix:** apply `controlBg` (derived from dashboard bg or dark/light fallback) **only** on
`<select>` / `<input>` elements. Everything else stays transparent.

### Opaque chart div covers sibling elements (Bullet and Stacked Bar v1.3)
ECharts renders an opaque white canvas by default.
**Fix:** add `background:transparent` to the chart div before `echarts.init`.

### accentLabel for dark dashboards (Timeline KPI Table v1.4, Bullet and Stacked Bar v1.5)
Raw accent color (e.g. `#6366f1`) is unreadable on a dark panel.
**Fix:** `accentForLabel(accent, bg, fg)` — same hue, lightness ~75% on dark / ~42% on light.
Use `getSuitableStyle('background')` + `bgIsDark()` to detect.

---

## Layout and Responsive

### Digit stacking / KPI values clipped narrow (Timeline KPI Table v1.3)
Identified from screenshot: digits rendered vertically, values clipped.
Root cause: no min-width guard on KPI widgets — they collapsed to a few pixels.
**Fix:** bound widget width; define 3→2→1 auto column breakpoints; scale inner layout
with CSS transform (not just `font-size`) after min width.

### KPI card stretching as banner (KPI Layout Cards v1.2)
Single-card or few-card layouts expanded to full row width.
**Fix:** expose `cardMinWidth` + `cardMaxWidth`; use bounded grid tracks
(`minmax(cardMinWidth, cardMaxWidth)`) not `1fr`.

### Large widget panel gap (Bullet and Stacked Bar v1.3)
Widget panel was `width:280px` fixed — too narrow for 3-column grid; cards became ~82px wide.
**Fix:** `width:clamp(300px, 38%, 480px)`; grid `minmax(120px, 1fr)`.

### Run-rate bar / value column (KPI Layout Cards v1.1.1, v1.4.2)
Right-side numeric values wrapped, causing layout break.
**Fix:** reserve no-wrap space for the value column; let the bar track shrink first.

---

## Lifecycle

### Stale chart on repeated `generateCustomVisual` calls
ECharts will throw if you call `echarts.init` on a div that already has an instance.
**Fix:** always call `chart.dispose()` and clear the container at the top of the function.
Store instance + ResizeObserver on `container.__myState` and clean up on entry.

### ResizeObserver not disconnected (Timeline KPI Table, KPI Layout Cards v1.3)
Observers persisted after redraws, accumulating and firing multiple resize handlers.
**Fix:** disconnect observer before creating a new one; store ref in `container.__myState`.

---

## Interaction Payloads

### showInteractionMenu with formatted values (multiple visuals)
Payload must use **raw** values for drill/filter to match source data.
Formatted display values (e.g. `"$1,234.56"`, `"Jan 2024"`) break drill-through.
**Fix:** `dp[idx(col)+1] = rowVal(row, col)` — always raw; formatted value is only for display.

---

## Settings Normalization

### Toggle settings arriving as strings (KPI Layout Cards v1.3.2)
Settings like `showIndicator` may arrive as `"true"` / `"false"` strings or `1`/`0` integers.
Code using strict `=== true` comparisons will silently treat `"true"` as false.
**Fix:** always pass through `tog(v, default)` helper that handles all forms.

### Numeric settings as strings (multiple visuals)
`multipleToggle` options are strings: `"2"` not `2`.
Chart APIs expecting numbers will receive `"2"` and silently malfunction.
**Fix:** `parseInt` / `parseFloat` all numeric settings before passing to chart API.

---

## ZIP Build

### ZIP write fails in workspace folder
`zip` command cannot write directly to the mounted workspace path
(`/sessions/.../mnt/Custom Visuals/`).
**Fix:** always build ZIP in `/tmp/`, then `cp` the file to the project folder.

### Write tool cannot write to `/tmp/`
`Write` tool is sandboxed to connected folders only.
**Fix:** use `mcp__workspace__bash` with heredoc (`cat > file << 'EOF'`) for files in `/tmp/`.

---

## Quick Checklist — Before Submitting Any Visual

- [ ] `getSuitableStyle('background')` — lowercase, no 'Color' suffix
- [ ] `getSuitableStyle('legendColor')` — not `getChartColors()`
- [ ] `getFormattedValue` called with `idx(col) + 1` (1-based)
- [ ] No ECharts data objects contain `_parent` / cyclic references
- [ ] Chart div has `background:transparent` before `echarts.init`
- [ ] Chart wrapper has `overflow:hidden`
- [ ] Container cleared + chart disposed at top of `generateCustomVisual`
- [ ] ResizeObserver stored and disconnected on re-render
- [ ] `hexToHsl` handles rgba() strings
- [ ] Native `<select>`/`<input>` get `controlBg` fill; everything else transparent
- [ ] Toggle settings normalized through `tog()`
- [ ] Numeric settings parsed with `parseInt`/`parseFloat`
- [ ] Interaction payloads use raw values (not formatted)
- [ ] ZIP built in `/tmp/` first

---

## Butterfly Chart Pattern

**Problem:** Legend selection changes must recompute stacks AND totals simultaneously.
Updating only the stack series without updating the total leaves the KPI/summary section
showing the pre-filter total — a common symptom where clicking a legend item causes the
bars to update but the totals panel still shows the full dataset value.

**Fix:** Trigger a full `refresh()` / `renderChart()` on every legend click event, not just
a `chart.setOption` series update. The legend click must run the full data pipeline:
filter → group → aggregate → render all regions.

**Label rule:** Default series labels come from the dropped metric field names, not
hardcoded strings. Read `metricCols[0].columnName` (and `metricCols[1].columnName` for the
second wing) and use those as the legend/axis labels. Never hardcode "Left" / "Right" or
"Positive" / "Negative" — the user named their columns.

```js
var leftLabel  = metricCols[0] ? metricCols[0].columnName : 'Left';
var rightLabel = metricCols[1] ? metricCols[1].columnName : 'Right';
```

---

## Waffle Chart Pattern

**Problem 1 — Metadata-safe column mapping:** Do not assume the first column in `data[0]`
is the category and the second is the metric. Resolve by `dropBoxName` first, then sort by
resolved metadata index. A waffle chart with two swapped columns renders the correct shape
but maps colors to the wrong categories.

**Problem 2 — Sparse legend color arrays:** `getSuitableStyle('legendColor')` can return
an array shorter than the number of data categories, or with `null` / `undefined` entries.
Always validate before indexing:

```js
var palette = ZAViz_Utils.getSuitableStyle('legendColor') || [];
function legendColor(i) {
  var c = palette[i % Math.max(palette.length, 1)];
  return (c && typeof c === 'string' && c.trim()) ? c : '#6366f1';  /* fallback */
}
```

Never call `palette[i]` directly without the length/null guard — causes transparent or
white segments on visuals with more categories than palette entries.

---

## Pivot Table Pattern

**Problem 1 — No measure shelf filled:** When the user drops only dimensions (no metrics),
a pivot table should fall back to showing a **count** of rows per group rather than showing
an empty or broken visual. Guard at the top of the render function:

```js
var metricCol = colByBox(metaData, 'Measures');
var useFallbackCount = !metricCol;
/* If useFallbackCount: aggregate by counting rows per dimension group */
```

**Problem 2 — Dimensional column headers must be formatted:** Column headers in a pivot
table are dimension values — they must pass through `getFormattedValue`, not be shown raw.
Date-typed dimensional headers (e.g. Month, Quarter) are the most common failure case where
raw epoch timestamps appear as pivot column headers.

```js
/* Build pivot header labels */
var headerLabels = uniqueColValues.map(function(raw) {
  return displayValue(colDef, raw);   /* never raw directly */
});
```

