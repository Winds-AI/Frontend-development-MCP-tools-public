**Note:** Keep Chrome DevTools (F12) open on your target tab. Browser related tools work only if DevTools is open.

### For Windsurf IDE

Configure these type of **Windsurf Memories** or **Cursor Rules**:

1. **Authentication context setup** - How auth works in your project
2. **Page/module creation patterns** - Router integration and navigation structure
3. **API data fetching patterns** - How API calls are structured and handled
4. **UI utilities context** - Toasts, modals, common components, etc.
5. **Roles & Permission** - If there is any role management and role based access then how does that work
6. **Routing & Navigation**- where are routes and navigation handled and how, sidebar also if there is any

**💡Important:** Spend time setting up comprehensive project context in your AI IDE. This server + proper context = autonomous frontend development magic!

You can skip these rules or memories setup if you will not be using this tool for autonomous development, then you will have to instruct the agent on what structure and rules to follow

## 🚀 Quick Setup Instructions

### 1) Start with npx (recommended)

```bash
npx @winds-ai/autonomous-frontend-browser-tools
```

- Connector runs in your terminal; Setup UI opens at `http://127.0.0.1:5055`
- Configure `projects.json` (right) and `.env` (left → Environment)
- Click Save, then Close (UI stops; connector keeps running)

### 2) Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle "Developer mode" on (top-right corner)
3. Click "Load unpacked" (top-left corner)
4. Select the `chrome-extension` directory from this repository

---

### 3) Create project configuration (projects.json)

Option A — Use the Setup UI (recommended): already covered above. It creates a mock file if missing and saves your changes to `chrome-extension/projects.json`.

Option B — Manual:

Create `chrome-extension/projects.json` on your machine. This file is ignored by git and holds per-project config. See the full structure and fields at the end of this guide in "Project configuration (chrome-extension/projects.json)".

File example:

```json
{
  "projects": {
    "my-frontend": {
      "config": {
        "SWAGGER_URL": "https://api.example.com/openapi.json",
        "API_BASE_URL": "https://api.example.com",
        "API_AUTH_TOKEN": "<your_bearer_token>",
        "PROJECT_ROOT": "/absolute/path/to/project/root",
        "ROUTES_FILE_PATH": "src/routes/paths.ts"
      }
    },
    "another-app": {
      "config": {
        "SWAGGER_URL": "https://staging.example.com/openapi.json",
        "API_BASE_URL": "https://staging.example.com",
        "API_AUTH_TOKEN": "<your_staging_token>"
      }
    }
  },
  "defaultProject": "my-frontend",
  "DEFAULT_SCREENSHOT_STORAGE_PATH": "/absolute/path/to/screenshots/root"
}
```

---

### 4) Start the Browser Tools Server (manual)

Recommended scripts (from repo root):

- First-time/full setup (installs, builds, and starts):

```bash
node setup.js
# or
npm run setup
```

- Daily start (when already set up):

```bash
node start-server.js
# or
npm run start
```

Notes:
- The server auto-selects an available port starting at 3025 (range 3025–3035).
- Health and identity endpoints: `/.identity`, `/connection-health`.

---

### 4) Configure your MCP client (ACTIVE_PROJECT only)

The MCP client only needs to know which project to use. Put all other configuration in `chrome-extension/projects.json`.

Example `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "browser-tools-frontend-dev": {
      "command": "node",
      "args": [
        "/absolute/path/to/browser-tools-mcp/dist/mcp-server.js"
      ],
      "env": {
        "ACTIVE_PROJECT": "my-frontend"
      }
    }
  }
}
```

Notes:
- Most settings (SWAGGER_URL, API_BASE_URL, API_AUTH_TOKEN, BROWSER_TOOLS_HOST/PORT, ROUTES_FILE_PATH) should live in `chrome-extension/projects.json`.
- Embedding provider keys MUST remain environment variables (do not put in projects.json):
  - `OPENAI_API_KEY` (and optional `OPENAI_EMBED_MODEL`)
  - `GEMINI_API_KEY` (and optional `GEMINI_EMBED_MODEL`)
- If you change embedding provider/model, reindex from the DevTools panel.

---

### 5) Build the semantic index (one-time per project/model)

1. Open Chrome DevTools → “BrowserTools MCP” panel.
2. In the Embeddings section, click “Reindex” for your project.
3. Status endpoints used by the server:
   - `GET /api/embed/status?project=<name>`
   - `POST /api/embed/reindex` with `{ project }`

Notes:
- Index is per-project in `.vectra/<project>`. Changing embedding provider/model requires reindex.
- Server logs show progress/backoff during reindex.

---

### 6) Verify connection health

- Identity: `http://localhost:3025/.identity` should return `{ signature: "mcp-browser-connector-24x7", ... }`
- Health: `http://localhost:3025/connection-health` shows heartbeat and connection details
- The Chrome extension panel shows connection status and allows reindex/status checks

## 🔧 System Compatibility & Features

### Enhanced MCP Server Architecture

- **Protocol**: Model Context Protocol (MCP) over standard input/output (stdio)
- **Transport**: stdio for maximum compatibility across MCP clients
- **AI Editor Support**: Windsurf, Cursor, Cline, Zed, Claude Desktop, VS Code with MCP extensions

### 🚀 Autonomous Operation Features

- **Enhanced WebSocket Stability**: Intelligent heartbeat monitoring with 25s intervals
- **Fast Recovery**: 3-15 second reconnection from network issues
- **Connection Health Monitoring**: Real-time status at `/connection-health`
- **Individual Request Tracking**: Prevents callback conflicts during concurrent operations
- **Network Tolerance**: Exponential backoff with up to 10 retry attempts
- **Streamlined Discovery**: Essential IP scanning for faster server detection

### Browser Compatibility

- **Chrome Extensions API v3**: Full compatibility with latest Chrome extension standards
- **DevTools Integration**: Seamless integration with Chrome Developer Tools
- **Cross-Platform**: Works on Windows, macOS, and Linux

## 🚨 Enhanced Troubleshooting Guide

### Connection Issues

1. **Server Auto-Discovery**: The system automatically discovers servers on ports 3025–3035
2. **Connection Health Check**: Visit `http://localhost:3025/connection-health` (or your actual port) to verify server status
3. **Chrome Extension Status**: Check DevTools → BrowserTools tab for connection status

### Common Fixes

1. **Complete Chrome Restart**: Close all Chrome windows and restart (not just refresh)
2. **Server Restart**: Stop and restart the browser-tools-server
3. **Extension Reload**: Go to `chrome://extensions/` and click reload on BrowserTools MCP
4. **Port Conflicts**: Server auto-selects available ports (check console output for actual port)

### Debug Information

- **Server Logs**: Check console output for detailed connection and error information
- **Chrome DevTools Console**: Look for WebSocket connection status and error messages
- **Extension Panel**: Connection status displayed in real-time in DevTools panel

### Performance Optimization

- **Long-Running Sessions**: System optimized for 2+ hour autonomous AI development sessions
- **Memory Management**: Enhanced callback cleanup prevents memory leaks
- **Network Tolerance**: Increased timeouts for unreliable network conditions

### Connection Issues

```bash
# Check server status
curl http://localhost:3025/.identity

# Monitor connection health
curl http://localhost:3025/connection-health

# View server logs
tail -f browser-tools-server/server.log
```

## 🎯 Ready for Autonomous Development!

Once setup is complete, your Browser MCP Extension is optimized for:

- ✅ Extended AI development sessions (2+ hours)
- ✅ Automatic recovery from network issues
- ✅ Concurrent screenshot and API operations
- ✅ Real-time connection health monitoring
- ✅ Minimal workflow disruption during connection drops

Screenshot storage configuration

- Preferred: set `DEFAULT_SCREENSHOT_STORAGE_PATH` in `chrome-extension/projects.json`
- Fallback: `SCREENSHOT_STORAGE_PATH` env variable
- Default: `~/Downloads/MCP_Screenshots`

**Happy autonomous AI development! 🚀**

## Project configuration (chrome-extension/projects.json)

- Location: `chrome-extension/projects.json`
- Purpose: Central per-project configuration used by both the MCP server and the browser tools server.
- Version control: This file is ignored by `.gitignore` (contains secrets like `API_AUTH_TOKEN`). Keep it local.

### Structure

```json
{
  "projects": {
    "my-frontend": {
      "config": {
        "SWAGGER_URL": "https://api.example.com/openapi.json",
        "API_BASE_URL": "https://api.example.com",
        "API_AUTH_TOKEN": "<your_bearer_token>",
        "PROJECT_ROOT": "/absolute/path/to/project/root",
        "ROUTES_FILE_PATH": "src/routes/paths.ts"
      }
    },
    "another-app": {
      "config": {
        "SWAGGER_URL": "https://staging.example.com/openapi.json",
        "API_BASE_URL": "https://staging.example.com",
        "API_AUTH_TOKEN": "<your_staging_token>"
      }
    }
  },
  "defaultProject": "my-frontend",
  "DEFAULT_SCREENSHOT_STORAGE_PATH": "/absolute/path/to/screenshots/root"
}
```

### Fields (per project `config`)
- `SWAGGER_URL` (required): URL of your Swagger/OpenAPI JSON used by searchApiDocumentation and listApiTags.
- `API_BASE_URL` (optional): Base URL used by `fetchLiveApiResponse`.
- `API_AUTH_TOKEN` (optional): Used only when you set `includeAuthToken = true` in `fetchLiveApiResponse`.
- `PROJECT_ROOT` (optional): Absolute path to your project (used for context/reference).
- `ROUTES_FILE_PATH` (optional): Shown in the `navigateBrowserTab` description to guide route references.
- Other optional keys that can be read from project config: `BROWSER_TOOLS_HOST`, `BROWSER_TOOLS_PORT`.

Notes:
- Embedding API keys must NOT be placed in `projects.json`. Use environment variables (`OPENAI_API_KEY`, `GEMINI_API_KEY`) as shown earlier.

### Active project resolution
- Preferred per-request header (internal): `X-ACTIVE-PROJECT`
- MCP/IDE env: `ACTIVE_PROJECT`
- Fallback: `defaultProject` in `projects.json`

### Screenshot storage precedence
- `projects.json: DEFAULT_SCREENSHOT_STORAGE_PATH` (global, recommended)
- `SCREENSHOT_STORAGE_PATH` env (fallback)
- Default: `~/Downloads/MCP_Screenshots`

After creating or updating `chrome-extension/projects.json`:
- Reload the Chrome extension (chrome://extensions → reload)
- Restart the server if running, or it will pick up on next start
- If you changed `SWAGGER_URL`, reindex from the DevTools panel if needed
