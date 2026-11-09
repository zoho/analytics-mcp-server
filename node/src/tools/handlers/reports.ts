import { z } from "zod";
import { getAnalyticsClient } from '../../utils/apiUtil';
import { requireOrgId, ToolResponse, logAndReturnError, buildReportLinkResponse } from "../../utils/common";
import { getChartTypeSuggestions } from "../../utils/charts";
import dedent from "dedent";
import { PRODUCT_NAME } from "../../config/product";

// ─────────────────────────────────────────────────────────────────────────────
// Chart Compatibility Validation Framework
// ─────────────────────────────────────────────────────────────────────────────

/** Compatibility categories as defined in reports-compatability.json legend */
type CompatClass = "D" | "A" | "M" | "G" | "unknown";

/**
 * Classifies a column's operation into a compatibility category.
 *
 * D (Dimension): discrete/categorical - string actual, date time-parts, numeric as dimension/range/count
 * A (Aggregate): aggregated value - sum/avg/min/max/count/distinctCount on numeric
 * M (Measure): numeric in measure mode - treated as a continuous numeric value
 * G (Geo): geographic column
 */
function classifyOperation(operation: string): CompatClass {
    switch (operation) {
        // Dimension operations
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

        // Aggregate operations
        case "sum":
        case "average":
        case "min":
        case "max":
        case "count":
        case "distinctCount":
            return "A";

        // Measure (numeric treated as continuous)
        case "measure":
            return "M";

        // Geo
        case "geo":
            return "G";

        default:
            return "unknown";
    }
}

/**
 * Normalizes a user-supplied chartType string to the key used in the
 * compatibility map below.
 */
const CHART_TYPE_ALIASES: Record<string, string> = {
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

function normalizeChartType(chartType: string): string {
    const lower = chartType.toLowerCase();
    return CHART_TYPE_ALIASES[lower] ?? lower;
}

/** Constraint token from compatibility JSON, e.g. "D", "A", "D|A", "MultiA", "Opt" */
type ConstraintToken = string;

/**
 * Determines whether a list of classified columns satisfies a constraint token.
 *
 * Rules:
 *   "Opt"    - zero columns is OK; non-empty must match one of the pipe-separated classes
 *   "MultiA" - two or more A-classified columns required
 *   "D|A"    - every column must be D or A (at least one column required unless combined with Opt)
 *   "D"      - every column must be D, at least one required
 *   "A"      - every column must be A, at least one required
 *   "M"      - every column must be M, at least one required
 *   "G"      - every column must be G, at least one required
 */
function satisfiesConstraint(classes: CompatClass[], constraint: ConstraintToken): boolean {
    const tokens = constraint.split("|");
    const isOpt = tokens.includes("Opt");
    const nonOptTokens = tokens.filter(t => t !== "Opt");

    if (classes.length === 0) {
        return isOpt;
    }

    // MultiA: need 2+ Aggregates
    if (nonOptTokens.includes("MultiA")) {
        const aCount = classes.filter(c => c === "A").length;
        if (aCount >= 2) return true;
        // fall through to check other tokens if present
    }

    // If constraint is pure "Opt" with no other type restrictions,
    // any non-empty value is acceptable ("Opt" means "optional", not "must be empty")
    const allowedClasses = nonOptTokens.filter(t => t !== "MultiA") as CompatClass[];
    if (allowedClasses.length === 0) {
        return isOpt;
    }

    return classes.every(c => allowedClasses.includes(c));
}

type ShelfName = "x" | "y" | "color" | "size" | "text" | "tooltip";

interface AxisColumnInput {
    type: string;       // "xAxis" | "yAxis" | "colorAxis" | "sizeAxis" | "textAxis"
    columnName: string;
    operation: string;
    tableName?: string;
}

/** Maps axisColumn type → compatibility shelf name */
function axisTypeToShelf(axisType: string): ShelfName | null {
    switch (axisType) {
        case "xAxis":     return "x";
        case "yAxis":     return "y";
        case "colorAxis": return "color";
        case "sizeAxis":  return "size";
        case "textAxis":  return "text";
        default:          return null;
    }
}

// Compatibility rules derived from reports-compatability.json
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

interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validates whether the provided axisColumns are compatible with the given chartType.
 *
 * Returns { valid: true } on success, or { valid: false, error: <detailed message> } on failure.
 * The error message is designed to be consumed by an AI agent so it can self-correct.
 */
function validateChartCompatibility(chartType: string, axisColumns: AxisColumnInput[]): ValidationResult {
    const normalizedKey = normalizeChartType(chartType);
    const cases = CHART_COMPAT[normalizedKey];

    if (!cases) {
        const suggestions = getChartTypeSuggestions(chartType, CHART_TYPE_ALIASES, 5);
        return {
        valid: false,
        error: suggestions.length
            ? `Given chart type was not found. Did you mean any of the following charts:\n${suggestions
                  .map(s => `- ${s}`)
                  .join("\n")}`
            : "Chart type not found.",
        };
    }

    // Group columns by shelf
    const shelves: Partial<Record<ShelfName, CompatClass[]>> = {};
    for (const col of axisColumns) {
        const shelf = axisTypeToShelf(col.type);
        if (!shelf) continue;
        const cls = classifyOperation(col.operation);
        if (!shelves[shelf]) shelves[shelf] = [];
        shelves[shelf]!.push(cls);
    }

    // All shelves referenced in any case
    const allShelves = new Set<ShelfName>();
    for (const caseObj of cases) {
        for (const shelf of Object.keys(caseObj) as ShelfName[]) {
            allShelves.add(shelf);
        }
    }

    // Try each case - if any passes, we're valid
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

    // Build a human-/agent-readable error message
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
            const details = (shelves[shelf] ?? []).map((cls, i) => {
                const op = axisColumns.filter(c => axisTypeToShelf(c.type) === shelf)[i]?.operation ?? "?";
                return `${cls} [op: "${op}"]`;
            });
            resolvedLines.push(`  - ${shelf}Axis: [${details.join(", ")}]`);
        }
    }

    const caseLines = cases.map((caseObj, i) => {
        const parts = (Object.keys(caseObj) as ShelfName[]).map(s => `${s}=${caseObj[s]}`);
        // Diagnose which shelf failed for this case
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

    const error = dedent`
        Chart compatibility validation failed for chart type "${chartType}".

        Resolved axis classifications:
        ${resolvedLines.join("\n")}

        None of the valid configurations matched:
        ${caseLines.join("\n")}

        Legend:
          D = ${legend.D}
          A = ${legend.A}
          M = ${legend.M}
          G = ${legend.G}
          MultiA = Two or more Aggregate columns on the same axis
          Opt = Optional (may be empty)

        Action: Review your axisColumns and adjust the column types and/or operations so that
        at least one of the valid cases above is satisfied.
    `.trim();

    return { valid: false, error };
}


// ─────────────────────────────────────────────────────────────────────────────
// createSummaryReport
// ─────────────────────────────────────────────────────────────────────────────

export const createSummaryReportSchema = {
    workspaceId: z.string(),
    tableName: z.string(),
    reportName: z.string(),
    summaryDetails: z.object({
        groupBy: z.array(z.object({
            columnName: z.string(),
            tableName: z.string(),
            operation: z.string()
        })).nonempty(),
        aggregate: z.array(z.object({
            columnName: z.string(),
            operation: z.string(),
            tableName: z.string()
        })).nonempty()
    }),
    filters: z.array(z.object({
        tableName: z.string().optional(),
        columnName: z.string(),
        operation: z.string(),
        filterType: z.string(),
        values: z.array(z.string()),
        exclude: z.boolean()
    })).optional(),
};

type CreateSummaryReportArgs = z.infer<z.ZodObject<typeof createSummaryReportSchema>>;

export async function createSummaryReportHandler({
    workspaceId,
    tableName,
    reportName,
    summaryDetails,
    filters,
}: CreateSummaryReportArgs) {
    try {
        const orgId = requireOrgId();
        if (!summaryDetails.groupBy || !summaryDetails.aggregate) {
            return ToolResponse("Both 'groupBy' and 'aggregate' must be provided in summaryDetails.");
        }
        const axisColumns: any[] = [];
        for (const gb of summaryDetails.groupBy) {
            axisColumns.push({
                type: "groupBy",
                columnName: gb.columnName,
                operation: gb.operation,
                tableName: gb.tableName
            });
        }
        for (const ag of summaryDetails.aggregate) {
            if (ag.operation === "actual") {
                return ToolResponse("Invalid operation 'actual' in aggregate. Use 'sum', 'count', etc.");
            }
            axisColumns.push({
                type: "summarize",
                columnName: ag.columnName,
                operation: ag.operation,
                tableName: ag.tableName
            });
        }
        const conf: any = {
            baseTableName: tableName,
            title: reportName,
            reportType: "summary",
            axisColumns
        };
        if (filters) {
            conf.filters = filters;
        }
        const analyticsClient = getAnalyticsClient();
        const workspaceInst = analyticsClient.getWorkspaceInstance(orgId, workspaceId);
        const reportId = await workspaceInst.createReport(conf);
        return ToolResponse(buildReportLinkResponse("generated", reportId));
    } catch (err) {
        return logAndReturnError(err, "An error occurred while creating the summary report", { workspaceId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// createPivotReport
// ─────────────────────────────────────────────────────────────────────────────

export const createPivotReportSchema = {
    workspaceId: z.string(),
    tableName: z.string(),
    reportName: z.string(),
    pivotDetails: z.object({
        row: z.array(z.object({
            columnName: z.string(),
            tableName: z.string(),
            operation: z.string()
        })).optional(),
        column: z.array(z.object({
            columnName: z.string(),
            tableName: z.string(),
            operation: z.string()
        })).optional(),
        data: z.array(z.object({
            columnName: z.string(),
            tableName: z.string(),
            operation: z.string()
        })).optional()
    }),
    filters: z.array(z.object({
        tableName: z.string().optional(),
        columnName: z.string(),
        operation: z.string(),
        filterType: z.string(),
        values: z.array(z.string()),
        exclude: z.boolean()
    })).optional(),
};

type CreatePivotReportArgs = z.infer<z.ZodObject<typeof createPivotReportSchema>>;

export async function createPivotReportHandler({
    workspaceId,
    tableName,
    reportName,
    pivotDetails,
    filters,
}: CreatePivotReportArgs) {
    try {
        const orgId = requireOrgId();
        if (!pivotDetails) {
            return ToolResponse("Pivot details must be provided.");
        }
        if (!pivotDetails.row && !pivotDetails.column && !pivotDetails.data) {
            return ToolResponse("At least one of 'row', 'column', or 'data' must be provided in pivotDetails.");
        }
        const axisColumns: any[] = [];
        const requiredKeys = ["columnName", "tableName", "operation"];
        for (const [axisType, axisKey] of [["row", "row"], ["column", "column"], ["data", "data"]] as const) {
            const axisList = (pivotDetails as any)[axisKey];
            if (axisList) {
                if (!Array.isArray(axisList) || axisList.length === 0) {
                    return ToolResponse(`${axisKey} must be a non-empty list of dictionaries with 'columnName', 'tableName', and 'operation'.`);
                }
                for (const entry of axisList) {
                    if (!requiredKeys.every(k => k in entry)) {
                        return ToolResponse(`Each entry in '${axisKey}' must contain 'columnName', 'tableName', and 'operation'.`);
                    }
                    const defaultOperation = (axisType === "row" || axisType === "column") ? "actual" : "count";
                    axisColumns.push({
                        type: axisType,
                        columnName: entry.columnName,
                        operation: entry.operation || defaultOperation,
                        tableName: entry.tableName
                    });
                }
            }
        }
        const conf: any = {
            baseTableName: tableName,
            title: reportName,
            reportType: "pivot",
            axisColumns
        };
        if (filters) {
            if (!Array.isArray(filters)) {
                return ToolResponse("Filters must be a list of dictionaries.");
            }
            for (const f of filters) {
                if (!["columnName", "operation", "filterType", "values", "exclude"].every(k => k in f)) {
                    return ToolResponse("Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'.");
                }
            }
            conf.filters = filters;
        }
        const analyticsClient = getAnalyticsClient();
        const workspaceInst = analyticsClient.getWorkspaceInstance(orgId, workspaceId);
        const reportId = await workspaceInst.createReport(conf);
        return ToolResponse(buildReportLinkResponse("generated", reportId));
    } catch (err) {
        return logAndReturnError(err, "An error occurred while creating the pivot report", { workspaceId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateChart
// ─────────────────────────────────────────────────────────────────────────────

export const updateChartSchema = {
    workspaceId: z.string().describe("The ID of the workspace containing the chart report"),
    reportId: z.string().describe("The ID of the chart report to update"),
    chartDetails: z.object({
        chartType: z.string().describe(
            'Chart type, e.g. "bar", "line", "pie", "scatter", "bubble", "stacked bar", "funnel", "heat map", "sankey", and many more etc.'
        ),
        axisColumns: z.array(
            z.object({
                type: z.enum(["xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"]).describe(
                    'Axis shelf: "xAxis", "yAxis", "colorAxis", "sizeAxis", or "textAxis"'
                ),
                columnName: z.string().describe("Name of the column"),
                operation: z.string().describe(
                    'Operation for the column. String: actual/count/distinctCount. Number: measure/dimension/sum/average/min/max/count/distinctCount. Date: year/month/week/day/fullDate/dateTime/range/monthYear/quarterYear/weekYear/count/distinctCount'
                ),
                tableName: z.string().optional().describe(
                    "If the column belongs to a related table, provide its name"
                ),
            })
        ).min(1).describe("List of axis column definitions"),
    }),
    title: z.string().optional().describe("Optional. New title for the chart report. Omit to keep the existing title."),
    filters: z
        .array(
            z.object({
                tableName: z.string().optional(),
                columnName: z.string(),
                operation: z.string(),
                filterType: z.string(),
                values: z.array(z.string()),
                exclude: z.boolean(),
            })
        )
        .optional(),
};

type UpdateChartArgs = z.infer<z.ZodObject<typeof updateChartSchema>>;

export async function updateChartHandler({
    workspaceId,
    reportId,
    chartDetails,
    title,
    filters,
}: UpdateChartArgs) {
    try {
        const orgId = requireOrgId();

        const { chartType, axisColumns } = chartDetails;

        if (!chartType) {
            return ToolResponse("Chart type is required. Please provide 'chartType' in chartDetails.");
        }
        if (!axisColumns || axisColumns.length === 0) {
            return ToolResponse("At least one axis column must be provided in chartDetails.axisColumns.");
        }

        // Validate each axis column has required fields
        for (let i = 0; i < axisColumns.length; i++) {
            const col = axisColumns[i];
            if (!col.columnName) {
                return ToolResponse(`axisColumns[${i}] is missing 'columnName'.`);
            }
            if (!col.operation) {
                return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'operation'.`);
            }
            if (!col.type) {
                return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'type'. Must be one of: xAxis, yAxis, colorAxis, sizeAxis, textAxis.`);
            }
        }

        // Run compatibility validation
        const validation = validateChartCompatibility(chartType, axisColumns);
        if (!validation.valid) {
            return ToolResponse(validation.error!);
        }

        // Build payload axisColumns
        const payloadAxisColumns = axisColumns.map(col => {
            const entry: Record<string, any> = {
                type: col.type == "sizeAxis" ? col.type.toLowerCase() : col.type,
                columnName: col.columnName,
                operation: col.operation,
            };
            if (col.tableName) entry.tableName = col.tableName;
            return entry;
        });

        const conf: Record<string, any> = {
            reportType: "chart",
            chartType,
            axisColumns: payloadAxisColumns,
        };

        // title is optional in update - only include if provided
        if (title) {
            conf.title = title;
        }

        if (filters) {
            if (!Array.isArray(filters)) {
                return ToolResponse("Filters must be provided as an array of objects.");
            }
            for (const f of filters) {
                if (!("columnName" in f && "operation" in f && "filterType" in f && "values" in f && "exclude" in f)) {
                    return ToolResponse("Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'.");
                }
            }
            conf.filters = filters;
        }

        console.error(`[updateChart] Updating chart report '${reportId}' in workspace '${workspaceId}'`);

        const ac = getAnalyticsClient();
        const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
        await workspaceInst.updateReport(reportId, conf);
        console.error(`[updateChart] Successfully updated chart report '${reportId}'`);
        return ToolResponse(buildReportLinkResponse("updated", reportId));
    } catch (error: any) {
        if ("errorMessage" in error && "errorCode" in error) {
            const { errorMessage, errorCode } = error as { errorMessage: string; errorCode: number };
            if (errorCode === 8166) {
                const responseStr = dedent`
                ${errorMessage}

                Supported operations for columns of different types:
                  String: actual, count, distinctCount
                  Number: measure, dimension, sum, average, min, max, count, distinctCount
                  Date: year, month, week, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
                `.trim();
                return ToolResponse(responseStr);
            }
        }
        return logAndReturnError(error, "An error occurred while updating the chart report", { workspaceId, viewId: reportId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// readReportMetadata
// ─────────────────────────────────────────────────────────────────────────────

export const readReportMetadataSchema = {
    workspaceId: z.string().describe("The ID of the workspace containing the report"),
    reportId: z.string().describe("The ID of the report whose metadata to retrieve"),
};

type ReadReportMetadataArgs = z.infer<z.ZodObject<typeof readReportMetadataSchema>>;

export async function readReportMetadataHandler({
    workspaceId,
    reportId,
}: ReadReportMetadataArgs) {
    try {
        const orgId = requireOrgId();

        console.error(`[readReportMetadata] Fetching metadata for report '${reportId}' in workspace '${workspaceId}'`);

        const ac = getAnalyticsClient();
        const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
        const metadata = await workspaceInst.getReportMetadata(reportId);
        console.error(`[readReportMetadata] Successfully retrieved metadata for report '${reportId}'`);
        return ToolResponse(buildReportLinkResponse("fetched", reportId, metadata));
    } catch (err) {
        return logAndReturnError(err, "An error occurred while retrieving the report metadata", { workspaceId, viewId: reportId });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// createChartReport
// ─────────────────────────────────────────────────────────────────────────────

export const createChartReportSchema = {
      workspaceId: z.string(),
      tableName: z.string(),
      chartName: z.string(),
      chartDetails: z.object({
          chartType: z.string().describe(
              'Chart type, e.g. "bar", "line", "pie", "scatter", "bubble", "stacked bar", "funnel", "heat map", "sankey", and many more etc.'
          ),
          axisColumns: z.array(
              z.object({
                  type: z.enum(["xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"]).describe(
                      'Axis shelf: "xAxis", "yAxis", "colorAxis", "sizeAxis", or "textAxis"'
                  ),
                  columnName: z.string().describe("Name of the column"),
                  operation: z.string().describe(
                      'Operation for the column. String: actual/count/distinctCount. Number: measure/dimension/sum/average/min/max/count/distinctCount. Date: year/month/week/day/fullDate/dateTime/range/monthYear/quarterYear/weekYear/count/distinctCount'
                  ),
                  tableName: z.string().optional().describe(
                      "If the column belongs to a related table, provide its name"
                  ),
              })
          ).min(1).describe("List of axis column definitions"),
      }),
      filters: z
        .array(
          z.object({
            tableName: z.string().optional(),
            columnName: z.string(),
            operation: z.string(),
            filterType: z.string(),
            values: z.array(z.string()),
            exclude: z.boolean(),
          })
        )
        .optional()
    }

type createChartReportMetaDataArgs = z.infer<z.ZodObject<typeof createChartReportSchema>>;

export async function createChartReportHandler({
    workspaceId,
    tableName,
    chartName,
    chartDetails,
    filters,
    }: createChartReportMetaDataArgs) {

    try {
        
        const orgId = requireOrgId();
        const { chartType, axisColumns } = chartDetails;

         if (!chartType) {
             return ToolResponse("Chart type is required. Please provide 'chartType' in chartDetails.");
         }
         if (!axisColumns || axisColumns.length === 0) {
             return ToolResponse("At least one axis column must be provided in chartDetails.axisColumns.");
         }

         // Validate each axis column has required fields
         for (let i = 0; i < axisColumns.length; i++) {
             const col = axisColumns[i];
             if (!col.columnName) {
                 return ToolResponse(`axisColumns[${i}] is missing 'columnName'.`);
             }
             if (!col.operation) {
                 return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'operation'.`);
             }
             if (!col.type) {
                 return ToolResponse(`axisColumns[${i}] ('${col.columnName}') is missing 'type'. Must be one of: xAxis, yAxis, colorAxis, sizeAxis, textAxis.`);
             }
         }

         // Run compatibility validation
         const validation = validateChartCompatibility(chartType, axisColumns);
         if (!validation.valid) {
             return ToolResponse(validation.error!);
         }

         // Build payload axisColumns
         const payloadAxisColumns = axisColumns.map(col => {
             const entry: Record<string, any> = {
                 type: col.type == "sizeAxis" ? col.type.toLowerCase() : col.type,
                 columnName: col.columnName,
                 operation: col.operation,
             };
             if (col.tableName) entry.tableName = col.tableName;
             return entry;
         });

         const conf: Record<string, any> = {
             baseTableName: tableName,
             title: chartName,
             reportType: "chart",
             chartType,
             axisColumns: payloadAxisColumns,
         };

         if (filters) {
             if (!Array.isArray(filters)) {
                 return ToolResponse("Filters must be provided as an array of objects.");
             }
             for (const f of filters) {
                 if (!("columnName" in f && "operation" in f && "filterType" in f && "values" in f && "exclude" in f)) {
                     return ToolResponse("Each filter must contain 'columnName', 'operation', 'filterType', 'values', and 'exclude'.");
                 }
             }
             conf.filters = filters;
         }

         const ac = getAnalyticsClient();
         const workspaceInst = ac.getWorkspaceInstance(orgId, workspaceId);
         const reportId = await workspaceInst.createReport(conf);
         return ToolResponse(buildReportLinkResponse("generated", reportId));

    } catch (error: any) {
        if ("errorMessage" in error && "errorCode" in error) {
            const { errorMessage, errorCode } = error as { errorMessage: string; errorCode: number };
            if (errorCode === 8166) {
                const responseStr = dedent`
                ${errorMessage}

                Supported operations for columns of different types:
                  String: actual, count, distinctCount
                  Number: measure, dimension, sum, average, min, max, count, distinctCount
                  Date: year, month, week, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
                `.trim();
                return ToolResponse(responseStr);
            }
        }
        return logAndReturnError(error, "An error occurred while creating the chart report", { workspaceId });
    }
}