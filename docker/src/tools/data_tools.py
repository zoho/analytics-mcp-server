from src.mcp_instance import mcp
from src.config import Settings
import os
import json
import urllib
import requests
from src.utils.analytics.common import retry_with_fallback
from src.utils.analytics.data import QUERY_DATA_ROW_LIMIT, import_data_implementation, export_view_implementation, query_data_implementation
import traceback
from fastmcp.server.dependencies import get_context
from sql_limit_enforcer import enforce_limit


@mcp.tool()
async def import_data(workspace_id: str, table_id: str, data: list[dict] | None = None, file_path: str | None = None, file_type: str | None = None, org_id: str | None = None) -> str:
    """
    <use_case>
    1. Imports data into a specified table in a workspace. The data to be imported should be provided as a list of dictionaries or as a file path (only local file). If file_path is provided, the format of the file should also be provided (csv or json), else the data parameter will be used.
    2. This can be used for both file upload as well as direct data import into a table.
    </use_case>

    <important_notes>
    - Make sure the the table already exists in the workspace before importing data.
    - If no table exists, create a table first using the create_table tool before importing the data.
    - if the file_path is a remote URL, download the file using download_file tool before using this tool.
    - if the file_path is a remote URL and table does not exist, you can create a new table using the create_table tool, analyse the structure of the file first, then create the table and  import the data.
    </important_notes>


    <arguments>
        workspace_id (str): The ID of the workspace containing the table.
        table_id (str): The ID of the table to which data will be added. It is None if the data needs to be added to a new table.
        data (str): The data to be added to the table in json format.
        file_path (str): The path to a local file containing data to be added to the table.
        file_type (str): The type of the file being imported ("csv", "json").
        org_id (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
    </arguments>

    <returns>
        A string indicating the result of the import operation. If successful, it returns a success message; otherwise, it returns an error message.
    </returns>
    """
    try:
        if not org_id:
            org_id = Settings.ORG_ID
        
        result = await retry_with_fallback([org_id], workspace_id, "WORKSPACE", import_data_implementation, workspace_id=workspace_id, file_path=file_path, table_id=table_id, file_type=file_type, data=data)
        return result.__str__()
    except Exception as e:
        ctx = get_context()
        await ctx.error(traceback.format_exc())
        return f"An error occurred while adding data to the table : {e}"


@mcp.tool()
async def export_view(workspace_id: str, view_id: str, response_file_format: str, response_file_path: str, org_id: str | None = None) -> str:
    """
    <use_case>
        Export an object from the workspace in the specified format. These objects can be tables, charts, or dashboards.
    </use_case>

    <important_notes>
        Mostly prefer html for charts and dashboards, and csv for tables.
    </important_notes>
    
    <arguments>
        workspace_id (str): The ID of the workspace from which to export objects.
        view_id (str): The ID of the Zoho Analytics view to be exported. This can be a table, chart, or dashboard.
        response_file_format (str): The format in which to export the objects. Supported formats are ["csv","json","xml","xls","pdf","html","image"].
        response_file_path (str): The path where the exported file will be saved.
        org_id (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
    <arguments>
    """
    try:
        if not org_id:
            org_id = Settings.ORG_ID
        return await retry_with_fallback([org_id], workspace_id, "WORKSPACE", export_view_implementation, response_file_format=response_file_format, response_file_path=response_file_path, workspace_id=workspace_id, view_id=view_id)
    except Exception as e:
        ctx = get_context()
        await ctx.error(traceback.format_exc())
        return f"An error occurred while exporting the object : {e}"


@mcp.tool()
async def query_data(workspace_id: str, sql_query: str, org_id: str | None = None) -> str:
    """
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
    - The tool enforces a maximum row cap of N rows - only the top N rows are returned
      regardless of how many rows the query would otherwise produce.
    - To paginate through results beyond the first N rows, use LIMIT with OFFSET
      (e.g., LIMIT 20 OFFSET 20 for the next page).
    - If table or column names contain spaces or special characters, enclose them in
      double quotes (e.g., "Column Name").
    - Do not use more than one level of nested sub-queries.
    - Combine multiple lookups into a single query using JOINs, UNIONs, or sub-queries
      where possible, while keeping the query efficient and optimized.

    Pagination Strategy:
    Since only the top N rows are returned, when absolutely necessary, use LIMIT + OFFSET to walk through data:
    - Page 1: LIMIT N OFFSET 0
    - Page 2: LIMIT N OFFSET N
    - Page 3: LIMIT N OFFSET 2N
    The first tool response will indicate the actual value of N so you can paginate correctly. Note that the maximum value for limit is N, and it is not possible to increase this limit. If you need more rows, you must adjust the OFFSET in the query to fetch the next set of rows.

    Arguments:
        - workspace_id (str): The ID of the workspace where the query will be executed.
        - sql_query (str): The MySQL-compatible SELECT query to execute. Always try to generate an optimized query.
        - org_id (str | None): The ID of the organization to which the workspace belongs to. If not provided, it defaults to the organization ID from the configuration.
    

     Returns:
        - Top N rows of the query result in comma-separated (list of list) format.
        - The first row contains column names.
        - The response header indicates the actual value of N (e.g., "Here are the top N results").
        - If an error occurs, returns an error message.
    """
    if not org_id:
        org_id = Settings.ORG_ID


    query_data_row_limit = Settings.QUERY_DATA_RESULT_ROW_LIMITS
    query_data_row_limit = query_data_row_limit if query_data_row_limit is not None and query_data_row_limit <= 1000  else 1000

    try:
        sql_query = enforce_limit(sql_query, query_data_row_limit)
    except Exception as e:
        ctx = get_context()
        await ctx.error(traceback.format_exc())
    
    try:
        res = await retry_with_fallback([org_id], workspace_id, "WORKSPACE", query_data_implementation, workspace_id=workspace_id, sql_query=sql_query)
        try:
            if isinstance(res, list) and len(res) >= query_data_row_limit:
                prefix = (
                    f"Here are the top {query_data_row_limit} rows for the given query "
                    f"(including the header row). It is possible (not confirmed) that there "
                    f"could be more rows this SELECT query could have produced. "
                    f"If you need more rows, adjust the OFFSET in the SELECT query."
                    f"Note that the LIMIT cannot be increased beyond {query_data_row_limit} due to system constraints.\n\n"
                )
                return prefix + res.__str__()
        except Exception as e:
            ctx = get_context()
            await ctx.error(traceback.format_exc())
        
        return res.__str__()
    except Exception as e:
        ctx = get_context()
        await ctx.error(traceback.format_exc())
        return f"An error occurred while executing the query: {e}"
    

if Settings.HOSTED_LOCATION == Settings.CONSTANT_REMOTE_HOSTED_LOCATION:
    import_data.disable()
    export_view.disable()