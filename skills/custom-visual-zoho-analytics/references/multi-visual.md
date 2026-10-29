# Multi-Visual / Dashboard in a Single ZIP

Load this file when the spec shows **multiple panels inside one custom visual container**:
KPI strip + chart, chart + table, kanban + filter sidebar, full dashboard grid, or any
visual where user interaction in one panel must update other panels.

---

## When to load this file

Trigger signals from the screenshot or spec:

| Signal | Action |
|---|---|
| Multiple distinct chart/table/KPI regions | Load this file, then plan panels |
| "Dashboard", "scorecard", "summary view" in the description | Load this file |
| Filter toolbar that updates several chart areas | Load this file |
| KPI strip above/beside a chart | Load this file |
| Cross-filter or drill that affects more than one region | Load this file |
| Single chart with sidebar filter only | Use code-patterns.md Filter Component instead |

---

## §01 — Architecture: generateCustomVisual → Skeleton → refresh()

This is the most important rule for multi-visual. **Violation causes flicker, lost scroll
position, and observer accumulation on every filter change.**

```
generateCustomVisual (called by platform on every re-render)
│
├─ Run cleanup[] from previous render
├─ Clear container.innerHTML
├─ Resolve columns + settings + theme  ← do this ONCE per call
├─ Build DOM skeleton (zones, panel containers)  ← build ONCE per call
├─ Initialize / restore filter state
├─ Start DuckDB async load if needed
└─ Call refresh()  ← refresh() does ALL rendering from here on

refresh() (called by every filter event + DuckDB ready callback)
│
├─ Guard: if state._busy return
├─ Filter raw rows → filteredData
├─ renderKpiPanel(filteredData)
├─ renderChartPanel(filteredData)
├─ renderTablePanel(filteredData)
└─ renderFilterPanel(data, filteredData)  ← full data for options, filtered for highlights
```

**Critical rule:** Filter change events call `refresh()` — NEVER call `generateCustomVisual`
directly from a filter event. Calling `generateCustomVisual` re-builds the entire skeleton,
losing scroll position, open popovers, and ResizeObserver connections.

```js
function generateCustomVisual(container, data, metaData) {
  /* 1. Cleanup */
  var prev = container.__mvState || {};
  (prev.cleanup || []).forEach(function(fn) { try { fn(); } catch(e) {} });

  /* 2. Clear */
  container.innerHTML = '';

  /* 3. Resolve once */
  var dims    = colsByBox(metaData, 'Dimensions');  /* sorted by resolved index */
  var metrics = colsByBox(metaData, 'Measures');    /* sorted by resolved index */
  var theme   = getTheme(metaData);

  /* 4. Build skeleton once */
  var zones = buildSkeleton(container, theme);

  /* 5. Init state — preserve filters across re-renders */
  var state = {
    cleanup:  [],
    filters:  prev.filters  || {},
    _busy:    false,
    db:       null,
    useDuckDB: false
  };
  container.__mvState = state;

  /* 6. Async DuckDB — does NOT block first render */
  initDuckDB().then(function(db) {
    state.db = db;
    ingestData(db, data).then(function() {
      state.useDuckDB = true;
      refresh();  /* re-render with SQL engine */
    });
  });

  /* 7. First render with JS engine */
  refresh();

  /* ─── inner functions have closure over dims, metrics, theme, zones, state, data ─── */

  function refresh() {
    if (state._busy) return;
    state._busy = true;
    try {
      var filtered = state.useDuckDB
        ? queryDuckDB(state.db, data, state.filters)   /* async path handled separately */
        : filterRowsJS(data, state.filters);
      renderKpiPanel(zones.kpi,    filtered, dims, metrics, state);
      renderChartPanel(zones.chart, filtered, dims, metrics, theme, state);
      renderTablePanel(zones.table, filtered, dims, metrics, state);
      renderFilterPanel(zones.filter, data, filtered, dims, state);
    } finally {
      state._busy = false;
    }
  }
}
```

---

## §02 — Manifest: Wide-Net Multi-Shelf Pattern

Dashboard visuals use two wide-net shelves, not granular named shelves:

```json
{
  "structure": [
    ["Dimensions", "multi", "DIMENSIONAL", ""],
    ["Measures",   "multi", "MEASURE",     ""]
  ]
}
```

**Why wide-net:** The user decides which dimensions and measures to bring in. The visual
organises whatever is dropped — it doesn't prescribe field names upfront.

**Column sort rule (critical for stable ordering):**
After resolving by `dropBoxName`, sort columns by their resolved metadata index. Without
this, removing and re-dropping a column can silently change the series order.

```js
function colsByBox(metaData, boxName) {
  var cols = (metaData.columns || []).filter(function(c) {
    return (c.dropBoxName || '') === boxName;
  });
  return cols.sort(function(a, b) {
    return idx(a) - idx(b);   /* idx() returns resolved metadata index */
  });
}
```

**Additional shelves to consider alongside the wide-net pair:**

| Shelf | Type | Purpose |
|---|---|---|
| `["Date", "single", "DIMENSIONAL", ""]` | optional | Period filter, trend, YoY |
| `["Tooltip Info", "multi", "DIMENSIONAL", ""]` | optional | Hover context without cluttering panels |

---

## §03 — Central Filter State

One state object. Every interaction mutates state and calls `refresh()`.
Filters store **raw values**; UI always shows formatted labels.

```js
/* State shape */
var state = {
  filters: {
    /* fieldId (resolved index as string): raw value */
    /* "3": "North",  "5": "2024-01-01" */
  },
  _busy:     false,
  db:        null,
  useDuckDB: false,
  cleanup:   []
};

/* Apply a filter from any panel event */
function applyFilter(fieldId, rawValue) {
  if (rawValue === null || rawValue === '__ALL__') {
    delete state.filters[String(fieldId)];
  } else {
    state.filters[String(fieldId)] = rawValue;
  }
  refresh();
}

/* Clear all filters */
function clearFilters() {
  state.filters = {};
  refresh();
}

/* JS filter implementation */
function filterRowsJS(rows, filters) {
  var keys = Object.keys(filters);
  if (!keys.length) return rows;
  return rows.filter(function(row) {
    return keys.every(function(fid) {
      return row[+fid] === filters[fid];
    });
  });
}

/* Skip own field — keeps all options visible in the panel that owns the filter */
function filterRowsExcluding(rows, filters, excludeFieldId) {
  var keys = Object.keys(filters).filter(function(k) {
    return k !== String(excludeFieldId);
  });
  if (!keys.length) return rows;
  return rows.filter(function(row) {
    return keys.every(function(fid) {
      return row[+fid] === filters[fid];
    });
  });
}
```

---

## §04 — JS-First / DuckDB Async Dispatch

Never block the initial render on DuckDB. Use a single dispatch layer so panels don't
need to know which engine is active.

```js
/* Single query dispatcher — panels call this, not the engine directly */
function queryData(rows, filters, groupCols, metricCols, skipFieldId) {
  if (state.useDuckDB && state.db) {
    /* DuckDB path: returns Promise */
    return runDuckDBQuery(state.db, buildSQL(filters, groupCols, metricCols));
  }
  /* JS fallback path: returns synchronously wrapped in resolved Promise */
  var filtered = skipFieldId != null
    ? filterRowsExcluding(rows, filters, skipFieldId)
    : filterRowsJS(rows, filters);
  return Promise.resolve(groupAndAggregate(filtered, groupCols, metricCols));
}
```

**DuckDB ingest rule:** Batch ingest rows in chunks of 10,000 — do not stream row by row
when the dataset is large.

```js
function ingestData(db, rows) {
  var CHUNK = 10000;
  var inserts = [];
  for (var i = 0; i < rows.length; i += CHUNK) {
    inserts.push(rows.slice(i, i + CHUNK));
  }
  return inserts.reduce(function(p, chunk) {
    return p.then(function() { return db.insertRows('data', chunk); });
  }, Promise.resolve());
}
```

---

## §05 — KPI Card Panel as a Pipeline Participant

A KPI card is not just a display component — it is a full pipeline participant that
re-runs on every filter change.

```
filter state  →  filterRowsJS(data, state.filters)
              →  groupByDimension(filtered, dimCol)   [By-Dimension cards]
                 OR aggregate(filtered, metricCol)     [Total cards — no grouping]
              →  compute current / compare / delta
              →  render card DOM
              →  wire click → applyFilter() or showInteractionMenu()
```

**By-Dimension vs Total:**

| Card type | Grouping | Title pattern | Click payload |
|---|---|---|---|
| By-Dimension | Groups rows by Dimension column | Dimension value label | `{ dimColIdx: rawDimValue }` |
| Total | No grouping — aggregates all filtered rows | `{formattedPeriod} — {metricName}` | `{ metricColIdx: rawTotal }` |

**Comparison pipeline:**

| Comparison type | Source | Delta formula |
|---|---|---|
| Metric 2 | Second MEASURE shelf column | `(current - compare) / compare` |
| Previous period | Date shelf, one period back | `(current - prev) / prev` |
| Previous year | Date shelf, 12 months / 4 quarters back | `(current - prevYear) / prevYear` |

If the comparison period produces no rows → show empty state on the delta, not `Infinity`
or `NaN`. Never substitute all rows as the comparison — see §08 for period rules.

**Card click:**

```js
function onCardClick(event, dimCol, dimRawVal, metricCol, metricRawVal) {
  var payload = {};
  if (dimCol)    payload[idx(dimCol) + 1]    = dimRawVal;    /* 1-based, raw */
  if (metricCol) payload[idx(metricCol) + 1] = metricRawVal; /* 1-based, raw */
  ZAViz_ActionsAPI.showInteractionMenu(payload, {
    pageX: event.pageX, pageY: event.pageY
  });
}
```

---

## §06 — Ghost Bars / Baselines

Show the full-dataset aggregate as a ghost alongside the filtered aggregate.
Gives context: "how much of the total does the filter represent?"

```js
var totalAgg    = groupAndAggregate(data,         dimCol, metricCol);
var filteredAgg = groupAndAggregate(filteredData, dimCol, metricCol);

/* ECharts series */
series: [
  {
    name: 'Total',
    data: totalAgg.map(function(r) { return r.value; }),
    itemStyle: { opacity: 0.25 },
    barGap: '0',
    barCategoryGap: '30%'
  },
  {
    name: 'Filtered',
    data: filteredAgg.map(function(r) { return r.value; }),
    itemStyle: { opacity: 1.0 },
    barGap: '0'
  }
]
```

**Skip-own-field for filter panel options:**
When a filter dropdown renders its own options, compute `visibleRows` excluding that
panel's own field so all values remain selectable, with the active one highlighted:

```js
var visibleRows = filterRowsExcluding(data, state.filters, thisFieldIdx);
var options     = extractUniqueValues(visibleRows, thisFieldIdx);
/* Highlight option if it matches state.filters[thisFieldIdx] */
```

---

## §07 — Mixed-Renderer Panel Layout

When a dashboard combines an ECharts panel with DOM panels (KPI strip, table, filter bar),
the chart MUST be initialized after the flex/grid layout has settled. Initializing before
layout gives width=0 or wrong dimensions.

```
Container (flex-direction: column)
├─ Toolbar / Filter bar    flex: 0 0 auto
├─ KPI strip               flex: 0 0 auto      ← DOM (dom-layout.md §05)
└─ Lower row               flex: 1 1 auto
   ├─ Chart zone           flex: 1 1 auto       ← ECharts init goes here
   └─ Table/sidebar zone   flex: 0 0 300px      ← DOM (dom-layout.md §03)
```

```js
function renderChartPanel(zoneEl, filtered, dims, metrics, theme, state) {
  /* Dispose previous */
  if (state.chartInstance) {
    state.chartInstance.dispose();
    state.chartInstance = null;
  }
  zoneEl.innerHTML = '';

  var chartEl = el('div', 'vz-chart-host', { style: 'width:100%;height:100%;' });
  zoneEl.appendChild(chartEl);

  /* Defer init until after this paint cycle — lets flex resolve dimensions */
  setTimeout(function() {
    var dpr = window.devicePixelRatio || 1;
    var w   = chartEl.clientWidth  || zoneEl.clientWidth  || 600;
    var h   = chartEl.clientHeight || zoneEl.clientHeight || 400;

    var chart = echarts.init(chartEl, null, {
      renderer: 'canvas',
      devicePixelRatio: dpr,
      width:  w,
      height: h
    });
    chart.resize({ width: w, height: h });
    chart.setOption(buildOption(filtered, dims, metrics, theme));

    state.chartInstance = chart;

    /* ResizeObserver for subsequent resizes */
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function() {
        var nw = chartEl.clientWidth  || zoneEl.clientWidth;
        var nh = chartEl.clientHeight || zoneEl.clientHeight;
        if (nw > 0 && nh > 0) chart.resize({ width: nw, height: nh });
      });
      ro.observe(zoneEl);
      state.cleanup.push(function() { ro.disconnect(); });
    }
    state.cleanup.push(function() { chart.dispose(); state.chartInstance = null; });
  }, 0);
}
```

**Rule:** `setTimeout(fn, 0)` is sufficient for flex layout resolution in most browsers.
Only use `requestAnimationFrame` if `clientWidth` is still 0 after the timeout.

---

## §08 — Period Comparison: Missing Period Rule

**Never substitute all rows when a comparison period is missing.**
Returning all rows silently makes the comparison look populated — the delta reads as
a plausible but completely wrong number.

```js
function getPreviousPeriodRows(data, dateColIdx, currentPeriodRaw) {
  /* Get sorted unique periods */
  var periods = [];
  var seen = {};
  data.forEach(function(row) {
    var v = row[dateColIdx];
    if (v != null && !seen[v]) { seen[v] = true; periods.push(v); }
  });
  periods.sort();

  var pos = periods.indexOf(currentPeriodRaw);
  if (pos <= 0) return [];   /* no previous period — return [] */

  var prevRaw = periods[pos - 1];
  return data.filter(function(row) { return row[dateColIdx] === prevRaw; });
}

/* Caller must handle [] gracefully */
var prevRows = getPreviousPeriodRows(data, dateIdx, currentPeriod);
if (!prevRows.length) {
  showEmptyDelta(cardEl, 'No prior period');
  return;
}
```

**MTD — Month-to-Date window:**

```js
/* Returns rows where the day-of-month ≤ todayDay, across all months */
function getMTDRows(data, dateColIdx, todayDay) {
  return data.filter(function(row) {
    var raw = row[dateColIdx];
    if (!raw) return false;
    var d = new Date(raw);
    return d.getDate() <= todayDay;
  });
}
```

**QTD — Quarter-to-Date window:**

```js
/* Returns rows in the equivalent quarter-progress position */
function getQTDRows(data, dateColIdx, currentQuarterStart, currentDayOfQuarter) {
  return data.filter(function(row) {
    var raw = row[dateColIdx];
    if (!raw) return false;
    var d = new Date(raw);
    /* Day 1 of the quarter containing this date */
    var qm = Math.floor(d.getMonth() / 3) * 3;
    var qStart = new Date(d.getFullYear(), qm, 1);
    var dayOfQ = Math.floor((d - qStart) / 86400000) + 1;
    return dayOfQ <= currentDayOfQuarter;
  });
}
```

---

## §09 — 3-Host-Width Responsive Planning

**Plan behavior for all three contexts BEFORE writing any code.**
Do not infer layout from the desktop screenshot alone.

| Context | Typical container width | Required behavior |
|---|---|---|
| Wide dashboard | 900px + | Full grid; 3-column KPI strip; chart + table side by side |
| Medium tile | 480 – 900px | 2-column KPI; chart full width; table below chart |
| Narrow embedded | < 480px | 1-column KPI; chart full width; table hidden or scrollable; suppress non-critical widgets |

```js
function getLayoutMode(containerWidth) {
  if (containerWidth >= 900) return 'wide';
  if (containerWidth >= 480) return 'medium';
  return 'narrow';
}

/* Call in ResizeObserver callback and on first render */
function applyLayoutMode(mode, zones) {
  if (mode === 'wide') {
    zones.lower.style.flexDirection = 'row';
    zones.table.style.display = 'block';
    zones.table.style.width   = '300px';
  } else if (mode === 'medium') {
    zones.lower.style.flexDirection = 'column';
    zones.table.style.display = 'block';
    zones.table.style.width   = '100%';
  } else {
    zones.lower.style.flexDirection = 'column';
    zones.table.style.display = 'none';   /* suppress on narrow */
  }
}
```

**Document the 3-mode behavior in version.txt** so future corrections have a spec to diff against.

---

## §10 — Multi-Panel Performance Rules

**1. Disable animations during filter changes.**
Animating every bar/line re-render on each filter click makes the UI feel sluggish.

```js
function refresh() {
  /* Suppress ECharts animation during filter-driven re-renders */
  var animOff = { animation: false };
  var animOn  = { animation: true };

  /* First render: animate. Subsequent: suppress. */
  var isFirstRender = !state._hasRendered;
  state._hasRendered = true;

  if (state.chartInstance) {
    state.chartInstance.setOption(
      Object.assign({}, buildOption(filtered, dims, metrics, theme),
                    isFirstRender ? animOn : animOff),
      /* notMerge = */ false
    );
  }
}
```

**2. Guard concurrent refreshes.**
DuckDB callbacks and user events can fire simultaneously.

```js
/* Already shown in §01 — use _busy flag */
if (state._busy) return;
state._busy = true;
/* ... render ... */
state._busy = false;
```

**3. Measure canvas/chart dimensions after layout settles.**
Use `setTimeout(fn, 0)` inside `renderChartPanel` (see §07). Never read `clientWidth`
in the same synchronous call that appends the chart element.

**4. Debounce ResizeObserver.**
A rapid sequence of resizes (user dragging a splitter) should not trigger one full
`refresh()` per pixel. Debounce at 60ms (see dom-layout.md §11).

---

## §11 — Security in Multi-Visual

Additional rules beyond the standard Gate 4 checks:

- SQL string interpolation: escape single quotes with `''` — `val.replace(/'/g, "''")`
- Filter state: validate raw values against actual data on each `generateCustomVisual`
  entry — stale filter values from a prior dataset can silently produce empty panels
- `textContent` for all panel label text — `innerHTML` only for structural markup
- DuckDB SQL: never interpolate setting strings directly — validate against an allowlist first

