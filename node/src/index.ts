#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMetaDataTools } from "./tools/metadata-tools";
import { registerModellingTools } from "./tools/modelling-tools";
import { registerDataTools } from "./tools/data-tools";
import { registerRowTools } from "./tools/row-tools";

const requiredEnvVars = [
  "ANALYTICS_CLIENT_ID",
  "ANALYTICS_CLIENT_SECRET",
  "ANALYTICS_REFRESH_TOKEN",
  "ANALYTICS_ORG_ID",
  "ACCOUNTS_SERVER_URL",
  "ANALYTICS_SERVER_URL"
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    const errorMessage = `Missing required environment variable: ${envVar}`;
    console.error(`[ERROR] ${errorMessage}`);
    console.error(`[INFO] Application cannot start without all required environment variables.`);
    console.error(`[INFO] Required variables: ${requiredEnvVars.join(', ')}`);
    console.error(`[INFO] Currently set variables: ${Object.keys(process.env).filter(key => requiredEnvVars.includes(key)).join(', ')}`);
    throw new Error(errorMessage);
  }
  else {
    console.error(`[OK] Environment variable ${envVar} is set`);
  }
}


const server = new McpServer({
  name: "zoho-analytics",
  version: "1.0.0"
});

registerMetaDataTools(server);
registerModellingTools(server);
registerDataTools(server);
registerRowTools(server);


const transport = new StdioServerTransport();
(async () => {
  await server.connect(transport);
  console.error("Zoho Analytics MCP server is running and connected to stdin/stdout::v1.0.1");
})().catch((error) => {
  console.error("Failed to start Zoho Analytics MCP server:", error);
  process.exit(1);
});
