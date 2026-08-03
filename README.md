# Zoho Analytics MCP Server

The Zoho Analytics MCP Server (Beta) implements the Model Context Protocol (MCP), a standardized interface that enables AI models to interact seamlessly with applications. This middleware solution bridges the connection between AI agents and Zoho Analytics, providing powerful data analysis capabilities through a unified interface.

*Note: The Zoho Analytics MCP project is currently in its early development (Beta) phase. As we continue to improve and refine its features, the available tools and functionalities may change.*

# Getting Started

1. [Docker Image Setup](#1-docker-image-setup)
2. [Configuring Environment Variables](#2-configuring-environment-variables)
3. [Remote MCP Server Setup (Hosted Option)](#3-remote-mcp-server-setup-hosted-option)
4. [Integrating with MCP Hosts](#4-integrate-with-mcp-hosts)
    - [Claude Desktop](#claude-desktop-configuration)
    - [VSCode](#vscode-configuration)
    - [Cursor](#cursor-configuration)


### 1. Docker Image Setup

**System Requirements**
To build the Zoho Analytics MCP server from source, you need to have Docker installed on your system. Before setup, please make sure to have `docker` and a `container runtime` installed in your device.

**Pull Docker Image**

If you prefer to use the pre-built Docker image, you can pull it directly from Docker Hub:

```bash
docker pull zohoanalytics/mcp-server:latest
```

### 2. Configuring Environment Variables

**Obtaining OAuth Credentials**
To configure the Zoho Analytics MCP Server, you need to provide OAuth credentials (Client ID, Client Secret, and Refresh Token) as environment variables. Follow these steps to generate them:
1. Go to the [Zoho Developer Console](https://api-console.zoho.com/)
2. Create a new Self-Client application.
3. Enable the Zoho Analytics API scope.
4. Generate your Refresh Token.
For detailed instructions, refer to the official [API Authentication Documentation](https://www.zoho.com/analytics/api/v2/authentication.html).


**Required Environment Variables**

Configure these essential variables before integrating with the MCP Hosts:

<table>
  <thead>
    <tr>
      <th>Variable</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>ANALYTICS_CLIENT_ID</td>
      <td>Your Zoho Analytics OAuth client ID</td>
    </tr>
    <tr>
      <td>ANALYTICS_CLIENT_SECRET</td>
      <td>Your Zoho Analytics OAuth client secret</td>
    </tr>
    <tr>
      <td>ANALYTICS_REFRESH_TOKEN</td>
      <td>Your Zoho Analytics OAuth refresh token</td>
    </tr>
    <tr>
      <td>ANALYTICS_ORG_ID</td>
      <td>Your Zoho Analytics organization ID</td>
    </tr>
    <tr>
      <td>ANALYTICS_MCP_DATA_DIR</td>
      <td>Directory for storing temporary data files</td>
    </tr>
    <tr>
      <td>ACCOUNTS_SERVER_URL</td>
      <td>Your Zoho Analytics Accounts Domain URL (https://accounts.zoho.com)</td>
    </tr>
    <tr>
      <td>ANALYTICS_SERVER_URL</td>
      <td>Your Zoho Analytics Accounts Domain URL (https://analyticsapi.zoho.com)</td>
    </tr>
  </tbody>
</table>


**Other Environment variables**

The following is a list of other optional environment variables:

<table>
  <tbody>
    <tr>
      <td>QUERY_DATA_RESULT_ROW_LIMITS (Optional)</td>
      <td>Number of rows outputted by the query_data tool. <br><br>Default row limit - 20</td>
    </tr>
    <tr>
      <td>QUERY_DATA_POLLING_INTERVAL (Optional)</td>
      <td>Sleep Time between consecutive polls to check job status (JOB COMPLETED, JOB IN QUEUE; For more, please refer to analytics v2 api documentation). Default sleep time - 4 seconds</td>
    </tr>
    <tr>
      <td>QUERY_DATA_QUEUE_TIMEOUT (Optional)</td>
      <td>This is the amount of time allowed between job submit time in the queue and job processing (query processing) time. Default time in queue - 120 seconds</td>
    </tr>
    <tr>
      <td>QUERY_DATA_QUERY_EXECUTION_TIMEOUT (Optional)</td>
      <td>The amount of time allowed for query execution. Default execution time - 30 seconds</td>
    </tr>
    <tr>
      <td>WORKSPACE_RESULT_LIMIT (Optional)</td>
      <td>The number of workspaces that will be returned in the response by the get_workspaces tool. Default size of the workspaces list - 20</td>
    </tr>
    <tr>
      <td>VIEW_RESULT_LIMIT (Optional)</td>
      <td>The number of view that will be returned in the response by get_views tool. Default size of the views list - 30</td>
    </tr>
  </tbody>
</table>


### 3. Remote MCP Server Setup (Self-Hosted)

Remote MCP lets you host Zoho Analytics MCP once and share it with your organization over HTTP(S), removing local Docker installs, manual OAuth steps, and per-user updates. Authentication, token lifecycle, and upgrades are handled centrally so end users just point their MCP client to a single URL.

**Client configuration**

Any MCP host that supports the HTTP transport can point to your hosted instance:

```json
{
  "mcpServers": {
    "ZohoAnalyticsMCP": {
      "url": "<hosted-mcp-server-url>",
      "type": "http"
    }
  }
}
```

or simply add the <mcp-server-url> in the corresponding location the MCP host requires. Check the documentation of your MCP host for more details.

**Self-hosting Setup Instructions**

1. Register a static OAuth client in the [Zoho Developer Console](https://api-console.zoho.com/) (server-based application). Set the redirect URI to `<your-public-url>/auth/callback` and record the client ID/secret.
2. Create a `.env` file for the hosted server with the variables below:

<table>
  <thead>
    <tr>
      <th>Variable</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>ANALYTICS_SERVER_URL</td>
      <td>Zoho Analytics API base URL (e.g., https://analyticsapi.zoho.in)</td>
    </tr>
    <tr>
      <td>OIDC_PROVIDER_CLIENT_ID</td>
      <td>Client ID from the OAuth app</td>
    </tr>
    <tr>
      <td>OIDC_PROVIDER_CLIENT_SECRET</td>
      <td>Client secret from the OAuth app</td>
    </tr>
    <tr>
      <td>MCP_SERVER_PUBLIC_URL</td>
      <td>Public HTTPS URL where your Remote MCP server is reachable</td>
    </tr>
    <tr>
      <td>SESSION_SECRET_KEY</td>
      <td>Random string used for session management</td>
    </tr>
    <tr>
      <td>PORT (optional)</td>
      <td>Override the default server port (4000)</td>
    </tr>
    <tr>
      <td>MCP_SERVER_ORG_IDS</td>
      <td>Comma-separated list of Zoho Analytics org IDs whose users are allowed to use the Remote MCP server. This setting controls server admission only. Once authenticated, users can access any Zoho Analytics organization they are already authorized to access through their account.</td>
    </tr>
    <tr>
      <td>STORAGE_BACKEND</td>
      <td>"memory" (default) or "redis" for distributed storage</td>
    </tr>
    <tr>
      <td>REDIS_HOST/REDIS_PORT/REDIS_PASSWORD</td>
      <td>Required only when STORAGE_BACKEND=redis</td>
    </tr>
  </tbody>
</table>

Before configuring and running the Remote MCP server, please check the [`Security Guidelines`](./SECURITY.md) for best practices on securing your hosted instance.

3. Run the Remote MCP container on the host machine:

```bash
docker run --name remote-mcp-server \
    --network=host \
    --env-file .env \
    zohoanalytics/mcp-server:remote-v1.1
```

Once the container is running, share `MCP_SERVER_PUBLIC_URL` with your users; their MCP clients will connect over HTTP without any local setup.

### 4. Integrate with MCP Hosts

Zoho Analytics MCP Server can be integrated with any MCP host. Below are some sample integrations that demonstrate how this can be done.

#### Claude Desktop Configuration
To configure the Zoho Analytics MCP server with Claude Desktop, add the following configuration to your Claude settings:
1. Install [Claude Desktop](https://claude.ai/download) in your system.
2. Open the Claude Desktop application and navigate to **Settings > Developer** tab.
3. Click **Edit Config** to configure *(claude_desktop_config.json)* with your MCP server details.

```json
{
  "mcpServers": {
    "ZohoAnalyticsMCP": {
      "command": "docker",
      "args": [
        "run",
        "-e", "ANALYTICS_CLIENT_ID=<YOUR_ANALYTICS_CLIENT_ID>",
        "-e", "ANALYTICS_CLIENT_SECRET=<YOUR_ANALYTICS_CLIENT_SECRET>",
        "-e", "ANALYTICS_REFRESH_TOKEN=<YOUR_ANALYTICS_REFRESH_TOKEN>",
        "-e", "ANALYTICS_ORG_ID=<YOUR_ANALYTICS_ORG_ID>",
        "-e", "ANALYTICS_MCP_DATA_DIR=<YOUR_ANALYTICS_MCP_DATA_DIR>",
        "--network=host",
        "-i",
        "--rm",
        "-v", "<YOUR_ANALYTICS_MCP_DATA_DIR>:<YOUR_ANALYTICS_MCP_DATA_DIR>",
        "zohoanalytics/mcp-server"
      ]
    }
  }
}
```

#### VSCode Configuration
To configure the Zoho Analytics MCP server with Visual Studio Code:
1. Install the VSCode in your system.
2. Open the VSCode application and navigate to Settings.
3. In the Settings page, search for MCP configurations. Select the `Edit in settings.json` option to configure the MCP server.


```json
{
  "servers": {
    "zoho_analytics_mcp_server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-e", "ANALYTICS_CLIENT_ID=<YOUR_ANALYTICS_CLIENT_ID>",
        "-e", "ANALYTICS_CLIENT_SECRET=<YOUR_ANALYTICS_CLIENT_SECRET>",
        "-e", "ANALYTICS_REFRESH_TOKEN=<YOUR_ANALYTICS_REFRESH_TOKEN>",
        "-e", "ANALYTICS_ORG_ID=<YOUR_ANALYTICS_ORG_ID>",
        "-e", "ANALYTICS_MCP_DATA_DIR=<YOUR_LOCAL_DATA_DIR>",
        "--network=host",
        "-i",
        "--rm",
        "-v", "<YOUR_LOCAL_DATA_DIR>:<YOUR_LOCAL_DATA_DIR>",
        "zohoanalytics/mcp-server"
      ]
    }
  }
}
```


#### Cursor Configuration
To configure the Zoho Analytics MCP server with Cursor:
1. Install the Cursor in your system.
2. Open the Cursor application and navigate to **Settings > Tools and Integrations**.
3. Click the Add Custom MCP menu to enter your server configuration details, and Save.

```json
{
  "mcpServers": {
    "ZohoAnalyticsMCP": {
      "command": "docker",
      "args": [
        "run",
        "-e", "ANALYTICS_CLIENT_ID=<YOUR_ANALYTICS_CLIENT_ID>",
        "-e", "ANALYTICS_CLIENT_SECRET=<YOUR_ANALYTICS_CLIENT_SECRET>",
        "-e", "ANALYTICS_REFRESH_TOKEN=<YOUR_ANALYTICS_REFRESH_TOKEN>",
        "-e", "ANALYTICS_ORG_ID=<YOUR_ANALYTICS_ORG_ID>",
        "-e", "ANALYTICS_MCP_DATA_DIR=<YOUR_ANALYTICS_MCP_DATA_DIR>",
        "--network=host",
        "-i",
        "--rm",
        "-v", "<YOUR_ANALYTICS_MCP_DATA_DIR>:<YOUR_ANALYTICS_MCP_DATA_DIR>",
        "zohoanalytics/mcp-server"
      ]
    }
  }
}
```

### Tools List

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
  </tbody>
</table>

## Example Prompts

Here are some example prompts illustrating how you can interact with the Zoho Analytics MCP Server and the kinds of responses you might receive:

### Example 1: Data Queries

**Prompt:**
```
Can you provide me with details of the top 5 best-selling products in the last quarter, including their names, sales figures, and profit margins?
```

**Response:**
```
Sure! Here are the details of the top 5 best-selling products in the last quarter:
1. XPro Smartphone
   - Sales Figures: $500,000
   - Profit Margin: 20%
2. UltraHD 4K Smart TV (55")
   - Sales Figures: $450,000
   - Profit Margin: 25%
3. Wireless Noise-Cancelling Headphones
   - Sales Figures: $419,500
   - Profit Margin: 15%
4. Fit Pro Smartwatch
   - Sales Figures: $350,000
   - Profit Margin: 30%
5. Home Assistant Smart Speaker
   - Sales Figures: $300,700
   - Profit Margin: 18%
```

### Example 2: Entity Creation

**Prompt:**
```
Can you create a new table called "Customer Feedback" with the following columns: Customer ID, Product ID, Feedback Date, Rating (1-5), and Comments?

Once done, can you also insert a sample record into the "Customer Feedback" table with the following details: Customer ID: 12345, Product ID: 67890, Feedback Date: 2024-06-01, Rating: 4, Comments: "Great product, but delivery was delayed."
```

**Response:**
```
Table "Customer Feedback" created successfully with the specified columns, and the sample record has been inserted. Please check the table at: analytics.zoho.com/workspaces/<workspace-id>/view/<view-id>
```

### Example 3: Report Creation

**Prompt:**
```
Can you create a report that shows the monthly sales for the top 3 products over the last year?
```

**Response:**
```
The report showing the monthly sales for the top 3 products over the last year has been created.
```

*The created report in analytics:*

![Report Example](assets/analytics-example-chart-1.png)

### Troubleshooting

For common issues:
1. Authentication Problems:
    - Verify all OAuth credentials
    - Ensure tokens have proper permissions
    - Check token expiration status
2. Connection Issues:
    - Confirm if the Docker container is running
    - Validate network connectivity
    - Check firewall settings
3. Data Center Errors:
    - Verify ANALYTICS_SERVER_URL and ACCOUNTS_SERVER_URL matches your organization's region
    - Ensure the location code is correct (case-sensitive)
4. File System Problems:
    - Confirm if the data directory exists
    - Check directory permissions
    - Verify sufficient disk space

