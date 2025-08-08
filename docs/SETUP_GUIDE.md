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

### 1. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **"Developer mode"** on (top-right corner)
3. Click **"Load unpacked"** (top-left corner)
4. Select the `chrome-extension` directory from the cloned repository

---

After loading the extension, you can choose one of the following setup flows:

### 2. Choose Your Setup Flow

#### 🟢 Recommended Way: Node.js Scripts

We provide two simple Node.js scripts for easy setup and running:

1. **First-time setup** (or after pulling new changes):

```bash
node setup.js
# or
npm run setup
```

This will:

- Check/install pnpm
- Install and build browser-tools-mcp
- Install and build browser-tools-server
- Show Chrome extension setup instructions
- Start the server

2. **Quick start** (for daily use, when everything is already set up):

```bash
node start-server.js
# or
npm run start
```

This will:

- Check if the server is properly set up
- Show a reminder about the Chrome extension
- Start the server directly

**🎯 Enhanced Server Features:** See `docs/PROJECT_OVERVIEW.md` (Server Features). 

### 4. Configure Your AI Code Platform

1. Add this server to your MCP configuration file in your preferred AI code platform (Windsurf, Cursor, GitHub Copilot, etc.).
2. **Important**: After updating the MCP configuration, close and restart your AI coding platform for the changes to take effect.

#### 🎯 Configuration Example (add to `.cursor/mcp.json` in your project)

```json
{
  "mcpServers": {
    "browser-tools-frontend-dev": {
      "command": "node",
      "args": [
        "/absolute/path/to/browser-tools-mcp/dist/mcp-server.js"
      ],
      "env": {
        // === API discovery/search ===
        "SWAGGER_URL": "https://api.example.com/docs/swagger.json",

        // === Live API calls ===
        "API_BASE_URL": "https://api.example.com",
        // Used only when fetchLiveApiResponse.includeAuthToken = true
        "API_AUTH_TOKEN": "<your_token_here>",

        // === Optional: connection overrides ===
        "BROWSER_TOOLS_HOST": "127.0.0.1",
        "BROWSER_TOOLS_PORT": "3025",

        // Optional: set active project name (used by screenshot organization)
        "ACTIVE_PROJECT": "my-project"
      }
    }
  }
}
```

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
