# Project Structure & Organization

## Repository Layout
```
browser-tools-mcp-extension/
├── browser-tools-mcp/          # MCP Server Implementation
├── browser-tools-server/       # WebSocket & HTTP Server
├── chrome-extension/           # Chrome Extension
├── docs/                       # Documentation
├── website-frontend/           # Project Website
├── .kiro/                      # Kiro IDE Configuration
├── package.json               # Root package orchestration
├── setup.js                   # Initial setup script
└── start-server.js            # Server startup script
```

## Core Components

### MCP Server (`browser-tools-mcp/`)
**Purpose**: Model Context Protocol implementation for AI IDE integration

```
browser-tools-mcp/
├── mcp-server.ts              # Main MCP server with 6 core tools
├── projects.json              # Multi-project configuration
├── package.json               # Dependencies & build scripts
├── tsconfig.json              # TypeScript configuration
└── dist/                      # Compiled JavaScript output
```

**Key Tools Implemented**:
- `inspectBrowserNetworkActivity` - Network request analysis
- `captureBrowserScreenshot` - Visual UI capture
- `inspectSelectedElementCss` - DevTools element inspection
- `fetchLiveApiResponse` - Authenticated API testing
- `searchApiDocumentation` - Swagger/OpenAPI integration
- `navigateBrowserTab` - Automated navigation

### Browser Tools Server (`browser-tools-server/`)
**Purpose**: Central coordination hub with WebSocket management

```
browser-tools-server/
├── browser-connector.ts       # Main server with WebSocket handling
├── screenshot-service.ts      # Screenshot coordination service
├── package.json               # Server dependencies
├── tsconfig.json              # TypeScript configuration
└── dist/                      # Compiled output
```

### Chrome Extension (`chrome-extension/`)
**Purpose**: Browser integration layer for real-time data capture

```
chrome-extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for tab management
├── devtools-panel/            # DevTools integration UI
├── content-scripts/           # Page interaction scripts
└── popup/                     # Extension popup interface
```

## Documentation Structure (`docs/`)

```
docs/
├── PROJECT_OVERVIEW.md        # Complete architecture overview
├── HOW_TO_USE.md             # Tool usage workflows
├── SETUP_GUIDE.md            # Installation instructions
├── FUTURE_PLANS.md           # Roadmap and planned features
└── each-tool-explained/       # Individual tool documentation
```

## Configuration Files

### Project Configuration (`browser-tools-mcp/projects.json`)
- Multi-project support with per-project settings
- API endpoints, authentication, storage paths
- Environment variable fallback system

### Package Management
- **Root**: Orchestration scripts for all components
- **Individual**: Each component has its own package.json
- **Lock Files**: pnpm-lock.yaml for dependency management

## Development Patterns

### File Naming Conventions
- **TypeScript**: kebab-case for files, PascalCase for classes
- **Configuration**: lowercase with extensions (.json, .md)
- **Scripts**: kebab-case for executable files

### Code Organization
- **Single Responsibility**: Each tool in MCP server handles one specific browser interaction
- **Error Handling**: Comprehensive error recovery with retry logic
- **Type Safety**: Full TypeScript coverage with Zod validation
- **Modular Design**: Clear separation between MCP protocol, server logic, and browser integration

### Connection Management
- **Discovery Pattern**: Auto-discovery of server ports (3025-3035)
- **Health Monitoring**: Heartbeat system with connection recovery
- **State Management**: Centralized connection state in browser-tools-server

## AI Development Workflow Integration
- **Context Provision**: Tools designed to provide rich context to AI agents
- **Autonomous Operation**: Built for extended AI-driven development sessions
- **Memory Integration**: Compatible with Windsurf memories and Cursor rules
- **Project Awareness**: Configuration-driven project-specific behavior