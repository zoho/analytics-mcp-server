# Zoho Analytics MCP Server

[![NPM Version](https://img.shields.io/npm/v/zoho-analytics-mcp-server)](https://www.npmjs.com/package/zoho-analytics-mcp-server)
[![NPM Downloads](https://img.shields.io/npm/dm/zoho-analytics-mcp-server)](https://www.npmjs.com/package/zoho-analytics-mcp-server)

A Node.js implementation of the Zoho Analytics Model Context Protocol (MCP) Server that provides seamless integration between Zoho Analytics and MCP Hosts such as VS Code, Claude Desktop, Cursor, and more.

## Overview

The Zoho Analytics MCP Server enables direct access to your Zoho Analytics data through MCP-compatible applications. This NPM package provides a lightweight, Docker-free alternative that makes it easy to integrate Zoho Analytics into your MCP workflows.

**Key Benefits:**
- Direct access to Zoho Analytics data from MCP-compatible applications
- No Docker dependency - runs directly with Node.js
- Easy configuration through environment variables
- Support for multiple MCP hosts

## Prerequisites

Before using the Zoho Analytics MCP Server, ensure you have:

- **Node.js** - Latest LTS version recommended
- **MCP Host Application** - Such as VS Code with GitHub Copilot extension, Claude Desktop, or Cursor
- **Zoho Account Credentials** - Client ID, Client Secret, and Refresh Token (see [Authentication Setup](#authentication-setup))

## Quick Start

### Installation

The easiest way to use the Zoho Analytics MCP Server is through NPX (no installation required):

```bash
npx zoho-analytics-mcp-server@latest
```

Alternatively, you can install it globally:

```bash
npm install -g zoho-analytics-mcp-server
```

### Authentication Setup

To use the Zoho Analytics MCP Server, you need OAuth credentials from Zoho. Follow these steps:

1. **Go to the [Zoho Developer Console](https://api-console.zoho.com/)**
2. **Create a new Self-Client application**
3. **Enable the Zoho Analytics API scope**
4. **Generate your Refresh Token**

For detailed instructions, refer to the [official API Authentication Documentation](https://www.zoho.com/analytics/api/).

## Configuration

### Environment Variables

#### Required Variables

| Variable | Description |
|----------|-------------|
| `ANALYTICS_CLIENT_ID` | Your Zoho Analytics OAuth client ID |
| `ANALYTICS_CLIENT_SECRET` | Your Zoho Analytics OAuth client secret |
| `ANALYTICS_REFRESH_TOKEN` | Your Zoho Analytics OAuth refresh token |
| `ANALYTICS_ORG_ID` | Your Zoho Analytics organization ID |
| `ACCOUNTS_SERVER_URL` | Your Zoho Accounts Domain URL (typically `<your-accounts-uri>`) |
| `ANALYTICS_SERVER_URL` | Your Zoho Analytics API Domain URL (typically `<your-analytics-uri>`) |

#### Optional Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `ANALYTICS_MCP_DATA_DIR` | Directory for storing temporary data files | System temp directory |
| `QUERY_DATA_RESULT_ROW_LIMITS` | Maximum number of rows returned by the query_data tool | 20 |
| `QUERY_DATA_POLLING_INTERVAL` | Interval (in seconds) between job status polls | 4 |
| `QUERY_DATA_QUEUE_TIMEOUT` | Maximum time (in seconds) a job can remain in queue | 120 |
| `QUERY_DATA_QUERY_EXECUTION_TIMEOUT` | Maximum query execution time (in seconds) | 30 |
| `WORKSPACE_RESULT_LIMIT` | Maximum number of workspaces returned by get_workspaces | 20 |
| `VIEW_RESULT_LIMIT` | Maximum number of views returned by get_views | 30 |



#### Tools List

The Zoho Analytics MCP server provides various tools for interacting with Zoho Analytics.

<table>
  <thead>
    <tr>
      <th>Tool</th>
      <th>API Used</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>create_workspace</td>
      <td>Create Workspace</td>
      <td>Creates a new workspace in Zoho Analytics with the given name.</td>
    </tr>
    <tr>
      <td>create_table</td>
      <td>Create Table</td>
      <td>Creates a new table in a specified workspace with defined columns.</td>
    </tr>
    <tr>
      <td>get_workspaces_list</td>
      <td>Get All Workspaces</td>
      <td>Fetches the list of workspaces in the user's organization.</td>
    </tr>
    <tr>
      <td>search_views</td>
      <td>search Views</td>
      <td>Fetches the list of views (tables, reports, dashboards) within a specified workspace based on the query</td>
    </tr>
    <tr>
      <td>get_view_details</td>
      <td>Get View Details</td>
      <td>Fetches the details of a specific view, including its structure and properties.</td>
    </tr>
    <tr>
      <td>import_data</td>
      <td>Import data - New table</td>
      <td>Imports data into a specified table from a file or a list of dictionaries.</td>
    </tr>
    <tr>
      <td>export_view</td>
      <td>Export Data<br>Export Data (Asynchronous) - For exporting Dashboards</td>
      <td>Exports an object (table, chart, or dashboard) from the workspace in the specified format.</td>
    </tr>
    <tr>
      <td>query_data</td>
      <td>Create Export Job - Using SQL Query</td>
      <td>Executes a SQL query on the specified workspace and returns the results.</td>
    </tr>
    <tr>
      <td>create_aggregate_formula</td>
      <td>Add Aggregate Formula</td>
      <td>Creates an aggregate formula in a specified table that returns a single aggregate value.</td>
    </tr>
    <tr>
      <td>create_query_table</td>
      <td>Create Query Table</td>
      <td>Creates a query table based on a SQL query for derived data views.</td>
    </tr>
    <tr>
      <td>create_chart_report</td>
      <td>Create Report</td>
      <td>Creates a chart report (bar, line, pie, scatter, bubble) in the specified workspace.</td>
    </tr>
    <tr>
      <td>create_pivot_report</td>
      <td>Create Report</td>
      <td>Creates a pivot table report for multidimensional data analysis.</td>
    </tr>
    <tr>
      <td>create_summary_report</td>
      <td>Create Report</td>
      <td>Creates a summary report that groups data by specified columns and applies aggregate functions.</td>
    </tr>
    <tr>
      <td>add_row</td>
      <td>Add row</td>
      <td>Adds a new row to a specified table.</td>
    </tr>
    <tr>
      <td>update_rows</td>
      <td>Update row</td>
      <td>Updates rows in a specified table based on given criteria.</td>
    </tr>
    <tr>
      <td>delete_rows</td>
      <td>Delete row</td>
      <td>Deletes rows from a specified table based on given criteria.</td>
    </tr>
    <tr>
      <td>delete_view</td>
      <td>Delete View</td>
      <td>Deletes a view (table, report, or dashboard) from a workspace.</td>
    </tr>
    <tr>
      <td>analyse_file_structure</td>
      <td>Not Applicable</td>
      <td>Analyzes the structure of a CSV or JSON file to determine its columns and data types.</td>
    </tr>
    <tr>
      <td>download_file</td>
      <td>Not Applicable</td>
      <td>Downloads a file from a given URL and saves it to a local directory.</td>
    </tr>
  </tbody>
</table>



## MCP Host Integration

### VS Code Configuration

Add the following configuration to your VS Code MCP settings file. For detailed setup instructions, see the [VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

```json
{
  "servers": {
    "zoho_analytics": {
      "type": "stdio",
      "command": "npx",
      "args": ["zoho-analytics-mcp-server@latest"],
      "env": {
        "ANALYTICS_CLIENT_ID": "your-client-id-here",
        "ANALYTICS_CLIENT_SECRET": "your-client-secret-here", 
        "ANALYTICS_REFRESH_TOKEN": "your-refresh-token-here",
        "ANALYTICS_ORG_ID": "your-org-id-here",
        "ACCOUNTS_SERVER_URL": "<your-accounts-uri>",
        "ANALYTICS_SERVER_URL": "<your-analytics-uri>"
      }
    }
  }
}
```

### Claude Desktop Configuration

For Claude Desktop, add the following to your MCP configuration file:

```json
{
  "mcpServers": {
    "zoho-analytics-mcp": {
      "command": "npx",
      "args": ["zoho-analytics-mcp-server@latest"],
      "env": {
        "ANALYTICS_CLIENT_ID": "your-client-id-here",
        "ANALYTICS_CLIENT_SECRET": "your-client-secret-here",
        "ANALYTICS_REFRESH_TOKEN": "your-refresh-token-here", 
        "ANALYTICS_ORG_ID": "your-org-id-here",
        "ACCOUNTS_SERVER_URL": "<your-accounts-uri>",
        "ANALYTICS_SERVER_URL": "<your-analytics-uri>"
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

- **Authentication Errors**: Ensure your OAuth credentials are correct and have the necessary scopes
- **Connection Timeouts**: Check your network connectivity and adjust timeout values if necessary
- **Permission Errors**: Verify that your Zoho account has access to the specified organization and workspaces

### Support

For issues and questions, contact Zoho support for account-related issues