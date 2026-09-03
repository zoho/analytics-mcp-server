# Node.js Development Setup

This guide covers the different ways to set up your development environment for contributing to the Node.js MCP server.

## Prerequisites

Choose one of the following setup methods based on your preference:

### Native Development
- Node.js (version 18 or higher)
- npm (comes with Node.js)
- VS Code (recommended for debugging)

### Containerized Development
- Docker
- Docker Compose
- VS Code with Remote - Containers extension (optional, but recommended)

## Setup Methods

### Option 1: Native Development

If you have Node.js installed on your system:

1. **Navigate to the node directory**:
   ```bash
   cd node
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Configure environment variables** (see [Environment Configuration](./ENVIRONMENT_SETUP.md))

5. **Run the server**:
   ```bash
   node dist/src/index.js
   ```

### Option 2: Containerized Development

For contributors who prefer not to install Node.js directly, we provide a Docker-based development environment. See the [Containerized Development Guide](./CONTAINERIZED_DEVELOPMENT.md) for detailed instructions.

**Quick start**:
```bash
cd docs/contributing/node
cp .env.example .env
# Edit .env with your credentials
docker-compose -f docker-compose.node_dev_env.yaml up -d
docker exec -it analytics-mcp-node-dev bash
npm install
npm run build
```

## Common Development Tasks

### Building the Project

After making changes to TypeScript code:

```bash
npm run build
```

### Running Tests

If tests are configured:

```bash
npm test
```

### Linting Code

Check code quality:

```bash
npm run lint
```

### Running the Server

With environment variables configured:

```bash
node dist/src/index.js
```

Or with inline environment variables:

```bash
DEBUG=true node dist/src/index.js
```

## Debugging

For detailed debugging instructions, see the [Debugging Guide](./DEBUGGING.md).

## Next Steps

- [Configure Environment Variables](./ENVIRONMENT_SETUP.md)
- [Learn about Debugging](./DEBUGGING.md)
- [Containerized Development Details](./CONTAINERIZED_DEVELOPMENT.md)
