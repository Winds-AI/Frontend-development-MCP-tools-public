# Browser Tools MCP Extension - Complete Project Overview

**🚀 Version 1.2.0 - Autonomous AI-Powered Frontend Development Platform**

- Contents:
  - Executive Summary
  - System Architecture
  - Server Features
  - Health Monitoring API

## 📋 Executive Summary

The Browser Tools MCP Extension is a comprehensive solution designed for **autonomous AI-powered frontend development workflows**. This system provides AI agents with reliable access to browser state, real-time debugging information, and seamless screenshot capabilities through enhanced WebSocket connections optimized for extended development sessions.

### 🎯 Project Mission

Enable AI development tools to work autonomously for hours without manual intervention by providing:

- **Stable browser integration** with intelligent connection recovery
- **Real-time context capture** (logs, network requests, screenshots)
- **Organized data storage** for persistent AI workflow continuity
- **Enhanced error handling** for autonomous operation reliability

---

## 🏗️ System Architecture

### Three-Component Architecture

```mermaid

flowchart TB
 subgraph subGraph0["AI Development Environment"]
        AI["AI Editor<br>Windsurf/Cursor/etc"]
        MCP["MCP Server<br>browser-tools-mcp"]
  end
 subgraph subGraph1["Browser Tools Server"]
        BTS["Browser Tools Server<br>browser-tools-server"]
        WS["WebSocket Manager<br>Connection Handling"]
        SS["Screenshot Service<br>Project-Based Storage"]
        NS["Network Service<br>Cache &amp; Filtering"]
        LG["Log Manager<br>Size-Limited Storage"]
  end
 subgraph subGraph2["Chrome Browser"]
        CE["Chrome Extension"]
        BG["Background Service<br>Tab+Auth+Screenshot"]
        DT["DevTools Panel<br>Network+Console+Elements"]
        BW["Browser Window"]
  end
 subgraph subGraph3["Connection Management"]
        HM["Health Monitoring<br>Unique Conn IDs"]
        WB["WebSocket<br>25s Heartbeat<br>60s Timeout"]
        PS["Port Discovery<br>3025-3035<br>5 Retries"]
        ER["Error Recovery<br>3-15s Backoff<br>Max 10 Retries"]
  end
    AI <-- MCP Protocol --> MCP
    MCP <-- Port Discovery --> BTS
    BTS <-- WS + Heartbeat --> CE
    BTS --- WS & SS & NS & LG
    CE --- BG & DT & BW
    BG -. Tab URLs + Auth Tokens .-> WS
    DT -. Network Requests<br>50 Entry Cache .-> NS
    DT -. Console Logs<br>Size Limited .-> LG
    DT -. Element Selection .-> BTS
    CE -. Screenshots<br>Base64 + File .-> SS
    NS -. Filtered Requests .-> MCP
    SS -. Storage Path + Data .-> MCP
    LG -. Truncated Logs .-> MCP
    NS -- Authenticated Calls --> API(("Target APIs"))
     SS -- Project Structure --> IMG["Image Storage<br>Downloads/MCP_Screenshots"]
    BTS -- Status Report --> HC["Health Monitor<br>connection-health"]
    MCP -.-> PS
    CE -.-> WB
    BTS -.-> HM
    WS -.-> ER

     API:::service
     IMG:::service
     HC:::service
    classDef default fill:#fff,stroke:#333,stroke-width:1px
    classDef service fill:#fcf,stroke:#333,stroke-width:1px
    style AI fill:#f9f,stroke:#333,stroke-width:2px
    style MCP fill:#bbf,stroke:#333,stroke-width:2px
    style BTS fill:#bfb,stroke:#333,stroke-width:2px
    style CE fill:#ffb,stroke:#333,stroke-width:2px
    style HM fill:#ffe,stroke:#333,stroke-width:1px
    style WB fill:#ffe,stroke:#333,stroke-width:1px
    style PS fill:#ffe,stroke:#333,stroke-width:1px
    style ER fill:#ffe,stroke:#333,stroke-width:1px



```

#### 1. **MCP Server** (`browser-tools-mcp/`)

- **Role**: Model Context Protocol implementation
- **Function**: Provides standardized AI tool interface
- **Key Features**: Enhanced server discovery, retry logic, connection health monitoring
- **AI Integration**: Compatible with Windsurf, Cursor, Cline, Zed, Claude Desktop

#### 2. **Browser Tools Server** (`browser-tools-server/`)

- **Role**: Central coordination hub
- **Function**: WebSocket management, data processing, screenshot coordination
- **Key Features**: Enhanced heartbeat system, individual request tracking, auto-port detection
- **Network**: HTTP REST API + WebSocket real-time communication

#### 3. **Chrome Extension** (`chrome-extension/`)

- **Role**: Browser integration layer
- **Function**: Real-time data capture, screenshot execution, DevTools integration
- **Key Features**: Fast reconnection, exponential backoff, streamlined discovery
- **UI**: DevTools panel with connection monitoring and manual controls

---

## 🔧 Server Features

- Auto-port detection (starts at 3025, selects 3026–3035 as needed)
- Connection health endpoint at `/connection-health`
- Heartbeat 25s, timeout 60s; fast reconnection (3–15s)
- Identity endpoint at `/.identity`
- Individual request tracking and improved callback cleanup

### 📊 Health Monitoring API

Real-time connection status at `/connection-health`:

```json
{
  "connected": true,
  "healthy": true,
  "connectionId": "conn_1735814017588_abc123",
  "heartbeatTimeout": 60000,
  "heartbeatInterval": 25000,
  "pendingScreenshots": 0,
  "uptime": 3600.45
}
```

---

## ✅ Prerequisites

- Chrome extension installed and DevTools open on the inspected tab
- Browser Tools Server running and discoverable (defaults to port 3025)
- Project configuration in `chrome-extension/projects.json` (see cheat sheet below)

---

## 🧭 Multi‑Project Selection

- Resolution order: request header `X-ACTIVE-PROJECT` → `ACTIVE_PROJECT` env (MCP) → `defaultProject` in `chrome-extension/projects.json`.
- Each project has its own embedding index at `.vectra/<project>` and API doc source.

---

## 🧰 Tools Quick Reference

| Tool | What it does | When to use | Key params | Preconditions |
| --- | --- | --- | --- | --- |
| `searchApiDocumentation` | Semantic search over Swagger/OpenAPI. Returns minimal endpoint info (method, path, simple param/request/response hints). | Finding endpoints and basic shapes before coding. | `query?`, `tag?`, `method?`, `limit?` | Embedding index built for the active project; `SWAGGER_URL` configured. |
| `listApiTags` | Lists all tags with operation counts. | Get a domain overview; seed further API searches. | none | `SWAGGER_URL` configured. |
| `fetchLiveApiResponse` | Makes a real HTTP request to `API_BASE_URL`; optionally includes `Authorization: Bearer ${API_AUTH_TOKEN}`. | Validate exact responses; verify auth/headers; confirm behavior. | `endpoint`, `method?`, `requestBody?`, `queryParams?`, `includeAuthToken?` | `API_BASE_URL` set; `API_AUTH_TOKEN` set if `includeAuthToken: true`. |
| `captureBrowserScreenshot` | Captures current tab, saves to a structured path, and returns the image. | UI analysis, visual verification, before/after loops. | `randomString` (dummy, required by MCP schema) | Extension connected; DevTools open. |
| `inspectSelectedElementCss` | Enhanced element context: computed styles, layout relations, issue detection, accessibility hints. | Rapid UI debugging after selecting an element in DevTools. | none | DevTools open and an element selected. |
| `inspectBrowserNetworkActivity` | Recent network requests with filters (URL substring, fields, time window, sort, limit). | Debug HTTP failures, payloads, and sequences (DevTools‑like). | `urlFilter`, `details[]`, `timeOffset?`, `orderBy?`, `orderDirection?`, `limit?` | Extension connected; trigger the requests first. |
| `inspectBrowserConsole` | Filtered console messages with stats and formatted output. | Surface JS errors/warnings/logs quickly. | `level?`, `limit?`, `timeOffset?`, `search?` | Extension connected; DevTools open. |
| `navigateBrowserTab` | Navigates the active tab to a URL. | Multi‑step flows; move to pages before taking screenshots or interacting. | `url` | Extension connected; optional `ROUTES_FILE_PATH` referenced in description. |
| `interactWithPage` | DOM interactions via semantic selectors (data‑testid, role+name, label, placeholder, name, text, css, xpath) with intelligent waits and CDP fallback. | Automate clicks/typing/selecting; assert visibility/enabled; optional post‑action screenshot. | `action`, `target`, `scopeTarget?`, `value?`, `options?` | Extension connected; DevTools open recommended. |

Notes:
- Prefer `inspectBrowserNetworkActivity` for network errors; console tool does not capture HTTP failures.
- Some MCP clients cache tool descriptions; dynamic updates are not always reflected live.

---

## 🔁 Common Workflows

- API integration
  1) `searchApiDocumentation` → 2) `fetchLiveApiResponse` → 3) implement/types → 4) iterate.

- UI debugging loop
  1) `captureBrowserScreenshot` → 2) select element in DevTools → 3) `inspectSelectedElementCss` → 4) fix → 5) screenshot again.

- Navigation + checks
  1) `navigateBrowserTab` → 2) `captureBrowserScreenshot` → 3) `inspectBrowserNetworkActivity`/`inspectBrowserConsole`.

- Automated UI interaction
  1) `navigateBrowserTab` → 2) `interactWithPage` (perform click/type/etc.) → 3) optional `captureBrowserScreenshot` → 4) verify via `inspectBrowserNetworkActivity`.

---

## 🗂️ Configuration Cheat Sheet (`chrome-extension/projects.json`)

- Per‑project `config`:
  - `SWAGGER_URL` (required for API search/tag tools)
  - `API_BASE_URL` (required for live API calls)
  - `API_AUTH_TOKEN` (only if `includeAuthToken: true`)
  - `ROUTES_FILE_PATH` (optional; referenced in navigation tool description)
  - Optional: `BROWSER_TOOLS_HOST`, `BROWSER_TOOLS_PORT`
- Global: `DEFAULT_SCREENSHOT_STORAGE_PATH` (base screenshot directory)

Embedding provider keys (env only, not in projects.json): `OPENAI_API_KEY`, `GEMINI_API_KEY` (+ optional model vars). Reindex from DevTools panel after provider/model changes.

---

## 🧑‍⚕️ Health & Troubleshooting

- Identity: `GET /.identity` → `{ signature: "mcp-browser-connector-24x7", ... }`
- Connection health: `GET /connection-health` → heartbeat status, uptime, pending screenshots, etc.
- Ports: auto‑select in range 3025–3035 (first free).

---

## ⚠️ Constraints & Tips

- Keep DevTools open on the inspected tab for console, network, selected element, and screenshots.
- Trigger real user actions before inspecting network activity to ensure logs exist.
- When docs lack detailed schemas, pair `searchApiDocumentation` with `fetchLiveApiResponse` to get exact shapes.
