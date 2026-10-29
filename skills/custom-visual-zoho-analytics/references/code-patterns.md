# Reusable Code Patterns — Zoho Analytics Custom Visuals

Copy these blocks into main.js. Do not rewrite them from scratch — they encode
platform-specific behaviours learned from multiple production visuals.

---

## Standard Helpers

```js
function safeStr(v) { return v == null ? "" : String(v).trim(); }
function safeNum(v) { var n = Number(v); return isFinite(n) ? n : null; }

/* Get setting value with fallback */
function gs(cs, k, d) {
  var v = cs && cs[k];
  return (v === undefined || v === null || v === "") ? d : v;
}

/* Normalize toggle settings (platform may send "true"/"false" strings or 0/1) */
function tog(v, d) {
  if (v === true  || v === "true"  || v === 1) return true;
  if (v === false || v === "false" || v === 0) return false;
  return d;
}
```

---

## Column Resolution

```js
/* Returns all columns assigned to a named drop area, sorted by resolved index */
function colsByBox(md, name) {
  var cols = md && Array.isArray(md.columns) ? md.columns : [];
  return cols.map(function (c, i) {
    var cp = {}; Object.keys(c || {}).forEach(function (k) { cp[k] = c[k]; });
    cp.__metaOrder = i; return cp;
  }).filter(function (c) { return safeStr(c.dropBoxName) === name; })
    .sort(function (a, b) { return idx(a) - idx(b); });
}
function colByBox(md, name) { return colsByBox(md, name)[0] || null; }

/* Resolve column index — fallback chain required for cross-version compatibility */
function idx(col) {
  if (!col) return -1;
  var i = col.dataindex !== undefined ? col.dataindex
        : col.colIndex  !== undefined ? col.colIndex
        : col.columnIndex !== undefined ? col.columnIndex
        : col.__metaOrder;
  return Number.isFinite(+i) ? +i : -1;  /* -1 on bad resolve; never silently use col 0 */
}

/* Read raw value from a data row */
function rowVal(row, col) {
  var i = idx(col);
  return Array.isArray(row) && i >= 0 && i < row.length ? row[i] : null;
}

/* Format value for display — always use this instead of raw values in UI */
function fmtVal(col, raw) {
  if (raw == null || raw === "") return "";
  try {
    if (typeof ZAViz_Utils !== "undefined" && col) {
      var out = String(ZAViz_Utils.getFormattedValue(idx(col) + 1, raw));
      if (out && out !== String(raw)) return out;
    }
  } catch (e) {}
  return safeStr(raw);
}
```

---

## Color Utilities

```js
/* Luminance 0–255 (supports #rrggbb, #rgb, rgba()) */
function luminance(c) {
  var v = safeStr(c);
  if (/^#([0-9a-f]{3})$/i.test(v))
    v = "#" + v.slice(1).split("").map(function (x) { return x + x; }).join("");
  var m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { var n = parseInt(m[1], 16); return (((n>>16)&255)*299+((n>>8)&255)*587+(n&255)*114)/1000; }
  var rm = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(v);
  if (rm) return (parseFloat(rm[1])*299+parseFloat(rm[2])*587+parseFloat(rm[3])*114)/1000;
  return null;
}

function isTransparentColor(v) {
  var s = safeStr(v).toLowerCase();
  if (!s || s === "transparent") return true;
  var m = /^rgba\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/i.exec(s);
  return !!(m && Number(m[1]) === 0);
}

/* Infer dark theme: use bg luminance when available, else infer from fg */
function bgIsDark(bgColor, fg) {
  if (bgColor && !isTransparentColor(bgColor)) {
    var l = luminance(bgColor); return l != null ? l < 128 : false;
  }
  var fl = luminance(safeStr(fg) || "#222"); return fl != null && fl > 150;
}

/* Text contrast: dark blue on light, white on dark */
function contrastText(color) {
  var l = luminance(color); return (l != null && l > 150) ? "#17324d" : "#ffffff";
}

/* Hex with alpha for canvas fillStyle */
function hexToRgba(hex, alpha) {
  var v = safeStr(hex);
  if (/^#([0-9a-f]{3})$/i.test(v))
    v = "#" + v.slice(1).split("").map(function (c) { return c + c; }).join("");
  var m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return hex;
  var n = parseInt(m[1], 16);
  return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+alpha+")";
}

/* HSL conversion — handles #rrggbb AND rgba() strings */
function hexToHsl(hex) {
  var v = safeStr(hex), r, g, b;
  var rm = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i.exec(v);
  if (rm) {
    r = parseFloat(rm[1])/255; g = parseFloat(rm[2])/255; b = parseFloat(rm[3])/255;
  } else {
    if (/^#([0-9a-f]{3})$/i.test(v))
      v = "#" + v.slice(1).split("").map(function (c) { return c+c; }).join("");
    var m = /^#([0-9a-f]{6})$/i.exec(v); if (!m) return null;
    var n = parseInt(m[1], 16);
    r=((n>>16)&255)/255; g=((n>>8)&255)/255; b=(n&255)/255;
  }
  var max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, h=0, s=0, l=(max+min)/2;
  if (d>0) {
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h=((g-b)/d+(g<b?6:0))/6;
    else if (max===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  return { h: h*360, s: s*100, l: l*100 };
}
function hslToHex(h, s, l) {
  h=((h%360)+360)%360; s=Math.max(0,Math.min(100,s))/100; l=Math.max(0,Math.min(100,l))/100;
  var c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), mv=l-c/2, r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
  else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
  function bh(n){return("0"+Math.round((n+mv)*255).toString(16)).slice(-2);}
  return "#"+bh(r)+bh(g)+bh(b);
}
```

---

## Theme

```js
function getTheme() {
  var fg = "#111827", bg = "";
  try {
    if (typeof ZAViz_Utils !== "undefined") {
      fg = ZAViz_Utils.getSuitableStyle("fontColor") || fg;
      bg = ZAViz_Utils.getSuitableStyle("background") || "";  // NOT 'backgroundColor'
    }
  } catch (e) {}
  var dark = bgIsDark(bg, fg);

  /* solidBg: actual dashboard surface for card elevation */
  var solidBg = (bg && !isTransparentColor(bg)) ? bg : (dark ? "#0f172a" : "#f8fafc");

  /* cardBg: solidBg +8L so cards float above column/section tints */
  var cardBg, hsl = hexToHsl(solidBg);
  if (hsl) { cardBg = hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 8, 96)); }
  else      { cardBg = dark ? "#1e293b" : "#ffffff"; }

  var ctrlBg = (bg && !isTransparentColor(bg)) ? bg : (dark ? "#1f2937" : "#ffffff");

  return {
    fg:     fg,
    dark:   dark,
    solidBg: solidBg,
    cardBg:  cardBg,
    muted:   dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)",
    border:  dark ? "rgba(255,255,255,0.12)" : "#e5e7eb",
    grid:    dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    axis:    dark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.15)",
    ctrlBg:  ctrlBg,
    ctrlFg:  dark ? "#f1f5f9" : "#111827",
    tipBg:   dark ? "#1e293b" : "#ffffff",
    tipBdr:  dark ? "rgba(255,255,255,0.12)" : "#e5e7eb"
  };
}

function getLegendColors() {
  try {
    if (typeof ZAViz_Utils !== "undefined") {
      var c = ZAViz_Utils.getSuitableStyle("legendColor");
      if (Array.isArray(c) && c.length) return c;
    }
  } catch (e) {}
  return ["#5470c6","#91cc75","#fac858","#ee6666","#73c0de","#3ba272","#fc8452","#9a60b4"];
}
```

---

## buildSegments — Color-Segmented Line / IBCS Deviation Areas

Shared by Line mode and Area mode. Handles crossing-point interpolation exactly.

```js
/*
 * buildSegments(currentVals, compareVals, aboveColor, belowColor)
 *
 * For each pair i -> i+1:
 *   delta[i] = Current[i] - Compare[i]
 *   Same sign: one segment
 *   Sign flip: split at crossing point:
 *     t       = -delta[i] / (delta[i+1] - delta[i])
 *     xCross  = i + t
 *     yCrossC = Current[i] + t * (Current[i+1] - Current[i])
 *     yCrossR = Compare[i] + t * (Compare[i+1] - Compare[i])
 *     midY    = (yCrossC + yCrossR) / 2   <- clean polygon apex
 *
 * Returns: [{ x0, y0c, y0r, x1, y1c, y1r, color }, ...]
 *   y*c = Current value at that point
 *   y*r = Compare (reference) value at that point
 *   At a crossing point: y0c == y0r == midY
 */
function buildSegments(currentVals, compareVals, aboveColor, belowColor) {
  var segments = [];
  var n = Math.min(currentVals.length, compareVals.length);
  for (var i = 0; i < n - 1; i++) {
    var c0=currentVals[i], c1=currentVals[i+1];
    var r0=compareVals[i], r1=compareVals[i+1];
    if (c0==null||c1==null||r0==null||r1==null) continue;
    var d0=c0-r0, d1=c1-r1;
    if (d0>=0 && d1>=0) {
      segments.push({x0:i,y0c:c0,y0r:r0,x1:i+1,y1c:c1,y1r:r1,color:aboveColor});
    } else if (d0<=0 && d1<=0) {
      segments.push({x0:i,y0c:c0,y0r:r0,x1:i+1,y1c:c1,y1r:r1,color:belowColor});
    } else {
      var t=(-d0)/(d1-d0), xCross=i+t;
      var yCrossC=c0+t*(c1-c0), yCrossR=r0+t*(r1-r0);
      var midY=(yCrossC+yCrossR)/2;
      segments.push({x0:i,y0c:c0,y0r:r0,x1:xCross,y1c:midY,y1r:midY,color:d0>=0?aboveColor:belowColor});
      segments.push({x0:xCross,y0c:midY,y0r:midY,x1:i+1,y1c:c1,y1r:r1,color:d1>=0?aboveColor:belowColor});
    }
  }
  return segments;
}
```

**Line mode** — one 2-point ECharts series per segment:
```js
segments.forEach(function(seg, si) {
  series.push({
    type:"line", name:"__seg_"+si+"__",
    data:[[seg.x0,seg.y0c],[seg.x1,seg.y1c]],
    lineStyle:{color:seg.color,width:lineWidth},
    itemStyle:{color:seg.color},
    showSymbol:false, silent:true, legendHoverLink:false, tooltip:{show:false}
  });
});
```

**Area mode** — overlay canvas polygon per segment (after chart renders):
```js
chart.on("finished", function() {
  // Size overlay canvas to match chart element
  var dpr=window.devicePixelRatio||1;
  overlayCanvas.width=chartEl.clientWidth*dpr;
  overlayCanvas.height=chartEl.clientHeight*dpr;
  overlayCanvas.style.width=chartEl.clientWidth+"px";
  overlayCanvas.style.height=chartEl.clientHeight+"px";
  var ctx=overlayCanvas.getContext("2d");
  ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
  ctx.scale(dpr,dpr);
  // Clip to plot area
  var tl=chart.convertToPixel({gridIndex:0},[0,yMax]);
  var br=chart.convertToPixel({gridIndex:0},[n-1,yMin]);
  ctx.save(); ctx.beginPath();
  ctx.rect(tl[0],tl[1],br[0]-tl[0],br[1]-tl[1]); ctx.clip();
  // Draw each polygon
  segments.forEach(function(seg) {
    try {
      var p00=chart.convertToPixel({gridIndex:0},[seg.x0,seg.y0c]);
      var p10=chart.convertToPixel({gridIndex:0},[seg.x1,seg.y1c]);
      var p11=chart.convertToPixel({gridIndex:0},[seg.x1,seg.y1r]);
      var p01=chart.convertToPixel({gridIndex:0},[seg.x0,seg.y0r]);
      ctx.beginPath();
      ctx.moveTo(p00[0],p00[1]); ctx.lineTo(p10[0],p10[1]);
      ctx.lineTo(p11[0],p11[1]); ctx.lineTo(p01[0],p01[1]);
      ctx.closePath();
      ctx.fillStyle=hexToRgba(seg.color,0.75); ctx.fill();
    } catch(e) {}
  });
  ctx.restore();
});
```

---

## ECharts Lifecycle

```js
/* Dispose on every generateCustomVisual call */
var prev = container.__myState;
if (prev) {
  if (prev.chart) { try { prev.chart.dispose(); } catch(e) {} }
  if (prev.ro)    { try { prev.ro.disconnect(); } catch(e) {} }
}
while (container.firstChild) container.removeChild(container.firstChild);
container.__myState = null;

/* Init with DPR */
var dpr   = window.devicePixelRatio || 1;
var chart = echarts.init(chartEl, null, { renderer:"canvas", devicePixelRatio:dpr });

/* ResizeObserver */
if (typeof ResizeObserver !== "undefined") {
  var ro = new ResizeObserver(function() {
    if (chartEl.clientWidth && chartEl.clientHeight) chart.resize();
  });
  ro.observe(chartWrapper);
  container.__myState = { chart: chart, ro: ro };
}
```

---

## ZAViz_ActionsAPI — Interaction Patterns

Four APIs are available. Choose based on whether you need a context menu or a direct action.
Full API reference and selection guide in `references/api-rules.md` → "ZAViz_ActionsAPI".

### buildClickedData helper

All four APIs share the same payload format. Use this helper to build it consistently:

```js
/**
 * Build a clicked_data / dataPoints payload.
 * cols: array of column objects to include (resolved via idx()).
 * row:  the data row (data[rowIndex]).
 * Returns: { 1: rawVal1, 2: rawVal2, ... }  — 1-based integer keys, raw values.
 */
function buildClickedData(cols, row) {
  var cd = {};
  for (var i = 0; i < cols.length; i++) {
    var ci = idx(cols[i]);
    if (ci >= 0) cd[ci + 1] = row[ci];
  }
  return cd;
}
```

---

### showInteractionMenu — context menu (user chooses action)

Requires click **coordinates** for menu positioning. Use when you want to offer
drill / VUD / explain / filter as options.

```js
chart.on("click", function(params) {
  if (!params || params.data == null) return;
  var xi = Math.round(Array.isArray(params.data) ? params.data[0]
           : (params.data.value ? params.data.value[0] : -1));
  if (xi < 0 || xi >= data.length) return;
  var row = data[xi];
  var cd  = buildClickedData([dimCol, dateCol, metricCol], row);
  try {
    var ev = params.event && params.event.event;
    ZAViz_ActionsAPI.showInteractionMenu(cd, { x: ev ? ev.pageX : 0, y: ev ? ev.pageY : 0 });
  } catch(e) {}
});
```

---

### invokeViewUnderlyingData — direct VUD

Fires immediately — no context menu. Use for a dedicated "View Data" icon/button.
No coordinates needed.

```js
element.addEventListener("click", function(e) {
  e.stopPropagation();
  var cd = buildClickedData([dimCol, dateCol, metricCol], row);
  try { ZAViz_ActionsAPI.invokeViewUnderlyingData(cd); } catch(e2) {}
});
```

---

### invokeExplainData — direct AI explain

Fires immediately. Use for a dedicated "Explain" icon/button on a KPI card or chart element.

```js
explainBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  var cd = buildClickedData([dimCol, metricCol], row);
  try { ZAViz_ActionsAPI.invokeExplainData(cd); } catch(e2) {}
});
```

---

### invokeDrillThrough — direct drill to named view

Navigates to `view_name` immediately. Use when you have a known fixed drill destination.
`view_name` must be the **exact** Zoho Analytics view / report name (case-sensitive).

```js
card.addEventListener("click", function(e) {
  var cd = buildClickedData([dimCol, dateCol, metricCol], row);
  try { ZAViz_ActionsAPI.invokeDrillThrough(cd, "Sales Detail Report"); } catch(e2) {}
});
```

---

### Multi-action card pattern

KPI cards often need both a drill action and a VUD/explain icon:

```js
function wireCardInteractions(card, row, dimCol, dateCol, metricCol) {
  var cd = buildClickedData([dimCol, dateCol, metricCol], row);

  // Main card click → context menu (user picks action)
  card.addEventListener("click", function(e) {
    if (e.target.classList.contains("za-action-icon")) return;
    try {
      ZAViz_ActionsAPI.showInteractionMenu(cd, { x: e.pageX, y: e.pageY });
    } catch(err) {}
  });

  // VUD icon → direct View Underlying Data
  var vudIcon = card.querySelector(".za-vud-icon");
  if (vudIcon) {
    vudIcon.addEventListener("click", function(e) {
      e.stopPropagation();
      try { ZAViz_ActionsAPI.invokeViewUnderlyingData(cd); } catch(err) {}
    });
  }

  // Explain icon → direct AI Explain
  var explainIcon = card.querySelector(".za-explain-icon");
  if (explainIcon) {
    explainIcon.addEventListener("click", function(e) {
      e.stopPropagation();
      try { ZAViz_ActionsAPI.invokeExplainData(cd); } catch(err) {}
    });
  }
}
```

---

## Root CSS Pattern

```js
root.style.cssText = [
  "width:100%;height:100%;margin:0;padding:0;box-sizing:border-box;",
  "background:transparent;display:flex;flex-direction:column;overflow:hidden;",
  "font-family:system-ui,-apple-system,Roboto,Arial,sans-serif;"
].join("");
```

Root and card backgrounds are **transparent** — the parent dashboard owns the surface.
Only filter/select controls need a solid `ctrlBg` for readability.

---

## DuckDB-WASM Pipeline

Use when the visual needs SQL-level filtering, GROUP BY, window functions, or running totals.

**Manifest dependency:**
```json
"dependencies": [
  "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1-dev106.0/dist/duckdb-browser-mvp.wasm",
  "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1-dev106.0/dist/duckdb-browser.js"
]
```

Or use the jsdelivr bundle (simpler for single-file usage):
```json
"dependencies": [
  "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.wasm",
  "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/duckdb-browser.js"
]
```

**Initialization and query pattern (ES5 compatible, Promise-based):**

```js
/*
 * initDuckDB()
 * Initialises a DuckDB-WASM instance. Returns a Promise that resolves to a db handle.
 * Call once; store result on container.__state.db for reuse.
 */
function initDuckDB() {
  return new Promise(function(resolve, reject) {
    try {
      var duckdb = window.duckdb;
      var JSDELIVR = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm/dist/";
      var bundles = {
        mvp: { mainModule: JSDELIVR + "duckdb-browser-mvp.wasm",
               mainWorker: JSDELIVR + "duckdb-browser-mvp-eh.worker.js" },
        eh:  { mainModule: JSDELIVR + "duckdb-browser-eh.wasm",
               mainWorker: JSDELIVR + "duckdb-browser-eh.worker.js" }
      };
      duckdb.selectBundle(bundles).then(function(bundle) {
        var workerUrl = URL.createObjectURL(
          new Blob(["importScripts('" + bundle.mainWorker + "');"],
                   {type: "text/javascript"})
        );
        var worker = new Worker(workerUrl);
        var logger = new duckdb.ConsoleLogger();
        var db = new duckdb.AsyncDuckDB(logger, worker);
        db.instantiate(bundle.mainModule, bundle.pthreadWorker).then(function() {
          resolve(db);
        }).catch(reject);
      }).catch(reject);
    } catch(e) { reject(e); }
  });
}

/*
 * queryData(db, rows, cols, sql)
 * Loads raw rows into a DuckDB table named 'data', runs sql, returns result rows.
 *   rows  : the data array from generateCustomVisual
 *   cols  : array of { name, type } — type is "VARCHAR" | "DOUBLE" | "DATE"
 *   sql   : SQL string that SELECTs from 'data'
 * Returns a Promise that resolves to an array of plain objects (column name → value).
 */
function queryData(db, rows, cols, sql) {
  return db.connect().then(function(conn) {
    // Build CREATE TABLE
    var colDefs = cols.map(function(c) {
      return '"' + c.name.replace(/"/g,"") + '" ' + c.type;
    }).join(", ");
    return conn.query("DROP TABLE IF EXISTS data").then(function() {
      return conn.query("CREATE TABLE data (" + colDefs + ")");
    }).then(function() {
      // Insert rows in batches of 500
      var BATCH = 500;
      function insertBatch(i) {
        if (i >= rows.length) return Promise.resolve();
        var batch = rows.slice(i, i + BATCH);
        var values = batch.map(function(row) {
          return "(" + cols.map(function(c, ci) {
            var v = Array.isArray(row) ? row[ci] : row[c.name];
            if (v == null || v === "") return "NULL";
            if (c.type === "VARCHAR") return "'" + String(v).replace(/'/g,"''") + "'";
            return String(v);
          }).join(", ") + ")";
        }).join(", ");
        return conn.query("INSERT INTO data VALUES " + values).then(function() {
          return insertBatch(i + BATCH);
        });
      }
      return insertBatch(0);
    }).then(function() {
      return conn.query(sql);
    }).then(function(result) {
      // Convert Arrow table to plain objects
      var out = [];
      var schema = result.schema.fields.map(function(f) { return f.name; });
      for (var i = 0; i < result.numRows; i++) {
        var obj = {};
        schema.forEach(function(name, ci) {
          obj[name] = result.getChildAt(ci).get(i);
        });
        out.push(obj);
      }
      return conn.close().then(function() { return out; });
    });
  });
}
```

**Usage example — period comparison query:**

```js
/* Inside generateCustomVisual, after resolving cols: */
initDuckDB().then(function(db) {
  container.__myState.db = db;
  var cols = [
    { name: "period", type: "VARCHAR" },
    { name: "metric", type: "DOUBLE"  }
  ];
  var sql = [
    "SELECT period, metric,",
    "  LAG(metric, 1) OVER (ORDER BY period) AS prev_metric,",
    "  metric - LAG(metric, 1) OVER (ORDER BY period) AS delta",
    "FROM data",
    "ORDER BY period"
  ].join(" ");
  return queryData(db, data, cols, sql);
}).then(function(rows) {
  renderChart(container, rows, theme);
}).catch(function(e) {
  console.warn("DuckDB fallback: ", e);
  renderChart(container, data, theme);  // degrade gracefully
});
```

> Always add a `.catch()` that degrades gracefully to plain-JS rendering — DuckDB-WASM
> may not load in every Analytics environment.

---

## D3.js Render Pattern

Use D3 when bespoke geometry, force simulation, geographic, or custom SVG is needed.

```js
function renderD3(container, rows, theme) {
  var dpr = window.devicePixelRatio || 1;
  var w = container.clientWidth  || 800;
  var h = container.clientHeight || 450;

  /* Remove previous SVG if present */
  var prev = container.querySelector("svg.__d3viz");
  if (prev) prev.parentNode.removeChild(prev);

  var svg = d3.select(container).append("svg")
    .attr("class", "__d3viz")
    .attr("width", w).attr("height", h)
    .style("background", "transparent");

  /* Build scales */
  var xScale = d3.scaleBand()
    .domain(rows.map(function(r) { return r.label; }))
    .range([60, w - 20]).padding(0.2);

  var yScale = d3.scaleLinear()
    .domain([0, d3.max(rows, function(r) { return r.value; })])
    .range([h - 40, 20]);

  /* Axes */
  svg.append("g").attr("transform", "translate(0," + (h - 40) + ")")
    .call(d3.axisBottom(xScale))
    .selectAll("text").style("fill", theme.fg);

  svg.append("g").attr("transform", "translate(60,0)")
    .call(d3.axisLeft(yScale))
    .selectAll("text").style("fill", theme.fg);

  /* Bars */
  var colors = getLegendColors();
  svg.selectAll(".bar").data(rows).enter().append("rect")
    .attr("class", "bar")
    .attr("x", function(d) { return xScale(d.label); })
    .attr("y", function(d) { return yScale(d.value); })
    .attr("width", xScale.bandwidth())
    .attr("height", function(d) { return (h - 40) - yScale(d.value); })
    .attr("fill", function(d, i) { return colors[i % colors.length]; })
    .on("click", function(event, d) {
      ZAViz_ActionsAPI.showInteractionMenu(d.payload,
        { x: event.pageX, y: event.pageY });
    });
}
```

**D3 lifecycle on re-render:**
- Remove previous SVG with the sentinel class (`.__d3viz`) at top of render
- No external dispose needed — just DOM removal

---

## Vega-Lite Pattern

Use for faceted views, statistical charts, or when a declarative spec is cleaner.

```js
function renderVegaLite(container, rows, theme, settings) {
  /* Remove previous vega container */
  var prev = container.querySelector(".__vega-wrap");
  if (prev) prev.parentNode.removeChild(prev);

  var wrap = document.createElement("div");
  wrap.className = "__vega-wrap";
  wrap.style.cssText = "width:100%;height:100%;";
  container.appendChild(wrap);

  var spec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
    "width": "container",
    "height": "container",
    "background": "transparent",
    "config": {
      "axis":   { "labelColor": theme.fg, "titleColor": theme.fg,
                  "gridColor": theme.grid, "domainColor": theme.axis },
      "legend": { "labelColor": theme.fg, "titleColor": theme.fg },
      "view":   { "stroke": "transparent" }
    },
    "data": { "values": rows },
    "mark": { "type": "bar", "color": getLegendColors()[0] },
    "encoding": {
      "x": { "field": "label", "type": "ordinal",  "title": null },
      "y": { "field": "value", "type": "quantitative", "title": null },
      "tooltip": [
        { "field": "label", "type": "ordinal" },
        { "field": "value", "type": "quantitative" }
      ]
    }
  };

  vegaEmbed(wrap, spec, {
    renderer: "svg",
    actions: false,
    theme: theme.dark ? "dark" : "excel"
  }).then(function(result) {
    /* Store view for cleanup */
    container.__myState.vegaView = result.view;
    /* Wire interactions */
    result.view.addEventListener("click", function(event, item) {
      if (!item || !item.datum) return;
      var dp = {};
      /* build raw payload from item.datum */
      ZAViz_ActionsAPI.showInteractionMenu(dp,
        { x: event.clientX, y: event.clientY });
    });
  });
}

/* In dispose block at top of generateCustomVisual: */
// if (prev && prev.vegaView) { try { prev.vegaView.finalize(); } catch(e) {} }
```

> Vega-Lite `"width":"container"` auto-fills the parent. Wire `ResizeObserver` to call
> `view.resize()` — not `view.initialize()`.

---

## isPlottable Guard

Prevents date and dimension columns from being rendered as numeric series.
Apply before every series-building loop when columns are auto-detected from shelves.

```js
function isPlottable(col, dateColIdx) {
  return col.datatype === "numeric" && idx(col) !== dateColIdx;
}

/* Usage — auto-detected series loop */
var dateColIdx = dateCol ? idx(dateCol) : -1;
var series = [];
for (var i = 0; i < measureCols.length; i++) {
  if (!isPlottable(measureCols[i], dateColIdx)) continue;
  series.push(buildSeries(measureCols[i], data));
}
if (series.length === 0) {
  container.innerHTML = "<div style='padding:16px'>No numeric columns to display</div>";
  return;
}
```

---

## encodeHTML

Use when rendering user data inside innerHTML to prevent XSS.

```js
function encodeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Usage */
el.innerHTML = "<span class='label'>" + encodeHTML(rawValue) + "</span>";
```

---

## Library CDN URLs

Add to `ZAViz_Manifest.json` `"libraries"` array as needed.

| Library | CDN URL | Notes |
|---|---|---|
| ECharts 5 | `https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js` | Default chart library |
| D3 v7 | `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js` | Bespoke/custom geometry |
| Vega | `https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js` | Full declarative spec |
| Vega-Lite | `https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js` | Statistical / faceted |
| Vega-Embed | `https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js` | Required with Vega-Lite |
| DuckDB-WASM | `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-browser.js` | In-browser SQL engine |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` | Lightweight charts |
| Plotly | `https://cdn.plot.ly/plotly-3.0.0.min.js` | Scientific / 3D / statistical |
| Three.js | `https://cdn.jsdelivr.net/npm/three@0.168/build/three.min.js` | 3D rendering |
| Highcharts | `https://code.highcharts.com/highcharts.js` | **Load before modules** (see note) |
| Cytoscape | `https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js` | Network graphs |
| Leaflet | `https://cdn.jsdelivr.net/npm/leaflet@1/dist/leaflet.js` | Maps (static/local tiles only) |
| Billboard.js | `https://cdn.jsdelivr.net/npm/billboard.js@3/dist/billboard.pkgd.min.js` | Chart.js alternative |
| Observable Plot | `https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/dist/plot.umd.min.js` | Requires D3 as peer |

**Library dependency notes:**
- **Highcharts**: core (`highcharts.js`) must be declared first in `dependencies`; then add module URLs (e.g. `highcharts/modules/exporting.js`). Reverse order causes silent failures.
- **Observable Plot**: requires D3 v7 declared before it in `dependencies`.
- **Cytoscape DAG layout**: requires the dagre layout plugin (`cytoscape-dagre.js`) declared after Cytoscape.
- **Vega-Lite**: always declare Vega, then Vega-Lite, then Vega-Embed in that order.

---

## Filter Component — Full Pattern

### Core Rules

1. **Never call `generateCustomVisual` from a filter event.** The platform owns that entry point. User interaction must call an internal `renderChart()` function instead.
2. **Filter state lives on `container.__myState.filters`** — persists across platform re-renders.
3. **Filter always operates on raw rows before any aggregation.** `WHERE → GROUP BY → AGGREGATE → FORMAT → RENDER`.
4. **Every visible filter label comes from `getFormattedValue`.** Never show raw values to the user.

---

### Filter State — Persist and Validate Across Re-renders

```js
function generateCustomVisual(container, data, metaData) {
  /* Restore previous state or initialise fresh */
  var prev = container.__myState || {};
  var state = {
    filters:  prev.filters  || {},  /* { fieldId: rawValue | null } */
    selected: prev.selected || {}   /* { fieldId: Set of raw values (multi-select) } */
  };

  /* Validate: drop filter values that no longer exist in new data */
  Object.keys(state.filters).forEach(function(fid) {
    var savedRaw = state.filters[fid];
    if (savedRaw === null) return;  /* null = "All" — always valid */
    var colIdx = /* resolve index for fid */;
    var exists = data.some(function(row) { return row[colIdx] === savedRaw; });
    if (!exists) {
      delete state.filters[fid];    /* stale value — reset to default */
    }
  });

  /* Persist updated state */
  container.__myState = state;

  /* ... rest of setup ... */
  renderChart(container, data, metaData, state);
}

/* Internal render — called by both initial render and filter changes */
function renderChart(container, data, metaData, state) {
  var filtered = applyFilters(data, state.filters);
  /* GROUP BY → AGGREGATE → FORMAT → RENDER on filtered */
}
```

---

### Unique Option Extraction

Build the option list for a filter dropdown from the live data set.

```js
function extractFilterOptions(data, col) {
  var seen = {};
  var uniqueRaws = [];
  data.forEach(function(row) {
    var raw = row[idx(col)];
    var key = (raw == null) ? "__NULL__" : String(raw);
    if (!seen[key]) { seen[key] = true; uniqueRaws.push(raw); }
  });

  /* Sort by raw value (chronological for dates, lexical for dimensions) */
  uniqueRaws.sort(function(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  /* Build {raw, label} pairs; null → "(Blank)" */
  return uniqueRaws.map(function(raw) {
    if (raw == null) return { raw: null, label: "(Blank)" };
    return fmtDim(col, raw);
  });
}
```

---

### Filter Pipeline — AND Logic Across Fields

```js
/* Single-select: one active value per field */
function applyFilters(rows, filters) {
  return rows.filter(function(row) {
    return Object.keys(filters).every(function(fid) {
      var active = filters[fid];
      if (active === null) return true;       /* null = "All" — field not filtered */
      var colIdx = parseInt(fid, 10);
      return row[colIdx] === active;
    });
  });
}

/* Multi-select: Set of active values per field (OR within field, AND across fields) */
function applyMultiFilters(rows, multiFilters) {
  /* multiFilters: { fieldIdx: Set | null } */
  return rows.filter(function(row) {
    return Object.keys(multiFilters).every(function(fid) {
      var activeSet = multiFilters[fid];
      if (!activeSet || activeSet.size === 0) return true;  /* "All" selected */
      return activeSet.has(row[parseInt(fid, 10)]);
    });
  });
}
```

---

### Filter Dropdown — Render and Wire

```js
function buildFilterControl(container, col, options, state, onchange) {
  /* Guard: hide if shelf has no column */
  if (!col) return null;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;flex-shrink:0;';

  var lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:12px;white-space:nowrap;';
  lbl.textContent = col.columnName || '';

  var sel = document.createElement('select');
  sel.style.cssText = 'font-size:12px;flex:1;min-width:0;max-width:160px;';

  /* "All" option */
  var allOpt = document.createElement('option');
  allOpt.value = '__ALL__';
  allOpt.textContent = 'All';
  sel.appendChild(allOpt);

  options.forEach(function(opt) {
    var el = document.createElement('option');
    el.value = (opt.raw == null) ? '__NULL__' : String(opt.raw);
    el.textContent = encodeHTML(opt.label);
    sel.appendChild(el);
  });

  /* Restore saved selection */
  var saved = state.filters[idx(col)];
  sel.value = (saved == null) ? '__ALL__'
            : (saved === null) ? '__NULL__'
            : String(saved);

  /* Wire: update state and call internal re-render — NEVER call generateCustomVisual */
  sel.addEventListener('change', function() {
    var v = sel.value;
    if (v === '__ALL__') {
      delete state.filters[idx(col)];
    } else if (v === '__NULL__') {
      state.filters[idx(col)] = null;
    } else {
      /* Coerce back to original type */
      var match = options.find(function(o) { return String(o.raw) === v; });
      state.filters[idx(col)] = match ? match.raw : v;
    }
    onchange();  /* calls renderChart() — not generateCustomVisual */
  });

  wrap.appendChild(lbl);
  wrap.appendChild(sel);
  container.appendChild(wrap);
  return wrap;
}
```

---

### Filter Height Reservation

When a filter bar sits above the chart, subtract its height from the chart container:

```js
var filterBar = buildFilterBar(container, cols, state, function() {
  renderChart(container, data, metaData, state);
});
var filterHeight = filterBar ? filterBar.offsetHeight : 0;

var chartWrap = document.createElement('div');
chartWrap.style.cssText =
  'width:100%;height:calc(100% - ' + filterHeight + 'px);overflow:hidden;';
container.appendChild(chartWrap);
/* Pass chartWrap (not container) to echarts.init / D3 / Vega */
```

---

### Filter Reset / Clear All

```js
function clearAllFilters(state, renderFn) {
  state.filters = {};
  renderFn();
}

/* Wire to a "Clear" button */
clearBtn.addEventListener('click', function() {
  clearAllFilters(state, function() {
    renderChart(container, data, metaData, state);
  });
});
```

---

### DuckDB SQL Filter — Safe String Escaping

When building SQL WHERE clauses from filter values, escape single quotes:

```js
function sqlLiteral(val) {
  if (val == null) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/* Build WHERE clause from active filters */
function buildWhereClause(filters, colMap) {
  var conditions = Object.keys(filters).map(function(fid) {
    var colName = colMap[fid];  /* column name in DuckDB table */
    var val = filters[fid];
    if (val == null) return '"' + colName + '" IS NULL';
    return '"' + colName + '" = ' + sqlLiteral(val);
  });
  return conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
}

var sql = 'SELECT * FROM data ' + buildWhereClause(state.filters, colNameMap);
var result = await conn.query(sql);
```

---

## Drop Area as Analytical Auto-Filter

Any DIMENSIONAL or DATE shelf that has a column dropped should be considered a **potential in-visual filter source** — not just a grouping/display axis.

This is the BI analyst pattern: when a user drops a Date or Dimension column onto a shelf, their intent is to **slice the data by it**, not merely display it. A period selector or category filter emerges naturally from any such column without requiring a dedicated "Filter" shelf in the manifest.

### Auto-Filter Decision Rule

```text
For each resolved DIMENSIONAL or DATE column:
  → Does it have ≥ 2 distinct values in the data?
  → Would filtering by it answer a meaningful analytical question?
  → If YES to both → render a filter control from this column automatically
```

### Implementation Pattern

```js
/* After resolving all columns, identify auto-filter candidates */
function getAutoFilterCols(metaCols, data) {
  return metaCols.filter(function(col) {
    if (col.datatype === 'numeric') return false;  /* metrics never auto-filter */
    /* Only if the column has more than one distinct value */
    var seen = {};
    var count = 0;
    for (var i = 0; i < data.length; i++) {
      var raw = data[i][idx(col)];
      var key = (raw == null) ? '__NULL__' : String(raw);
      if (!seen[key]) { seen[key] = true; count++; }
      if (count > 1) return true;
    }
    return false;
  });
}

var filterCols = getAutoFilterCols(metaData.columns, data);
/* Render one filter control per candidate column */
filterCols.forEach(function(col) {
  var options = extractFilterOptions(data, col);
  buildFilterControl(filterBar, col, options, state, function() {
    renderChart(container, data, metaData, state);
  });
});
```

### Shelf Candidate Mapping

| Shelf type | Auto-filter? | Default selection |
|---|---|---|
| Date / time column | Always — enables period selection | Latest raw period |
| Primary Dimension | Always — enables category filter | All (no filter) |
| Secondary Dimension | When ≥ 2 values exist | All (no filter) |
| Measure / Numeric | Never | N/A |
| Tooltip-only shelf | Never — context only, not filter-driving | N/A |

### BI Analyst Reasoning (document in planning notes)

When planning Phase 1, write down for each drop area:
- "Is this a filter source?" — if DIMENSIONAL or DATE, the answer is almost always yes
- "What is the default state?" — latest for date, all for dimensions
- "Should it be single-select or multi-select?" — date = single, dimension = configurable

> This avoids the common anti-pattern of adding a separate "Filter" shelf in the manifest
> for data that is already accessible through existing dimension/date shelves.

---

## ECharts Explicit Init — Dimensions + DPR

Always pass explicit `width`, `height`, and `devicePixelRatio` to `echarts.init`.
Without explicit dimensions, ECharts reads the element before flex layout settles and
may get `clientWidth = 0`, producing a collapsed chart.

```js
function initECharts(chartEl, containerEl) {
  var dpr = window.devicePixelRatio || 1;
  /* Fallback chain: chart element → parent container → safe default */
  var w   = chartEl.clientWidth   || containerEl.clientWidth   || 800;
  var h   = chartEl.clientHeight  || containerEl.clientHeight  || 450;

  var chart = echarts.init(chartEl, null, {
    renderer:        'canvas',
    devicePixelRatio: dpr,
    width:            w,
    height:           h
  });

  /* Explicit resize after init keeps internal layout in sync */
  chart.resize({ width: w, height: h });
  return chart;
}
```

**When clientWidth is still 0 after `setTimeout(fn, 0)`** (rare — happens when the
containing flex item has no explicit size yet), use `requestAnimationFrame`:

```js
requestAnimationFrame(function() {
  var w = chartEl.clientWidth || 800;
  var h = chartEl.clientHeight || 450;
  chart.resize({ width: w, height: h });
});
```

---

## displayValue — Safe Formatted Value Helper

Always use this wrapper instead of calling `getFormattedValue` directly. It guards against:
- `getFormattedValue` throwing on malformed raw values
- `idx(col)` returning -1 (unresolved column)
- `null` / `undefined` raw values

```js
/**
 * Safe display wrapper for all visible values.
 * Use for: labels, axes, tooltips, card values, table cells, filter labels.
 * Never pass raw values directly to the UI — always go through displayValue().
 */
function displayValue(col, raw) {
  var i = idx(col);
  try {
    if (i >= 0) return ZAViz_Utils.getFormattedValue(i + 1, raw);
  } catch(e) { /* fall through */ }
  return raw != null ? String(raw) : '';
}

/* Dimension-safe variant — DIMENSIONAL columns may carry timestamps */
function displayDim(col, raw) {
  return displayValue(col, raw);   /* same logic — getFormattedValue handles date dims too */
}

/* Usage examples */
var label   = displayValue(dimCol,    row[idx(dimCol)]);    /* category label */
var metric  = displayValue(metricCol, row[idx(metricCol)]); /* numeric KPI value */
var dateStr = displayValue(dateCol,   row[idx(dateCol)]);   /* date — even if col is DIMENSIONAL */
```

**Rule:** `displayValue` is for everything shown to the user. `raw` values go only into
`showInteractionMenu` payloads, filter state, and sort/group keys — never into displayed text.

---

## Native Canvas DPR Init

For D3, custom drawing, or any visual that uses a raw `<canvas>` element (not echarts/chart.js).

```js
function initNativeCanvas(canvasEl, containerEl) {
  var dpr = window.devicePixelRatio || 1;
  var w   = canvasEl.clientWidth  || containerEl.clientWidth  || 800;
  var h   = canvasEl.clientHeight || containerEl.clientHeight || 450;

  /* Bitmap size = CSS size × DPR */
  canvasEl.width  = w * dpr;
  canvasEl.height = h * dpr;

  /* CSS size stays at logical pixels */
  canvasEl.style.width  = w + 'px';
  canvasEl.style.height = h + 'px';

  var ctx = canvasEl.getContext('2d');
  /* Scale all drawing operations to match DPR */
  ctx.scale(dpr, dpr);

  return { ctx: ctx, w: w, h: h, dpr: dpr };
}

/* Usage — call after layout settles (setTimeout or rAF) */
setTimeout(function() {
  var cv = initNativeCanvas(canvasEl, zoneEl);
  drawChart(cv.ctx, cv.w, cv.h, data);
}, 0);
```

**Clip host to prevent canvas overflow:**
If a library (D3, custom canvas) paints before flex layout has fully settled, the canvas
may render at incorrect dimensions and bleed outside its container. Guard with:

```css
.vz-canvas-host {
  overflow: hidden;   /* clips any overflow while layout settles */
  position: relative;
}
```

**On resize:**
```js
function resizeNativeCanvas(canvasEl, containerEl, redrawFn) {
  var dpr = window.devicePixelRatio || 1;
  var w   = containerEl.clientWidth;
  var h   = containerEl.clientHeight;
  if (!w || !h) return;
  canvasEl.width  = w * dpr;
  canvasEl.height = h * dpr;
  canvasEl.style.width  = w + 'px';
  canvasEl.style.height = h + 'px';
  var ctx = canvasEl.getContext('2d');
  ctx.scale(dpr, dpr);
  redrawFn(ctx, w, h);
}
```

---

## Period Comparison Helpers

### Previous Period — Missing Period Rule

**Never return all rows when a comparison period has no data.**
Returning all rows as a fallback makes the delta appear valid while being completely wrong.

```js
function getPreviousPeriodRows(data, dateColIdx, currentPeriodRaw) {
  var seen = {}, periods = [];
  data.forEach(function(row) {
    var v = row[dateColIdx];
    if (v != null && !seen[v]) { seen[v] = true; periods.push(v); }
  });
  periods.sort();

  var pos = periods.indexOf(currentPeriodRaw);
  if (pos <= 0) return [];   /* no previous — caller must handle [] */

  var prevRaw = periods[pos - 1];
  return data.filter(function(row) { return row[dateColIdx] === prevRaw; });
}

/* Caller pattern */
var prevRows = getPreviousPeriodRows(data, dateIdx, currentRaw);
if (!prevRows.length) {
  /* Show empty delta — never substitute all rows */
  deltaEl.textContent = '—';
  return;
}
var prevAgg = aggregate(prevRows, metricIdx);
var delta   = (currentAgg - prevAgg) / Math.abs(prevAgg || 1);
```

### MTD — Month-to-Date

Returns rows for all months where the day-of-month ≤ todayDay.
Use when comparing the current partial month against the same partial window of prior months.

```js
function getMTDRows(data, dateColIdx, todayDay) {
  return data.filter(function(row) {
    var raw = row[dateColIdx];
    if (raw == null) return false;
    var d = new Date(raw);
    return !isNaN(d) && d.getDate() <= todayDay;
  });
}

/* Usage: compare March 1–15 vs Feb 1–15 vs Jan 1–15 */
var today    = new Date();
var mtdRows  = getMTDRows(data, dateIdx, today.getDate());
```

### QTD — Quarter-to-Date

Returns rows in the equivalent quarter-progress position across all quarters.
Use when comparing the current partial quarter against the same progress point of prior quarters.

```js
function dayOfQuarter(d) {
  var qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  var qStart = new Date(d.getFullYear(), qStartMonth, 1);
  return Math.floor((d - qStart) / 86400000) + 1;
}

function getQTDRows(data, dateColIdx, currentDayOfQuarter) {
  return data.filter(function(row) {
    var raw = row[dateColIdx];
    if (raw == null) return false;
    var d = new Date(raw);
    return !isNaN(d) && dayOfQuarter(d) <= currentDayOfQuarter;
  });
}

/* Usage */
var currentDoQ = dayOfQuarter(new Date());
var qtdRows    = getQTDRows(data, dateIdx, currentDoQ);
```

### Previous Year Same Period

```js
function getPreviousYearRows(data, dateColIdx, currentYear) {
  return data.filter(function(row) {
    var raw = row[dateColIdx];
    if (raw == null) return false;
    var d = new Date(raw);
    return !isNaN(d) && d.getFullYear() === currentYear - 1;
  });
}
```

**Key rule across all period helpers:** Display values use `getFormattedValue`. Sorting,
filtering, and grouping always use the raw value — never the formatted label.

