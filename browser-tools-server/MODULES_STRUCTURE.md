# Browser Tools Server - Modular Architecture

## Overview
The browser-tools-server has been refactored from a monolithic 1300+ line file into a clean, modular architecture organized by functionality.

## Directory Structure

```
browser-tools-server/
├── modules/                    # Core functionality modules
│   ├── shared.ts              # Configuration, utilities, shared functions
│   ├── screenshot.ts          # Screenshot capture tool helpers
│   ├── navigation.ts          # Browser navigation tool helpers  
│   ├── network-activity.ts    # Network inspection tool helpers
│   ├── element-inspector.ts   # Element CSS inspection helpers
│   ├── console-inspector.ts   # Console log inspection and filtering
│   ├── api-client.ts          # Live API response fetching (placeholder)
│   ├── api-docs.ts           # API documentation search (placeholder)
│   └── server-lifecycle.ts   # Server startup and shutdown management
├── browser-connector.ts       # Main server coordination and routing
├── screenshot-service.ts      # Screenshot processing service
└── dist/                      # Compiled JavaScript output
```

## Module Responsibilities

### `shared.ts` (formerly top-scaffold.ts)
- Environment configuration and project settings
- Shared utilities (path conversion, log processing, etc.)
- Port discovery and availability checking
- Global log storage and management
- Type definitions and constants

### `screenshot.ts`
- Screenshot configuration building
- Screenshot response formatting
- Helpers for the `captureBrowserScreenshot` MCP tool

### `navigation.ts`
- Navigation message building
- Navigation response parsing
- Helpers for the `navigateBrowserTab` MCP tool

### `network-activity.ts`
- Network log filtering and sorting
- Network request detail projection
- Result limiting and pagination
- Helpers for the `inspectBrowserNetworkActivity` MCP tool

### `element-inspector.ts`
- Selected element debug text formatting
- Helpers for the `inspectSelectedElementCss` MCP tool

### `console-inspector.ts`
- Console log filtering, sorting, and formatting
- Statistics and analysis of console messages
- Helpers for the `inspectBrowserConsole` MCP tool
- Supports filtering by level (log/error/warn/info/debug), time range, and search

### `api-client.ts` & `api-docs.ts`
- Placeholder modules for future API-related tool helpers
- Ready for `fetchLiveApiResponse` and `searchApiDocumentation` tool logic

### `server-lifecycle.ts` (formerly bottom-scaffold.ts)
- Server startup and port binding
- Graceful shutdown handling
- Signal handling (SIGINT, SIGTERM)
- Network interface discovery and logging

### `browser-connector.ts` (main file)
- Express app setup and middleware
- WebSocket server management
- HTTP endpoint routing
- Chrome extension communication
- MCP tool coordination

## Benefits of This Architecture

1. **Maintainability**: Each module has a single responsibility
2. **Testability**: Individual modules can be tested in isolation
3. **Readability**: Code is organized by functionality, not file size
4. **Scalability**: New MCP tools can be added as separate modules
5. **Debugging**: Issues can be traced to specific functional areas

## Import Pattern

All modules follow a consistent import pattern:
```typescript
// Main coordination file
import { helperFunction } from './modules/module-name.js';

// Modules import from shared utilities
import { sharedUtility } from './shared.js';
```

## Migration Notes

- All functionality preserved from original monolithic structure
- No breaking changes to external APIs or WebSocket protocols
- Build and runtime behavior identical to previous version
- Chrome extension integration unchanged

## Future Enhancements

- Add unit tests for individual modules
- Implement API client and documentation modules
- Consider extracting WebSocket management to separate module
- Add module-level documentation and JSDoc comments