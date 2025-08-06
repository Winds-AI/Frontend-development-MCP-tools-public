#!/usr/bin/env node
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import * as net from "net";
import ScreenshotService from "./screenshot-service.js";
import { fileURLToPath } from "url";
// Helper constants for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load project configuration
function loadProjectConfig() {
    try {
        const configPath = path.join(__dirname, "..", "..", "chrome-extension", "projects.json");
        console.log(`[DEBUG] Browser Connector: Looking for projects.json at: ${configPath}`);
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, "utf8");
            console.log(`[DEBUG] Browser Connector: Successfully loaded projects.json`);
            return JSON.parse(configData);
        }
        else {
            console.log(`[DEBUG] Browser Connector: projects.json not found at: ${configPath}`);
        }
    }
    catch (error) {
        console.error("Browser Connector: Error loading projects config:", error);
    }
    return null;
}
// Get configuration value with fallback priority:
// 1. Environment variable (highest priority)
// 2. Project config file
// 3. Default value (lowest priority)
function getConfigValue(key, defaultValue) {
    // First check environment variables
    if (process.env[key]) {
        return process.env[key];
    }
    // Then check project config
    const projectsConfig = loadProjectConfig();
    if (projectsConfig) {
        const activeProject = process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
        const project = projectsConfig.projects[activeProject];
        if (project && project.config[key]) {
            return project.config[key];
        }
    }
    // Finally return default value
    return defaultValue;
}
// Get screenshot storage path from project config
function getScreenshotStoragePath() {
    const projectsConfig = loadProjectConfig();
    if (projectsConfig && projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH) {
        return projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH;
    }
    return undefined;
}
// Get active project name
function getActiveProjectName() {
    const projectsConfig = loadProjectConfig();
    if (projectsConfig) {
        return process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    }
    return undefined;
}
/**
 * Converts a file path to the appropriate format for the current platform
 * Handles Windows, WSL, macOS and Linux path formats
 *
 * @param inputPath - The path to convert
 * @returns The converted path appropriate for the current platform
 */
function convertPathForCurrentPlatform(inputPath) {
    const platform = os.platform();
    // If no path provided, return as is
    if (!inputPath)
        return inputPath;
    console.log(`Converting path "${inputPath}" for platform: ${platform}`);
    // Windows-specific conversion
    if (platform === "win32") {
        // Convert forward slashes to backslashes
        return inputPath.replace(/\//g, "\\");
    }
    // Linux/Mac-specific conversion
    if (platform === "linux" || platform === "darwin") {
        // Check if this is a Windows UNC path (starts with \\)
        if (inputPath.startsWith("\\\\") || inputPath.includes("\\")) {
            // Check if this is a WSL path (contains wsl.localhost or wsl$)
            if (inputPath.includes("wsl.localhost") || inputPath.includes("wsl$")) {
                // Extract the path after the distribution name
                // Handle both \\wsl.localhost\Ubuntu\path and \\wsl$\Ubuntu\path formats
                const parts = inputPath.split("\\").filter((part) => part.length > 0);
                console.log("Path parts:", parts);
                // Find the index after the distribution name
                const distNames = [
                    "Ubuntu",
                    "Debian",
                    "kali",
                    "openSUSE",
                    "SLES",
                    "Fedora",
                ];
                // Find the distribution name in the path
                let distIndex = -1;
                for (const dist of distNames) {
                    const index = parts.findIndex((part) => part === dist || part.toLowerCase() === dist.toLowerCase());
                    if (index !== -1) {
                        distIndex = index;
                        break;
                    }
                }
                if (distIndex !== -1 && distIndex + 1 < parts.length) {
                    // Reconstruct the path as a native Linux path
                    const linuxPath = "/" + parts.slice(distIndex + 1).join("/");
                    console.log(`Converted Windows WSL path "${inputPath}" to Linux path "${linuxPath}"`);
                    return linuxPath;
                }
                // If we couldn't find a distribution name but it's clearly a WSL path,
                // try to extract everything after wsl.localhost or wsl$
                const wslIndex = parts.findIndex((part) => part === "wsl.localhost" ||
                    part === "wsl$" ||
                    part.toLowerCase() === "wsl.localhost" ||
                    part.toLowerCase() === "wsl$");
                if (wslIndex !== -1 && wslIndex + 2 < parts.length) {
                    // Skip the WSL prefix and distribution name
                    const linuxPath = "/" + parts.slice(wslIndex + 2).join("/");
                    console.log(`Converted Windows WSL path "${inputPath}" to Linux path "${linuxPath}"`);
                    return linuxPath;
                }
            }
            // For non-WSL Windows paths, just normalize the slashes
            const normalizedPath = inputPath
                .replace(/\\\\/g, "/")
                .replace(/\\/g, "/");
            console.log(`Converted Windows UNC path "${inputPath}" to "${normalizedPath}"`);
            return normalizedPath;
        }
        // Handle Windows drive letters (e.g., C:\path\to\file)
        if (/^[A-Z]:\\/i.test(inputPath)) {
            // Convert Windows drive path to Linux/Mac compatible path
            const normalizedPath = inputPath
                .replace(/^[A-Z]:\\/i, "/")
                .replace(/\\/g, "/");
            console.log(`Converted Windows drive path "${inputPath}" to "${normalizedPath}"`);
            return normalizedPath;
        }
    }
    // Return the original path if no conversion was needed or possible
    return inputPath;
}
// Function to get default downloads folder
function getDefaultDownloadsFolder() {
    const homeDir = os.homedir();
    // Downloads folder is typically the same path on Windows, macOS, and Linux
    const downloadsPath = path.join(homeDir, "Downloads", "mcp-screenshots");
    return downloadsPath;
}
// We store logs in memory
const consoleLogs = [];
const consoleErrors = [];
const networkErrors = [];
const networkSuccess = [];
const allXhr = [];
// Store the current URL from the extension
let currentUrl = "";
// Store the current tab ID from the extension
let currentTabId = null;
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
let selectedElement = null;
const screenshotCallbacks = new Map();
// Function to get available port starting with the given port
async function getAvailablePort(startPort, maxAttempts = 10) {
    let currentPort = startPort;
    let attempts = 0;
    while (attempts < maxAttempts) {
        try {
            // Try to create a server on the current port
            // We'll use a raw Node.js net server for just testing port availability
            await new Promise((resolve, reject) => {
                const testServer = net.createServer();
                // Handle errors (e.g., port in use)
                testServer.once("error", (err) => {
                    if (err.code === "EADDRINUSE") {
                        console.log(`Port ${currentPort} is in use, trying next port...`);
                        currentPort++;
                        attempts++;
                        resolve(); // Continue to next iteration
                    }
                    else {
                        reject(err); // Different error, propagate it
                    }
                });
                // If we can listen, the port is available
                testServer.once("listening", () => {
                    // Make sure to close the server to release the port
                    testServer.close(() => {
                        console.log(`Found available port: ${currentPort}`);
                        resolve();
                    });
                });
                // Try to listen on the current port
                testServer.listen(currentPort, currentSettings.serverHost);
            });
            // If we reach here without incrementing the port, it means the port is available
            return currentPort;
        }
        catch (error) {
            console.error(`Error checking port ${currentPort}:`, error);
            // For non-EADDRINUSE errors, try the next port
            currentPort++;
            attempts++;
        }
    }
    // If we've exhausted all attempts, throw an error
    throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
}
// Start with requested port and find an available one
const REQUESTED_PORT = parseInt(process.env.PORT || "3025", 10);
let PORT = REQUESTED_PORT;
// Create application and initialize middleware
const app = express();
app.use(cors());
// Increase JSON body parser limit to 50MB to handle large screenshots
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
// Helper to recursively truncate strings in any data structure
function truncateStringsInData(data, maxLength) {
    if (typeof data === "string") {
        return data.length > maxLength
            ? data.substring(0, maxLength) + "... (truncated)"
            : data;
    }
    if (Array.isArray(data)) {
        return data.map((item) => truncateStringsInData(item, maxLength));
    }
    if (typeof data === "object" && data !== null) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = truncateStringsInData(value, maxLength);
        }
        return result;
    }
    return data;
}
// Helper to safely parse and process JSON strings
function processJsonString(jsonString, maxLength) {
    try {
        // Try to parse the string as JSON
        const parsed = JSON.parse(jsonString);
        // Process any strings within the parsed JSON
        const processed = truncateStringsInData(parsed, maxLength);
        // Stringify the processed data
        return JSON.stringify(processed);
    }
    catch (e) {
        // If it's not valid JSON, treat it as a regular string
        return truncateStringsInData(jsonString, maxLength);
    }
}
// Helper to process logs based on settings
function processLogsWithSettings(logs) {
    return logs.map((log) => {
        const processedLog = { ...log };
        if (log.type === "network-request") {
            // Handle headers visibility
            if (!currentSettings.showRequestHeaders) {
                delete processedLog.requestHeaders;
            }
            if (!currentSettings.showResponseHeaders) {
                delete processedLog.responseHeaders;
            }
        }
        return processedLog;
    });
}
// Helper to calculate size of a log entry
function calculateLogSize(log) {
    return JSON.stringify(log).length;
}
// Helper to truncate logs based on character limit
function truncateLogsToQueryLimit(logs) {
    if (logs.length === 0)
        return logs;
    // First process logs according to current settings
    const processedLogs = processLogsWithSettings(logs);
    let currentSize = 0;
    const result = [];
    for (const log of processedLogs) {
        const logSize = calculateLogSize(log);
        // Check if adding this log would exceed the limit
        if (currentSize + logSize > currentSettings.queryLimit) {
            console.log(`Reached query limit (${currentSize}/${currentSettings.queryLimit}), truncating logs`);
            break;
        }
        // Add log and update size
        result.push(log);
        currentSize += logSize;
        console.log(`Added log of size ${logSize}, total size now: ${currentSize}`);
    }
    return result;
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
                message: data.message?.substring(0, 100) +
                    (data.message?.length > 100 ? "..." : ""),
                timestamp: data.timestamp,
            });
            consoleLogs.push(data);
            if (consoleLogs.length > currentSettings.logLimit) {
                console.log(`Console logs exceeded limit (${currentSettings.logLimit}), removing oldest entry`);
                consoleLogs.shift();
            }
            break;
        case "console-error":
            console.log("Adding console error:", {
                level: data.level,
                message: data.message?.substring(0, 100) +
                    (data.message?.length > 100 ? "..." : ""),
                timestamp: data.timestamp,
            });
            consoleErrors.push(data);
            if (consoleErrors.length > currentSettings.logLimit) {
                console.log(`Console errors exceeded limit (${currentSettings.logLimit}), removing oldest entry`);
                consoleErrors.shift();
            }
            break;
        case "network-request":
            const logEntry = {
                url: data.url,
                method: data.method,
                status: data.status,
                timestamp: data.timestamp,
            };
            console.log("Adding network request:", logEntry);
            // Store the full request data in the detailedNetworkLogCache for the getNetworkRequestDetails tool
            console.log("[DEBUG] Adding detailed network log to cache");
            detailedNetworkLogCache.push(data);
            if (detailedNetworkLogCache.length > MAX_CACHE_SIZE) {
                console.log(`[DEBUG] Detailed network logs exceeded limit (${MAX_CACHE_SIZE}), removing oldest entry`);
                detailedNetworkLogCache.shift();
            }
            console.log(`[DEBUG] Current detailedNetworkLogCache size: ${detailedNetworkLogCache.length}`);
            // Route network requests based on status code
            if (data.status >= 400) {
                networkErrors.push(data);
                if (networkErrors.length > currentSettings.logLimit) {
                    console.log(`Network errors exceeded limit (${currentSettings.logLimit}), removing oldest entry`);
                    networkErrors.shift();
                }
            }
            else {
                networkSuccess.push(data);
                if (networkSuccess.length > currentSettings.logLimit) {
                    console.log(`Network success logs exceeded limit (${currentSettings.logLimit}), removing oldest entry`);
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
        networkErrors: networkErrors.length,
        networkSuccess: networkSuccess.length,
    });
    console.log("=== End Extension Log ===\n");
    res.json({ status: "ok" });
});
// Update GET endpoints to use the new function
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
    // Merge and sort network success and error logs by timestamp
    const mergedLogs = [...networkSuccess, ...networkErrors].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const truncatedLogs = truncateLogsToQueryLimit(mergedLogs);
    res.json(truncatedLogs);
});
// Add new endpoint for selected element
app.post("/selected-element", (req, res) => {
    const { data } = req.body;
    selectedElement = data;
    res.json({ status: "ok" });
});
app.get("/selected-element", (req, res) => {
    res.json(selectedElement || { message: "No element selected" });
});
const detailedNetworkLogCache = [];
const MAX_CACHE_SIZE = 50; // Limit cache size
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
// Add function to clear all logs
function clearAllLogs() {
    console.log("Wiping all logs...");
    consoleLogs.length = 0;
    consoleErrors.length = 0;
    networkErrors.length = 0;
    networkSuccess.length = 0;
    allXhr.length = 0;
    selectedElement = null;
    console.log("All logs have been wiped");
}
// Add endpoint to wipe logs
app.post("/wipelogs", (req, res) => {
    clearAllLogs();
    res.json({ status: "ok", message: "All logs cleared successfully" });
});
// Add endpoint for the extension to report the current URL
app.post("/current-url", (req, res) => {
    console.log("Received current URL update request:", JSON.stringify(req.body, null, 2));
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
        console.log(`Updated current URL via dedicated endpoint: ${oldUrl} -> ${currentUrl}`);
        console.log(`URL update details: source=${source}, tabId=${tabId}, timestamp=${timestamp}`);
        res.json({
            status: "ok",
            url: currentUrl,
            tabId: currentTabId,
            previousUrl: oldUrl,
            updated: oldUrl !== currentUrl,
        });
    }
    else {
        console.log("No URL provided in current-url request");
        res.status(400).json({ status: "error", message: "No URL provided" });
    }
});
// Add endpoint to get the current URL
app.get("/current-url", (req, res) => {
    console.log("Current URL requested, returning:", currentUrl);
    res.json({ url: currentUrl });
});
export class BrowserConnector {
    constructor(app, server) {
        this.activeConnection = null;
        this.urlRequestCallbacks = new Map();
        // Connection health monitoring - optimized for autonomous operation
        this.lastHeartbeatTime = 0;
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL = 25000; // Reduced to 25 seconds for more frequent checks
        this.HEARTBEAT_TIMEOUT = 60000; // Increased to 60 seconds for network tolerance
        this.connectionId = ""; // Track connection identity for better debugging
        this.app = app;
        this.server = server;
        // Initialize WebSocket server using the existing HTTP server
        this.wss = new WebSocketServer({
            noServer: true,
            path: "/extension-ws",
        });
        // Register the capture-screenshot endpoint
        this.app.post("/capture-screenshot", async (req, res) => {
            console.log("Browser Connector: Received request to /capture-screenshot endpoint");
            console.log("Browser Connector: Active WebSocket connection:", !!this.activeConnection);
            await this.captureScreenshot(req, res);
        });
        // Add connection health endpoint for autonomous operation monitoring
        this.app.get("/connection-health", (req, res) => {
            const status = this.getConnectionStatus();
            const isHealthy = this.hasActiveConnection() &&
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
        this.app.post("/navigate-tab", async (req, res) => {
            await this.navigateTab(req, res);
        });
        // Handle upgrade requests for WebSocket
        this.server.on("upgrade", (request, socket, head) => {
            if (request.url === "/extension-ws") {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit("connection", ws, request);
                });
            }
        });
        this.wss.on("connection", (ws) => {
            // Generate unique connection ID for debugging autonomous operation
            this.connectionId = `conn_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            console.log(`Chrome extension connected via WebSocket [${this.connectionId}]`);
            // Close any existing connection gracefully
            if (this.activeConnection) {
                console.log(`Closing existing connection for new one [${this.connectionId}]`);
                this.activeConnection.close(1000, "New connection established");
            }
            this.activeConnection = ws;
            this.lastHeartbeatTime = Date.now();
            // Start heartbeat monitoring
            this.startHeartbeatMonitoring();
            ws.on("message", (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    // Handle heartbeat responses
                    if (data.type === "heartbeat-response") {
                        this.lastHeartbeatTime = Date.now();
                        console.log("Browser Connector: Received heartbeat response from extension");
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
                            console.log("Updating tab ID from WebSocket message:", data.tabId);
                            currentTabId = data.tabId;
                        }
                        // Call the callback if exists
                        if (data.requestId &&
                            this.urlRequestCallbacks.has(data.requestId)) {
                            const callback = this.urlRequestCallbacks.get(data.requestId);
                            if (callback)
                                callback(data.url);
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
                            console.log("Updating tab ID from page navigation event:", data.tabId);
                            currentTabId = data.tabId;
                        }
                    }
                    // Handle screenshot response - enhanced for autonomous operation
                    if (data.type === "screenshot-data" && data.data) {
                        console.log(`Received screenshot data [${this.connectionId}]`);
                        // Find the specific callback for this request ID (if provided)
                        if (data.requestId && screenshotCallbacks.has(data.requestId)) {
                            const callback = screenshotCallbacks.get(data.requestId);
                            console.log(`Found specific callback for requestId: ${data.requestId} [${this.connectionId}]`);
                            if (callback) {
                                callback.resolve({
                                    data: data.data,
                                });
                                screenshotCallbacks.delete(data.requestId); // Only delete this specific callback
                            }
                        }
                        else {
                            // Fallback: Get the most recent callback if no requestId (legacy support)
                            const callbacks = Array.from(screenshotCallbacks.entries());
                            if (callbacks.length > 0) {
                                const [oldestRequestId, callback] = callbacks[0]; // Use oldest pending callback
                                console.log(`Using oldest callback as fallback: ${oldestRequestId} [${this.connectionId}]`);
                                callback.resolve({
                                    data: data.data,
                                });
                                screenshotCallbacks.delete(oldestRequestId); // Only delete this specific callback
                            }
                            else {
                                console.log(`No callbacks found for screenshot data [${this.connectionId}]`);
                            }
                        }
                    }
                    // Handle screenshot error - enhanced for autonomous operation
                    else if (data.type === "screenshot-error") {
                        console.log(`Received screenshot error [${this.connectionId}]:`, data.error);
                        // Find the specific callback for this request ID (if provided)
                        if (data.requestId && screenshotCallbacks.has(data.requestId)) {
                            const callback = screenshotCallbacks.get(data.requestId);
                            console.log(`Found specific error callback for requestId: ${data.requestId} [${this.connectionId}]`);
                            if (callback) {
                                callback.reject(new Error(data.error || "Screenshot capture failed"));
                                screenshotCallbacks.delete(data.requestId); // Only delete this specific callback
                            }
                        }
                        else {
                            // Fallback: Use most recent callback if no requestId
                            const callbacks = Array.from(screenshotCallbacks.entries());
                            if (callbacks.length > 0) {
                                const [oldestRequestId, callback] = callbacks[0];
                                console.log(`Using oldest error callback as fallback: ${oldestRequestId} [${this.connectionId}]`);
                                callback.reject(new Error(data.error || "Screenshot capture failed"));
                                screenshotCallbacks.delete(oldestRequestId); // Only delete this specific callback
                            }
                        }
                    }
                    else {
                        console.log("Unhandled message type:", data.type);
                    }
                }
                catch (error) {
                    console.error("Error processing WebSocket message:", error);
                }
            });
            ws.on("close", (code, reason) => {
                const reasonStr = reason.toString();
                console.log(`Chrome extension disconnected [${this.connectionId}] - Code: ${code}, Reason: ${reasonStr}`);
                if (this.activeConnection === ws) {
                    this.handleConnectionClose();
                }
                // Log detailed disconnection info for autonomous operation debugging
                console.log(`Connection closure details - Normal: ${code === 1000 || code === 1001}, Connection ID: ${this.connectionId}`);
            });
        });
    }
    // Connection health monitoring methods
    startHeartbeatMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => {
            if (!this.activeConnection ||
                this.activeConnection.readyState !== WebSocket.OPEN) {
                console.log("WebSocket connection lost, clearing heartbeat monitor");
                this.stopHeartbeatMonitoring();
                return;
            }
            const now = Date.now();
            const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;
            // Check if connection is healthy
            if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
                console.warn(`Connection appears unhealthy [${this.connectionId}] - no heartbeat response received in ${timeSinceLastHeartbeat}ms (timeout: ${this.HEARTBEAT_TIMEOUT}ms)`);
                // Enhanced callback cleanup for autonomous operation
                const callbacks = Array.from(screenshotCallbacks.entries());
                console.log(`Rejecting ${callbacks.length} pending screenshot callbacks due to heartbeat timeout [${this.connectionId}]`);
                callbacks.forEach(([requestId, callback], index) => {
                    callback.reject(new Error(`Connection timeout - heartbeat failed [${this.connectionId}] - request ${requestId} (${index + 1}/${callbacks.length})`));
                });
                screenshotCallbacks.clear();
                // Close the unhealthy connection
                try {
                    console.log(`Closing unhealthy connection [${this.connectionId}] due to heartbeat timeout`);
                    this.activeConnection?.close(1001, "Heartbeat timeout");
                }
                catch (error) {
                    console.error(`Error closing unhealthy connection [${this.connectionId}]:`, error);
                }
                this.handleConnectionClose();
            }
            else {
                // Send heartbeat
                this.sendHeartbeat();
            }
        }, this.HEARTBEAT_INTERVAL);
    }
    stopHeartbeatMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    sendHeartbeat() {
        if (this.activeConnection &&
            this.activeConnection.readyState === WebSocket.OPEN) {
            try {
                // Add connection ID to heartbeat for debugging autonomous operation
                console.log(`Browser Connector: Sending heartbeat to Chrome extension [${this.connectionId}]`);
                this.activeConnection.send(JSON.stringify({
                    type: "heartbeat",
                    connectionId: this.connectionId,
                    timestamp: Date.now(),
                }));
            }
            catch (error) {
                console.error(`Error sending heartbeat [${this.connectionId}]:`, error);
                this.handleConnectionClose();
            }
        }
    }
    handleConnectionClose() {
        const connectionInfo = this.connectionId || "unknown";
        console.log(`Handling connection close event [${connectionInfo}]`);
        if (this.activeConnection) {
            this.activeConnection = null;
        }
        this.stopHeartbeatMonitoring();
        // Enhanced callback cleanup for autonomous operation reliability
        const callbacks = Array.from(screenshotCallbacks.values());
        console.log(`Cleaning up ${callbacks.length} pending screenshot callbacks due to connection loss [${connectionInfo}]`);
        callbacks.forEach((callback, index) => {
            callback.reject(new Error(`WebSocket connection lost [${connectionInfo}] - callback ${index + 1}/${callbacks.length}`));
        });
        screenshotCallbacks.clear();
        console.log(`WebSocket connection closed [${connectionInfo}] - waiting for reconnection`);
        // Reset connection ID
        this.connectionId = "";
    }
    // Method to get detailed connection status for autonomous operation debugging
    getConnectionStatus() {
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
    getReadyStateText(state) {
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
    hasActiveConnection() {
        const isActive = this.activeConnection !== null &&
            this.activeConnection.readyState === WebSocket.OPEN;
        if (!isActive && this.connectionId) {
            console.log(`Connection health check failed [${this.connectionId}] - State: ${this.activeConnection?.readyState || "null"}`);
        }
        return isActive;
    }
    // Add new endpoint for programmatic screenshot capture using unified service
    async captureScreenshot(req, res) {
        console.log("Browser Connector: Starting captureScreenshot method");
        if (!this.activeConnection) {
            console.log("Browser Connector: No active WebSocket connection to Chrome extension ");
            return res.status(503).json({
                error: "Chrome extension not connected. Please open Chrome DevTools and ensure the extension is loaded.",
            });
        }
        try {
            // Extract parameters from request body
            console.log("Browser Connector: Starting screenshot capture...");
            const requestId = Date.now().toString();
            console.log("Browser Connector: Generated requestId:", requestId);
            // Create promise that will resolve when we get the screenshot data
            const screenshotPromise = new Promise((resolve, reject) => {
                console.log(`Browser Connector: Setting up screenshot callback for requestId: ${requestId}`);
                // Store callback in map
                screenshotCallbacks.set(requestId, { resolve, reject });
                console.log("Browser Connector: Current callbacks:", Array.from(screenshotCallbacks.keys()));
                // Set timeout to clean up if we don't get a response - increased for autonomous operation
                setTimeout(() => {
                    if (screenshotCallbacks.has(requestId)) {
                        console.log(`Browser Connector: Screenshot capture timed out for requestId: ${requestId} [${this.connectionId}]`);
                        screenshotCallbacks.delete(requestId);
                        reject(new Error(`Screenshot capture timed out - no response from Chrome extension [${this.connectionId}] after 15 seconds`));
                    }
                }, 15000); // Increased from 10 to 15 seconds for autonomous operation stability
            });
            // Send screenshot request to extension
            const message = JSON.stringify({
                type: "take-screenshot",
                requestId: requestId,
            });
            console.log(`Browser Connector: Sending WebSocket message to extension:`, message);
            this.activeConnection.send(message);
            // Wait for screenshot data
            console.log("Browser Connector: Waiting for screenshot data...");
            const { data: base64Data, path: customPath, autoPaste, } = await screenshotPromise;
            console.log("Browser Connector: Received screenshot data, processing with unified service...");
            if (!base64Data) {
                throw new Error("No screenshot data received from Chrome extension");
            }
            // Use the unified screenshot service
            const screenshotService = ScreenshotService.getInstance();
            // Prepare configuration for screenshot service
            // Use project configuration for screenshot path, fallback to customPath if needed
            const projectScreenshotPath = getScreenshotStoragePath();
            const screenshotConfig = {
                returnImageData: true,
                baseDirectory: projectScreenshotPath || customPath,
            };
            // Save screenshot using unified service
            const result = await screenshotService.saveScreenshot(base64Data, currentUrl, screenshotConfig);
            console.log(`Browser Connector: Screenshot saved successfully to: ${result.filePath}`);
            console.log(`Browser Connector: Project directory: ${result.projectDirectory}`);
            console.log(`Browser Connector: URL category: ${result.urlCategory}`);
            // Execute auto-paste if requested and on macOS
            if (os.platform() === "darwin" && autoPaste === true) {
                console.log("Browser Connector: Executing auto-paste to Cursor...");
                try {
                    await screenshotService.executeAutoPaste(result.filePath);
                    console.log("Browser Connector: Auto-paste executed successfully");
                }
                catch (autoPasteError) {
                    console.error("Browser Connector: Auto-paste failed:", autoPasteError);
                    // Don't fail the screenshot save for auto-paste errors
                }
            }
            else {
                if (os.platform() === "darwin" && !autoPaste) {
                    console.log("Browser Connector: Auto-paste disabled, skipping");
                }
                else {
                    console.log("Browser Connector: Not on macOS, skipping auto-paste");
                }
            }
            // Build response object
            const response = {
                filePath: result.filePath,
                filename: result.filename,
                projectDirectory: result.projectDirectory,
                urlCategory: result.urlCategory,
            };
            // Include image data if requested
            if (result.imageData) {
                response.imageData = result.imageData;
                console.log("Browser Connector: Including image data in response");
            }
            console.log("Browser Connector: Screenshot capture completed successfully");
            res.json(response);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Browser Connector: Error capturing screenshot:", errorMessage);
            res.status(500).json({
                error: errorMessage,
            });
        }
    }
    // Add navigation endpoint
    async navigateTab(req, res) {
        console.log("Browser Connector: Received navigateTab request");
        console.log("Browser Connector: Request body:", req.body);
        const { url, tabId } = req.body;
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
            const navigationPromise = new Promise((resolve, reject) => {
                const requestId = Date.now().toString();
                // Set up a one-time message handler for this navigation request
                const messageHandler = (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        if (data.type === "navigation-response" &&
                            data.requestId === requestId) {
                            // Remove this listener once we get a response
                            this.activeConnection?.removeListener("message", messageHandler);
                            if (data.success) {
                                resolve({ success: true });
                            }
                            else {
                                resolve({ success: false, error: data.error });
                            }
                        }
                    }
                    catch (error) {
                        // Ignore parsing errors for other messages
                    }
                };
                // Add temporary message handler
                this.activeConnection?.on("message", messageHandler);
                // Send navigation request to extension
                this.activeConnection?.send(JSON.stringify({
                    type: "navigate-tab",
                    url: url,
                    tabId: tabId,
                    requestId: requestId,
                }));
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
            }
            else {
                console.error("Browser Connector: Navigation failed:", result.error);
                res.status(500).json({ error: result.error || "Navigation failed" });
            }
        }
        catch (error) {
            console.error("Browser Connector: Error during navigation:", error);
            res.status(500).json({
                error: error instanceof Error
                    ? error.message
                    : "An unknown error occurred during navigation",
            });
        }
    }
    // Add shutdown method
    shutdown() {
        return new Promise((resolve) => {
            console.log("Shutting down WebSocket server...");
            // Send close message to client if connection is active
            if (this.activeConnection &&
                this.activeConnection.readyState === WebSocket.OPEN) {
                console.log("Notifying client to close connection...");
                try {
                    this.activeConnection.send(JSON.stringify({ type: "server-shutdown" }));
                }
                catch (err) {
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
// Use an async IIFE to allow for async/await in the initial setup
(async () => {
    try {
        console.log(`Starting Browser Tools Server...`);
        console.log(`Requested port: ${REQUESTED_PORT}`);
        // Find an available port
        try {
            PORT = await getAvailablePort(REQUESTED_PORT);
            if (PORT !== REQUESTED_PORT) {
                console.log(`\n====================================`);
                console.log(`NOTICE: Requested port ${REQUESTED_PORT} was in use.`);
                console.log(`Using port ${PORT} instead.`);
                console.log(`====================================\n`);
            }
        }
        catch (portError) {
            console.error(`Failed to find an available port:`, portError);
            process.exit(1);
        }
        // Create the server with the available port
        const server = app.listen(PORT, currentSettings.serverHost, () => {
            console.log(`\n=== Browser Tools Server Started ===`);
            console.log(`Aggregator listening on http://${currentSettings.serverHost}:${PORT}`);
            if (PORT !== REQUESTED_PORT) {
                console.log(`NOTE: Using fallback port ${PORT} instead of requested port ${REQUESTED_PORT}`);
            }
            // Log all available network interfaces for easier discovery
            const networkInterfaces = os.networkInterfaces();
            console.log("\nAvailable on the following network addresses:");
            Object.keys(networkInterfaces).forEach((interfaceName) => {
                const interfaces = networkInterfaces[interfaceName];
                if (interfaces) {
                    interfaces.forEach((iface) => {
                        if (!iface.internal && iface.family === "IPv4") {
                            console.log(`  - http://${iface.address}:${PORT}`);
                        }
                    });
                }
            });
            console.log(`\nFor local access use: http://localhost:${PORT}`);
        });
        // Handle server startup errors
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                console.error(`ERROR: Port ${PORT} is still in use, despite our checks!`);
                console.error(`This might indicate another process started using this port after our check.`);
            }
            else {
                console.error(`Server error:`, err);
            }
            process.exit(1);
        });
        // Initialize the browser connector with the existing app AND server
        const browserConnector = new BrowserConnector(app, server);
        // Handle shutdown gracefully with improved error handling
        process.on("SIGINT", async () => {
            console.log("\nReceived SIGINT signal. Starting graceful shutdown...");
            try {
                // First shutdown WebSocket connections
                await browserConnector.shutdown();
                // Then close the HTTP server
                await new Promise((resolve, reject) => {
                    server.close((err) => {
                        if (err) {
                            console.error("Error closing HTTP server:", err);
                            reject(err);
                        }
                        else {
                            console.log("HTTP server closed successfully");
                            resolve();
                        }
                    });
                });
                // Clear all logs
                clearAllLogs();
                console.log("Shutdown completed successfully");
                process.exit(0);
            }
            catch (error) {
                console.error("Error during shutdown:", error);
                // Force exit in case of error
                process.exit(1);
            }
        });
        // Also handle SIGTERM
        process.on("SIGTERM", () => {
            console.log("\nReceived SIGTERM signal");
            process.emit("SIGINT");
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
})().catch((err) => {
    console.error("Unhandled error during server startup:", err);
    process.exit(1);
});
