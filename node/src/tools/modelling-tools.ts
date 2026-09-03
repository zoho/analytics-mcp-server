import { z } from "zod";
import type { ServerInstance } from "../common";
import {getAnalyticsClient, config } from '../utils/apiUtil';
import { retryWithFallback, ToolResponse, logAndReturnError } from "../utils/common";
import dedent from "dedent";

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
function normalizeChartType(chartType: string): string {
    const lower = chartType.toLowerCase().replace(/\s+/g, "");
    const aliases: Record<string, string> = {
        "bar":                    "bar|horizontalBar",
        "horizontalbar":          "bar|horizontalBar",
        "stackedbar":             "stackedBar|horizontalStackedBar",
        "horizontalstackedbar":   "stackedBar|horizontalStackedBar",
        "line":                   "line|smoothLine|step|area|smoothArea",
        "smoothline":             "line|smoothLine|step|area|smoothArea",
        "step":                   "line|smoothLine|step|area|smoothArea",
        "area":                   "line|smoothLine|step|area|smoothArea",
        "smootharea":             "line|smoothLine|step|area|smoothArea",
        "stackedarea":            "stackedArea|stackedSmoothArea",
        "stackedsmootharea":      "stackedArea|stackedSmoothArea",
        "pie":                    "pie|ring|semiPie|semiRing",
        "ring":                   "pie|ring|semiPie|semiRing",
        "semipie":                "pie|ring|semiPie|semiRing",
        "semiring":               "pie|ring|semiPie|semiRing",
        "funnel":                 "funnel|pyramid",
        "pyramid":                "funnel|pyramid",
        "butterfly":              "butterfly",
        "histogram":              "histogram",
        "scatter":                "scatter",
        "bubble":                 "bubble|packedBubble",
        "packedbubble":           "bubble|packedBubble",
        "bubblepie":              "bubblePie",
        "combo":                  "combo|comboBarWithSmoothLine",
        "combobarthsmoothline":   "combo|comboBarWithSmoothLine",
        "combobarsmoothline":     "combo|comboBarWithSmoothLine",
        "web":                    "web|webWithFill|webWithoutFill",
        "webwithfill":            "web|webWithFill|webWithoutFill",
        "webwithoutfill":         "web|webWithFill|webWithoutFill",
        "heatmap":                "heatMap",
        "mapscatter":             "mapScatter|mapFilled",
        "mapfilled":              "mapScatter|mapFilled",
        "mapbubble":              "mapBubble",
        "mappie":                 "mapPie|mapBubblePie",
        "mapbubblepie":           "mapPie|mapBubblePie",
        "geoheatmap":             "geoHeatMap",
        "treemap":                "treeMap",
        "sunburst":               "sunburst",
        "sankey":                 "sankey",
        "wordcloud":              "wordCloud",
        "raceline":               "raceLine|raceBar",
        "racebar":                "raceLine|raceBar",
        "racebubble":             "raceBubble",
        "gantt":                  "gantt",
        "tableChart":             "tableChart",
        "tablechart":             "tableChart",
        "maparea":                "mapScatter|mapFilled",
        "areawithpoints":         "line|smoothLine|step|area|smoothArea",
    };
    return aliases[lower] ?? lower;
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
        // Unknown chart type - skip validation, let the API respond
        return { valid: true };
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

export function registerModellingTools(server: ServerInstance) {

    server.registerTool("addAggregateFormula",
    {
        description: dedent`
        1. Use Case:
        - Create an aggregate formula in the specified table of a workspace in Zoho Analytics.
        - Use this when the user wants to define a reusable aggregate formula expression on a table.

        2. Important Notes:
        - Aggregate Formulas in Zoho Analytics are select query expressions that return a single aggregate value as output.
        - The expression should always return a valid aggregate value.
        - Any column or table names used in the expression should be enclosed in double quotes. Literal values should be enclosed in single quotes.
        - While the expression can contain complex nested functions, it should always return a single aggregate value.
        - Assume the expression is MySQL-compatible.
        - Note that the tool also supports multi-table aggregate formulas, where the expression can reference columns from related tables (lookups should exist between such tables). In such cases, the expression should use the fully qualified column names (e.g., "TableName"."ColumnName") to avoid ambiguity.
        - Multi-table aggregate formulas should be created with the child table as the base table.
        - Enclose table and column names with dobule quotes whereas literal values with single quotes in the expression.

        3. Arguments:
        - workspaceId (str): The ID of the workspace.
        - tableId (str): The ID of the table (view) in which to create the aggregate formula.
        - formulaName (str): The name of the aggregate formula.
        - expression (str): The SQL aggregate expression.
            For example: SUM("Revenue") or AVG("Salary") or running_sum(sum("Sales"."Sales"))
        - orgId (str | None): The ID of the organization. Defaults to config.ORGID if not provided.

        4. Returns:
        - str: Success message with the created formula ID, or an error message.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace"),
            tableId: z.string().describe("The ID of the table (view) in which to create the aggregate formula"),
            formulaName: z.string().describe("The name of the aggregate formula to create"),
            expression: z.string().describe('The SQL aggregate expression, e.g. SUM("Revenue") or running_sum(sum("Sales"."Sales"))'),
            orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided.")
        },
        annotations: {
            title: "Add Aggregate Formula",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, formulaName, expression, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            console.error(`[addAggregateFormula] Creating aggregate formula '${formulaName}' in table '${tableId}' of workspace '${workspaceId}'`);
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace) => {
                const ac = getAnalyticsClient();
                const viewInst = ac.getViewInstance(org_id, workspace, tableId);
                console.error(`[addAggregateFormula] Calling ViewAPI.addAggregateFormula for formula: '${formulaName}', expression: '${expression}'`);
                const formulaId = await viewInst.addAggregateFormula(formulaName, expression);
                console.error(`[addAggregateFormula] Successfully created aggregate formula. Formula ID: ${formulaId}`);
                return ToolResponse(`Aggregate formula '${formulaName}' created successfully. Formula ID: ${formulaId}`);
            }, workspaceId);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the aggregate formula");
        }
    });


    server.registerTool("createWorkspace",
    {
        description: "Create a new workspace in Zoho Analytics with the given name",
        inputSchema: {
        workspaceName: z.string().describe("Name of the workspace to create")
        },
        annotations: {
          title: "Create Workspace",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceName }) => {
        try {
            const ac = getAnalyticsClient();
            const org = ac.getOrgInstance(config.ORGID || "");
            const configParam = {};
            const workspace_id = await org.createWorkspace(workspaceName, configParam);
            return ToolResponse(`Workspace '${workspaceName}' created successfully. Workspace Id: ${workspace_id}`);
        } catch (err) {
            if (
                typeof err === "object" &&
                err !== null &&
                "errorCode" in err
            ) {
                const errorCode = (err as { errorCode: number }).errorCode;
                if (errorCode === 7101) {
                return ToolResponse("Workspace name is already taken. Provide an alternate name.");
                }
            }
            return logAndReturnError(err, "An error occurred while creating the workspace");
        }
    });


    server.registerTool("createTable",
    {
        description: "Create a new table in the given workspace with the given name",
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace in which to create the table"),
            tableName: z.string().describe("The name of the table to create"),
            columnsArr: z.array(z.object({
                COLUMNNAME: z.string().describe("The name of the column"),
                DATATYPE: z.enum(["PLAIN", "NUMBER", "DATE", "EMAIL", "CURRENCY", "URL", "POSITIVE_NUMBER", "DECIMAL_NUMBER"]).describe("The data type of the column")
            })).describe("A list of column definitions for the table"),
            orgId: z.string().optional().describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided.")
        },
        annotations: {
          title: "Create Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, columnsArr, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, tableAlias, cols_arr) => {
                const tableDesign = {
                    TABLENAME: tableAlias,
                    COLUMNS: cols_arr
                };
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id || "", workspace);
                const tableId = await workspaceInst.createTable(tableDesign);
                return ToolResponse(`Table '${tableName}' created successfully. Table Id: ${tableId}`);
            }, workspaceId, tableName, columnsArr);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the table");
        }
    });

    server.registerTool("createChartReport",
    {
    description: dedent`
    1. Use Cases:
    - Create a chart report in the specified workspace for a table in Zoho Analytics.
    - Use this to generate visual representations of data using various chart types.

    2. Important Notes:
    - A chart is a report that visually represents data from a table or multiple related tables.
    - Charts can include filters to narrow down the dataset.
    - Multiple axis columns of the same type are supported (e.g., multiple yAxis for multi-measure charts).
    - For numeric columns: use "measure" as operation to treat as a continuous numeric value, "dimension" to treat as categorical data.
    - For string columns: use "actual" for raw values, or "count"/"distinctCount" for aggregations.
    - For date columns: use time-part operations like "year", "month", "week", "fullDate", etc.
    - "sizeAxis" is required for bubble and packed bubble charts.
    - Use "colorAxis" to add a color dimension/aggregate to support chart coloring.
    - Use your best judgement to pick the chart for the task and the right operation types for each axis based on the chart type and column types.
      The tool will validate compatibility and return a detailed error if the column/operation configuration is invalid for the specified chart type.
    - Validate the correctness of the individual values provided in filter using queryData tool.
    - columns provided in axis columns can belong to multiple different yet related tables (related via a lookup relationship)

    3. Arguments:
    - workspaceId (str): ID of the workspace to create the chart in.
    - tableName (str): The base table name for the chart.
    - chartName (str): Desired name for the chart report.
    - chartDetails (dict): Details of the chart including:
        - chartType (str): The chart type. Examples: "bar", "horizontal bar", "stacked bar", "line", "area",
        "pie", "ring", "scatter", "bubble", "packed bubble", "funnel", "pyramid", "butterfly", "combo",
        "heat map", "tree map", "sunburst", "sankey", "word cloud", "race line", "race bar", "race bubble",
        "gantt", "histogram", "web", "map scatter", "map filled", "map bubble", "map pie", "geo heat map"
        - axisColumns (list[dict]): List of axis column definitions. Each entry has:
            - type (str): Axis shelf - one of "xAxis", "yAxis", "colorAxis", "sizeAxis", "textAxis"
            - columnName (str): Name of the column.
            - operation (str):
                String columns: actual, count, distinctCount
                Number columns: measure, dimension, sum, average, min, max, count, distinctCount
                Date columns: year, month, week, day, fullDate, dateTime, range, monthYear, quarterYear, weekYear, count, distinctCount
            - tableName (optional str): If the column belongs to a related table, provide its name.
    - filters (list[dict] | None): Optional. Filter definitions per <filters_args>.

        3.1. Filter Arguments:
        - tableName (str): The name of the table containing the column to filter.
        - columnName (str): The name of the column to filter.
        - operation (str): Function applied to the column in the filter.
            Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
            String: actual, count, distinctCount
            Number: measure, dimension, sum, average, min, max, count, distinctCount
        - filterType (str): Type of filter. Accepted: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
        - values (list): Values to filter on.
            - individualValues: ["value1", "value2"]
            - range: ["10 to 20", "50 and above"]
            - ranking: ["top 10", "bottom 5"]
        - exclude (bool): Whether to exclude the matched values. Default is false.

    4. Returns:
    - str: Chart creation status or error message.
    `,
    inputSchema: {
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
     },
     annotations: {
       title: "Create Chart Report",
       readOnlyHint: false,
       destructiveHint: false,
       idempotentHint: false,
       openWorldHint: false
     }
   },
   async ({
     workspaceId,
     tableName,
     chartName,
     chartDetails,
     filters,
     }) => {
     
     try {
        
        const orgId = config.ORGID || "";
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

         return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace) => {
             const ac = getAnalyticsClient();
             const workspaceInst = ac.getWorkspaceInstance(org_id || "", workspace);
             const reportId = await workspaceInst.createReport(conf);
             return ToolResponse(`Chart report created successfully. Report ID: ${reportId}`);
         }, workspaceId);

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
        return logAndReturnError(error, "An error occurred while creating the chart report");
    }
  }
    );

    server.registerTool("createSummaryReport",
    {
        description: dedent`
        1. use_case:
        - Create a summary report in the specified workspace and table in Zoho Analytics.
        - Use this to generate grouped aggregate reports, ideal for quick summaries with group-by and aggregate logic.
        - Creates a summary table that groups data by specified columns and applies aggregate functions.
        
        2. important_notes:
        - Do NOT use "actual" operation for numeric columns in aggregate. Use "sum" instead.
        - You can use lookup columns from other tables if relationships are already defined.

        3. arguments:
        - workspaceId (str): The ID of the workspace to create the Summary report in.
        - tableName (str): The name of the base table for the summary report.
        - reportName (str): The name for the Summary to be created.
        - summaryDetails (dict): Contains:
            - groupBy (list[dict]):
                Each dict must have:
                - columnName (str)
                - tableName (str)
                - operation (str): Below are the valid operation types based on datatypes
                    Date: year, quarterYear, monthYear, weekYear, fullDate, dateTime, range, quarter, month, week, weekDay, day, hour, count, distinctCount
                    String: actual, count, distinctCount
                    Number: measure, dimension, sum, average, min, max, count, distinctCount
            - aggregate (list[dict]): Each dict must have:
                - columnName (str)
                - operation (str): sum, average, count, min, max, etc.
                - tableName (str): Need to be provided if the column belongs to another table with which a lookup is defined.
        - filters (list[dict] | None): Optional filters. See <filters_args> in createChartReport tool.
        - orgId (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
        
            3.1. filter_args:
            - tableName (str): The name of the table containing the column to filter.
            - columnName (str): The name of the column to filter.
            - operation (str): Specifies the function applied to the specified column used in the filter. The accepted functions differ based on the data type of the column.
                Date: actual, seasonal, relative
                String: actual, count, distinctCount
                Number: measure, dimension, sum, average, min, max, count, distinctCount
            - filterType (str): The type of filter to apply. Accepted values: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
            - values (list): The values to filter on.
                Example:
                - For individualValues: "value1", "value2"
                - For range: "10 to 20", "50 and above"
                - For ranking: "top 10", "bottom 5"
            - exclude (bool): Whether to exclude or include the filtered values. Default is False.
        
        4.returns:
        - str: Chart creation status or error message.
        `,
        inputSchema: {
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
            orgId: z.string().optional()
        },
        annotations: {
          title: "Create Summary Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, reportName, summaryDetails, filters, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
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
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id || "", workspace);
                const reportId = await workspaceInst.createReport(conf);
                return ToolResponse(`Summary report created successfully. Report ID: ${reportId}`);
            },workspaceId);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the summary report");
        }
    });

    server.registerTool("createPivotReport",
    {
        description: dedent`
    1. use_cases:
    - Create a pivot table report in the specified workspace and table in Zoho Analytics.
    - Use this when you need multidimensional data summaries by defining rows, columns, and data fields.

    2. Important Notes:
    - All pivot details (row, column, data) are optional individually but at least one of them must be provided and valid.
    - Allowed operations:
        - String columns: actual, count, distinctCount
        - Number columns: measure, dimension, sum, average, min, max, count
        - Date columns: year, month, week, day
    - Data fields require aggregate operations like sum, count, etc.
    - Lookup fields from other tables can be used if lookup is already defined.
    - For row and column fields, prefer non-aggregate operations like actual, measure or dimension depending on the data type. 
    For data fields, prefer aggregate operations like sum, count, etc.

    3. arguments:
    - workspaceId (str): ID of the workspace to create the report in.
    - tableName (str): Base table name for the report.
    - reportName (str): Desired name of the pivot report.
    - pivotDetails (dict): Contains:
        - row (optional(list[dict])): Each dict must have 'columnName' and 'tableName' and 'operation'.
        - column (optional(list[dict])): Same structure as row.
        - data (optional(list[dict])): same structure as row.
    - filters (list[dict] | None): Optional filters to restrict data scope. Filter definitions per <filters_args>.
    - orgId (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.

        3.1. filters_args:
        - tableName (str): The name of the table containing the column to filter.
        - columnName (str): The name of the column to filter.
        - operation (str): Specifies the function applied to the specified column used in the filter. The accepted functions differ based on the data type of the column.
            Date: actual, seasonal, relative
            String: actual, count, distinctCount
            Number: sum, average, min, max
        - filterType (str): The type of filter to apply. Accepted values: individualValues, range, ranking, rankingPct, dateRange, year, quarterYear, monthYear, weekYear, quarter, month, week, weekDay, day, hour, dateTime
        - values (list): The values to filter on.
            Example:
            - For individualValues: "value1", "value2"
            - For range: "10 to 20"
            - For ranking: "top 10", "bottom 5"
        - exclude (bool): Whether to exclude or include the filtered values. Default is False.
        `,
        inputSchema: {
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
        orgId: z.string().optional()
        },
        annotations: {
          title: "Create Pivot Report",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, reportName, pivotDetails, filters, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
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
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, bodyConf) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id || "", workspace);
                const reportId = await workspaceInst.createReport(bodyConf);
                return ToolResponse(`Pivot report created successfully. Report ID: ${reportId}`);
            }, workspaceId, conf);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the pivot report");
        }
    });

    server.registerTool("createQueryTable",
    {
        description: "Create a query table in the specified workspace with the given name and SQL query",
        inputSchema: {
        workspaceId: z.string().describe("The ID of the workspace in which to create the query table"),
        tableName: z.string().describe("The name of the query table to create"),
        query: z.string().describe("The SQL select query to create the query table"),
        orgId: z.string().optional().describe("The ID of the organization to which the workspace belongs. Defaults to config.ORGID if not provided.")
        },
        annotations: {
          title: "Create Query Table",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableName, query, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async(org_id, workspace, table, sql) => {
                const analyticsClient = getAnalyticsClient();
                const workspaceInst = analyticsClient.getWorkspaceInstance(org_id, workspace);
                const configParam = {};
                const tableId = await workspaceInst.createQueryTable(sql, table, configParam);
                return ToolResponse(`Query table '${table}' created successfully. Table Id: ${tableId}`);
            }, workspaceId, tableName, query);            
        } catch (err) {
            return logAndReturnError(err, "An error occurred while creating the query table");
        }
    });

    server.registerTool("createLookup",
    {
        description: dedent`
        Creates a lookup relationship between two columns across two tables. a Lookup is a relationship between two tables that connects a column in one table to a matching column in another table. A lookup tells Zoho Analytics that these two columns are related, allowing you to combine data from both tables in reports/dashboards/multi-table aggregate formulas.

        The direction of the relationship flows from source → target.
        For ONE_TO_MANY: source is the "one" (parent) side, target is the "many" (child) side.
        For ONE_TO_ONE and MANY_TO_MANY: source/target order is arbitrary but must be consistent.
        MANY_TO_ONE is not supported directly - swap the source and target and use ONE_TO_MANY instead.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing both tables"),
            sourceTableId: z.string().describe("ID of the source (typically parent/one-side) table"),
            sourceColumnId: z.string().describe("ID of the column in the source table to link from"),
            targetTableId: z.string().describe("ID of the target (typically child/many-side) table"),
            targetColumnId: z.string().describe("ID of the column in the target table to link to"),
            relationshipType: z.enum(["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY", "MANY_TO_ONE"]).describe(
                "Nature of the relationship. MANY_TO_ONE will be automatically converted to ONE_TO_MANY by swapping source and target."
            ),
            orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided.")
        },
        annotations: {
            title: "Create Lookup",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, sourceTableId, sourceColumnId, targetTableId, targetColumnId, relationshipType, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }

            // MANY_TO_ONE → swap source/target and use ONE_TO_MANY
            let effectiveRelationType = relationshipType;
            let effectiveSourceTableId = sourceTableId;
            let effectiveSourceColumnId = sourceColumnId;
            let effectiveTargetTableId = targetTableId;
            let effectiveTargetColumnId = targetColumnId;

            if (relationshipType === "MANY_TO_ONE") {
                console.error("[createLookup] MANY_TO_ONE detected - swapping source and target, using ONE_TO_MANY");
                effectiveRelationType = "ONE_TO_MANY";
                effectiveSourceTableId = targetTableId;
                effectiveSourceColumnId = targetColumnId;
                effectiveTargetTableId = sourceTableId;
                effectiveTargetColumnId = sourceColumnId;
            }

            console.error(`[createLookup] Creating lookup: sourceTable=${effectiveSourceTableId}, sourceColumn=${effectiveSourceColumnId}, targetTable=${effectiveTargetTableId}, targetColumn=${effectiveTargetColumnId}, relationType=${effectiveRelationType}`);

            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, srcTable, srcCol, tgtTable, tgtCol, relType) => {
                const ac = getAnalyticsClient();
                const viewInstance = ac.getViewInstance(org_id || "", workspace, srcTable);
                const references = [
                    {
                        viewId: tgtTable,
                        columnId: tgtCol,
                        relationType: relType
                    }
                ];
                await viewInstance.addLookupV2(srcCol, references, {});
                console.error(`[createLookup] Lookup created successfully`);
                return ToolResponse(
                    `Lookup relationship created successfully. Source table: ${srcTable}, Source column: ${srcCol} → Target table: ${tgtTable}, Target column: ${tgtCol}, Relationship type: ${relType}`
                );
            }, workspaceId, effectiveSourceTableId, effectiveSourceColumnId, effectiveTargetTableId, effectiveTargetColumnId, effectiveRelationType);
        } catch (err: any) {
            console.error("[createLookup] Error:", err);
            const errorCode = err?.errorCode;
            const errorMessage = err?.errorMessage;

            const errorCodeMessages: Record<string | number, string> = {
                // Add specific error code mappings here as needed
            };

            if (errorCode !== undefined) {
                const mappedMessage = errorCodeMessages[errorCode];
                if (mappedMessage) {
                    return ToolResponse(`Error [${errorCode}]: ${mappedMessage}`);
                }
                return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while creating the lookup"}`);
            }
            return logAndReturnError(err, "An error occurred while creating the lookup");
        }
    });

    server.registerTool("deleteLookup",
    {
        description: "Remove a lookup relationship for a specified column in a table (view).",
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace containing the table"),
            viewId: z.string().describe("The ID of the view (table) from which to remove the lookup"),
            columnId: z.string().describe("The ID of the column whose lookup relationship should be removed"),
            orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided.")
        },
        annotations: {
            title: "Delete Lookup",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    async ({ workspaceId, viewId, columnId, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }

            console.error(`[deleteLookup] Removing lookup: viewId=${viewId}, columnId=${columnId}`);

            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, view, col) => {
                const ac = getAnalyticsClient();
                const viewInstance = ac.getViewInstance(org_id || "", workspace, view);
                await viewInstance.removeLookup(col, {});
                console.error(`[deleteLookup] Lookup removed successfully`);
                return ToolResponse(`Lookup relationship for column ${col} in view ${view} removed successfully.`);
            }, workspaceId, viewId, columnId);
        } catch (err: any) {
            console.error("[deleteLookup] Error:", err);
            const errorCode = err?.errorCode;
            const errorMessage = err?.errorMessage;

            if (errorCode !== undefined) {
                return ToolResponse(`Error [${errorCode}]: ${errorMessage || "An unknown error occurred while removing the lookup"}`);
            }
            return logAndReturnError(err, "An error occurred while removing the lookup");
        }
    });

    server.registerTool("deleteView",
    {
      description: `
      <use_case>
        Delete a view (table, report, or dashboard) in the specified workspace.
      </use_case>
      `,
      inputSchema: {
        workspaceId: z.string(),
        viewId: z.string(),
        orgId: z.string().nullable().optional(),
      },
      annotations: {
        title: "Delete View",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ workspaceId, viewId, orgId }) => {
        try {
            if (!orgId){
                orgId = config.ORGID || "";
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, view) => {
                const analyticsClient = getAnalyticsClient();
                const viewInstance = analyticsClient.getViewInstance(org_id || "", workspace, view);
                await viewInstance.delete();
                return ToolResponse(`View with ID ${view} deleted successfully from workspace ${workspace}.`);
            }, workspaceId, viewId);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while deleting the view");
        }
    }
  );
}
