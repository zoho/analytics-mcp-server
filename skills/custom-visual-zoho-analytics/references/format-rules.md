# Format Rules — Dates, Numbers, Durations

Read this file before writing any label, axis, tooltip, card title, filter, or KPI value.

---

## Call Chain

```text
main.js
  -> ZAViz_Utils.getFormattedValue(1BasedColIdx, raw)   <- always prefer
      -> $ZC.getFormattedValue(colInfo, raw, datatype)  <- fallback when zc.js declared
          -> ZCFormatUtil.formatValue(...)               <- NEVER call directly
```

Standard usage:
  var label = ZAViz_Utils.getFormattedValue(idx(col) + 1, rawValue);

ZC fallback (only when ZAViz_Utils unavailable and zc.js is declared):
  var label = $ZC.getFormattedValue(col[col.datatype], rawValue, col.datatype);

Core rules:
- Index is 1-BASED: idx(col) + 1, never idx(col)
- Use for ALL visible dates, numbers, durations: axes, labels, tooltips, cards, tables, filters
- Auto means platform formatting; do not custom-code K/L/Cr when Auto is selected
- Raw values go to filter logic and showInteractionMenu payloads, never formatted strings

---

## Date Formats

### Hard Rule — getFormattedValue Is the Only Valid Date Formatter

**Every date value displayed to the user MUST pass through `getFormattedValue`.**

This is non-negotiable for all operation types:
YEAR, QUARTER, MONTH, WEEK, WEEKDAY, DATE, HOUR, MINUTE, SECOND — and all fiscal year
and custom start-month configurations.

```js
/* CORRECT — for every date operation type, every time */
var label = ZAViz_Utils.getFormattedValue(idx(dateCol) + 1, rawValue);
```

Why this matters: the platform carries per-column format configuration set by the
Zoho Analytics admin or the report author — this includes fiscal year type
(FY 2024-25 vs 2024-2025), fiscal start month, week numbering convention, locale-specific
date separators, and user-selected date display patterns. None of this is accessible to
main.js. Only `getFormattedValue` knows the active configuration and produces the
correct label. Any logic you write in main.js will be wrong for at least some users.

### What the platform controls — never replicate these

| Operation | Platform-owned variables (partial list) |
|---|---|
| YEAR | Calendar year vs fiscal year; FY label pattern; start month |
| QUARTER | Quarter numbering relative to fiscal start; label style (Q1 2024 vs Apr-Jun 2024) |
| MONTH | Month+year display; locale month names; fiscal month offset |
| WEEK | ISO week vs locale week; week label style |
| WEEKDAY | Full name vs abbreviated; locale day names |
| DATE | Locale date separator; DMY vs MDY vs YMD; time zone |
| HOUR/MINUTE/SECOND | 12h vs 24h; locale AM/PM strings |

The examples in the right column are illustrative only. The actual output depends on
the user's Analytics configuration — never write code that produces or matches
specific label patterns.

### Fiscal-Year Rule (hardest edge case)

Never shift month indices to compute fiscal quarters or fiscal year boundaries in main.js.
All fiscal calendar logic is platform-managed. Even if you know the fiscal start month,
any calculation you perform will diverge from the platform's own grouping once users
change their fiscal settings. Treat fiscal labels as opaque strings produced by `getFormattedValue`.

```js
// WRONG — hardcoded fiscal shift
var fiscalQ = Math.floor(((month - 3 + 12) % 12) / 3) + 1;
var fyLabel  = "FY " + year + "-" + String(year + 1).slice(-2);

// CORRECT — always delegate
var label = ZAViz_Utils.getFormattedValue(idx(dateCol) + 1, rawValue);
```

### Date and Period Rules

| Case | Rule |
|---|---|
| Date filter dropdown | Store { raw, label } - raw for sorting/filtering, label for display |
| Default period | Latest raw value in data |
| Grouped date dimension | Call getFormattedValue before grouping/display, not after |
| Full date filter | Filter raw rows before grouping - never filter on formatted label |
| Missing previous period | Return [] and show empty state - never return all rows as fallback |
| MTD comparison | Day 1..todayDay across every month |
| QTD comparison | Equivalent quarter-progress window across matching quarters |
| Week/year label changes | Match periods by raw timeline value, not label string |
| YYYY-MM detection | Treat as month-only when month portion is 01..12 |
| Timestamp raw values | Dates may arrive as Unix ms - always pass raw to getFormattedValue |
| DIMENSIONAL date columns | datatype may be ordinal or time; guard before numeric operations |

### fmtDim - Date/Dimension Filter Option Pattern

```js
function fmtDim(col, raw) {
  if (raw == null || raw === "") return { raw: raw, label: "" };
  var label = "";
  try { label = String(ZAViz_Utils.getFormattedValue(idx(col) + 1, raw)); } catch(e) {}
  return { raw: raw, label: label || String(raw) };
}

/* Build sorted date filter options */
var options = uniqueRaws.map(function(r) { return fmtDim(dateCol, r); });
options.sort(function(a, b) { return a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0; });
/* Display: option.label  |  Filter/sort/compare: option.raw */
```

---

## Numeric Formats

### Unit Systems

| Unit | Scale | System |
|---|---|---|
| K  | 1,000 | International |
| M  | 1,000,000 | International |
| B  | 1,000,000,000 | International |
| L  | 100,000 | Indian |
| C / Cr | 10,000,000 | Indian |

### Auto Thresholds

| Locale | Tier order (largest first) |
|---|---|
| International | Billion -> Million -> Thousand -> Raw |
| Indian | Crore -> Lakh -> Thousand -> Raw |

Indian grouping (1,00,000) and currency symbols are locale-managed by the platform.
Never reformat in main.js when Auto is selected.

### Composite Unit Mode Strings

Zoho format specs use these shorthand identifiers for tiered unit display:

| Code | Meaning | System |
|---|---|---|
| `KMB` | K/M/B tiered (1K / 1M / 1B) | International |
| `KLC` | K/L/C tiered (1K / 1L / 1Cr) | Indian |
| `A`   | Auto by locale — platform selects KMB or KLC from workspace locale | Both |

When a column's format spec contains one of these codes, `getFormattedValue` applies
the correct tier automatically. Never replicate this logic in main.js.

### KPI Comparison Formatting

| Value | Rule |
|---|---|
| Current / Compare value | getFormattedValue on the source metric column |
| Absolute delta | Format with Metric 1 display rules; preserve sign +/- |
| % delta | Compute from raw numbers; render as signed % string |
| Total card title | "{formatted period} - {Metric 1 name}" - never raw timestamp |
| Layout 2 primary | Show Difference from or % Difference from - never repeat current value |

---

## Duration Formats

| Token | Meaning |
|---|---|
| %D      | days |
| %H      | hours |
| %m      | minutes |
| %s      | seconds |
| %SSS    | milliseconds |
| %SSSSSS | microseconds |

Default display template: %D.%H:%m:%s
Pass raw duration values (ms) to getFormattedValue - platform applies the column template.

---

## Anti-Patterns

```js
// WRONG - bypasses platform formatting
ZCFormatUtil.formatNumber(v)
ZCFormatUtil.formatToLakhs(v)
$ZC.generateFormatSpecifier(...)

// WRONG - 0-based index bug (most common formatting error)
ZAViz_Utils.getFormattedValue(col.dataindex, raw)
ZAViz_Utils.getFormattedValue(idx(col), raw)

// WRONG - custom unit logic when Auto is selected
if (v >= 1e6) return (v/1e6).toFixed(1) + "M";

// WRONG - any custom date construction or fiscal year shift
var fiscalMonth = (month + 3) % 12;
var label = year + "-" + (month < 10 ? "0" + month : month);

// CORRECT
ZAViz_Utils.getFormattedValue(idx(col) + 1, raw)
```
