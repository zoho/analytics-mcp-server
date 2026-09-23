import { z } from "zod";
import path from "path";
import fs from "fs";
import { defineTool } from "../../tool-registry";
import { getAnalyticsClient, config } from "../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../utils/common";
import {
  pollJobCompletion,
  QUERY_DATA_POLLING_INTERVAL,
  QUERY_DATA_QUEUE_TIMEOUT,
  QUERY_DATA_QUERY_EXECUTION_TIMEOUT,
  QUERY_DATA_ROW_LIMIT,
} from "../../utils/data-util";
import { enforceLimit } from "../../utils/sqlLimitEnforcer";

// ---- Tool Registrations ----

defineTool({
  name: "queryData",
  description: `
    Executes a SQL query on the specified workspace and returns the top N rows as results.
    Use this to retrieve data from Zoho Analytics using custom SQL queries, gather insights,
    and answer natural language queries by analyzing the results.

    Use Cases:
    - Retrieve data from a Zoho Analytics workspace using custom SQL queries.
    - Gather insights from the data and answer user queries.
    - Answer natural language queries by analyzing SQL query results.

    Important Notes:
    - Always provide a MySQL-compatible SELECT query only.
    - Always include a LIMIT clause and use aggregate queries (COUNT, SUM, AVG, etc.) wherever possible
      to minimize data transfer and avoid fetching raw rows unnecessarily.
    - The tool enforces a maximum row cap of N rows - only the top N rows are returned.
    - To paginate through results beyond the first N rows, use LIMIT with OFFSET
      (e.g., LIMIT 20 OFFSET 20 for the next page).
    - If table or column names contain spaces or special characters, enclose them in double quotes.
    - Do not use more than one level of nested sub-queries.
    - Combine multiple lookups into a single query using JOINs, UNIONs, or sub-queries where possible.

    Pagination Strategy:
    Since only the top N rows are returned, use LIMIT + OFFSET to walk through data:
    - Page 1: LIMIT N OFFSET 0
    - Page 2: LIMIT N OFFSET N
    - Page 3: LIMIT N OFFSET 2N
    The first tool response will indicate the actual value of N.

    Returns:
    - Top N rows of the query result as JSON with columns and rows arrays.
    - If an error occurs, returns an error message.
  `,
  args: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace where the query will be executed"),
    sqlQuery: z.string().describe("The SQL query to be executed"),
  },
  handler: async ({ workspaceId, sqlQuery }) => {
    try {
      try {
        sqlQuery = enforceLimit(sqlQuery, QUERY_DATA_ROW_LIMIT);
      } catch {
        // If limit enforcement fails for any reason, proceed with the original query
      }
      return await retryWithFallback(
        [config.ORGID || ""],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, sql) => {
          const analyticsClient = getAnalyticsClient();
          const bulk = analyticsClient.getBulkInstance(org_id, workspace);

          const jobId = await bulk.initiateBulkExportUsingSQL(sql, "CSV");

          const statusMessages: Record<string, string> = {
            error:
              "Some internal error occurred (Not likely due to the query). Please try again later.",
            queue_timeout:
              "Query Job accepted, but queue processing is slow. Please try again later.",
            execution_timeout:
              "Query is taking too long to execute, maybe due to the complexity. Please try a simpler query",
          };

          const errorMessage = await pollJobCompletion(
            bulk,
            jobId,
            statusMessages,
            QUERY_DATA_POLLING_INTERVAL,
            QUERY_DATA_QUEUE_TIMEOUT,
            QUERY_DATA_QUERY_EXECUTION_TIMEOUT
          );

          if (errorMessage) throw new Error(errorMessage);

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
            csvData = fs.readFileSync(tmpFilePath, "utf8");
          } finally {
            if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
          }

          const rows: string[][] = csvData
            .trim()
            .split("\n")
            .map((line: string) => line.split(","));

          const columns: string[] = rows.shift() || [];
          const limitedRows: string[][] = rows.slice(0, QUERY_DATA_ROW_LIMIT);

          let responseMessage =
            `Query executed successfully. Retrieved ${limitedRows.length} rows.\n` +
            JSON.stringify({ columns, rows: limitedRows });

          if (limitedRows.length >= QUERY_DATA_ROW_LIMIT) {
            responseMessage =
              `Here are the top ${QUERY_DATA_ROW_LIMIT} rows for the given query (including the header row). ` +
              `It is possible (not confirmed) that there could be more rows this SELECT query could have produced. ` +
              `If you need more rows, adjust the OFFSET in the SELECT query. ` +
              `Note that the LIMIT cannot be increased beyond ${QUERY_DATA_ROW_LIMIT} due to system constraints.\n\n` +
              JSON.stringify({ columns, rows: limitedRows });
          }

          return ToolResponse(responseMessage);
        },
        workspaceId,
        sqlQuery
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while executing the query");
    }
  },
});

defineTool({
  name: "importData",
  description: `
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
  args: {
    workspaceId: z.string().describe("The ID of the workspace that contains the target table."),
    tableId: z.string().describe("The ID of the table to import data into. "),
    data: z
      .array(z.record(z.string(), z.any()))
      .optional()
      .describe(
        "Inline data to import, provided as an array of JSON objects. " +
          "Each object represents one row, with keys mapping to column names. " +
          "Used when no filePath is provided."
      ),
    filePath: z
      .string()
      .optional()
      .describe(
        "Absolute path to a local file (CSV or JSON) containing the data to import. " +
          "Remote URLs are not supported - download the file first if needed."
      ),
    fileType: z
      .enum(["csv", "json"])
      .optional()
      .describe(
        "Format of the file specified in filePath. " +
          "Required when filePath is provided. Accepted values: \"csv\" or \"json\"."
      ),
    orgId: z
      .string()
      .optional()
      .describe(
        "Organization ID associated with the workspace. " +
          "Required for shared workspaces. Falls back to the configured default if omitted."
      ),
  },
  handler: async ({ workspaceId, tableId, data, filePath, fileType, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }

      let resolvedFilePath = filePath;
      if (filePath) {
        const allowedFileRoot = process.env.ALLOWED_FILE_ROOT;
        if (!allowedFileRoot) {
          throw new Error(
            "The ALLOWED_FILE_ROOT environment variable is not configured. " +
              "It is required for the importData tool to work properly. " +
              "Please set ALLOWED_FILE_ROOT to the directory from which file imports are permitted."
          );
        }
        const normalizedRoot = path.resolve(allowedFileRoot);
        const tentativePath = path.resolve(filePath);
        if (
          tentativePath === normalizedRoot ||
          tentativePath.startsWith(normalizedRoot + path.sep)
        ) {
          resolvedFilePath = tentativePath;
        } else {
          resolvedFilePath = path.resolve(normalizedRoot, filePath);
          if (
            resolvedFilePath !== normalizedRoot &&
            !resolvedFilePath.startsWith(normalizedRoot + path.sep)
          ) {
            throw new Error(
              `The provided file path resolves outside the allowed file root directory (${normalizedRoot}). ` +
                `Please provide a file path that is within the allowed root.`
            );
          }
        }
      }

      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, table, input, filePath, type) => {
          const analyticsClient = getAnalyticsClient();
          const bulk = analyticsClient.getBulkInstance(org_id || "", workspace);

          if (filePath) {
            if ((filePath as string).startsWith("https")) {
              return ToolResponse(
                "File path cannot be a remote URL. Please download the file first and provide the local file path."
              );
            }
            if (!fs.existsSync(filePath)) {
              return ToolResponse(
                `File ${filePath} does not exist. Please provide a valid local file path.`
              );
            }
            if (!type || (type !== "csv" && type !== "json")) {
              return ToolResponse("File type must be specified as 'csv' or 'json'.");
            }
            const result = await bulk.importData(table, "append", type, "true", filePath, {
              delimiter: "0",
            });
            return ToolResponse(JSON.stringify(result));
          }

          if (!input) {
            return ToolResponse("No data provided to import. Please provide either 'data' or 'filePath'.");
          }

          const result = await bulk.importRawData(
            table,
            "append",
            "json",
            "true",
            JSON.stringify(input),
            { delimiter: "0" }
          );
          return ToolResponse(JSON.stringify(result));
        },
        workspaceId,
        tableId,
        data,
        resolvedFilePath,
        fileType
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while importing data into the table");
    }
  },
});

defineTool({
  name: "exportData",
  description: `
    Exports a view from a Zoho Analytics workspace to a CSV file on the server.

    Use Cases:
    - Export a table, report, or other view data to a file for further processing or archiving.
    - Take a snapshot of a view's data and save it to the server's configured export directory.

    Important Notes:
    - Exports are saved in CSV format to the server's configured ALLOWED_FILE_ROOT directory.
    - First attempts a synchronous export. If that fails (e.g., for views not supported by
      the synchronous API such as tables with more than one million rows, live connect views,
      dashboards, or query tables), automatically falls back to the asynchronous export API.
    - Returns the full file path where the exported data was saved.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the view to export"),
    viewId: z.string().describe("The ID of the view to export"),
  },
  handler: async ({ workspaceId, viewId }) => {
    try {
      return await retryWithFallback(
        [config.ORGID || ""],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, view) => {
          const allowedFileRoot = process.env.ALLOWED_FILE_ROOT;
          if (!allowedFileRoot) {
            throw new Error(
              "The ALLOWED_FILE_ROOT environment variable is not configured. " +
                "It is required for the exportData tool to work properly. " +
                "Please set ALLOWED_FILE_ROOT to a writable directory."
            );
          }

          const analyticsClient = getAnalyticsClient();
          const bulk = analyticsClient.getBulkInstance(org_id, workspace);

          const exportDir = path.join(allowedFileRoot, "exports");
          fs.mkdirSync(exportDir, { recursive: true });
          const filePath = path.join(exportDir, `export_${view}_${Date.now()}.csv`);

          try {
            await bulk.exportData(view, "csv", filePath);
            return ToolResponse(`View exported successfully. File saved to: ${filePath}`);
          } catch {
            // Sync export not supported for this view — fall back to async export
            const jobId = await bulk.initiateBulkExport(view, "csv");

            const statusMessages: Record<string, string> = {
              error: "An internal error occurred during the async export job. Please try again later.",
              queue_timeout: "Export job accepted, but queue processing is slow. Please try again later.",
              execution_timeout: "Export job is taking too long to complete. Please try again later.",
            };

            const errorMessage = await pollJobCompletion(
              bulk,
              jobId,
              statusMessages,
              QUERY_DATA_POLLING_INTERVAL,
              QUERY_DATA_QUEUE_TIMEOUT,
              QUERY_DATA_QUERY_EXECUTION_TIMEOUT
            );

            if (errorMessage) throw new Error(errorMessage);

            await bulk.exportBulkData(jobId, filePath);
            return ToolResponse(`View exported successfully. File saved to: ${filePath}`);
          }
        },
        workspaceId,
        viewId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while exporting the view");
    }
  },
});

defineTool({
  name: "addRow",
  description: `
    <use_case>
    Adds a new row to the specified table.
    </use_case>
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace where the table is located"),
    tableId: z.string().describe("The ID of the table to which the row will be added"),
    columns: z
      .record(z.string(), z.string())
      .describe("A dictionary containing the column names and their corresponding values for the new row"),
  },
  handler: async ({ workspaceId, tableId, columns }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, table, cols) => {
          const analyticsClient = getAnalyticsClient();
          const view = analyticsClient.getViewInstance(org_id, workspace, table);
          await view.addRow(cols);
          return ToolResponse("Row added successfully.");
        },
        workspaceId,
        tableId,
        columns
      );
    } catch (err) {
      return logAndReturnError(err, "Error while adding row");
    }
  },
});

defineTool({
  name: "deleteRows",
  description: `
    <use_case>
    Deletes rows from the specified table based on the given criteria.
    </use_case>
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace where the table is located"),
    tableId: z.string().describe("The ID of the table from which rows will be deleted"),
    criteria: z
      .string()
      .describe(
        "A string representing the criteria for selecting rows to delete. Example criteria: \"\\\"SalesTable\\\".\\\"Region\\\"='East'\""
      ),
  },
  handler: async ({ workspaceId, tableId, criteria }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, table, crit) => {
          const analyticsClient = getAnalyticsClient();
          const view = analyticsClient.getViewInstance(org_id, workspace, table);
          await view.deleteRow(crit);
          return ToolResponse("Rows deleted successfully.");
        },
        workspaceId,
        tableId,
        criteria
      );
    } catch (err) {
      return logAndReturnError(err, "Error while deleting rows");
    }
  },
});

defineTool({
  name: "updateRows",
  description: `
    <use_case>
    Updates rows in the specified table based on the given criteria.
    </use_case>
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace where the table is located"),
    tableId: z.string().describe("The ID of the table to be updated"),
    columns: z
      .record(z.string(), z.string())
      .describe("A dictionary containing the column names and their new values for the update"),
    criteria: z
      .string()
      .describe(
        "A string representing the criteria for selecting rows to update. Example criteria: \"\\\"SalesTable\\\".\\\"Region\\\"='East'\""
      ),
  },
  handler: async ({ workspaceId, tableId, columns, criteria }) => {
    try {
      const orgId = config.ORGID || "";
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace, table, crit, cols) => {
          const analyticsClient = getAnalyticsClient();
          const view = analyticsClient.getViewInstance(org_id, workspace, table);
          await view.updateRow(cols, crit);
          return ToolResponse("Rows updated successfully.");
        },
        workspaceId,
        tableId,
        criteria,
        columns
      );
    } catch (err) {
      return logAndReturnError(err, "Error while updating rows");
    }
  },
});
