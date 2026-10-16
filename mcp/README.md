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

### Support

For issues and questions, contact Zoho support for account-related issues
