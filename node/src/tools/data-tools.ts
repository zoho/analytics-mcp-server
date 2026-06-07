import { z } from "zod";
import type { ServerInstance } from "../common";
import {getAnalyticsClient, config } from '../utils/apiUtil';
import { retryWithFallback, ToolResponse, logAndReturnError } from "../utils/common";
import dedent from "dedent";
import path from "path";
import fs from "fs";
import { pollJobCompletion, QUERY_DATA_POLLING_INTERVAL, QUERY_DATA_QUEUE_TIMEOUT, QUERY_DATA_QUERY_EXECUTION_TIMEOUT, QUERY_DATA_ROW_LIMIT } from "../utils/data-util";
import { enforceLimit } from "sql-limit-enforcer";


export function registerDataTools(server: ServerInstance) {

    server.registerTool("queryData",
    {
        description: dedent`
        Executes a SQL query on the specified workspace and returns the top N rows as results.
        Use this to retrieve data from Zoho Analytics using custom SQL queries, gather insights,
        and answer natural language queries by analyzing the results.

        Use Cases:
        - Retrieve data from a Zoho Analytics workspace using custom SQL queries.
        - Gather insights from the data and answer user queries.
        - Answer natural language queries by analyzing SQL query results.

        Important Notes:
        - Always provide a MySQL-compatible SELECT query only.
        - Always include a LIMIT clause and use aggregate queries (COUNT, SUM, AVG, etc.) wherever possible to minimize data transfer and avoid fetching raw rows unnecessarily.
        - The tool enforces a maximum row cap of N rows - only the top N rows are returned regardless of how many rows the query would otherwise produce.
        - To paginate through results beyond the first N rows, use LIMIT with OFFSET (e.g., LIMIT 20 OFFSET 20 for the next page).
        - If table or column names contain spaces or special characters, enclose them in double quotes (e.g., "Column Name").
        - Do not use more than one level of nested sub-queries.
        - Combine multiple lookups into a single query using JOINs, UNIONs, or sub-queries where possible, while keeping the query efficient and optimized.

        Pagination Strategy:
        Since only the top N rows are returned, when absolutely necessary, use LIMIT + OFFSET to walk through data:
        - Page 1: LIMIT N OFFSET 0
        - Page 2: LIMIT N OFFSET N
        - Page 3: LIMIT N OFFSET 2N
        The first tool response will indicate the actual value of N so you can paginate correctly. Note that the maximum value for limit is N, and it is not possible to increase this limit. If you need more rows, you must adjust the OFFSET in the query to fetch the next set of rows.

        Returns:
        - Top N rows of the query result in comma-separated (list of list) format.
        - The first row contains column names.
        - The response header indicates the actual value of N (e.g., "Here are the top N results").
        - If an error occurs, returns an error message.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace where the query will be executed"),
            sqlQuery: z.string().describe("The SQL query to be executed"),
            orgId: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Query Data",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, sqlQuery, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }
            try {
                sqlQuery = enforceLimit(sqlQuery, QUERY_DATA_ROW_LIMIT);
            } catch (limitErr) {
                // If limit enforcement fails for any reason, proceed with the original query
            }
            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async(org_id, workspace, sql) => {
                const analyticsClient = getAnalyticsClient();
                const bulk = analyticsClient.getBulkInstance(org_id, workspace);

                const jobId = await bulk.initiateBulkExportUsingSQL(sql, "CSV");

                const statusMessages: Record<string, string> = {
                    error: "Some internal error occurred (Not likely due to the query). Please try again later.",
                    queue_timeout: "Query Job accepted, but queue processing is slow. Please try again later.",
                    execution_timeout: "Query is taking too long to execute, maybe due to the complexity. Please try a simpler query"
                };

                const errorMessage = await pollJobCompletion(
                    bulk,
                    jobId,
                    statusMessages,
                    QUERY_DATA_POLLING_INTERVAL,
                    QUERY_DATA_QUEUE_TIMEOUT,
                    QUERY_DATA_QUERY_EXECUTION_TIMEOUT
                );

                if (errorMessage) {
                    throw new Error(errorMessage);
                }

                const allowedFileRoot = process.env.ALLOWED_FILE_ROOT;
                if (!allowedFileRoot) {
                    throw new Error(
                        "The ALLOWED_FILE_ROOT environment variable is not configured. " +
                        "It is required for the queryData tool to work properly. " +
                        "Please set ALLOWED_FILE_ROOT to a writable directory."
                    );
                }
                const jobDir = path.join(allowedFileRoot, "job", jobId);
                fs.mkdirSync(jobDir, { recursive: true });
                const tmpFilePath = path.join(jobDir, `${jobId}.csv`);
                await bulk.exportBulkData(jobId, tmpFilePath);

                let csvData: string;
                try {
                    csvData = fs.readFileSync(tmpFilePath, 'utf8');
                } finally {
                    if (fs.existsSync(tmpFilePath)) {
                        fs.unlinkSync(tmpFilePath);
                    }
                }

                const rows: string[][] = csvData
                    .trim()
                    .split('\n')
                    .map((line: string) => line.split(','));

                const columns: string[] = rows.shift() || [];
                const limitedRows: string[][] = rows.slice(0, QUERY_DATA_ROW_LIMIT);

                let responseMessage = `Query executed successfully. Retrieved ${limitedRows.length} rows.\n${JSON.stringify({ columns, rows: limitedRows })}`;
                if (limitedRows.length >= QUERY_DATA_ROW_LIMIT) {
                    responseMessage = (
                        `Here are the top ${QUERY_DATA_ROW_LIMIT} rows for the given query (including the header row). ` +
                        `It is possible (not confirmed) that there could be more rows this SELECT query could have produced. ` +
                        `If you need more rows, adjust the OFFSET in the SELECT query. ` +
                        `Note that the LIMIT cannot be increased beyond ${QUERY_DATA_ROW_LIMIT} due to system constraints.\n\n` +
                        JSON.stringify({ columns, rows: limitedRows })
                    );
                }

                return ToolResponse(responseMessage);
            }, workspaceId, sqlQuery);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while executing the query");
        }
    });


    server.registerTool("exportView",
    {
        description: dedent`
        use_case:
        - Export an object from the workspace in the specified format. These objects can be tables, charts, or dashboards.
        
        important_notes:
        - Mostly prefer html for charts, pdf dashboards, and csv for tables.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace from which to export objects"),
            viewId: z.string().describe("The ID of the Zoho Analytics view to be exported. This can be a table, chart, or dashboard"),
            responseFileFormat: z.enum(["csv", "html", "pdf", "json", "xml", "xls", "image"]).describe('The format in which to export the objects. Supported formats are ["csv","json","xml","xls","pdf","html","image"].'),
            responseFileName: z.string().describe("The name of the exported file without extension (e.g. \"sales_report\"). The file will be saved under the configured exports directory with the extension derived from responseFileFormat. Do not include path separators or directory components."),
            orgId: z.string().optional().describe("The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.")
        },
        annotations: {
          title: "Export View",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
    },
    async ({ workspaceId, viewId, responseFileFormat, responseFileName, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }

            const allowedFileRoot = process.env.ALLOWED_FILE_ROOT;
            if (!allowedFileRoot) {
                return ToolResponse(
                    "The ALLOWED_FILE_ROOT environment variable is not configured. " +
                    "It is required for the exportView tool to work properly. " +
                    "Please set ALLOWED_FILE_ROOT to a writable directory."
                );
            }

            if (!responseFileName || responseFileName.trim() === '') {
                return ToolResponse("responseFileName must not be empty.");
            }
            const sanitizedFileName = path.basename(responseFileName.trim());
            if (
                sanitizedFileName === '' ||
                sanitizedFileName === '.' ||
                sanitizedFileName === '..' ||
                sanitizedFileName !== responseFileName.trim()
            ) {
                return ToolResponse(
                    "Invalid responseFileName. Please provide a plain file name without directory separators or path traversal sequences."
                );
            }

            const exportsDir = path.join(path.resolve(allowedFileRoot), "exports");
            fs.mkdirSync(exportsDir, { recursive: true });

            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, view, response_format, fileName)=> {
                const supportedFormats = ["csv", "json", "xml", "xls", "pdf", "html", "image"];
                if (!supportedFormats.includes(response_format)) {
                    return ToolResponse(
                        `Invalid response file format. Supported formats are ${JSON.stringify(supportedFormats)}.`
                    );
                }

                const formatExtensionMap: Record<string, string> = {
                    csv: "csv", html: "html", pdf: "pdf", json: "json",
                    xml: "xml", xls: "xls", image: "png"
                };
                let extension = formatExtensionMap[response_format] || response_format;

                interface ViewDetails {
                    viewType: string;
                    isTabbedDashboard?: boolean;
                }
                const analyticsClient = getAnalyticsClient();
                let viewDetails: ViewDetails = await analyticsClient.getViewDetails(viewId, { withInvolvedMetaInfo: true }) as ViewDetails;
                if (viewDetails.viewType === "Dashboard" && viewDetails.isTabbedDashboard) {
                    extension = "zip";
                }

                const bulk = analyticsClient.getBulkInstance(org_id || "", workspace);
                const fullPath = path.join(exportsDir, `${fileName}.${extension}`);

                try {
                    await bulk.exportData(view, response_format, fullPath);
                } catch (e: any) {
                    if (e?.errorCode === 8133) {

                        if (response_format !== "pdf") {
                            return ToolResponse(
                                `Exporting view ${view} in ${response_format} format is not supported. Please use 'pdf' format for dashboards.`
                            );
                        }

                        const jobId = await bulk.initiateBulkExport(view, "pdf", { dashboardLayout: 1 });
                        const statusMessages: Record<string, string> = {
                            error: "Some internal error ocurred. Please try again later.",
                            queue_timeout: "Dashboard export Job accepted, but queue processing is slow. Please try again later.",
                            execution_timeout: "Dashboard is taking too long to export, maybe due to the complexity. Please try again later."
                        };
                        const errorMessage = await pollJobCompletion(bulk, jobId, statusMessages);
                        if (errorMessage) {
                            return ToolResponse(errorMessage);
                        }

                        await bulk.exportBulkData(jobId, fullPath);
                    } else {
                        throw e;
                    }
                }

                return ToolResponse(
                    `Object exported successfully to ${fullPath} in ${response_format} format.`
                );
            }, workspaceId, viewId, responseFileFormat, sanitizedFileName);
        } catch (error) {
            return logAndReturnError(error, `An error occurred while exporting the view`);
        }
    });


    server.registerTool("importData",
    {
        description: dedent`
        Imports data into an existing table within a specified workspace.

        Data can be provided in two ways:
        - Directly as a list of JSON objects (via the \`data\` parameter)
        - From a local file path (via \`filePath\`, with \`fileType\` set to "csv" or "json")

        PREREQUISITES:
        - The target table must already exist. If it doesn't, use \`createTable\` first.
        - Before creating a table, inspect the source data (file or inline) to determine
          the correct column names and data types.
        - If \`filePath\` points to a remote URL, download the file locally before using this tool.

        BEHAVIOR:
        - If both \`data\` and \`filePath\` are provided, \`filePath\` takes precedence.
        - For shared workspaces, \`orgId\` is required.

        returns:
        - A success message if the import completes, or a descriptive error message if it fails.
        `,
        inputSchema: {
            workspaceId: z.string().describe("The ID of the workspace that contains the target table."),
            tableId: z.string().describe("The ID of the table to import data into. "),
            data: z.array(z.record(z.string(), z.any())).optional().describe("Inline data to import, provided as an array of JSON objects. " +
                "Each object represents one row, with keys mapping to column names. " +
                "Used when no filePath is provided."),
            filePath: z.string().optional().describe("Absolute path to a local file (CSV or JSON) containing the data to import. " +
                "Remote URLs are not supported - download the file first if needed."),
            fileType: z.enum(["csv", "json"]).optional().describe("Format of the file specified in filePath. " +
            "Required when filePath is provided. Accepted values: \"csv\" or \"json\"."),
            orgId: z.string().optional().describe("Organization ID associated with the workspace. " +
                "Required for shared workspaces. Falls back to the configured default if omitted.")
        },
        annotations: {
          title: "Import Data",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspaceId, tableId, data, filePath, fileType, orgId }) => {
        try {
            if (!orgId) {
                orgId = config.ORGID || "";
            }

            let resolvedFilePath = filePath;
            if (filePath) {
                const allowedFileRoot = process.env.ALLOWED_FILE_ROOT;
                if (!allowedFileRoot) {
                    return ToolResponse(
                        "The ALLOWED_FILE_ROOT environment variable is not configured. " +
                        "It is required for the importData tool to work properly. " +
                        "Please set ALLOWED_FILE_ROOT to the directory from which file imports are permitted."
                    );
                }
                const normalizedRoot = path.resolve(allowedFileRoot);
                const tentativePath = path.resolve(filePath);
                if (tentativePath === normalizedRoot || tentativePath.startsWith(normalizedRoot + path.sep)) {
                    resolvedFilePath = tentativePath;
                } else {
                    resolvedFilePath = path.resolve(normalizedRoot, filePath);
                    if (resolvedFilePath !== normalizedRoot && !resolvedFilePath.startsWith(normalizedRoot + path.sep)) {
                        return ToolResponse(
                            `The provided file path resolves outside the allowed file root directory (${normalizedRoot}). ` +
                            `Please provide a file path that is within the allowed root.`
                        );
                    }
                }
            }

            return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, table, input , filePath, type) => {
                const analyticsClient = getAnalyticsClient();
                const bulk = analyticsClient.getBulkInstance(org_id || "", workspace);
                if (filePath) {
                    if ((filePath as string).startsWith("https")) {
                        return ToolResponse("File path cannot be a remote URL. Please download the file first and provide the local file path.");
                    }
                    const fs = require('fs');
                    if (!fs.existsSync(filePath)) {
                        return ToolResponse(`File ${filePath} does not exist. Please provide a valid local file path.`);
                    }
                    if (!type || (type !== "csv" && type !== "json")) {
                        return ToolResponse("File type must be specified as 'csv' or 'json'.");
                    }
                    const result = await bulk.importData(table, "append", type, "true", filePath, { delimiter: '0' });
                    return ToolResponse(JSON.stringify(result));
                }
                if (!input) {
                    return ToolResponse("No data provided to import. Please provide either 'data' or 'filePath'.");
                }
                const result = await bulk.importRawData(table, "append", "json", "true", JSON.stringify(input), { delimiter: '0' });
                return ToolResponse(JSON.stringify(result));
            }, workspaceId, tableId,  data, resolvedFilePath, fileType);
        } catch (error) {
            return logAndReturnError(error, "An error occurred while importing data into the table");
        }
    });
}
