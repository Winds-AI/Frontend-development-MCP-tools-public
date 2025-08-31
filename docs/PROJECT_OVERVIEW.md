**🚀 Autonomous AI-Powered Frontend Development Platform**

- Contents:
  - Executive Summary
  - System Architecture
  - Server Features
  - Health Monitoring API

## 📋 Executive Summary

This is a comprehensive solution designed for **autonomous AI-powered frontend development workflows**. This system provides AI agents the reliable access to browser state, real-time debugging information, and seamless screenshot capabilities through enhanced WebSocket connections optimized for extended development sessions.

### 🎯 Project Mission

Enable AI development tools to work autonomously for minutes without manual intervention by providing:

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
        PC["Port Config<br>Default: 3025<br>Via PORT env"]
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
     SS -- Project Structure --> IMG["Image Storage<br>Downloads/AFBT_Screenshots"]
    BTS -- Status Report --> HC["Health Monitor<br>connection-health"]
    MCP -.-> PC
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
- **UI**: DevTools panel with connection monitoring and manual controls (embedding management moved to Setup UI)

---

## 🔧 Server Features

- **Port Configuration**: Server runs on port 3025 (configurable via `PORT` environment variable)
- **Connection Health**: Real-time monitoring endpoint at `/connection-health`
- **Heartbeat System**: 25s heartbeat interval, 60s timeout; fast reconnection (3–15s backoff)
- **Identity Endpoint**: Service identification at `/.identity`
- **Request Tracking**: Individual request tracking and improved callback cleanup

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
- Project configuration in root `projects.json` and env in `.env`

---

## 🧭 Multi‑Project Selection

- Resolution order: request header `X-ACTIVE-PROJECT` → `ACTIVE_PROJECT` env (MCP) → `defaultProject` in root `projects.json`.
- Each project has its own embedding index at `.vectra/<project>` and API doc source.

### projects.json resolution

The server resolves `projects.json` across common launch modes to avoid "projects.json not found" during reindex:

- **Env Override**: `AFBT_PROJECTS_JSON` (absolute path)
- **CWD**: `./projects.json` (when started from repo root)
- **Parent of CWD**: `../projects.json` (when started inside `browser-tools-server/`)
- **Module-relative**: `browser-tools-server/../../projects.json` (local dev builds)
- **Home Fallback**: `~/.afbt/projects.json`

This ensures embeddings reindex works via both `pnpm run setup` and `npx afbt-setup`/direct server runs.

---

## 🧰 Tools Quick Reference

| Tool                      | What it does                                                                                                                                                      | When to use                                                                                   | Key params                                                                       | Preconditions                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `api.searchEndpoints`     | Semantic search over Swagger/OpenAPI. Returns minimal endpoint info (method, path, simple param/request/response hints) and `requiresAuth` from OpenAPI security. | Finding endpoints and basic shapes before coding.                                             | `query?`, `tag?`, `method?`, `limit?`                                            | Embedding index built for the active project; `SWAGGER_URL` configured.                                                             |
| `api.listTags`            | Lists all tags with operation counts.                                                                                                                             | Get a domain overview; seed further API searches.                                             | none                                                                             | `SWAGGER_URL` configured.                                                                                                           |
| `api.request`             | Makes a real HTTP request to `API_BASE_URL`; optionally includes `Authorization: Bearer <token>`. Token source: dynamic via browser storage.                      | Validate exact responses; verify auth/headers; confirm behavior.                              | `endpoint`, `method?`, `requestBody?`, `queryParams?`, `includeAuthToken?`       | `API_BASE_URL` set; if `includeAuthToken: true` then configure `AUTH_STORAGE_TYPE` + `AUTH_TOKEN_KEY` (and optional `AUTH_ORIGIN`). |
| `browser.screenshot`      | Captures current tab, saves to a structured path, and returns the image.                                                                                          | UI analysis, visual verification, before/after loops.                                         | `randomString` (dummy, required by MCP schema)                                   | Extension connected; DevTools open.                                                                                                 |
| `ui.inspectElement`       | Enhanced element context: computed styles, layout relations, issue detection, accessibility hints.                                                                | Rapid UI debugging after selecting an element in DevTools.                                    | none                                                                             | DevTools open and an element selected.                                                                                              |
| `browser.network.inspect` | Recent network requests with filters (URL substring, fields, time window, sort, limit).                                                                           | Debug HTTP failures, payloads, and sequences (DevTools‑like).                                 | `urlFilter`, `details[]`, `timeOffset?`, `orderBy?`, `orderDirection?`, `limit?` | Extension connected; trigger the requests first.                                                                                    |
| `browser.console.read`    | Filtered console messages with stats and formatted output.                                                                                                        | Surface JS errors/warnings/logs quickly.                                                      | `level?`, `limit?`, `timeOffset?`, `search?`                                     | Extension connected; DevTools open.                                                                                                 |
| `browser.navigate`        | Navigates the active tab to a URL.                                                                                                                                | Multi‑step flows; move to pages before taking screenshots or interacting.                     | `url`                                                                            | Extension connected; optional `ROUTES_FILE_PATH` referenced in description.                                                         |
| `ui.interact`             | DOM interactions via semantic selectors (data‑testid, role+name, label, placeholder, name, text, css, xpath) with intelligent waits and CDP fallback.             | Automate clicks/typing/selecting; assert visibility/enabled; optional post‑action screenshot. | `action`, `target`, `scopeTarget?`, `value?`, `options?`                         | Extension connected; DevTools open recommended.                                                                                     |

Notes:

- Prefer `browser.network.inspect` for network errors; console tool does not capture HTTP failures.
- Some MCP clients cache tool descriptions; dynamic updates are not always reflected live.
- `ui.interact` provides automated UI interaction capabilities for common web application patterns.

---

## 🔁 Common Workflows

- API integration

  1. `api.searchEndpoints` → 2) `api.request` → 3) implement/types → 4) iterate.

- UI debugging loop

  1. `browser.screenshot` → 2) select element in DevTools → 3) `ui.inspectElement` → 4) fix → 5) screenshot again.

- Navigation + checks

  1. `browser.navigate` → 2) `browser.screenshot` → 3) `browser.network.inspect`/`browser.console.read`.

- Automated UI interaction
  1. `browser.navigate` → 2) `ui.interact` (perform click/type/etc.) → 3) optional `browser.screenshot` → 4) verify via `browser.network.inspect`.

---

## 🧑‍⚕️ Health & Troubleshooting

- **Identity Endpoint**: `GET /.identity` → `{ signature: "mcp-browser-connector-24x7", port: 3025, name: "frontend-browser-tools-server", version: "1.2.0" }`
- **Connection Health**: `GET /connection-health` → heartbeat status, uptime, pending screenshots, connection ID
- **Port Configuration**: Server runs on port 3025 (configurable via `PORT` environment variable)

---

## ⚠️ Constraints & Tips

- Keep DevTools open on the inspected tab for console, network, selected element, and screenshots.
- Trigger real user actions before inspecting network activity to ensure logs exist.
- When docs lack detailed schemas, pair `api.searchEndpoints` with `api.request` to get exact shapes.
