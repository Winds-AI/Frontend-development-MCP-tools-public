#!/usr/bin/env node
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Socket } from "net";
import os from "os";
import * as net from "net";
import ScreenshotService from "./screenshot-service.js";
import dotenv from "dotenv";
dotenv.config();

// Install global colored logger (subtle)
import { installGlobalLogger } from "./modules/logger.js";
installGlobalLogger();

// Local deps needed earlier that were removed when moving scaffolding
import path from "path";

// Moved scaffolding imports and helpers
import {
  __filename as __top_filename,
  __dirname as __top_dirname,
  loadProjectConfig,
  getConfigValue,
  getScreenshotStoragePath,
  getActiveProjectName,
  convertPathForCurrentPlatform,
  getDefaultDownloadsFolder,
  truncateStringsInData,
  processJsonString,
  calculateLogSize,
  type NetworkLogEntry,
  MAX_DETAILED_NETWORK_LOG_CACHE,
  getAvailablePort,
  clearAllLogs as clearImportedLogs,
  logs,
  networkLogs,
  detailedNetworkLogCache,
  truncateLogsToQueryLimit,
} from "./modules/shared.js";
import {
  buildScreenshotConfig,
  buildScreenshotResponse,
} from "./modules/screenshot.js";
import {
  buildNavigationMessage,
  parseNavigationResponse,
} from "./modules/navigation.js";
import { formatSelectedElementDebugText } from "./modules/element-inspector.js";
import {
  filterNetworkLogs,
  sortNetworkLogs,
  projectNetworkLogDetails,
  limitResults,
  type NetworkFilterParams,
} from "./modules/network-activity.js";
import {
  buildConsoleInspectionResponse,
  type ConsoleFilterParams,
} from "./modules/console-inspector.js";
import type {
  ProjectConfig,
  Project,
  ProjectsConfig,
} from "./modules/shared.js";

// Semantic embedding index utilities
import {
  rebuildIndex as rebuildSemanticIndex,
  getStatus as getEmbedStatus,
  searchSemantic,
} from "./modules/semantic-index.js";

// Preserve original helper constant names by aliasing
const __filename = __top_filename;
const __dirname = __top_dirname;

/**
 * convertPathForCurrentPlatform moved to modules/top-scaffold.ts
 * Using imported version to keep behavior identical.
 */

// Function to get default downloads folder
/**
 * getDefaultDownloadsFolder moved to modules/top-scaffold.ts
 * Using imported version to keep behavior identical.
 */

// We store logs in memory
const consoleLogs: any[] = [];
const consoleErrors: any[] = [];
const consoleWarnings: any[] = [];
const networkErrors: any[] = [];
const networkSuccess: any[] = [];
const allXhr: any[] = [];

// Store the current URL from the extension
let currentUrl: string = "";

// Store the current tab ID from the extension
let currentTabId: string | number | null = null;

// Add settings state
let currentSettings = {
  logLimit: 50,
  queryLimit: 30000,
  showRequestHeaders: false,
  showResponseHeaders: false,
  model: "claude-3-sonnet",
  stringSizeLimit: 500,
  maxLogSize: 20000,
  // Add server host configuration
  serverHost: process.env.SERVER_HOST || "0.0.0.0", // Default to all interfaces
};

// Add new storage for selected element
let selectedElement: any = null;

// Add new state for tracking screenshot requests
interface ScreenshotCallback {
  resolve: (value: {
    data: string;
    path?: string;
    autoPaste?: boolean;
  }) => void;
  reject: (reason: Error) => void;
}

const screenshotCallbacks = new Map<string, ScreenshotCallback>();

// Using imported getAvailablePort from shared.js

// Start with requested port and find an available one
const REQUESTED_PORT = parseInt(process.env.PORT || "3025", 10);
let PORT = REQUESTED_PORT;

// Create application and initialize middleware
const app = express();
app.use(cors());
// Increase JSON body parser limit to 50MB to handle large screenshots
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

/**
 * truncateStringsInData moved to modules/top-scaffold.ts
 * Using imported version to keep behavior identical.
 */

/**
 * processJsonString moved to modules/top-scaffold.ts
 * Using imported version to keep behavior identical.
 */

// Helper function to use imported truncateLogsToQueryLimit with current settings
function truncateLogsWithCurrentSettings(logs: any[]): any[] {
  return truncateLogsToQueryLimit(logs, {
    queryLimit: currentSettings.queryLimit,
    showRequestHeaders: currentSettings.showRequestHeaders,
    showResponseHeaders: currentSettings.showResponseHeaders,
  });
}

// Endpoint for the extension to POST data
app.post("/extension-log", (req, res) => {
  console.log("\n=== Received Extension Log ===");
  console.log("Request body:", {
    dataType: req.body.data?.type,
    timestamp: req.body.data?.timestamp,
    hasSettings: !!req.body.settings,
  });

  const { data, settings } = req.body;

  // Update settings if provided
  if (settings) {
    console.log("Updating settings:", settings);
    currentSettings = {
      ...currentSettings,
      ...settings,
    };
  }

  if (!data) {
    console.log("Warning: No data received in log request");
    res.status(400).json({ status: "error", message: "No data provided" });
    return;
  }

  console.log(`Processing ${data.type} log entry`);

  switch (data.type) {
    case "page-navigated":
      // Handle page navigation event via HTTP POST
      // Note: This is also handled in the WebSocket message handler
      // as the extension may send navigation events through either channel
      console.log("Received page navigation event with URL:", data.url);
      currentUrl = data.url;

      // Also update the tab ID if provided
      if (data.tabId) {
        console.log("Updating tab ID from page navigation event:", data.tabId);
        currentTabId = data.tabId;
      }

      console.log("Updated current URL:", currentUrl);
      break;
    case "console-log":
      console.log("Adding console log:", {
        level: data.level,
        message:
          data.message?.substring(0, 100) +
          (data.message?.length > 100 ? "..." : ""),
        timestamp: data.timestamp,
      });
      consoleLogs.push(data);
      if (consoleLogs.length > currentSettings.logLimit) {
        console.log(
          `Console logs exceeded limit (${currentSettings.logLimit}), removing oldest entry`
        );
        consoleLogs.shift();
      }
      break;
    case "console-error":
      console.log("Adding console error:", {
        level: data.level,
        message:
          data.message?.substring(0, 100) +
          (data.message?.length > 100 ? "..." : ""),
        timestamp: data.timestamp,
      });
      consoleErrors.push(data);
      if (consoleErrors.length > currentSettings.logLimit) {
        console.log(
          `Console errors exceeded limit (${currentSettings.logLimit}), removing oldest entry`
        );
        consoleErrors.shift();
      }
      break;
    case "console-warn":
      console.log("Adding console warning:", {
        level: data.level,
        message:
          data.message?.substring(0, 100) +
          (data.message?.length > 100 ? "..." : ""),
        timestamp: data.timestamp,
      });
      consoleWarnings.push(data);
      if (consoleWarnings.length > currentSettings.logLimit) {
        console.log(
          `Console warnings exceeded limit (${currentSettings.logLimit}), removing oldest entry`
        );
        consoleWarnings.shift();
      }
      break;
    case "network-request":
      const logEntry = {
        url: data.url,
        method: data.method,
        status: data.status,
        timestamp: data.timestamp,
        requestHeaders: data.requestHeaders,
        responseHeaders: data.responseHeaders,
        requestBody: data.requestBody,
        responseBody: data.responseBody,
      };
      console.log("Adding network request:", {
        url: logEntry.url,
        method: logEntry.method,
        status: logEntry.status,
        timestamp: logEntry.timestamp,
      });
      // Store the full request data in the detailedNetworkLogCache for the getNetworkRequestDetails tool
      console.log("[DEBUG] Adding detailed network log to cache");
      detailedNetworkLogCache.push(logEntry);
      if (detailedNetworkLogCache.length > MAX_CACHE_SIZE) {
        console.log(
          `[DEBUG] Detailed network logs exceeded limit (${MAX_CACHE_SIZE}), removing oldest entry`
        );
        detailedNetworkLogCache.shift();
      }
      console.log(
        `[DEBUG] Current detailedNetworkLogCache size: ${detailedNetworkLogCache.length}`
      );

      // Route network requests based on status code
      if (data.status >= 400) {
        networkErrors.push(data);
        if (networkErrors.length > currentSettings.logLimit) {
          console.log(
            `Network errors exceeded limit (${currentSettings.logLimit}), removing oldest entry`
          );
          networkErrors.shift();
        }
      } else {
        networkSuccess.push(data);
        if (networkSuccess.length > currentSettings.logLimit) {
          console.log(
            `Network success logs exceeded limit (${currentSettings.logLimit}), removing oldest entry`
          );
          networkSuccess.shift();
        }
      }
      break;
    case "selected-element":
      console.log("Updating selected element:", {
        tagName: data.element?.tagName,
        id: data.element?.id,
        className: data.element?.className,
      });
      selectedElement = data.element;
      break;
    default:
      console.log("Unknown log type:", data.type);
  }

  console.log("Current log counts:", {
    consoleLogs: consoleLogs.length,
    consoleErrors: consoleErrors.length,
    consoleWarnings: consoleWarnings.length,
    networkErrors: networkErrors.length,
    networkSuccess: networkSuccess.length,
  });
  console.log("=== End Extension Log ===\n");

  res.json({ status: "ok" });
});

// Update GET endpoints to use the new function
app.get("/console-logs", (req, res) => {
  // Processing is handled by truncateLogsWithCurrentSettings
  const truncatedLogs = truncateLogsWithCurrentSettings(consoleLogs);
  res.json(truncatedLogs);
});

app.get("/console-errors", (req, res) => {
  const truncatedLogs = truncateLogsWithCurrentSettings(consoleErrors);
  res.json(truncatedLogs);
});

app.get("/console-warnings", (req, res) => {
  const truncatedLogs = truncateLogsWithCurrentSettings(consoleWarnings);
  res.json(truncatedLogs);
});

// New MCP tool endpoint: Console Inspector
app.get("/console-inspection", (req, res) => {
  console.log("Browser Connector: Received console inspection request");

  // Parse query parameters for filtering
  const filters: ConsoleFilterParams = {
    level: req.query.level as any || 'all',
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    since: req.query.since ? parseInt(req.query.since as string) : undefined,
    search: req.query.search as string || undefined,
  };

  console.log("Browser Connector: Console inspection filters:", filters);

  try {
    // Build comprehensive console inspection response
    const response = buildConsoleInspectionResponse(
      consoleLogs,
      consoleErrors,
      consoleWarnings,
      filters
    );

    console.log(`Browser Connector: Returning ${response.logs.length} console entries`);
    console.log(`Browser Connector: Stats:`, response.stats);

    res.json(response);
  } catch (error) {
    console.error("Browser Connector: Error in console inspection:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

app.get("/network-errors", (req, res) => {
  const truncatedLogs = truncateLogsWithCurrentSettings(networkErrors);
  res.json(truncatedLogs);
});

app.get("/network-success", (req, res) => {
  const truncatedLogs = truncateLogsWithCurrentSettings(networkSuccess);
  res.json(truncatedLogs);
});

app.get("/all-xhr", (req, res) => {
  // Merge and sort network success and error logs by timestamp
  const mergedLogs = [...networkSuccess, ...networkErrors].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const truncatedLogs = truncateLogsWithCurrentSettings(mergedLogs);
  res.json(truncatedLogs);
});

// Add new endpoint for selected element
app.post("/selected-element", (req, res) => {
  const { data } = req.body;
  selectedElement = data;
  res.json({ status: "ok" });
});

app.get("/selected-element", async (req, res) => {
  // Keep endpoint structure; formatting will be applied by tool when requested elsewhere
  res.json(selectedElement || { message: "No element selected" });
});

// Use imported detailedNetworkLogCache from top-scaffold
const MAX_CACHE_SIZE = MAX_DETAILED_NETWORK_LOG_CACHE; // Limit cache size

app.get("/.port", (req, res) => {
  res.send(PORT.toString());
});

// Add new identity endpoint with a unique signature
app.get("/.identity", (req, res) => {
  res.json({
    port: PORT,
    name: "browser-tools-server",
    version: "1.2.0",
    signature: "mcp-browser-connector-24x7",
  });
});

/**
 * Server-side network request inspector (consolidated)
 * Query params:
 * - urlFilter: substring to filter URL (string)
 * - details: comma-separated keys (url,method,status,timestamp,requestHeaders,responseHeaders,requestBody,responseBody)
 * - includeTimestamp: "true" | "false" (default: true)
 * - timeStart/timeEnd: unix ms bounds (numbers)
 * - orderBy: "timestamp" | "url" (default: "timestamp")
 * - orderDirection: "asc" | "desc" (default: "desc")
 * - limit: number (default: 20)
 */
app.get("/network-request-details", (req, res) => {
  try {
    const urlFilter = String(req.query.urlFilter ?? "");
    const detailsCsv = String(req.query.details ?? "url,method,status");
    const details = detailsCsv
      .split(",")
      .filter(Boolean) as any as NetworkFilterParams["details"];
    const includeTimestamp =
      String(req.query.includeTimestamp ?? "true") === "true";
    const timeStart = req.query.timeStart
      ? Number(req.query.timeStart)
      : undefined;
    const timeEnd = req.query.timeEnd ? Number(req.query.timeEnd) : undefined;
    const orderBy = String(
      req.query.orderBy ?? "timestamp"
    ) as any as NetworkFilterParams["orderBy"];
    const orderDirection = String(
      req.query.orderDirection ?? "desc"
    ) as any as NetworkFilterParams["orderDirection"];
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    let results = filterNetworkLogs(detailedNetworkLogCache, {
      urlFilter,
      timeStart,
      timeEnd,
    });
    results = sortNetworkLogs(results, orderBy, orderDirection);
    const projected = projectNetworkLogDetails(
      results,
      details,
      includeTimestamp
    );
    const limited = limitResults(projected, limit);

    res.json(limited);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: e?.message || "Failed to read network details" });
  }
});

// Add function to clear all logs (local version that also clears imported logs)
function clearAllLogs() {
  console.log("Wiping all logs...");
  consoleLogs.length = 0;
  consoleErrors.length = 0;
  consoleWarnings.length = 0;
  networkErrors.length = 0;
  networkSuccess.length = 0;
  allXhr.length = 0;
  selectedElement = null;

  // Also clear imported logs from top-scaffold
  clearImportedLogs();

  console.log("All logs have been wiped");
}

// Add endpoint to wipe logs
app.post("/wipelogs", (req, res) => {
  clearAllLogs();
  res.json({ status: "ok", message: "All logs cleared successfully" });
});

// Add endpoint for the extension to report the current URL
app.post("/current-url", (req, res) => {
  console.log(
    "Received current URL update request:",
    JSON.stringify(req.body, null, 2)
  );

  if (req.body && req.body.url) {
    const oldUrl = currentUrl;
    currentUrl = req.body.url;

    // Update the current tab ID if provided
    if (req.body.tabId) {
      const oldTabId = currentTabId;
      currentTabId = req.body.tabId;
      console.log(`Updated current tab ID: ${oldTabId} -> ${currentTabId}`);
    }

    // Log the source of the update if provided
    const source = req.body.source || "unknown";
    const tabId = req.body.tabId || "unknown";
    const timestamp = req.body.timestamp
      ? new Date(req.body.timestamp).toISOString()
      : "unknown";

    console.log(
      `Updated current URL via dedicated endpoint: ${oldUrl} -> ${currentUrl}`
    );
    console.log(
      `URL update details: source=${source}, tabId=${tabId}, timestamp=${timestamp}`
    );

    res.json({
      status: "ok",
      url: currentUrl,
      tabId: currentTabId,
      previousUrl: oldUrl,
      updated: oldUrl !== currentUrl,
    });
  } else {
    console.log("No URL provided in current-url request");
    res.status(400).json({ status: "error", message: "No URL provided" });
  }
});

// Add endpoint to get the current URL
app.get("/current-url", (req, res) => {
  console.log("Current URL requested, returning:", currentUrl);
  res.json({ url: currentUrl });
});

// Embeddings: index status
app.get("/api/embed/status", async (req, res) => {
  try {
    const project = typeof req.query.project === "string" ? req.query.project : undefined;
    const status = await getEmbedStatus(project);
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to get embedding index status" });
  }
});

// Embeddings: rebuild index (manual only)
app.post("/api/embed/reindex", async (req, res) => {
  try {
    const project = typeof req.query.project === "string" ? req.query.project : (req.body?.project as string | undefined);
    const meta = await rebuildSemanticIndex(project);
    res.json({ status: "ok", meta });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to rebuild embedding index" });
  }
});

// Embeddings: semantic search
app.post("/api/embed/search", async (req, res) => {
  try {
    const { query, tag, method, limit } = req.body || {};
    const lim = typeof limit === "number" ? limit : Number(limit) || undefined;
    // Implicit multi-client routing: prefer header ACTIVE-PROJECT, then env/default
    const projectFromHeader =
      (req.headers["x-active-project"] as string | undefined) ||
      (req.headers["active-project"] as string | undefined);
    const result = await searchSemantic(
      { query, tag, method, limit: lim },
      projectFromHeader
    );
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to perform semantic search" });
  }
});

export class BrowserConnector {
  private wss: WebSocketServer;
  private activeConnection: WebSocket | null = null;
  private app: express.Application;
  private server: any;
  private urlRequestCallbacks: Map<string, (url: string) => void> = new Map();

  // Connection health monitoring - optimized for autonomous operation
  private lastHeartbeatTime: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 25000; // Reduced to 25 seconds for more frequent checks
  private readonly HEARTBEAT_TIMEOUT = 60000; // Increased to 60 seconds for network tolerance
  private connectionId: string = ""; // Track connection identity for better debugging

  constructor(app: express.Application, server: any) {
    this.app = app;
    this.server = server;

    // Initialize WebSocket server using the existing HTTP server
    this.wss = new WebSocketServer({
      noServer: true,
      path: "/extension-ws",
    });

    // Register the capture-screenshot endpoint
    this.app.post(
      "/capture-screenshot",
      async (req: express.Request, res: express.Response) => {
        console.log(
          "Browser Connector: Received request to /capture-screenshot endpoint"
        );

        console.log(
          "Browser Connector: Active WebSocket connection:",
          !!this.activeConnection
        );
        await this.captureScreenshot(req, res);
      }
    );

    // Add connection health endpoint for autonomous operation monitoring
    this.app.get("/connection-health", (req, res) => {
      const status = this.getConnectionStatus();
      const isHealthy =
        this.hasActiveConnection() &&
        Date.now() - this.lastHeartbeatTime < this.HEARTBEAT_TIMEOUT;

      res.json({
        ...status,
        healthy: isHealthy,
        pendingScreenshots: screenshotCallbacks.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // Add navigation endpoint
    this.app.post(
      "/navigate-tab",
      async (req: express.Request, res: express.Response): Promise<void> => {
        await this.navigateTab(req, res);
      }
    );

    // Add DOM action endpoint
    this.app.post(
      "/dom-action",
      async (req: express.Request, res: express.Response): Promise<void> => {
        await this.domAction(req, res);
      }
    );

    // Handle upgrade requests for WebSocket
    this.server.on(
      "upgrade",
      (request: IncomingMessage, socket: Socket, head: Buffer) => {
        if (request.url === "/extension-ws") {
          this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            this.wss.emit("connection", ws, request);
          });
        }
      }
    );

    this.wss.on("connection", (ws: WebSocket) => {
      // Generate unique connection ID for debugging autonomous operation
      this.connectionId = `conn_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      console.log(
        `Chrome extension connected via WebSocket [${this.connectionId}]`
      );

      // Close any existing connection gracefully
      if (this.activeConnection) {
        console.log(
          `Closing existing connection for new one [${this.connectionId}]`
        );
        this.activeConnection.close(1000, "New connection established");
      }

      this.activeConnection = ws;
      this.lastHeartbeatTime = Date.now();

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      ws.on("message", (message: string | Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const data = JSON.parse(message.toString());

          // Handle heartbeat responses
          if (data.type === "heartbeat-response") {
            this.lastHeartbeatTime = Date.now();
            console.log(
              "Browser Connector: Received heartbeat response from extension"
            );
            return;
          }

          // Log message without the base64 data
          console.log("Received WebSocket message:", {
            ...data,
            data: data.data ? "[base64 data]" : undefined,
          });

          // Handle URL response
          if (data.type === "current-url-response" && data.url) {
            console.log("Received current URL from browser:", data.url);
            currentUrl = data.url;

            // Also update the tab ID if provided
            if (data.tabId) {
              console.log(
                "Updating tab ID from WebSocket message:",
                data.tabId
              );
              currentTabId = data.tabId;
            }

            // Call the callback if exists
            if (
              data.requestId &&
              this.urlRequestCallbacks.has(data.requestId)
            ) {
              const callback = this.urlRequestCallbacks.get(data.requestId);
              if (callback) callback(data.url);
              this.urlRequestCallbacks.delete(data.requestId);
            }
          }
          // Handle page navigation event via WebSocket
          // Note: This is intentionally duplicated from the HTTP handler in /extension-log
          // as the extension may send navigation events through either channel
          if (data.type === "page-navigated" && data.url) {
            console.log("Page navigated to:", data.url);
            currentUrl = data.url;

            // Also update the tab ID if provided
            if (data.tabId) {
              console.log(
                "Updating tab ID from page navigation event:",
                data.tabId
              );
              currentTabId = data.tabId;
            }
          }
          // Handle screenshot response - enhanced for autonomous operation
          if (data.type === "screenshot-data" && data.data) {
            console.log(`Received screenshot data [${this.connectionId}]`);

            // Find the specific callback for this request ID (if provided)
            if (data.requestId && screenshotCallbacks.has(data.requestId)) {
              const callback = screenshotCallbacks.get(data.requestId);
              console.log(
                `Found specific callback for requestId: ${data.requestId} [${this.connectionId}]`
              );
              if (callback) {
                callback.resolve({
                  data: data.data,
                });
                screenshotCallbacks.delete(data.requestId); // Only delete this specific callback
              }
            } else {
              // Fallback: Get the most recent callback if no requestId (legacy support)
              const callbacks = Array.from(screenshotCallbacks.entries());
              if (callbacks.length > 0) {
                const [oldestRequestId, callback] = callbacks[0]; // Use oldest pending callback
                console.log(
                  `Using oldest callback as fallback: ${oldestRequestId} [${this.connectionId}]`
                );
                callback.resolve({
                  data: data.data,
                });
                screenshotCallbacks.delete(oldestRequestId); // Only delete this specific callback
              } else {
                console.log(
                  `No callbacks found for screenshot data [${this.connectionId}]`
                );
              }
            }
          }
          // Handle screenshot error - enhanced for autonomous operation
          else if (data.type === "screenshot-error") {
            console.log(
              `Received screenshot error [${this.connectionId}]:`,
              data.error
            );

            // Find the specific callback for this request ID (if provided)
            if (data.requestId && screenshotCallbacks.has(data.requestId)) {
              const callback = screenshotCallbacks.get(data.requestId);
              console.log(
                `Found specific error callback for requestId: ${data.requestId} [${this.connectionId}]`
              );
              if (callback) {
                callback.reject(
                  new Error(data.error || "Screenshot capture failed")
                );
                screenshotCallbacks.delete(data.requestId); // Only delete this specific callback
              }
            } else {
              // Fallback: Use most recent callback if no requestId
              const callbacks = Array.from(screenshotCallbacks.entries());
              if (callbacks.length > 0) {
                const [oldestRequestId, callback] = callbacks[0];
                console.log(
                  `Using oldest error callback as fallback: ${oldestRequestId} [${this.connectionId}]`
                );
                callback.reject(
                  new Error(data.error || "Screenshot capture failed")
                );
                screenshotCallbacks.delete(oldestRequestId); // Only delete this specific callback
              }
            }
          } else {
            console.log("Unhandled message type:", data.type);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        console.log(
          `Chrome extension disconnected [${this.connectionId}] - Code: ${code}, Reason: ${reasonStr}`
        );

        if (this.activeConnection === ws) {
          this.handleConnectionClose();
        }

        // Log detailed disconnection info for autonomous operation debugging
        console.log(
          `Connection closure details - Normal: ${code === 1000 || code === 1001
          }, Connection ID: ${this.connectionId}`
        );
      });
    });
  }

  // Connection health monitoring methods
  private startHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (
        !this.activeConnection ||
        this.activeConnection.readyState !== WebSocket.OPEN
      ) {
        console.log("WebSocket connection lost, clearing heartbeat monitor");
        this.stopHeartbeatMonitoring();
        return;
      }

      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;

      // Check if connection is healthy
      if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        console.warn(
          `Connection appears unhealthy [${this.connectionId}] - no heartbeat response received in ${timeSinceLastHeartbeat}ms (timeout: ${this.HEARTBEAT_TIMEOUT}ms)`
        );

        // Enhanced callback cleanup for autonomous operation
        const callbacks = Array.from(screenshotCallbacks.entries());
        console.log(
          `Rejecting ${callbacks.length} pending screenshot callbacks due to heartbeat timeout [${this.connectionId}]`
        );

        callbacks.forEach(([requestId, callback], index) => {
          callback.reject(
            new Error(
              `Connection timeout - heartbeat failed [${this.connectionId
              }] - request ${requestId} (${index + 1}/${callbacks.length})`
            )
          );
        });
        screenshotCallbacks.clear();

        // Close the unhealthy connection
        try {
          console.log(
            `Closing unhealthy connection [${this.connectionId}] due to heartbeat timeout`
          );
          this.activeConnection?.close(1001, "Heartbeat timeout");
        } catch (error) {
          console.error(
            `Error closing unhealthy connection [${this.connectionId}]:`,
            error
          );
        }

        this.handleConnectionClose();
      } else {
        // Send heartbeat
        this.sendHeartbeat();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat() {
    if (
      this.activeConnection &&
      this.activeConnection.readyState === WebSocket.OPEN
    ) {
      try {
        // Add connection ID to heartbeat for debugging autonomous operation
        console.log(
          `Browser Connector: Sending heartbeat to Chrome extension [${this.connectionId}]`
        );
        this.activeConnection.send(
          JSON.stringify({
            type: "heartbeat",
            connectionId: this.connectionId,
            timestamp: Date.now(),
          })
        );
      } catch (error) {
        console.error(`Error sending heartbeat [${this.connectionId}]:`, error);
        this.handleConnectionClose();
      }
    }
  }
  private handleConnectionClose() {
    const connectionInfo = this.connectionId || "unknown";
    console.log(`Handling connection close event [${connectionInfo}]`);

    if (this.activeConnection) {
      this.activeConnection = null;
    }

    this.stopHeartbeatMonitoring();

    // Enhanced callback cleanup for autonomous operation reliability
    const callbacks = Array.from(screenshotCallbacks.values());
    console.log(
      `Cleaning up ${callbacks.length} pending screenshot callbacks due to connection loss [${connectionInfo}]`
    );

    callbacks.forEach((callback, index) => {
      callback.reject(
        new Error(
          `WebSocket connection lost [${connectionInfo}] - callback ${index + 1
          }/${callbacks.length}`
        )
      );
    });
    screenshotCallbacks.clear();

    console.log(
      `WebSocket connection closed [${connectionInfo}] - waiting for reconnection`
    );

    // Reset connection ID
    this.connectionId = "";
  }

  // Method to get detailed connection status for autonomous operation debugging
  public getConnectionStatus() {
    return {
      connected: this.activeConnection !== null,
      readyState: this.activeConnection?.readyState,
      readyStateText: this.getReadyStateText(this.activeConnection?.readyState),
      lastHeartbeat: this.lastHeartbeatTime,
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeatTime,
      connectionId: this.connectionId,
      heartbeatTimeout: this.HEARTBEAT_TIMEOUT,
      heartbeatInterval: this.HEARTBEAT_INTERVAL,
    };
  }

  private getReadyStateText(state?: number): string {
    switch (state) {
      case 0:
        return "CONNECTING";
      case 1:
        return "OPEN";
      case 2:
        return "CLOSING";
      case 3:
        return "CLOSED";
      default:
        return "UNKNOWN";
    }
  }

  // Enhanced method to check connection health for autonomous operation
  public hasActiveConnection(): boolean {
    const isActive =
      this.activeConnection !== null &&
      this.activeConnection.readyState === WebSocket.OPEN;

    if (!isActive && this.connectionId) {
      console.log(
        `Connection health check failed [${this.connectionId}] - State: ${this.activeConnection?.readyState || "null"
        }`
      );
    }

    return isActive;
  }

  // Add new endpoint for programmatic screenshot capture using unified service
  async captureScreenshot(req: express.Request, res: express.Response) {
    console.log("Browser Connector: Starting captureScreenshot method");

    if (!this.activeConnection) {
      console.log(
        "Browser Connector: No active WebSocket connection to Chrome extension "
      );
      return res.status(503).json({
        error:
          "Chrome extension not connected. Please open Chrome DevTools and ensure the extension is loaded.",
      });
    }

    try {
      // Extract parameters from request body
      console.log("Browser Connector: Starting screenshot capture...");
      const { projectName, returnImageData, baseDirectory } = req.body || {};
      
      const requestId = Date.now().toString();
      console.log("Browser Connector: Generated requestId:", requestId);

      // Create promise that will resolve when we get the screenshot data
      const screenshotPromise = new Promise<{
        data: string;
        path?: string;
        autoPaste?: boolean;
      }>((resolve, reject) => {
        console.log(
          `Browser Connector: Setting up screenshot callback for requestId: ${requestId}`
        );
        // Store callback in map
        screenshotCallbacks.set(requestId, { resolve, reject });
        console.log(
          "Browser Connector: Current callbacks:",
          Array.from(screenshotCallbacks.keys())
        );

        // Set timeout to clean up if we don't get a response - increased for autonomous operation
        setTimeout(() => {
          if (screenshotCallbacks.has(requestId)) {
            console.log(
              `Browser Connector: Screenshot capture timed out for requestId: ${requestId} [${this.connectionId}]`
            );
            screenshotCallbacks.delete(requestId);
            reject(
              new Error(
                `Screenshot capture timed out - no response from Chrome extension [${this.connectionId}] after 15 seconds`
              )
            );
          }
        }, 15000); // Increased from 10 to 15 seconds for autonomous operation stability
      });

      // Send screenshot request to extension
      const message = JSON.stringify({
        type: "take-screenshot",
        requestId: requestId,
      });
      console.log(
        `Browser Connector: Sending WebSocket message to extension:`,
        message
      );
      this.activeConnection.send(message);

      // Wait for screenshot data
      console.log("Browser Connector: Waiting for screenshot data...");
      const {
        data: base64Data,
        path: customPath,
        autoPaste,
      } = await screenshotPromise;
      console.log(
        "Browser Connector: Received screenshot data, processing with unified service..."
      );

      if (!base64Data) {
        throw new Error("No screenshot data received from Chrome extension");
      }

      // Use the unified screenshot service
      const screenshotService = ScreenshotService.getInstance();

      // Prepare configuration for screenshot service
      // Use project configuration for screenshot path, fallback to customPath if needed
      const projectScreenshotPath = getScreenshotStoragePath();

      // Build config using tool helper (statically imported)
      const screenshotConfig = buildScreenshotConfig(
        projectScreenshotPath,
        customPath,
        projectName
      );

      // Save screenshot using unified service
      const result = await screenshotService.saveScreenshot(
        base64Data,
        currentUrl,
        screenshotConfig
      );

      console.log(
        `Browser Connector: Screenshot saved successfully to: ${result.filePath}`
      );
      console.log(
        `Browser Connector: Project directory: ${result.projectDirectory}`
      );
      console.log(`Browser Connector: URL category: ${result.urlCategory}`);

      // Execute auto-paste if requested and on macOS
      if (os.platform() === "darwin" && autoPaste === true) {
        console.log("Browser Connector: Executing auto-paste to Cursor...");
        try {
          await screenshotService.executeAutoPaste(result.filePath);
          console.log("Browser Connector: Auto-paste executed successfully");
        } catch (autoPasteError) {
          console.error(
            "Browser Connector: Auto-paste failed:",
            autoPasteError
          );
          // Don't fail the screenshot save for auto-paste errors
        }
      } else {
        if (os.platform() === "darwin" && !autoPaste) {
          console.log("Browser Connector: Auto-paste disabled, skipping");
        } else {
          console.log("Browser Connector: Not on macOS, skipping auto-paste");
        }
      }

      // Build response object via tool helper
      const response: any = buildScreenshotResponse(result);

      console.log(
        "Browser Connector: Screenshot capture completed successfully"
      );
      res.json(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "Browser Connector: Error capturing screenshot:",
        errorMessage
      );
      res.status(500).json({
        error: errorMessage,
      });
    }
  }

  // Add navigation endpoint
  async navigateTab(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    console.log("Browser Connector: Received navigateTab request");
    console.log("Browser Connector: Request body:", req.body);

    const { url } = req.body;

    if (!url) {
      res.status(400).json({ error: "Missing URL parameter" });
      return;
    }

    if (!this.activeConnection) {
      res.status(503).json({ error: "Chrome extension not connected" });
      return;
    }

    try {
      console.log("Browser Connector: Sending navigation request to extension");

      // Create a promise that will resolve when we get the navigation response
      const navigationPromise = new Promise<{
        success: boolean;
        error?: string;
      }>((resolve, reject) => {
        const requestId = Date.now().toString();

        // Set up a one-time message handler for this navigation request
        const messageHandler = (
          message: string | Buffer | ArrayBuffer | Buffer[]
        ) => {
          try {
            const data = JSON.parse(message.toString());

            // Parse navigation response using tool helper (statically imported)
            const parsed = parseNavigationResponse(data, requestId);
            if (parsed) {
              // Remove this listener once we get a response
              this.activeConnection?.removeListener("message", messageHandler);

              if (parsed.success) {
                resolve({ success: true });
              } else {
                resolve({ success: false, error: parsed.error });
              }
            }
          } catch (error) {
            // Ignore parsing errors for other messages
          }
        };

        // Add temporary message handler
        this.activeConnection?.on("message", messageHandler);

        // Send navigation request to extension (using tool builder - statically imported)
        this.activeConnection?.send(
          buildNavigationMessage({ url }, requestId)
        );

        // Set timeout
        setTimeout(() => {
          this.activeConnection?.removeListener("message", messageHandler);
          reject(new Error("Navigation timeout"));
        }, 10000); // 10 second timeout
      });

      const result = await navigationPromise;

      if (result.success) {
        console.log("Browser Connector: Navigation completed successfully");
        res.json({ success: true, url: url });
      } else {
        console.error("Browser Connector: Navigation failed:", result.error);
        res.status(500).json({ error: result.error || "Navigation failed" });
      }
    } catch (error) {
      console.error("Browser Connector: Error during navigation:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred during navigation",
      });
    }
  }

  // DOM action relay to extension over WebSocket
  async domAction(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const payload = req.body || {};

      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "Invalid request body" });
        return;
      }

      if (!this.activeConnection) {
        res.status(503).json({ error: "Chrome extension not connected" });
        return;
      }

      const requestId = Date.now().toString();

      const actionPromise = new Promise<{ success: boolean; details?: any; error?: string }>((resolve, reject) => {
        const messageHandler = (
          message: string | Buffer | ArrayBuffer | Buffer[]
        ) => {
          try {
            const data = JSON.parse(message.toString());
            if (
              data &&
              data.type === "dom-action-response" &&
              data.requestId === requestId
            ) {
              this.activeConnection?.removeListener("message", messageHandler);
              if (data.success) {
                resolve({ success: true, details: data.details });
              } else {
                resolve({ success: false, error: data.error || "DOM action failed" });
              }
            }
          } catch (_) {
          }
        };

        this.activeConnection?.on("message", messageHandler);

        const message = JSON.stringify({
          type: "dom-action",
          requestId,
          payload,
        });
        this.activeConnection?.send(message);

        setTimeout(() => {
          this.activeConnection?.removeListener("message", messageHandler);
          reject(new Error("DOM action timeout"));
        }, 15000);
      });

      const result = await actionPromise;

      if (result.success) {
        res.json({ success: true, details: result.details });
      } else {
        res.status(500).json({ error: result.error || "DOM action failed" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Unknown error" });
    }
  }

  // Add shutdown method
  public shutdown() {
    return new Promise<void>((resolve) => {
      console.log("Shutting down WebSocket server...");

      // Send close message to client if connection is active
      if (
        this.activeConnection &&
        this.activeConnection.readyState === WebSocket.OPEN
      ) {
        console.log("Notifying client to close connection...");
        try {
          this.activeConnection.send(
            JSON.stringify({ type: "server-shutdown" })
          );
        } catch (err) {
          console.error("Error sending shutdown message to client:", err);
        }
      }

      // Set a timeout to force close after 2 seconds
      const forceCloseTimeout = setTimeout(() => {
        console.log("Force closing connections after timeout...");
        if (this.activeConnection) {
          this.activeConnection.terminate(); // Force close the connection
          this.activeConnection = null;
        }
        this.wss.close();
        resolve();
      }, 2000);

      // Close active WebSocket connection if exists
      if (this.activeConnection) {
        this.activeConnection.close(1000, "Server shutting down");
        this.activeConnection = null;
      }

      // Close WebSocket server
      this.wss.close(() => {
        clearTimeout(forceCloseTimeout);
        console.log("WebSocket server closed gracefully");
        resolve();
      });
    });
  }
}

// Import server lifecycle management
import { initializeServer } from "./modules/server-lifecycle.js";

// Use an async IIFE to allow for async/await in the initial setup
(async () => {
  await initializeServer(app, REQUESTED_PORT, currentSettings);
})().catch((err) => {
  console.error("Unhandled error during server startup:", err);
  process.exit(1);
});
