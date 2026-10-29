# Visual Patterns — Pattern-Specific Reference

Load this file when the visual type matches one of these patterns.
Generic rules (API, formatting, gates) are in the other reference files.

---

## When to Load This File

| Pattern | Load when |
|---|---|
| KPI / Metric Cards | Visual shows metric values with comparison, delta, or trend |
| Hybrid Bar + Bullet | Visual mixes bar groups with target/actual bullet sections |
| Multi-Visual Dashboard | Single ZIP renders multiple panels with shared filter state |
| Responsive Widget Grid | KPI widgets in 3/2/1-column auto layout |
| IBCS / Comparison Coloring | Semantic green/red/gray coloring based on favorable/unfavorable variance |

---

## KPI Card Layouts

Four layout grammars. Decide which one(s) to support before writing any code.

| Layout | Primary display | When to use |
|---|---|---|
| 1 | Current value + indicator + compare value | Default KPI card |
| 2 | Difference from or % Difference from | Focus on the gap, not the absolute |
| 3 | Run-rate bars | Progress toward a target or budget |
| 4 | Current of target/comparison + progress track | Attainment percentage |

### Layout 3 — Run-Rate Bars

Right-side value must never wrap. Reserve a `no-wrap` value column; let the bar track shrink.

```css
.kpi-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.kpi-bar-track {
  flex: 1 1 0;        /* shrinks first */
  min-width: 20px;
}
.kpi-value {
  flex: 0 0 auto;     /* never shrinks */
  white-space: nowrap;
}
```

### Layout 4 — Progress Track

```js
var pct = Math.min(100, Math.round(current / target * 100));
trackEl.style.width = pct + "%";
```

Cap at 100% visually; show raw attainment number in the label.

### Card Title Rule

- By-Dimension cards: title = dimension label
- Total card / no Dimension dropped: title = `{formatted active period} - {Metric 1 name}`
  - Never use raw timestamp, never use generic "Total"
  - `period = ZAViz_Utils.getFormattedValue(idx(dateCol) + 1, latestRawPeriod)`

### Card Sizing — Prevent Banner Stretch

```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--cardMin), var(--cardMax)));
  justify-content: start;   /* prevents single card from stretching to full row */
  gap: 8px;
}
```

Expose `cardMinWidth` and `cardMaxWidth` as settings. Defaults: 160px / 280px.

### Layout 2 — Delta Display Rule

Layout 2 shows the **difference**, not the current value.

```js
/* WRONG — repeats current value */
primaryEl.textContent = fmtVal(row, metricCol);

/* CORRECT — Layout 2 shows the delta */
var delta = currentRaw - compareRaw;
primaryEl.textContent = (delta >= 0 ? "+" : "") +
  ZAViz_Utils.getFormattedValue(idx(metricCol) + 1, Math.abs(delta));
```

---

## Responsive Widget / KPI Grid Pattern

### Responsive Columns

```js
function computeColumns(availWidth, cardMin) {
  var cols = Math.floor(availWidth / cardMin);
  return Math.max(1, Math.min(3, cols));
}
```

3 → 2 → 1 column breakpoints. Scale the inner card layout (CSS transform) after the
minimum width is hit — do not reflow or wrap the card's internal rows.

```css
/* Scale inner layout after min-width instead of wrapping */
.kpi-inner {
  min-width: 160px;
  transform-origin: top left;
}
```

In the ResizeObserver callback:
```js
var scale = Math.min(1, cardEl.clientWidth / CARD_MIN_WIDTH);
innerEl.style.transform = "scale(" + scale + ")";
innerEl.style.height = (CARD_MIN_HEIGHT / scale) + "px"; /* compensate height */
```

### Independent Scroll Regions

When a widget grid sits alongside a table panel, each scrolls independently:

```css
.widget-panel { overflow-y: auto; flex: 0 0 var(--widgetPanelWidth); }
.table-panel  { overflow-y: auto; flex: 1 1 0; }
```

Never let the table's row count push the widget panel off-screen.

### Shared Accent Color

Widget label, selected card border, table header, and grid lines all use one configurable
accent color. Expose a single `accentColor` setting rather than per-component colors.

---

## Hybrid Bar + Bullet Visual

### Grammar Rule

A bullet chart section is NOT two side-by-side bar groups.

| Section | Correct render | Wrong render |
|---|---|---|
| Bullet | Target as full-width background track + actual value as overlay bar | Two bars side by side |
| Bar group | Normal grouped/stacked bars | — |

Both sections share the same category axis. Each has its own value axis.

### Identify Actual vs Target

Infer from column names (case-insensitive match):
- "target" / "budget" / "plan" / "goal" → Target column
- "actual" / "sales" / "revenue" / "achieved" → Actual column
- If ambiguous: first column = Actual, second column = Target

```js
function inferBulletPair(cols) {
  var TARGET_RE = /target|budget|plan|goal/i;
  var target = null, actual = null;
  cols.forEach(function(c) {
    if (TARGET_RE.test(c.columnName)) target = c;
    else actual = c;
  });
  /* fallback: first = actual, second = target */
  if (!actual) actual = cols[0];
  if (!target) target = cols[1] || cols[0];
  return { actual: actual, target: target };
}
```

### ECharts Bullet Render

```js
/* Target — background bar (full opacity, low saturation) */
{ type:"bar", barGap:"-100%", data: targetVals, itemStyle:{ color: targetFill }, z: 1 }
/* Actual — overlay bar (narrower, foreground) */
{ type:"bar", barMaxWidth: "60%", data: actualVals, itemStyle:{ color: actualColor }, z: 2 }
```

`barGap:"-100%"` makes the actual bar overlay the target bar exactly.

### Grid Padding

Use fixed pixel left padding, not percentage, to avoid large blank gaps on wide containers:

```js
grid: { left: 48, right: 16, containLabel: true }
```

---

## Multi-Visual / Cross-Filter Dashboard

> **→ Load `references/multi-visual.md`** for the complete multi-panel architecture.
> This file covers: generateCustomVisual→refresh() split, wide-net manifest, central filter
> state, JS-first/DuckDB dispatch, KPI panel pipeline, ghost bars, skip-own-field,
> mixed-renderer layout, 3-host-width planning, period rules (MTD/QTD/missing period),
> and multi-panel performance rules.

---

## IBCS## IBCS / Comparison Coloring

### Semantic Labels

| Comparison type | Label pattern |
|---|---|
| Period (YoY, MoM, previous period) | "Current" and "Previous" — never "Compare" or "Series 2" |
| Metric vs metric | Use the actual dropped field names — e.g. "Revenue" vs "Cost" |
| Target vs actual | "Actual" and "Target" — infer from column names (see Hybrid pattern) |

### Color Rules

| Variance | Color | Condition |
|---|---|---|
| Favorable | Green (or theme positive) | Current > compare when higher = good |
| Unfavorable | Red (or theme negative) | Current < compare when higher = good |
| Neutral / no comparison | Gray or legend color | No comparison shelf dropped |

### IBCS Toggle False — Must Remove Everything

When the IBCS/semantic color toggle is `false`:
- Remove semantic green/red coloring
- Remove directional arrows / indicator icons
- Revert to the standard legend palette
- Do NOT leave arrows or color-coded bars with semantic colors disabled

```js
var useIBCS = tog(getSetting("ibcsColors", true));
var color = useIBCS
  ? (delta >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR)
  : getLegendColors()[seriesIdx % getLegendColors().length];
var showArrow = useIBCS && showIndicator;
```

### Period Comparison — Null Previous

If no previous period rows exist, return `[]` and render an empty-state message.
Never fall back to showing all data as the "previous" period.

```js
var prevRows = data.filter(function(r) { return r[dateIdx] === prevRaw; });
if (prevRows.length === 0) {
  container.innerHTML = "<div class='empty'>No comparison data available</div>";
  return;
}
```

---

## Native Control Background (Dark Dashboards)

Transparent root works for cards and charts, but native `<select>` / `<input>` elements
have no visible background on dark dashboards — text becomes invisible.

Apply `controlBg` only to native controls; keep everything else transparent:

```js
var bg  = ZAViz_Utils.getSuitableStyle('background');
var fg  = ZAViz_Utils.getSuitableStyle('fontColor');
var dark = bgIsDark(bg, fg);
var controlBg = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";

selectEl.style.background = controlBg;
selectEl.style.color       = fg;
/* root, cards, chart wrappers → no background set */
```
