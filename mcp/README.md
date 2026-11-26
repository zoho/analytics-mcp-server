# Zoho Analytics Plugins Compatible MCP Server

[![NPM Version](https://img.shields.io/npm/v/zoho-analytics-mcp-server)](https://www.npmjs.com/package/zoho-analytics-mcp-server)
[![NPM Downloads](https://img.shields.io/npm/dm/zoho-analytics-mcp-server)](https://www.npmjs.com/package/zoho-analytics-mcp-server)

A Node.js implementation of the Zoho Analytics Model Context Protocol (MCP) Server that works together with Zoho Analytics Agent Skills to provide seamless integration between Zoho Analytics and MCP Hosts such as VS Code, Claude Desktop, Cursor, and more.

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

This MCP Server is installable and usable via Zoho Analytics Agents plugin via Zoho Analytics Marketplace.

1. Add Marketplace

In Claude Code CLI, add Zoho Analytics Marketplace by running the following command:

```bash
/plugin marketplace add zoho/analytics-mcp-server
```

2. Install the Plugin

After installing the marketplace, install the plugin by running the following command:

```bash
/plugin install zoho/analytics-mcp-server
``` 

Claude Code CLI will prompt you for your Zoho Analytics OAuth credentials, including Client ID, Client Secret, and Refresh Token. Refer to the below section for detailed authentication setup.


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

#### Optional Code Mode Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEMODE_TIMEOUT_MS` | `60000` | Wall-clock limit for one `execute_code` run |
| `CODEMODE_MEMORY_MB` | `64` | Sandbox memory limit |
| `CODEMODE_MAX_TOOL_CALLS` | `50` | Maximum tool calls per `execute_code` run |
| `CODEMODE_MAX_OUTPUT_CHARS` | `100000` | Maximum size of the returned result and of the captured logs |

## Exposed MCP Tools

| Tool | Purpose |
|------|---------|
| `execute_analytics_tool` | Runs a single Zoho Analytics operation by name |
| `get_signature` | Returns TypeScript signatures (arguments and the typed `data` result) for the given operations |
| `execute_code` | Runs JavaScript in a QuickJS (WebAssembly) sandbox where every operation is available as `await tools.<toolName>(args)` |

### Response envelope

Every operation returns the same JSON envelope. The operation's result is in `data`; its type is published through `get_signature`.

```json
{ "status": "success" | "error", "messages": ["hints, warnings, next steps"], "errors": [{ "message": "...", "code": 7101, "path": "argName" }], "data": { } }
```

In `execute_code`, a failed call rejects with an `Error` carrying `.errors` and `.messages`. Set `VALIDATE_TOOL_RESPONSES=1` during development to log (stderr) any handler whose `data` does not match its declared DTO.

### Support

For issues and questions, contact Zoho support for account-related issues
