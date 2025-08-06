# AGENTIC REFACTORING PLAN: browser-connector.ts Tool-wise Organization

## OBJECTIVE
Refactor `browser-tools-server/browser-connector.ts` to organize code by tools, moving infrastructure/connection code to top/bottom and grouping each tool's logic together.

## CURRENT STRUCTURE ANALYSIS

The current `browser-connector.ts` file (1545 lines) contains:

### Infrastructure Code
- WebSocket server setup and management
- Express app configuration
- Port discovery and server startup
- Heartbeat monitoring
- Connection health management
- Project configuration loading
- Path conversion utilities
- Log management utilities

### Tool-Specific Code
1. **inspectSelectedElementCss**: Selected element handling, `/selected-element` endpoints
2. **captureBrowserScreenshot**: Screenshot capture method, `/capture-screenshot` endpoint, WebSocket screenshot handling
3. **inspectBrowserNetworkActivity**: Network request logging, console logs, `/network-*` endpoints
4. **navigateBrowserTab**: Navigation method, `/navigate-tab` endpoint, URL tracking

## EXECUTION PLAN

### Phase 1: Analysis & Temp File Creation

Create temporary files to logically segregate code sections:

```bash
# Create temp directory for refactoring
mkdir -p /tmp/browser-connector-refactor

# Create temp files for each section
touch /tmp/browser-connector-refactor/01-imports-and-interfaces.ts
touch /tmp/browser-connector-refactor/02-configuration-functions.ts  
touch /tmp/browser-connector-refactor/03-utility-functions.ts
touch /tmp/browser-connector-refactor/04-global-variables.ts
touch /tmp/browser-connector-refactor/05-tool-inspect-selected-element.ts
touch /tmp/browser-connector-refactor/06-tool-capture-screenshot.ts
touch /tmp/browser-connector-refactor/07-tool-network-activity.ts
touch /tmp/browser-connector-refactor/08-tool-navigate-tab.ts
touch /tmp/browser-connector-refactor/09-general-endpoints.ts
touch /tmp/browser-connector-refactor/10-websocket-connection-class.ts
touch /tmp/browser-connector-refactor/11-server-startup.ts
```

### Phase 2: Code Extraction by Logical Sections

Extract code into temp files based on functionality:

#### 01-imports-and-interfaces.ts
- All import statements (lines 1-16)
- Interface definitions: `ProjectConfig`, `Project`, `ProjectsConfig`, `ScreenshotCallback`, `NetworkLogEntry`
- Helper constants: `__filename`, `__dirname`

#### 02-configuration-functions.ts
- `loadProjectConfig()` function
- `getConfigValue()` function  
- `getScreenshotStoragePath()` function
- `getActiveProjectName()` function

#### 03-utility-functions.ts
- `convertPathForCurrentPlatform()` function
- `getDefaultDownloadsFolder()` function
- `truncateStringsInData()` function
- `processJsonString()` function
- `processLogsWithSettings()` function
- `calculateLogSize()` function
- `truncateLogsToQueryLimit()` function
- `clearAllLogs()` function
- `getAvailablePort()` function

#### 04-global-variables.ts
- `consoleLogs`, `consoleErrors`, `networkErrors`, `networkSuccess`, `allXhr` arrays
- `currentUrl`, `currentTabId` variables
- `currentSettings` object
- `detailedNetworkLogCache` array and `MAX_CACHE_SIZE`
- `REQUESTED_PORT`, `PORT` variables
- Express app setup and middleware configuration

#### 05-tool-inspect-selected-element.ts
```typescript
// ===== TOOL: inspectSelectedElementCss =====
// Global state for selected element
let selectedElement: any = null;

// Endpoints for selected element inspection
app.post("/selected-element", (req, res) => {
  const { data } = req.body;
  selectedElement = data;
  res.json({ status: "ok" });
});

app.get("/selected-element", (req, res) => {
  res.json(selectedElement || { message: "No element selected" });
});

// WebSocket message handling for selected element (to be integrated)
// case "selected-element": selectedElement = data.element; break;
```

#### 06-tool-capture-screenshot.ts
```typescript
// ===== TOOL: captureBrowserScreenshot =====
// Screenshot callback management
interface ScreenshotCallback {
  resolve: (value: { data: string; path?: string; autoPaste?: boolean; }) => void;
  reject: (reason: Error) => void;
}
const screenshotCallbacks = new Map<string, ScreenshotCallback>();

// Screenshot capture endpoint
app.post("/capture-screenshot", async (req: express.Request, res: express.Response) => {
  // [Extract the entire captureScreenshot method logic]
});

// WebSocket message handling for screenshots (to be integrated)
// case "screenshot-data": [screenshot response handling]
// case "screenshot-error": [screenshot error handling]
```

#### 07-tool-network-activity.ts
```typescript
// ===== TOOL: inspectBrowserNetworkActivity =====
// Network activity storage
const consoleLogs: any[] = [];
const consoleErrors: any[] = [];
const networkErrors: any[] = [];
const networkSuccess: any[] = [];
const allXhr: any[] = [];
const detailedNetworkLogCache: NetworkLogEntry[] = [];
const MAX_CACHE_SIZE = 50;

// Network activity endpoints
app.get("/console-logs", (req, res) => {
  const truncatedLogs = truncateLogsToQueryLimit(consoleLogs);
  res.json(truncatedLogs);
});

app.get("/console-errors", (req, res) => {
  const truncatedLogs = truncateLogsToQueryLimit(consoleErrors);
  res.json(truncatedLogs);
});

app.get("/network-errors", (req, res) => {
  const truncatedLogs = truncateLogsToQueryLimit(networkErrors);
  res.json(truncatedLogs);
});

app.get("/network-success", (req, res) => {
  const truncatedLogs = truncateLogsToQueryLimit(networkSuccess);
  res.json(truncatedLogs);
});

app.get("/all-xhr", (req, res) => {
  const mergedLogs = [...networkSuccess, ...networkErrors].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const truncatedLogs = truncateLogsToQueryLimit(mergedLogs);
  res.json(truncatedLogs);
});

// Extension log processing endpoint
app.post("/extension-log", (req, res) => {
  // [Extract the entire extension-log handler]
});

// WebSocket message handling for network activity (to be integrated)
// case "console-log": [console log handling]
// case "console-error": [console error handling] 
// case "network-request": [network request handling]
```

#### 08-tool-navigate-tab.ts
```typescript
// ===== TOOL: navigateBrowserTab =====
// Navigation callback management
private urlRequestCallbacks: Map<string, (url: string) => void> = new Map();

// Current URL tracking
let currentUrl: string = "";
let currentTabId: string | number | null = null;

// Navigation endpoints
app.post("/navigate-tab", async (req: express.Request, res: express.Response): Promise<void> => {
  // [Extract the entire navigateTab method logic]
});

app.post("/current-url", (req, res) => {
  // [Extract current URL update logic]
});

app.get("/current-url", (req, res) => {
  console.log("Current URL requested, returning:", currentUrl);
  res.json({ url: currentUrl });
});

// WebSocket message handling for navigation (to be integrated)
// case "current-url-response": [URL response handling]
// case "page-navigated": [page navigation handling]
// case "navigation-response": [navigation response handling]
```

#### 09-general-endpoints.ts
```typescript
// ===== GENERAL ENDPOINTS (Non-tool specific) =====
app.get("/.port", (req, res) => {
  res.send(PORT.toString());
});

app.get("/.identity", (req, res) => {
  res.json({
    port: PORT,
    name: "browser-tools-server", 
    version: "1.2.0",
    signature: "mcp-browser-connector-24x7",
  });
});

app.post("/wipelogs", (req, res) => {
  clearAllLogs();
  res.json({ status: "ok", message: "All logs cleared successfully" });
});

app.get("/connection-health", (req, res) => {
  // [Extract connection health logic]
});
```

#### 10-websocket-connection-class.ts
```typescript
// ===== WEBSOCKET CONNECTION MANAGEMENT =====
export class BrowserConnector {
  // [Extract entire BrowserConnector class with all methods]
  // Organize WebSocket message handling by tool sections
}
```

#### 11-server-startup.ts
```typescript
// ===== SERVER STARTUP AND INITIALIZATION =====
// [Extract the async IIFE and all server startup logic]
```

### Phase 3: Reorganization Strategy

#### New File Structure:

1. **Top Section (Infrastructure):**
   - Imports and interfaces
   - Configuration functions
   - Utility functions
   - Global variables and Express setup

2. **Middle Section (Tools - in order):**
   - inspectSelectedElementCss
   - captureBrowserScreenshot  
   - inspectBrowserNetworkActivity
   - navigateBrowserTab

3. **Bottom Section (Connection Management):**
   - General endpoints
   - WebSocket connection class
   - Server startup logic

### Phase 4: Reconstruction

Combine temp files in the new order:

```bash
# Create the new organized file
cat /tmp/browser-connector-refactor/01-imports-and-interfaces.ts > browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// CONFIGURATION FUNCTIONS" >> browser-tools-server/browser-connector-new.ts  
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/02-configuration-functions.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// UTILITY FUNCTIONS" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/03-utility-functions.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// GLOBAL VARIABLES & EXPRESS SETUP" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/04-global-variables.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// TOOL: inspectSelectedElementCss" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/05-tool-inspect-selected-element.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// TOOL: captureBrowserScreenshot" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/06-tool-capture-screenshot.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// TOOL: inspectBrowserNetworkActivity" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/07-tool-network-activity.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// TOOL: navigateBrowserTab" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/08-tool-navigate-tab.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// GENERAL ENDPOINTS" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/09-general-endpoints.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// WEBSOCKET CONNECTION MANAGEMENT" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/10-websocket-connection-class.ts >> browser-tools-server/browser-connector-new.ts

echo -e "\n// =============================================" >> browser-tools-server/browser-connector-new.ts
echo "// SERVER STARTUP" >> browser-tools-server/browser-connector-new.ts
echo "// =============================================" >> browser-tools-server/browser-connector-new.ts
cat /tmp/browser-connector-refactor/11-server-startup.ts >> browser-tools-server/browser-connector-new.ts
```

### Phase 5: Integration & Cleanup

#### 1. Integrate WebSocket Message Handling
- Move tool-specific WebSocket message cases to their respective tool sections
- Ensure the BrowserConnector class references the correct tool sections

#### 2. Fix Variable Scoping
- Ensure variables are accessible where needed
- Move shared variables to appropriate sections

#### 3. Validation
- Compare old vs new file functionality
- Test that all endpoints still work
- Verify WebSocket connections function properly

#### 4. Final Steps
```bash
# Backup original file
cp browser-tools-server/browser-connector.ts browser-tools-server/browser-connector-backup.ts

# Replace with new organized version
mv browser-tools-server/browser-connector-new.ts browser-tools-server/browser-connector.ts

# Clean up temp files
rm -rf /tmp/browser-connector-refactor
```

## DETAILED CODE MAPPING

### Tool-Specific Code Locations in Current File

#### inspectSelectedElementCss
- **Variables**: `selectedElement` (line ~200)
- **Endpoints**: 
  - `POST /selected-element` (line ~600)
  - `GET /selected-element` (line ~605)
- **WebSocket**: `case "selected-element"` in message handler

#### captureBrowserScreenshot  
- **Variables**: `screenshotCallbacks` Map (line ~220)
- **Interface**: `ScreenshotCallback` (line ~210)
- **Methods**: `captureScreenshot()` method in BrowserConnector class
- **Endpoints**: `POST /capture-screenshot` (line ~750)
- **WebSocket**: `case "screenshot-data"` and `case "screenshot-error"` in message handler

#### inspectBrowserNetworkActivity
- **Variables**: 
  - `consoleLogs`, `consoleErrors`, `networkErrors`, `networkSuccess`, `allXhr` (line ~180-190)
  - `detailedNetworkLogCache`, `MAX_CACHE_SIZE` (line ~620)
- **Endpoints**:
  - `GET /console-logs` (line ~450)
  - `GET /console-errors` (line ~455)
  - `GET /network-errors` (line ~460)
  - `GET /network-success` (line ~465)
  - `GET /all-xhr` (line ~470)
  - `POST /extension-log` (line ~300)
- **WebSocket**: `case "console-log"`, `case "console-error"`, `case "network-request"` in message handler

#### navigateBrowserTab
- **Variables**: 
  - `currentUrl`, `currentTabId` (line ~195)
  - `urlRequestCallbacks` Map in BrowserConnector class
- **Methods**: `navigateTab()` method in BrowserConnector class
- **Endpoints**:
  - `POST /navigate-tab` (line ~780)
  - `POST /current-url` (line ~550)
  - `GET /current-url` (line ~580)
- **WebSocket**: `case "current-url-response"`, `case "page-navigated"`, `case "navigation-response"` in message handler

## SUCCESS CRITERIA

After refactoring, the file should have:

1. **Clear Tool Sections**: Each tool's logic grouped together with clear section headers
2. **Infrastructure Separation**: Connection and utility code separated from tool logic
3. **Maintained Functionality**: All endpoints and WebSocket handling working as before
4. **Improved Readability**: Easy to find and modify tool-specific code
5. **Logical Flow**: Infrastructure → Tools → Connection Management → Startup

This plan provides a systematic approach to refactor the browser-connector.ts file with clear tool-wise organization while maintaining all functionality.