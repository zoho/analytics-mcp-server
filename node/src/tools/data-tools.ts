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

    server.registerTool("query_data",
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
        workspace_id: z.string().describe("The ID of the workspace where the query will be executed"),
        sql_query: z.string().describe("The SQL query to be executed"),
        org_id: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Query Data",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspace_id, sql_query, org_id }) => {
        try {
            if (!org_id) {
                org_id = config.ORGID || "";
            }
            try {
                sql_query = enforceLimit(sql_query, QUERY_DATA_ROW_LIMIT);
            } catch (limitErr) {
                // If limit enforcement fails for any reason, proceed with the original query
            }
            return await retryWithFallback([org_id], workspace_id, "WORKSPACE", async(org_id, workspace, sql) => {
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

                const tmpFilePath = `/tmp/${jobId}.csv`;
                await bulk.exportBulkData(jobId, tmpFilePath);

                const fs = require('fs');
                const csvData = fs.readFileSync(tmpFilePath, 'utf8');
                fs.unlinkSync(tmpFilePath);

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
            }, workspace_id, sql_query);
        } catch (err) {
            return logAndReturnError(err, "An error occurred while executing the query");
        }
    });

    server.registerTool("analyze_file_structure",
    {
        description: dedent`
        use_case:
        - Analyzes the structure of a file (CSV or JSON) to determine its columns and data types.
        - This can be used to understand the structure of a file before importing it into Zoho Analytics.
        - If the table does not already exist and a file needs to be imported, this tool can be used to analyze the file structure and create a new table with the appropriate columns.

        important_notes:
        - This tool supports only local files. If the file is a remote URL, download it first using the download_file tool.
        - The returned data types will not be the exact data types used in Zoho Analytics, but rather a general representation of the data types in Python.

        returns:
        - A dictionary containing the column names and their respective data types.
        `,
        inputSchema: {
            file_path: z.string().describe("The path to the local file to be analyzed")
        },
        annotations: {
          title: "Analyze File Structure",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
    },
    async ({ file_path }) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const csv = require('csv-parser');
            if (!fs.existsSync(file_path)) {
                return ToolResponse(`${file_path} does not exist. Please provide a valid file path.`);
            }
            const fileExtension = path.extname(file_path).toLowerCase();            // Process based on file type
            if (fileExtension === '.csv') {
                return await new Promise<any>((resolve, reject) => {
                    const results: Record<string, string>[] = [];
                    const structure: Record<string, string> = {};
                    
                    fs.createReadStream(file_path)
                        .pipe(csv())
                        .on('headers', (headers: string[]) => {
                            // Initialize structure with headers
                            headers.forEach(header => {
                                structure[header] = ''; // Will be determined later
                            });
                        })
                        .on('data', (data: Record<string, string>) => {
                            results.push(data);
                            
                            // If we don't have types yet and we have some data, try to infer types
                            if (Object.values(structure).some(v => v === '') && results.length === 1) {
                                Object.entries(data).forEach(([column, value]) => {
                                    if (value === null || value === '') {
                                        structure[column] = 'TEXT'; // Default for empty values
                                    } else if (!isNaN(parseInt(value)) && parseInt(value).toString() === value) {
                                        structure[column] = 'NUMBER';
                                    } else if (!isNaN(parseFloat(value))) {
                                        structure[column] = 'DECIMAL';
                                    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
                                        structure[column] = 'BOOLEAN';
                                    } else {
                                        structure[column] = 'TEXT';
                                    }
                                });
                            }
                        })
                        .on('end', () => {
                            // Set any remaining untyped columns to TEXT
                            Object.keys(structure).forEach(key => {
                                if (structure[key] === '') {
                                    structure[key] = 'TEXT';
                                }
                            });

                            resolve(ToolResponse(`Successfully analyzed CSV file structure at: ${file_path}: ${JSON.stringify(structure)}`));
                        })
                        .on('error', (error: Error) => {
                            reject(logAndReturnError(error, `An error occurred while analyzing the CSV file structure`));
                        });
                });
                
            } else if (fileExtension === '.json') {
                const fileData = JSON.parse(fs.readFileSync(file_path, 'utf8'));
                
                if (Array.isArray(fileData) && fileData.length > 0 && typeof fileData[0] === 'object') {
                    const firstObject = fileData[0];
                    const structure: Record<string, string> = {};
                    
                    // Analyze the first object to determine types
                    for (const [column, value] of Object.entries(firstObject)) {
                        if (typeof value === 'number') {
                            // Check if it's an integer
                            if (Number.isInteger(value)) {
                                structure[column] = 'NUMBER';
                            } else {
                                structure[column] = 'DECIMAL';
                            }
                        } else if (typeof value === 'boolean') {
                            structure[column] = 'BOOLEAN';
                        } else {
                            structure[column] = 'TEXT';
                        }
                    }
                    return ToolResponse(`Successfully analyzed JSON file structure at: ${file_path}, structure: ` + JSON.stringify(structure));
                } else {
                    return ToolResponse("Invalid JSON format. Expected a list of objects.");
                }
                
            } else {
                return ToolResponse("Unsupported file type. Please provide a CSV or JSON file.");
            }
        }
        catch (err) {
            return logAndReturnError(err, `An error occurred while analyzing file structure`);
        }
    });

    server.registerTool("export_view",
    {
        description: dedent`
        use_case:
        - Export an object from the workspace in the specified format. These objects can be tables, charts, or dashboards.
        
        important_notes:
        - Mostly prefer html for charts, pdf dashboards, and csv for tables.
        `,
        inputSchema: {
            workspace_id: z.string().describe("The ID of the workspace from which to export objects"),
            view_id: z.string().describe("The ID of the Zoho Analytics view to be exported. This can be a table, chart, or dashboard"),
            response_file_format: z.enum(["csv", "html", "pdf", "json", "xml", "xls", "image"]).describe('The format in which to export the objects. Supported formats are ["csv","json","xml","xls","pdf","html","image"].'),
            response_file_path: z.string().describe("The path where the exported file will be saved"),
            org_id: z.string().optional().describe("The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.")
        },
        annotations: {
          title: "Export View",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
    },
    async ({ workspace_id, view_id, response_file_format, response_file_path, org_id }) => {
        try {
            if (!org_id) {
                org_id = config.ORGID || "";
            }
            return await retryWithFallback([org_id], workspace_id, "WORKSPACE", async (org_id, workspace, view, response_format, response_path)=> {
                const supportedFormats = ["csv", "json", "xml", "xls", "pdf", "html", "image"];
                if (!supportedFormats.includes(response_format)) {
                    return ToolResponse(
                        `Invalid response file format. Supported formats are ${JSON.stringify(supportedFormats)}.`
                    );
                }
                interface ViewDetails {
                    viewType: string;
                    isTabbedDashboard?: boolean;
                }
                const analyticsClient = getAnalyticsClient();
                let viewDetails : ViewDetails  = await analyticsClient.getViewDetails(view_id, { withInvolvedMetaInfo: true }) as ViewDetails;
                if (viewDetails.viewType == "Dashboard" && viewDetails.isTabbedDashboard) {
                    const extension = response_path.split('.').pop();
                    if (extension?.toLowerCase() !== 'zip') {
                        response_path = response_path.replace(/\.[^/.]+$/, ".zip");
                    }
                }
                const bulk = analyticsClient.getBulkInstance(org_id || "", workspace);
                let fullPath = response_path;
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
            }, workspace_id, view_id, response_file_format, response_file_path);
        } catch (error) {
            return logAndReturnError(error, `An error occurred while exporting the view`);
        }
    });

    server.registerTool("download_file",
    {
        description: dedent`
        use_case:
        - Downloads a file from a given URL and saves it to a local directory.
        - This can be used to download files that need to be imported into Zoho Analytics.

        returns:
        - A string indicating the path where the file has been saved locally.
        `,
        inputSchema: {
        file_url: z.string().describe("The URL of the file to be downloaded")
        },
        annotations: {
          title: "Download File",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true
        }
    },
    async ({ file_url }) => {
        try {   
            const fs = require('fs');
            const path = require('path');
            const axios = require('axios');
            const url = require('url');
            const downloadDir = '/tmp';
            fs.mkdirSync(downloadDir, { recursive: true });
            const parsedUrl = new URL(file_url);
            let filename = path.basename(parsedUrl.pathname);
            const fileType = file_url.split('.').pop()?.toLowerCase() || '';
            if (!filename) {
                filename = `downloaded_file.${fileType}`;
            }
            const downloadedPath = path.join(downloadDir, filename);
            const response = await axios({
                method: 'GET',
                url: file_url,
                responseType: 'stream',
            });
            const writer = fs.createWriteStream(downloadedPath);
            response.data.pipe(writer);
            return await new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    resolve(ToolResponse(`File downloaded successfully and saved to ${downloadedPath}`));
                });
                writer.on('error', (err: Error) => {
                    reject(logAndReturnError(err, `An error occurred while downloading the file from ${file_url}`));
                });
            });
        } catch (error) {
            return logAndReturnError(error, `Failed to download the file from ${file_url}`);
        }
    });

    server.registerTool("import_data",
    {
        description: dedent`
        use_case:
        - Imports data into a specified table in a workspace. The data to be imported should be provided as a list of dictionaries or as a file path (only local file). If file_path is provided, the format of the file should also be provided (csv or json), else the data parameter will be used.
        - This can be used for both file upload as well as direct data import into a table.
        
        important_notes:
        - Make sure the the table already exists in the workspace before importing data.
        - If no table exists, create a table first using the create_table tool before importing the data.
        - if the file_path is a remote URL, download the file using download_file tool before using this tool.
        - if the file_path is a remote URL and table does not exist, you can create a new table using the create_table tool, analyse the structure (column structure of the table) of the file using analyse_file_structure tool and then import the data.

        returns:
        - A string indicating the result of the import operation. If successful, it returns a success message; otherwise, it returns an error message.
        `,
        inputSchema: {
            workspace_id: z.string().describe("The ID of the workspace containing the table"),
            table_id: z.string().describe("The ID of the table to which data will be added. It is None if the data needs to be added to a new table"),
            data: z.array(z.record(z.string(), z.any())).optional().describe("The data to be added to the table in json format"),
            file_path: z.string().optional().describe("The path to a local file containing data to be added to the table"),
            file_type: z.enum(["csv", "json"]).optional().describe("The type of the file being imported (\"csv\", \"json\")"),
            org_id: z.string().optional().describe("The organization ID for the request, if applicable. This is a mandatory parameter for shared workspaces")
        },
        annotations: {
          title: "Import Data",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
    },
    async ({ workspace_id, table_id, data, file_path, file_type, org_id }) => {
        try {
            if (!org_id) {
                org_id = config.ORGID || "";
            }
            return await retryWithFallback([org_id], workspace_id, "WORKSPACE", async (org_id, workspace, table, input , path, type) => {
                const analyticsClient = getAnalyticsClient();
                const bulk = analyticsClient.getBulkInstance(org_id || "", workspace);
                if (path) {
                    if (path.startsWith("https")) {
                        return ToolResponse("File path cannot be a remote URL. Please download the file using the download_file tool and provide the local file path.");
                    }
                    const fs = require('fs');
                    if (!fs.existsSync(path)) {
                        return ToolResponse(`File ${path} does not exist. Please provide a valid local file path.`);
                    }
                    if (!type || (type !== "csv" && type !== "json")) {
                        return ToolResponse("File type must be specified as 'csv' or 'json'.");
                    }
                    const result = await bulk.importData(table, "append", type, "true", path, { delimiter: '0' });
                    return ToolResponse(JSON.stringify(result));
                }
                if (!input) {
                    return ToolResponse("No data provided to import. Please provide either 'data' or 'local_file_path'.");
                }
                const result = await bulk.importRawData(table, "append", "json", "true", JSON.stringify(input), { delimiter: '0' });
                return ToolResponse(JSON.stringify(result));
            }, workspace_id, table_id,  data, file_path, file_type);
        } catch (error) {
            return logAndReturnError(error, "An error occurred while importing data into the table");
        }
    });
}