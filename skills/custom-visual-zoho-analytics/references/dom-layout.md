# DOM Layout — Vanilla HTML Rendering Reference

Load this file when the renderer decision is **Vanilla DOM** (no chart library).
Applies to: KPI cards, kanban boards, info tables, widget grids, detail panels, dashboards.

---

## §00 — Design Tokens: Spacing + Font System

Apply these values consistently across every DOM visual. They align with the Zoho Analytics
dashboard context — visuals that deviate feel out of place alongside native chart tiles.

### Spacing Hierarchy

| Token | Value | Used for |
|---|---|---|
| `--vz-gap-section` | `12px` | Between major zones (KPI strip ↔ chart, chart ↔ table) |
| `--vz-gap-component` | `8px` | Between sibling components inside a zone (card ↔ card, row ↔ row) |
| `--vz-gap-micro` | `4px` | Internal padding within a component (label ↔ value, icon ↔ text) |
| `--vz-gap-chart-legend` | `10px` | Between a chart area and its legend or filter bar |

### Font Size Hierarchy

| Token | Value | Used for |
|---|---|---|
| `--vz-font-main` | `13px` | Primary labels, card titles, axis labels, filter labels |
| `--vz-font-data` | `12px` | Data labels, tick text, legend text, filter option text, value-unit labels |
| `--vz-font-metric` | clamp(18px, 3vw, 32px) | KPI metric values — responsive, never ellipsed |
| `--vz-font-delta` | `12px` | Delta/comparison values, percentage changes |

### Inject design tokens alongside theme variables (§13)

```js
function applyThemeVars(rootEl, theme, accent) {
  var af = contrastText(accent);
  var vars = {
    /* Theme */
    '--vz-fg':      theme.fg,
    '--vz-muted':   theme.muted,
    '--vz-border':  theme.border,
    '--vz-card':    theme.cardBg,
    '--vz-ctrl':    theme.ctrlBg,
    '--vz-ctrl-fg': theme.ctrlFg,
    '--vz-accent':  accent,
    '--vz-accent-fg': af,
    /* Spacing tokens */
    '--vz-gap-section':      '12px',
    '--vz-gap-component':    '8px',
    '--vz-gap-micro':        '4px',
    '--vz-gap-chart-legend': '10px',
    /* Font tokens */
    '--vz-font-main':   '13px',
    '--vz-font-data':   '12px',
    '--vz-font-metric': 'clamp(18px, 3vw, 32px)',
    '--vz-font-delta':  '12px'
  };
  Object.keys(vars).forEach(function(k) {
    rootEl.style.setProperty(k, vars[k]);
  });
}
```

**Rules:**
- Never hardcode `12px` spacing directly in component CSS — reference `var(--vz-gap-section)` so
  the system stays consistent and overridable.
- KPI metric font must never use `text-overflow:ellipsis` — use `clamp()` or scale instead.
- Data labels that cannot fit must be suppressed (`display:none` or opacity 0), not truncated.

---

## Renderer Decision — Chart Library vs Vanilla DOM

Make this decision at the START of Phase 1 before designing shelves or settings.

| Signal from spec / screenshot | Renderer |
|---|---|
| Axes, plot area, legend, data points, curves | Chart library (ECharts / D3 / Vega-Lite) |
| Cards, tiles, metric boxes, KPI values | Vanilla DOM |
| Rows and columns in a board layout | Vanilla DOM |
| Table rows, scrollable list | Vanilla DOM |
| Mixed: chart panel + KPI/card panel | Chart library for the chart zone; Vanilla DOM for panels |
| Gauge, radial progress without data points | Either — prefer Vanilla DOM + SVG arc |
| Sparkline inside a card | Vanilla DOM + inline SVG (§16) |

**When Vanilla DOM is chosen:** load this file before writing any code. Skip canvas/DPR patterns. Do not call `echarts.init`. Apply the zone layout model (§03) as the structural spine.

---

## §01 — Root Container Setup

The mandatory first lines of every DOM visual's `generateCustomVisual`.

```js
/* Always set these before appending any children */
container.style.cssText = [
  'position:relative',
  'width:100%',
  'height:100%',
  'margin:0',
  'padding:0',
  'box-sizing:border-box',
  'background:transparent',   /* never paint the root — parent owns it */
  'overflow:hidden',
  'display:flex',
  'flex-direction:column',    /* zones stack vertically */
  'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif'
].join(';');
```

**Rules:**
- `background:transparent` — the dashboard owns the surface color
- `overflow:hidden` on root prevents any zone from bleeding outside the container
- `flex-direction:column` sets up the zone model (§03)

---

## §02 — Idempotent CSS Injection

Inject a scoped `<style>` tag on every render. Remove the previous one first to prevent style accumulation.

```js
function injectCSS(scopeId, css) {
  var old = document.getElementById(scopeId);
  if (old) old.remove();
  var s = document.createElement('style');
  s.id = scopeId;
  s.textContent = css;
  document.head.appendChild(s);
}

/* Usage — call before building DOM */
injectCSS('__vz_myvisual', buildCSS(theme, accent));

function buildCSS(t, accent) {
  var af = contrastText(accent);
  return [
    /* Scope ALL rules to the unique prefix to avoid global collisions */
    '.vz-root{position:relative;width:100%;height:100%;...}',
    '.vz-card{background:' + t.cardBg + ';border:1px solid ' + t.border + ';}',
    '.vz-accent-bg{background:' + accent + ';color:' + af + ';}',
    /* ... */
  ].join('');
}
```

**Rules:**
- Use a unique `scopeId` per visual (e.g. `__vz_kanban`, `__vz_kpicard`)
- Prefix all class names to avoid collision with the host page
- Rebuild the entire CSS string when theme or accent changes — do not patch individual rules

---

## §03 — Zone Layout: Fixed + Flex

All DOM visuals decompose into **fixed zones** (toolbar, filter bar, header) and one **growing content zone**.

```
┌─────────────────────────────────┐
│  Toolbar / Filter Bar           │  flex: 0 0 auto  (fixed height)
├─────────────────────────────────┤
│                                 │
│  Content Zone                   │  flex: 1 1 auto  (takes remaining space)
│  (cards / board / table)        │
│                                 │
└─────────────────────────────────┘
```

```js
/* Two-zone: toolbar + content */
function buildLayout(container) {
  var toolbar = el('div', 'vz-toolbar');  /* flex:0 0 auto in CSS */
  var content = el('div', 'vz-content'); /* flex:1 1 auto; overflow:auto in CSS */
  container.appendChild(toolbar);
  container.appendChild(content);
  return { toolbar: toolbar, content: content };
}

/* Three-zone: toolbar + content + footer */
function buildLayout3(container) {
  var toolbar = el('div', 'vz-toolbar');
  var content = el('div', 'vz-content');
  var footer  = el('div', 'vz-footer');   /* flex:0 0 auto */
  container.appendChild(toolbar);
  container.appendChild(content);
  container.appendChild(footer);
  return { toolbar: toolbar, content: content, footer: footer };
}
```

**CSS for zone roles:**
```css
.vz-toolbar { flex: 0 0 auto; min-height: 38px; }
.vz-footer  { flex: 0 0 auto; }
.vz-content { flex: 1 1 auto; overflow: auto; min-height: 0; }
/* min-height:0 is critical — without it flex children can overflow their parent */
```

---

## §04 — Available Space Calculation

When CSS alone is insufficient (e.g. passing explicit dimensions to a child), measure after DOM append.

```js
/* Read ALL measurements before writing any dimensions */
var toolbarH = zones.toolbar ? zones.toolbar.offsetHeight : 0;
var filterH  = zones.filter  ? zones.filter.offsetHeight  : 0;
var totalFixed = toolbarH + filterH;

/* Content zone gets the remainder */
/* Option A — explicit height (when child needs px dimensions) */
zones.content.style.height = (container.clientHeight - totalFixed) + 'px';

/* Option B — CSS calc (preferred when child uses 100% height) */
zones.content.style.height = 'calc(100% - ' + totalFixed + 'px)';

/* Option C — let flex handle it (best default; use when overflow:auto is enough) */
/* No explicit height needed — flex:1 1 auto + min-height:0 handles it */
```

**Rule:** Always read `offsetHeight` in one batch before writing any `style.height`. Never interleave reads and writes (causes forced synchronous layout / reflow).

---

## §05 — Card / Item Grid

```css
.vz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-min, 180px), var(--card-max, 300px)));
  justify-content: start;   /* prevents few cards from stretching to fill row */
  gap: 8px;
  padding: 10px;
  align-content: start;
}
```

```js
/* Apply card dimensions from settings */
function applyGridVars(el, cardMin, cardMax) {
  el.style.setProperty('--card-min', cardMin + 'px');
  el.style.setProperty('--card-max', cardMax + 'px');
}
```

**Responsive column breakpoints (3 → 2 → 1):**

```js
function computeColumns(availWidth, cardMin) {
  return Math.max(1, Math.min(3, Math.floor(availWidth / (cardMin + 8))));
}
/* Use in ResizeObserver callback (§11) to switch between grid and stacked layout */
```

**Scale-down when card hits min-width:**

```css
.vz-card-inner {
  min-width: 160px;
  transform-origin: top left;
}
```

```js
var scale = Math.min(1, cardEl.clientWidth / CARD_MIN_W);
innerEl.style.transform  = 'scale(' + scale + ')';
innerEl.style.height     = (CARD_MIN_H / scale) + 'px'; /* compensate collapsed height */
```

---

## §06 — Overflow & Scroll Patterns

| Scenario | CSS rule |
|---|---|
| Root container | `overflow:hidden` — nothing escapes |
| Horizontal board (columns scroll sideways) | `overflow-x:auto; overflow-y:hidden` |
| Vertical card list inside a column | `overflow-y:auto; overflow-x:hidden` |
| Scrollable table body | `overflow-y:auto` on the tbody wrapper |
| Side panel / detail pane | `overflow-y:auto` on the panel itself |
| Content zone (cards, grid) | `overflow:auto` — scrolls in both axes when needed |

**Independent scroll regions:**
```css
.vz-board   { display:flex; gap:10px; overflow-x:auto; overflow-y:hidden; flex:1 1 auto; }
.vz-column  { flex:0 0 280px; display:flex; flex-direction:column; overflow:hidden; }
.vz-cards   { flex:1 1 auto; overflow-y:auto; overflow-x:hidden; padding:8px; }
```

Never allow a child region's scroll height to push the sibling panel off-screen. Each scroll region must have a bounded height from its flex parent.

---

## §07 — Sticky Headers & Columns

```css
/* Table header — sticks to top of the scroll container */
.vz-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--vz-accent); /* must be opaque — sticky reveals rows scrolling under */
}

/* Action column — sticks to the right edge */
.vz-table td.action-col,
.vz-table th.action-col {
  position: sticky;
  right: 0;
  z-index: 5;
  background: var(--vz-card);
}

/* Column group header in kanban — sticks to top of the column */
.vz-col-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--vz-col-bg);
}
```

**Critical:** `position:sticky` requires the overflow to be set on the **direct scroll parent** — not an ancestor further up the tree. If sticky is not working, check which ancestor has `overflow:auto/hidden`.

---

## §08 — Text Overflow Rules

```css
/* Standard truncation — safe for labels, column headers, tag names */
.vz-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Multi-line clamp (two lines max) */
.vz-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Do NOT truncate these values:**
- KPI metric values — wrap or scale instead, never ellipsis
- Currency amounts — a clipped "$1,234..." is worse than no label
- Percentage deltas — "12.3..." is misleading

```css
/* KPI values: allow wrap, never ellipsis */
.vz-metric {
  word-break: break-all;
  white-space: normal;
  overflow: visible;
}
```

---

## §09 — Popover / Side Panel / Tooltip

### Z-index Hierarchy

```
Content zone:        z-index: 1
Toolbar / headers:   z-index: 10
Floating badges:     z-index: 50
Popovers:            z-index: 100
Full-screen overlay: z-index: 200
```

### Popover Positioning

```js
function positionPopover(popEl, triggerEl, containerEl) {
  var tRect = triggerEl.getBoundingClientRect();
  var cRect = containerEl.getBoundingClientRect();
  var left  = tRect.left - cRect.left;
  var top   = tRect.bottom - cRect.top + 4;

  /* Clamp to container right edge */
  var maxLeft = containerEl.clientWidth - popEl.offsetWidth - 8;
  left = Math.min(left, maxLeft);
  left = Math.max(8, left);

  popEl.style.left = left + 'px';
  popEl.style.top  = top  + 'px';
}
```

### Slide-in Side Panel

```css
.vz-panel {
  position: absolute;
  top: 0; right: -320px; bottom: 0;
  width: 300px;
  transition: right 0.2s ease;
  z-index: 100;
  background: var(--vz-card);
  border-left: 1px solid var(--vz-border);
  overflow-y: auto;
}
.vz-panel.open { right: 0; }
```

---

## §10 — Click-Outside Close

```js
function openOverlay(overlayEl, containerEl, state) {
  overlayEl.style.display = 'block';

  /* setTimeout 0 prevents the opening click from immediately closing the overlay */
  setTimeout(function() {
    var handler = function(e) {
      if (!overlayEl.contains(e.target)) {
        overlayEl.style.display = 'none';
        document.removeEventListener('click', handler, true);
        /* Remove from cleanup registry */
        state.cleanup = state.cleanup.filter(function(f) { return f._id !== handler._id; });
      }
    };
    handler._id = Date.now() + Math.random(); /* unique id for removal */
    document.addEventListener('click', handler, true);

    /* Register for cleanup on re-render */
    state.cleanup.push(function() {
      document.removeEventListener('click', handler, true);
    });
  }, 0);
}
```

**Rule:** Use `addEventListener` with `capture:true` so the handler fires before any stopPropagation on inner elements. Always register in `state.cleanup` so it is removed on the next `generateCustomVisual` entry.

---

## §11 — ResizeObserver: Re-layout on Container Resize

```js
function watchResize(targetEl, callback, state) {
  if (typeof ResizeObserver === 'undefined') return;

  var timer;
  var ro = new ResizeObserver(function() {
    /* Debounce: skip rapid intermediate sizes */
    clearTimeout(timer);
    timer = setTimeout(callback, 60);
  });

  ro.observe(targetEl);

  /* Register disconnect in cleanup registry */
  state.cleanup.push(function() {
    clearTimeout(timer);
    ro.disconnect();
  });
}

/* Usage */
watchResize(zones.content, function() {
  redrawContent(zones.content, data, state);
}, state);
```

**Observe the content zone, not the root.** The root is sized by the platform; the content zone is the element whose dimensions drive layout decisions (column count, card scale).

---

## §12 — DOM Construction Helper

```js
/* Lightweight element factory */
function el(tag, cls, opts) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (opts) {
    if (opts.text  !== undefined) e.textContent = opts.text;    /* safe — no XSS */
    if (opts.style !== undefined) e.style.cssText = opts.style;
    if (opts.title !== undefined) e.title = opts.title;         /* native tooltip */
    if (opts.id    !== undefined) e.id = opts.id;
  }
  return e;
}

/* Fragment-based batch append — avoids one reflow per item */
function appendMany(parent, items, buildFn) {
  var frag = document.createDocumentFragment();
  items.forEach(function(item) { frag.appendChild(buildFn(item)); });
  parent.appendChild(frag);
}
```

**Rules:**
- Always use `textContent` for data values — never `innerHTML` with raw data
- Use `encodeHTML()` only when `innerHTML` is unavoidable (HTML structure from data)
- Use `el.title` for simple native hover tooltips — no JS needed
- Batch inserts with `DocumentFragment` when appending more than ~5 items

---

## §13 — CSS Variable Theming

Inject theme values as CSS custom properties on the root element. All CSS rules reference variables — no re-injection needed when only a value changes.

```js
function applyThemeVars(rootEl, theme, accent) {
  var af = contrastText(accent);
  var vars = {
    '--vz-fg':      theme.fg,
    '--vz-muted':   theme.muted,
    '--vz-border':  theme.border,
    '--vz-card':    theme.cardBg,
    '--vz-ctrl':    theme.ctrlBg,
    '--vz-ctrl-fg': theme.ctrlFg,
    '--vz-accent':  accent,
    '--vz-accent-fg': af
  };
  Object.keys(vars).forEach(function(k) {
    rootEl.style.setProperty(k, vars[k]);
  });
}
```

**In CSS:**
```css
.vz-card   { background: var(--vz-card);   border: 1px solid var(--vz-border); }
.vz-label  { color: var(--vz-muted); }
.vz-badge  { background: var(--vz-accent); color: var(--vz-accent-fg); }
```

This means the CSS rules (injected once in §02) never need rebuilding when the theme changes — only `applyThemeVars()` is called again.

---

## §14 — Accent Adaptation & contrastText

```js
/* Readable text on a colored background — dark text if bg is light, white if dark */
function contrastText(color) {
  var l = luminance(color);
  return (l != null && l > 150) ? '#17324d' : '#ffffff';
}

/* Shift accent lightness for use as text (not background) */
function accentForLabel(accent, isDark) {
  var hsl = hexToHsl(accent);
  if (!hsl) return accent;
  /* Dark theme: lighten to ~72%; Light theme: darken to ~42% */
  return hslToHex(hsl.h, Math.min(hsl.s, 70), isDark ? 72 : 42);
}

/* Usage */
var accentBadgeFg  = contrastText(accent);           /* text ON an accent-bg badge */
var accentTextColor = accentForLabel(accent, dark);  /* accent-colored text on card surface */
```

---

## §15 — Empty, Error & Warning States

### Empty State (required shelf not filled)

```js
function showEmpty(parentEl, message) {
  var d = el('div', 'vz-empty', {
    style: 'display:flex;align-items:center;justify-content:center;height:100%;' +
           'font-size:13px;opacity:0.55;padding:16px;text-align:center;'
  });
  d.textContent = message || 'Drop data here to display this visual';
  parentEl.appendChild(d);
}

/* Guard at top of renderChart() */
if (!groupCol || !metricCol) { showEmpty(container, 'Add a Dimension and a Measure to get started'); return; }
```

### Non-blocking Warning Badge

Use when settings are misconfigured but the visual can still render (e.g. color count mismatch).

```js
function showWarning(containerEl, message) {
  var badge = el('div', 'vz-warn', { style:
    'position:absolute;top:8px;right:12px;z-index:50;' +
    'background:#fef3c7;border:1px dashed #d97706;border-radius:6px;' +
    'padding:3px 8px;font-size:11px;color:#92400e;cursor:default;'
  });
  badge.textContent = '⚠ Config';
  badge.title = message; /* native tooltip — no JS needed */
  containerEl.appendChild(badge);
}
```

**Never use a modal or alert for configuration warnings.** The visual renders anyway; the badge is discoverable but non-blocking.

---

## §16 — Inline SVG Sparklines

Self-contained SVG sparkline — no library needed.

```js
function buildSparkline(values, width, height, opts) {
  opts = opts || {};
  var type   = opts.type || 'line'; /* 'line' | 'area' | 'bar' */
  var color  = opts.color || '#6366f1';
  var n = values.length;
  if (n < 2) return null;

  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var range = max - min || 1;
  var pad = 2; /* pixel padding so edge points are not clipped */

  function sx(i) { return pad + (i / (n - 1)) * (width  - pad * 2); }
  function sy(v) { return pad + (1 - (v - min) / range) * (height - pad * 2); }

  var pts = values.map(function(v, i) { return sx(i) + ',' + sy(v); }).join(' ');

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width',  width);
  svg.setAttribute('height', height);
  svg.style.overflow = 'visible';

  if (type === 'area') {
    var closedPts = pts + ' ' + sx(n-1) + ',' + (height-pad) + ' ' + sx(0) + ',' + (height-pad);
    var area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    area.setAttribute('points', closedPts);
    area.setAttribute('fill', color);
    area.setAttribute('opacity', '0.18');
    svg.appendChild(area);
  }

  if (type === 'bar') {
    var bw = Math.max(1, (width - pad*2) / n - 2);
    values.forEach(function(v, i) {
      var barH = Math.max(1, ((v - min) / range) * (height - pad*2));
      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x',      sx(i) - bw/2);
      rect.setAttribute('y',      height - pad - barH);
      rect.setAttribute('width',  bw);
      rect.setAttribute('height', barH);
      rect.setAttribute('fill',   color);
      rect.setAttribute('rx',     '1');
      svg.appendChild(rect);
    });
    return svg;
  }

  /* Line (default) */
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  line.setAttribute('fill',   'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap',  'round');
  svg.appendChild(line);

  /* Highlight dots: first / last / min / max */
  if (opts.highlights !== false) {
    var hlIdx = [0, n-1];
    var minI  = values.indexOf(min);
    var maxI  = values.indexOf(max);
    if (hlIdx.indexOf(minI) < 0) hlIdx.push(minI);
    if (hlIdx.indexOf(maxI) < 0) hlIdx.push(maxI);
    hlIdx.forEach(function(i) {
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', sx(i));
      dot.setAttribute('cy', sy(values[i]));
      dot.setAttribute('r',  '2.5');
      dot.setAttribute('fill', color);
      svg.appendChild(dot);
    });
  }

  return svg;
}
```

---

## §17 — Event & Observer Cleanup Registry

Run at the **top of every `generateCustomVisual` call**, before touching the DOM.

```js
function generateCustomVisual(container, data, metaData) {
  /* 1. Run all cleanup functions from the previous render */
  var prev = container.__myState || {};
  (prev.cleanup || []).forEach(function(fn) { try { fn(); } catch(e) {} });

  /* 2. Clear DOM */
  container.innerHTML = '';

  /* 3. Initialise fresh state — preserve filter selection */
  var state = {
    cleanup:  [],                      /* registered cleanup functions */
    filters:  prev.filters  || {},     /* preserved across re-renders */
    expanded: prev.expanded || {}      /* preserved open/close states */
  };
  container.__myState = state;

  /* All future listeners/observers register themselves: */
  /*   state.cleanup.push(function() { el.removeEventListener(...); }); */
  /*   state.cleanup.push(function() { observer.disconnect(); });        */
}
```

---

## §18 — Reflow Minimisation

```js
/* ─── WRONG: interleaved reads and writes (causes layout thrashing) ─── */
items.forEach(function(item) {
  var w = item.el.offsetWidth;    /* READ — forces layout */
  item.el.style.height = w + 'px'; /* WRITE */
});

/* ─── CORRECT: batch reads, then batch writes ─── */
var widths = items.map(function(item) { return item.el.offsetWidth; }); /* batch READ */
items.forEach(function(item, i) { item.el.style.height = widths[i] + 'px'; }); /* batch WRITE */

/* ─── CORRECT: DocumentFragment for bulk inserts ─── */
var frag = document.createDocumentFragment();
rows.forEach(function(row) { frag.appendChild(buildRow(row)); });
tbodyEl.appendChild(frag);  /* single reflow, not one per row */

/* ─── CORRECT: CSS transitions instead of JS setInterval ─── */
/* panel.style.right = '0' + transition: right 0.2s ease  (no JS timer needed) */
```

**Key rules:**
- Measure `offsetHeight` / `clientWidth` in one pass before writing any `style.height`
- Use `DocumentFragment` when appending more than ~5 elements
- Use CSS `transition` for animations — never `setInterval` for visual changes
- Avoid `display:none` toggling for show/hide when `visibility:hidden` or opacity suffices — `display:none` always triggers reflow

