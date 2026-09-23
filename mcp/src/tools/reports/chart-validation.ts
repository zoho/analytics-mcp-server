import { getChartTypeSuggestions } from "../../utils/charts";

// ─────────────────────────────────────────────────────────────────────────────
// Chart Compatibility Validation Framework
// ─────────────────────────────────────────────────────────────────────────────

/** Compatibility categories as defined in chart compatibility rules */
export type CompatClass = "D" | "A" | "M" | "G" | "unknown";

/**
 * Classifies a column's operation into a compatibility category.
 *
 * D (Dimension): discrete/categorical - string actual, date time-parts, numeric as dimension/range/count
 * A (Aggregate): aggregated value - sum/avg/min/max/count/distinctCount on numeric
 * M (Measure): numeric in measure mode - treated as a continuous numeric value
 * G (Geo): geographic column
 */
export function classifyOperation(operation: string): CompatClass {
  switch (operation) {
    case "actual":
    case "dimension":
    case "year":
    case "month":
    case "week":
    case "day":
    case "hour":
    case "quarter":
    case "weekDay":
    case "fullDate":
    case "dateTime":
    case "range":
    case "monthYear":
    case "quarterYear":
    case "weekYear":
    case "seasonal":
    case "relative":
      return "D";

    case "sum":
    case "average":
    case "min":
    case "max":
    case "count":
    case "distinctCount":
      return "A";

    case "measure":
      return "M";

    case "geo":
      return "G";

    default:
      return "unknown";
  }
}

/** All supported chart type aliases mapped to their canonical compatibility key */
export const CHART_TYPE_ALIASES: Record<string, string> = {
  "bar":                        "bar|horizontalBar",
  "horizontal bar":             "bar|horizontalBar",
  "stacked bar":                "stackedBar|horizontalStackedBar",
  "horizontal stacked bar":     "stackedBar|horizontalStackedBar",
  "line":                       "line|smoothLine|step|area|smoothArea",
  "smooth line":                "line|smoothLine|step|area|smoothArea",
  "step":                       "line|smoothLine|step|area|smoothArea",
  "area":                       "line|smoothLine|step|area|smoothArea",
  "smooth area":                "line|smoothLine|step|area|smoothArea",
  "stacked area":               "stackedArea|stackedSmoothArea",
  "stacked smooth area":        "stackedArea|stackedSmoothArea",
  "pie":                        "pie|ring|semiPie|semiRing",
  "ring":                       "pie|ring|semiPie|semiRing",
  "semi pie":                   "pie|ring|semiPie|semiRing",
  "semi ring":                  "pie|ring|semiPie|semiRing",
  "funnel":                     "funnel|pyramid",
  "pyramid":                    "funnel|pyramid",
  "butterfly":                  "butterfly",
  "histogram":                  "histogram",
  "scatter":                    "scatter",
  "bubble":                     "bubble|packedBubble",
  "packed bubble":              "bubble|packedBubble",
  "bubble pie":                 "bubblePie",
  "combo":                      "combo|comboBarWithSmoothLine",
  "combo bar with smooth line": "combo|comboBarWithSmoothLine",
  "combo bar smooth line":      "combo|comboBarWithSmoothLine",
  "web":                        "web|webWithFill|webWithoutFill",
  "web with fill":              "web|webWithFill|webWithoutFill",
  "web without fill":           "web|webWithFill|webWithoutFill",
  "heat map":                   "heatMap",
  "map scatter":                "mapScatter|mapFilled",
  "map filled":                 "mapScatter|mapFilled",
  "map bubble":                 "mapBubble",
  "map pie":                    "mapPie|mapBubblePie",
  "map bubble pie":             "mapPie|mapBubblePie",
  "geo heat map":               "geoHeatMap",
  "tree map":                   "treeMap",
  "sunburst":                   "sunburst",
  "sankey":                     "sankey",
  "word cloud":                 "wordCloud",
  "race line":                  "raceLine|raceBar",
  "race bar":                   "raceLine|raceBar",
  "race bubble":                "raceBubble",
  "gantt":                      "gantt",
  "table chart":                "tableChart",
  "map area":                   "mapScatter|mapFilled",
  "area with points":           "line|smoothLine|step|area|smoothArea",
};

export function normalizeChartType(chartType: string): string {
  const lower = chartType.toLowerCase();
  return CHART_TYPE_ALIASES[lower] ?? lower;
}

/** Constraint token from compatibility rules, e.g. "D", "A", "D|A", "MultiA", "Opt" */
type ConstraintToken = string;

export function satisfiesConstraint(classes: CompatClass[], constraint: ConstraintToken): boolean {
  const tokens = constraint.split("|");
  const isOpt = tokens.includes("Opt");
  const nonOptTokens = tokens.filter((t) => t !== "Opt");

  if (classes.length === 0) return isOpt;

  if (nonOptTokens.includes("MultiA")) {
    const aCount = classes.filter((c) => c === "A").length;
    if (aCount >= 2) return true;
  }

  const allowedClasses = nonOptTokens.filter((t) => t !== "MultiA") as CompatClass[];
  if (allowedClasses.length === 0) return isOpt;

  return classes.every((c) => allowedClasses.includes(c));
}

export type ShelfName = "x" | "y" | "color" | "size" | "text" | "tooltip";

export interface AxisColumnInput {
  type: string;
  columnName: string;
  operation: string;
  tableName?: string;
}

export function axisTypeToShelf(axisType: string): ShelfName | null {
  switch (axisType) {
    case "xAxis":     return "x";
    case "yAxis":     return "y";
    case "colorAxis": return "color";
    case "sizeAxis":  return "size";
    case "textAxis":  return "text";
    default:          return null;
  }
}

// Compatibility rules per chart type
const CHART_COMPAT: Record<string, Array<Partial<Record<ShelfName, ConstraintToken>>>> = {
  "pie|ring|semiPie|semiRing": [
    { x: "D", y: "A" },
    { x: "D|A", y: "Opt" },
    { x: "Opt", y: "A|D" },
  ],
  "funnel|pyramid": [
    { x: "D", y: "A" },
    { x: "Opt", y: "A" },
  ],
  "bar|horizontalBar": [
    { x: "D", y: "A|MultiA", color: "D|A|M|Opt" },
    { x: "D|A", y: "Opt" },
    { x: "Opt", y: "D|A" },
    { x: "A", y: "Opt" },
  ],
  "stackedBar|horizontalStackedBar": [
    { x: "D", y: "A", color: "D|A|M" },
    { x: "Opt", y: "D|A", color: "D|A|M" },
    { x: "D|A", y: "Opt", color: "D|A|M" },
  ],
  "butterfly": [
    { x: "D", y: "A", color: "D" },
    { x: "D", y: "MultiA" },
  ],
  "histogram": [
    { x: "D", y: "A|Opt" },
    { x: "Opt", y: "A" },
    { x: "A|Opt", y: "D" },
    { x: "A", y: "Opt" },
  ],
  "line|smoothLine|step|area|smoothArea": [
    { x: "D", y: "A|D|Opt", color: "D|A|M|Opt" },
    { x: "Opt", y: "A|D" },
    { x: "A|D", y: "Opt" },
  ],
  "stackedArea|stackedSmoothArea": [
    { x: "D", y: "A", color: "D|A|M" },
    { x: "D", y: "MultiA" },
  ],
  "scatter": [
    { x: "D", y: "A|D" },
    { x: "A", y: "A|D" },
    { x: "D|A", y: "Opt" },
  ],
  "bubble|packedBubble": [
    { x: "D|A", y: "A|D", size: "A" },
    { x: "D|A", y: "Opt", size: "A", color: "A|D" },
    { x: "Opt", y: "D|A", size: "A", color: "A|D" },
  ],
  "bubblePie": [
    { x: "D", y: "A", size: "A", color: "D" },
    { x: "D", y: "MultiA", size: "A" },
  ],
  "combo|comboBarWithSmoothLine": [
    { x: "D", y: "MultiA" },
    { x: "D", y: "A", color: "D" },
  ],
  "web|webWithFill|webWithoutFill": [
    { x: "D", y: "A", color: "D|Opt" },
  ],
  "heatMap": [
    { x: "D", y: "D", color: "A", size: "Opt" },
  ],
  "mapScatter|mapFilled": [
    { x: "G", y: "A|D|M|Opt" },
  ],
  "mapBubble": [
    { x: "G", y: "A|D|M|Opt", size: "A" },
  ],
  "mapPie|mapBubblePie": [
    { x: "G", y: "A|MultiA", size: "A|Opt", color: "A|D|M|Opt" },
  ],
  "geoHeatMap": [
    { x: "G", y: "A|D|M|Opt" },
  ],
  "treeMap": [
    { x: "D", y: "A|Opt", color: "D|A|M|Opt", size: "A|Opt" },
    { x: "A", y: "D|Opt", color: "D|A|M|Opt", size: "A|Opt" },
    { x: "A|Opt", y: "D", color: "D|A|M|Opt", size: "A|Opt" },
    { x: "D|Opt", y: "A", color: "D|A|M|Opt", size: "A|Opt" },
    { x: "D|Opt", y: "MultiA", size: "A|Opt" },
  ],
  "sunburst": [
    { x: "D", y: "A|M", color: "D", text: "D|Opt", tooltip: "D|Opt" },
  ],
  "sankey": [
    { x: "D", y: "D", text: "A|M",     size: "A|Opt",  tooltip: "A|M|Opt" },
    { x: "D", y: "D", text: "A|M|Opt", size: "A",      tooltip: "A|M|Opt" },
    { x: "D", y: "D", text: "A|M|Opt", size: "A|Opt",  tooltip: "A|M" },
  ],
  "wordCloud": [
    { x: "D",   y: "A|D", color: "A|D|M|Opt", size: "A" },
    { x: "A",   y: "A|D", color: "A|D|M|Opt", size: "A" },
    { x: "D",   y: "Opt", color: "A",          size: "A" },
    { x: "A",   y: "Opt", color: "D",          size: "A" },
    { x: "Opt", y: "D",   color: "A",          size: "A" },
    { x: "Opt", y: "A",   color: "D",          size: "A" },
  ],
  "raceLine|raceBar": [
    { x: "D", y: "A|M", color: "D" },
  ],
  "raceBubble": [
    { x: "A", y: "A", color: "D", size: "A", tooltip: "D" },
  ],
  "gantt": [
    { x: "D", y: "D" },
  ],
};

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates whether the provided axisColumns are compatible with the given chartType.
 * Returns { valid: true } on success, or { valid: false, error: <detailed message> } on failure.
 */
export function validateChartCompatibility(
  chartType: string,
  axisColumns: AxisColumnInput[]
): ValidationResult {
  const normalizedKey = normalizeChartType(chartType);
  const cases = CHART_COMPAT[normalizedKey];

  if (!cases) {
    const suggestions = getChartTypeSuggestions(chartType, CHART_TYPE_ALIASES, 5);
    return {
      valid: false,
      error: suggestions.length
        ? `Given chart type was not found. Did you mean any of the following charts:\n${suggestions
            .map((s) => `- ${s}`)
            .join("\n")}`
        : "Chart type not found.",
    };
  }

  const shelves: Partial<Record<ShelfName, CompatClass[]>> = {};
  for (const col of axisColumns) {
    const shelf = axisTypeToShelf(col.type);
    if (!shelf) continue;
    const cls = classifyOperation(col.operation);
    if (!shelves[shelf]) shelves[shelf] = [];
    shelves[shelf]!.push(cls);
  }

  const allShelves = new Set<ShelfName>();
  for (const caseObj of cases) {
    for (const shelf of Object.keys(caseObj) as ShelfName[]) {
      allShelves.add(shelf);
    }
  }

  for (const caseObj of cases) {
    let caseMatches = true;
    for (const shelf of allShelves) {
      const constraint = caseObj[shelf] ?? "Opt";
      const classes = shelves[shelf] ?? [];
      if (!satisfiesConstraint(classes, constraint)) {
        caseMatches = false;
        break;
      }
    }
    if (caseMatches) return { valid: true };
  }

  const legend: Record<CompatClass, string> = {
    D:       "Dimension (discrete: string 'actual', date time-parts like year/month/week, numeric 'dimension')",
    A:       "Aggregate (sum/average/min/max/count/distinctCount)",
    M:       "Measure (numeric 'measure' - continuous numeric value)",
    G:       "Geo (geographic column)",
    unknown: "Unknown (unrecognized operation)",
  };

  const resolvedLines: string[] = [];
  for (const shelf of allShelves) {
    const cols = shelves[shelf] ?? [];
    if (cols.length === 0) {
      resolvedLines.push(`  - ${shelf}Axis: (empty)`);
    } else {
      const details = cols.map((cls, i) => {
        const op = axisColumns.filter((c) => axisTypeToShelf(c.type) === shelf)[i]?.operation ?? "?";
        return `${cls} [op: "${op}"]`;
      });
      resolvedLines.push(`  - ${shelf}Axis: [${details.join(", ")}]`);
    }
  }

  const caseLines = cases.map((caseObj, i) => {
    const parts = (Object.keys(caseObj) as ShelfName[]).map((s) => `${s}=${caseObj[s]}`);
    const failedShelves: string[] = [];
    for (const shelf of allShelves) {
      const constraint = caseObj[shelf] ?? "Opt";
      const classes = shelves[shelf] ?? [];
      if (!satisfiesConstraint(classes, constraint)) {
        const actual = classes.length === 0 ? "(empty)" : `[${classes.join(", ")}]`;
        failedShelves.push(`${shelf}Axis must be "${constraint}" but got ${actual}`);
      }
    }
    return `  Case ${i + 1}: { ${parts.join(", ")} } - FAILED: ${failedShelves.join("; ")}`;
  });

  const error = [
    `Chart compatibility validation failed for chart type "${chartType}".`,
    "",
    "Resolved axis classifications:",
    ...resolvedLines,
    "",
    "None of the valid configurations matched:",
    ...caseLines,
    "",
    "Legend:",
    `  D = ${legend.D}`,
    `  A = ${legend.A}`,
    `  M = ${legend.M}`,
    `  G = ${legend.G}`,
    "  MultiA = Two or more Aggregate columns on the same axis",
    "  Opt = Optional (may be empty)",
    "",
    "Action: Review your axisColumns and adjust the column types and/or operations so that",
    "at least one of the valid cases above is satisfied.",
  ].join("\n").trim();

  return { valid: false, error };
}
