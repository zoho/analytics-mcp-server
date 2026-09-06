# Environment Configuration

This guide explains how to configure environment variables for the Node.js MCP server, whether you're using native development or containerized development.

## Quick Start

### For Native Development

Create a `.env` file in the `node/` directory:

```bash
cd node
cp ../docs/contributing/node/.env.example .env
# Edit .env with your credentials
```

### For Containerized Development

Create a `.env` file in the `docs/contributing/node/` directory:

```bash
cd docs/contributing/node
cp .env.example .env
# Edit .env with your credentials
```

## Required Environment Variables

You must configure these variables to use the MCP server:

| Variable | Description | Example |
|----------|-------------|---------|
| `ANALYTICS_CLIENT_ID` | Your Zoho Analytics OAuth client ID | `1000.ABC123...` |
| `ANALYTICS_CLIENT_SECRET` | Your Zoho Analytics OAuth client secret | `abc123def456...` |
| `ANALYTICS_REFRESH_TOKEN` | Your Zoho Analytics OAuth refresh token | `1000.abc123...` |
| `ANALYTICS_ORG_ID` | Your Zoho Analytics organization ID | `123456789` |
| `ACCOUNTS_SERVER_URL` | Your Zoho Accounts Domain URL | `https://accounts.zoho.com` |
| `ANALYTICS_SERVER_URL` | Your Zoho Analytics API Domain URL | `https://analyticsapi.zoho.com` |

## Optional Environment Variables

Customize server behavior with these optional variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_FILE_ROOT` | Root directory for file operations | `/app` (containerized) or current directory (native) |
| `QUERY_DATA_RESULT_ROW_LIMITS` | Maximum rows returned by query_data | `20` |
| `DEBUG` | Enable debug mode | `false` |
| `DEBUG_PORT` | Port for Node.js debugger | `9229` |

For a complete list of available environment variables, see the `.env.example` file.

## Setting Environment Variables

### Method 1: Using .env File (Recommended)

Create a `.env` file with your configuration:

```env
ANALYTICS_CLIENT_ID=your_client_id
ANALYTICS_CLIENT_SECRET=your_client_secret
ANALYTICS_REFRESH_TOKEN=your_refresh_token
ANALYTICS_ORG_ID=your_org_id
ACCOUNTS_SERVER_URL=https://accounts.zoho.com
ANALYTICS_SERVER_URL=https://analyticsapi.zoho.com
```

**For native development**: Place in `node/.env`
**For containerized development**: Place in `docs/contributing/node/.env`

### Method 2: Inline Environment Variables

For temporary testing or overriding specific variables:

```bash
QUERY_DATA_RESULT_ROW_LIMITS=50 node dist/src/index.js
```

Or multiple variables:

```bash
DEBUG=true DEBUG_PORT=9229 QUERY_DATA_RESULT_ROW_LIMITS=50 node dist/src/index.js
```

### Method 3: Export to Shell Session

For a development session:

```bash
export ANALYTICS_CLIENT_ID="your_client_id"
export ANALYTICS_CLIENT_SECRET="your_client_secret"
export ANALYTICS_REFRESH_TOKEN="your_refresh_token"
# ... other variables
node dist/src/index.js
```

### Method 4: MCP Client Configuration

When running with an MCP client (e.g., Claude Desktop), add environment variables to your MCP configuration file:

```json
{
  "mcpServers": {
    "zoho-analytics": {
      "command": "node",
      "args": ["/path/to/dist/src/index.js"],
      "env": {
        "ANALYTICS_CLIENT_ID": "your_client_id",
        "ANALYTICS_CLIENT_SECRET": "your_client_secret",
        "ANALYTICS_REFRESH_TOKEN": "your_refresh_token",
        "ANALYTICS_ORG_ID": "your_org_id",
        "ACCOUNTS_SERVER_URL": "https://accounts.zoho.com",
        "ANALYTICS_SERVER_URL": "https://analyticsapi.zoho.com"
      }
    }
  }
}
```

## Obtaining Zoho Analytics Credentials

### OAuth Client ID and Secret

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create a new client application
3. Choose "Server-based Applications"
4. Note your Client ID and Client Secret

### Refresh Token

1. Follow the OAuth 2.0 authorization flow
2. Exchange the authorization code for a refresh token
3. Store the refresh token securely

### Organization ID

1. Log in to Zoho Analytics
2. Go to your organization settings
3. Find your Organization ID (usually in the URL or settings page)

## Security Best Practices

### Never Commit Credentials

The `.env` file contains sensitive credentials and should **never** be committed to version control:

- `.env` is already included in `.gitignore`
- Use `.env.example` as a template for sharing with contributors
- Never hardcode credentials in source code

### Rotate Credentials Regularly

- Periodically regenerate OAuth tokens
- Update the `.env` file with new credentials
- Revoke old tokens in the Zoho API Console

### Limit Access Scope

- Use OAuth scopes to limit API access
- Only grant permissions necessary for the MCP server
- Review and audit API access regularly

## Updating Environment Variables

### For Native Development

1. Edit the `node/.env` file
2. Restart the server to load new values

### For Containerized Development

1. Edit the `docs/contributing/node/.env` file
2. Restart the container:
   ```bash
   docker-compose -f docker-compose.node_dev_env.yaml restart
   ```
3. Verify inside the container:
   ```bash
   docker exec -it analytics-mcp-node-dev bash
   echo $ANALYTICS_CLIENT_ID
   ```

## Troubleshooting

### Missing Environment Variables

If you see errors about missing environment variables:

1. Check that `.env` file exists in the correct location
2. Verify all required variables are set
3. Ensure no typos in variable names
4. For containerized development, restart the container after changes

### Invalid Credentials

If authentication fails:

1. Verify credentials are correct in Zoho API Console
2. Check that tokens haven't expired
3. Ensure the correct Accounts and Analytics server URLs for your region
4. Regenerate refresh token if necessary

### Environment Variables Not Loading

**Native development**:
- Ensure you're using a tool that loads `.env` files (or use export/inline methods)
- Check file permissions on `.env`

**Containerized development**:
- Verify `env_file` is specified in `docker-compose.node_dev_env.yaml`
- Restart container after `.env` changes
- Check container logs for errors

## Regional Server URLs

Zoho Analytics has different server URLs based on your region:

| Region | Accounts URL | Analytics URL |
|--------|-------------|---------------|
| US | `https://accounts.zoho.com` | `https://analyticsapi.zoho.com` |
| EU | `https://accounts.zoho.eu` | `https://analyticsapi.zoho.eu` |
| India | `https://accounts.zoho.in` | `https://analyticsapi.zoho.in` |
| Australia | `https://accounts.zoho.com.au` | `https://analyticsapi.zoho.com.au` |
| China | `https://accounts.zoho.com.cn` | `https://analyticsapi.zoho.com.cn` |

Use the URLs that match your Zoho Analytics account region.

## Related Documentation

- [Development Setup](./DEVELOPMENT_SETUP.md) - Choose your development environment
- [Containerized Development](./CONTAINERIZED_DEVELOPMENT.md) - Docker-based setup details
- [Debugging Guide](./DEBUGGING.md) - Debug configuration and troubleshooting
