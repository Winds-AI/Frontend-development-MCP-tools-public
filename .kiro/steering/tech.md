# Technology Stack & Build System

## Architecture Overview
Three-component system with MCP server, browser tools server, and Chrome extension communicating via WebSocket and HTTP REST APIs.

## Tech Stack

### MCP Server (`browser-tools-mcp/`)
- **Runtime**: Node.js with ES modules
- **Language**: TypeScript 5.7.3
- **Framework**: Model Context Protocol SDK (@modelcontextprotocol/sdk)
- **Validation**: Zod for schema validation
- **Build**: TypeScript compiler (tsc)

### Browser Tools Server (`browser-tools-server/`)
- **Runtime**: Node.js with ES modules  
- **Language**: TypeScript 5.7.3
- **Framework**: Express.js with WebSocket (ws)
- **Features**: CORS, body-parser, screenshot service
- **Build**: TypeScript compiler (tsc)

### Chrome Extension (`chrome-extension/`)
- **Language**: JavaScript (ES6+)
- **APIs**: Chrome Extension APIs, WebSocket
- **Integration**: DevTools panels, background service workers

## Package Management
- **Primary**: pnpm (preferred for performance and disk efficiency)
- **Lock files**: pnpm-lock.yaml
- **Workspaces**: Monorepo structure with individual package.json files

## Build Commands

### Development Setup
```bash
# Install all dependencies
pnpm install:all

# Build all components
pnpm build:all

# Start the complete system
pnpm start
```

### Individual Component Commands
```bash
# MCP Server
cd browser-tools-mcp
pnpm install && pnpm build && pnpm start

# Browser Tools Server  
cd browser-tools-server
pnpm install && pnpm build && pnpm start

# Root level orchestration
pnpm setup  # Initial project setup
```

## Configuration Management

### Project Configuration (`projects.json`)
- Multi-project support with environment-specific settings
- API endpoints, auth tokens, screenshot storage paths
- Environment variable fallbacks with priority system

### Key Environment Variables
- `API_BASE_URL`: Target API base URL
- `API_AUTH_TOKEN`: Authentication token for API calls
- `SWAGGER_URL`: OpenAPI/Swagger documentation URL
- `SCREENSHOT_STORAGE_PATH`: Local screenshot storage directory
- `BROWSER_TOOLS_HOST/PORT`: Server connection settings

## Connection & Discovery
- **Port Range**: 3025-3035 (auto-discovery)
- **Protocol**: HTTP REST + WebSocket with heartbeat (25s interval)
- **Health Monitoring**: `/connection-health` endpoint
- **Recovery**: Exponential backoff with max 10 retries

## Development Workflow
1. Start browser-tools-server (auto-discovers available port)
2. Load Chrome extension (connects to server via WebSocket)
3. Start MCP server (discovers browser-tools-server)
4. AI IDE connects to MCP server via stdio transport