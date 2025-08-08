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
