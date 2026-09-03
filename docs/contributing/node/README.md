# Node.js MCP Server - Contribution Guide

Welcome to the Node.js MCP Server contribution documentation. This guide will help you set up your development environment and start contributing.

## 📚 Documentation Overview

This documentation is organized into focused guides for easy navigation:

### Getting Started

**[Development Setup](./DEVELOPMENT_SETUP.md)** - Start here!
- Overview of native vs. containerized development
- Prerequisites for each approach
- Quick start instructions
- Common development tasks

### Configuration

**[Environment Setup](./ENVIRONMENT_SETUP.md)** - Configure credentials and settings
- Required and optional environment variables
- Multiple ways to set environment variables
- Obtaining Zoho Analytics credentials
- Security best practices
- Regional server URLs

### Docker Development

**[Containerized Development](./CONTAINERIZED_DEVELOPMENT.md)** - Docker-based development
- Docker Compose configuration details
- Container management commands
- Development workflow in containers
- Debugging in containerized environment
- Troubleshooting container issues

### Debugging

**[Debugging Guide](./DEBUGGING.md)** - Debug the MCP server with VS Code
- Attach to running server (recommended)
- Direct launch from VS Code
- VS Code debugging features
- Remote debugging in containers
- Troubleshooting debugging issues

## 🚀 Quick Start Guide

### For Native Development

```bash
# 1. Navigate to node directory
cd node

# 2. Install dependencies
npm install

# 3. Configure environment (see Environment Setup guide)
cp ../docs/contributing/node/.env.example .env
# Edit .env with your credentials

# 4. Build
npm run build

# 5. Run
node dist/src/index.js
```

### For Containerized Development

```bash
# 1. Configure environment
cd docs/contributing/node
cp .env.example .env
# Edit .env with your credentials

# 2. Start container
docker-compose -f docker-compose.node_dev_env.yaml up -d

# 3. Access container
docker exec -it analytics-mcp-node-dev bash

# 4. Install and build
npm install
npm run build

# 5. Run
node dist/src/index.js
```

## 📖 Documentation Navigation

Choose your path based on what you need:

### I'm new to this project
→ Start with [Development Setup](./DEVELOPMENT_SETUP.md)

### I need to configure credentials
→ See [Environment Setup](./ENVIRONMENT_SETUP.md)

### I want to use Docker
→ Read [Containerized Development](./CONTAINERIZED_DEVELOPMENT.md)

### I need to debug the server
→ Check [Debugging Guide](./DEBUGGING.md)

### I have issues with my setup
→ Check troubleshooting sections in relevant guides

## 🔧 Common Tasks

### Building the Project
```bash
npm run build
```

### Running Tests
```bash
npm test
```

### Linting Code
```bash
npm run lint
```

### Debugging
```bash
# Enable debug mode
DEBUG=true DEBUG_PORT=9229 node dist/src/index.js

# Then attach VS Code debugger (see Debugging Guide)
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables |
| `docker-compose.node_dev_env.yaml` | Docker Compose configuration for dev environment |
| `node/src/index.ts` | Main entry point for the MCP server |
| `node/tsconfig.json` | TypeScript configuration |
| `node/package.json` | Node.js dependencies and scripts |

## 🤝 Contributing Workflow

1. **Fork and clone** the repository
2. **Set up your environment** (native or containerized)
3. **Create a feature branch** for your changes
4. **Make your changes** and test thoroughly
5. **Run linting** to ensure code quality
6. **Build the project** to verify TypeScript compilation
7. **Submit a pull request** with a clear description

## 💡 Tips

- **Use containerized development** if you don't want to install Node.js locally
- **Use VS Code Remote - Containers** for the best containerized development experience
- **Enable debugging** when working on complex features
- **Check environment setup** if you encounter authentication issues
- **Refer to specific guides** for detailed information on each topic

## 🐛 Troubleshooting

If you encounter issues:

1. Check the **Troubleshooting** section in the relevant guide
2. Verify your **environment variables** are correctly set
3. Ensure **dependencies are installed**: `npm install`
4. Try a **clean rebuild**: `rm -rf dist && npm run build`
5. For container issues, **restart the container**

## 📞 Getting Help

- Check existing documentation first
- Review troubleshooting sections in each guide
- Look for similar issues in the project's issue tracker
- Create a new issue with detailed information about your problem

## 🔒 Security Notes

- **Never commit `.env` files** - they contain sensitive credentials
- **Never enable debugging in production** - it provides full process access
- **Rotate credentials regularly** - especially OAuth tokens
- **Use `.env.example` as a template** - share templates, not actual credentials

## 📚 Additional Resources

- [VS Code Documentation](https://code.visualstudio.com/docs)
- [Node.js Documentation](https://nodejs.org/docs)
- [Docker Documentation](https://docs.docker.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Zoho Analytics API Documentation](https://www.zoho.com/analytics/api/)

---

**Ready to contribute?** Start with [Development Setup](./DEVELOPMENT_SETUP.md) 🚀
