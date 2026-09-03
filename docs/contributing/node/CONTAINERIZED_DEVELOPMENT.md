# Containerized Development Environment

This guide covers using Docker for Node.js MCP server development. This approach allows you to develop without installing Node.js or npm directly on your host system.

## Prerequisites

- Docker
- Docker Compose
- VS Code with Remote - Containers extension (optional, but recommended)

## Quick Start

1. **Configure environment variables**:
   ```bash
   cd docs/contributing/node
   cp .env.example .env
   # Edit .env with your credentials (see Environment Setup guide)
   ```

2. **Start the container**:
   ```bash
   docker-compose -f docker-compose.node_dev_env.yaml up -d
   ```

3. **Access the container**:
   ```bash
   docker exec -it analytics-mcp-node-dev bash
   ```

4. **Install dependencies and build**:
   ```bash
   npm install
   npm run build
   ```

For detailed environment configuration, see [Environment Setup](./ENVIRONMENT_SETUP.md).

## Docker Compose Configuration

The configuration file `docker-compose.node_dev_env.yaml` includes:

```yaml
version: '3.8'

services:
  node-dev:
    image: node:24  # Node.js version 24
    container_name: analytics-mcp-node-dev
    network_mode: host  # Allows access to ports on host
    working_dir: /app
    volumes:
      - ../../../node:/app  # Mounts node/ directory
    env_file:
      - .env  # Loads environment variables
    stdin_open: true
    tty: true
    command: tail -f /dev/null  # Keeps container running
```

### Key Features

- **`env_file`**: Automatically loads environment variables from `.env` into the container
- **`network_mode: host`**: Container shares host's network stack (easy access to debug ports)
- **Volume mount**: Your `node/` directory is mounted at `/app` - changes are immediately reflected
- **Interactive**: `stdin_open` and `tty` allow shell interaction
- **Persistent**: Container keeps running until you stop it

## Development Workflow

### Running the MCP Server

Inside the container, run the server (environment variables are auto-loaded):

```bash
node dist/src/index.js
```

Override environment variables temporarily:

```bash
QUERY_DATA_RESULT_ROW_LIMITS=50 node dist/src/index.js
```

### Rebuilding After Changes

```bash
npm run build
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Debugging

The containerized environment fully supports VS Code debugging. See the [Debugging Guide](./DEBUGGING.md) for complete instructions.

### Quick Debug Setup

1. Enable debugging (see [DEBUGGING.md](./DEBUGGING.md))
2. Start server with debug mode inside container:
   ```bash
   DEBUG=true DEBUG_PORT=9229 node dist/src/index.js
   ```
3. Due to `network_mode: host`, the debug port (9229) is accessible on your host
4. Attach VS Code debugger using the "Attach to MCP Server" configuration

### VS Code Remote - Containers

For integrated development:

1. Install the Remote - Containers extension in VS Code
2. Press `F1` → "Remote-Containers: Attach to Running Container"
3. Select `analytics-mcp-node-dev`
4. Open `/app` folder inside the container
5. Use debugging normally with launch configurations

## Container Management

### View Status
```bash
docker-compose -f docker-compose.node_dev_env.yaml ps
```

### View Logs
```bash
docker-compose -f docker-compose.node_dev_env.yaml logs -f
```

### Stop Container
```bash
docker-compose -f docker-compose.node_dev_env.yaml stop
```

### Start Stopped Container
```bash
docker-compose -f docker-compose.node_dev_env.yaml start
```

### Remove Container
```bash
docker-compose -f docker-compose.node_dev_env.yaml down
```

### Rebuild Container
```bash
docker-compose -f docker-compose.node_dev_env.yaml down
docker-compose -f docker-compose.node_dev_env.yaml up -d
```

## Using Different Node.js Versions

Edit `docker-compose.node_dev_env.yaml`:

```yaml
services:
  node-dev:
    image: node:20  # Change to node:20, node:22, node:18, etc.
```

Then rebuild:

```bash
docker-compose -f docker-compose.node_dev_env.yaml down
docker-compose -f docker-compose.node_dev_env.yaml up -d
```

## Troubleshooting

### Container Won't Start

Check if container name is in use:
```bash
docker ps -a | grep analytics-mcp-node-dev
```

Remove if exists:
```bash
docker rm -f analytics-mcp-node-dev
```

### File Permission Issues

Container runs as root by default. To run as your user:

Edit `docker-compose.node_dev_env.yaml`:
```yaml
services:
  node-dev:
    user: "${UID}:${GID}"
```

Start with:
```bash
UID=$(id -u) GID=$(id -g) docker-compose -f docker-compose.node_dev_env.yaml up -d
```

### Debug Port Already in Use

1. Change `DEBUG_PORT` environment variable
2. Update VS Code launch configuration to match

### Cannot Access Server from Host

With `network_mode: host`, the server should be accessible. If not:
1. Verify server is running inside container
2. Check host firewall settings
3. Verify correct ports are being used

## Environment Variables

For detailed environment variable configuration, see [Environment Setup](./ENVIRONMENT_SETUP.md).

### Updating Environment Variables

1. Edit `.env` file in `docs/contributing/node/`
2. Restart container:
   ```bash
   docker-compose -f docker-compose.node_dev_env.yaml restart
   ```
3. Verify:
   ```bash
   docker exec -it analytics-mcp-node-dev bash
   echo $ANALYTICS_CLIENT_ID
   ```

## Best Practices

1. **Keep container running**: Designed to stay running - don't restart unnecessarily
2. **Global tools**: Install global npm packages inside container:
   ```bash
   npm install -g <package-name>
   ```
3. **Security**: Use `.env` for credentials, never hardcode
4. **Cleanup**: Periodically clean Docker resources:
   ```bash
   docker system prune -a
   ```

## Related Documentation

- [Development Setup](./DEVELOPMENT_SETUP.md) - Overview of setup options
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Detailed environment configuration
- [Debugging Guide](./DEBUGGING.md) - Debug configuration and troubleshooting

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [VS Code Remote - Containers](https://code.visualstudio.com/docs/remote/containers)
- [Node.js Official Docker Image](https://hub.docker.com/_/node)
