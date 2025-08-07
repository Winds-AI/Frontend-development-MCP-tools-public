/**
 * Refactor Temp: Top Scaffolding — env/config, connection bootstrap, shared utils
 * This module aggregates non-tool-specific code extracted from browser-connector.ts.
 * Exports are named to allow fine-grained re-use during the transition.
 *
 * NOTE: This file holds only stateless/shared utilities and configuration helpers.
 * Express bindings and WebSocket state remain in browser-connector.ts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
// Recreate ESM helper constants and export them for passthrough usage
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
/**
 * Returns the default downloads folder path for the current OS, used for screenshot storage fallback.
 */
export function getDefaultDownloadsFolder() {
    const homeDir = os.homedir();
    // Downloads folder is typically the same path on Windows, macOS, and Linux
    const downloadsPath = path.join(homeDir, "Downloads", "mcp-screenshots");
    return downloadsPath;
}
/**
 * Helper to recursively truncate strings in any data structure
 * (moved from browser-connector.ts)
 */
export function truncateStringsInData(data, maxLength) {
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
/**
 * Helper to safely parse and process JSON strings
 * (moved from browser-connector.ts)
 */
export function processJsonString(jsonString, maxLength) {
    try {
        // Try to parse the string as JSON
        const parsed = JSON.parse(jsonString);
        // Process any strings within the parsed JSON
        const processed = truncateStringsInData(parsed, maxLength);
        // Stringify the processed data
        return JSON.stringify(processed);
    }
    catch {
        // If it's not valid JSON, treat it as a regular string
        return truncateStringsInData(jsonString, maxLength);
    }
}
/**
 * Helper to calculate size of a log entry
 * (moved from browser-connector.ts)
 */
export function calculateLogSize(log) {
    return JSON.stringify(log).length;
}
/**
 * Helper to process logs based on current settings
 * (moved from browser-connector.ts)
 */
export function processLogsWithSettings(logs, currentSettings) {
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
/** Maximum in-memory cache size for detailed network logs */
export const MAX_DETAILED_NETWORK_LOG_CACHE = 50;
/**
 * Keep a backward-compatible signature: if settings are omitted, defaults are used.
 */
export function truncateLogsToQueryLimit(logs, currentSettings) {
    // Overload support: original single-arg signature (logs only)
    // and new two-arg signature (logs, settings). If settings omitted,
    // return logs unchanged to preserve original behavior at call sites
    // that expect default processing in the caller.
    if (logs.length === 0)
        return logs;
    const effectiveSettings = currentSettings ?? {
        queryLimit: 30000,
        showRequestHeaders: false,
        showResponseHeaders: false,
    };
    // First process logs according to current settings
    const processedLogs = processLogsWithSettings(logs, effectiveSettings);
    let currentSize = 0;
    const result = [];
    for (const log of processedLogs) {
        const logSize = calculateLogSize(log);
        // Check if adding this log would exceed the limit
        if (currentSize + logSize > effectiveSettings.queryLimit) {
            console.log(`Reached query limit (${currentSize}/${effectiveSettings.queryLimit}), truncating logs`);
            break;
        }
        // Add log and update size
        result.push(log);
        currentSize += logSize;
        console.log(`Added log of size ${logSize}, total size now: ${currentSize}`);
    }
    return result;
}
/**
 * Converts a file path to the appropriate format for the current platform
 * Handles Windows, WSL, macOS and Linux path formats
 * (moved from browser-connector.ts)
 */
export function convertPathForCurrentPlatform(inputPath) {
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
// Load project configuration
export function loadProjectConfig() {
    try {
        const configPath = path.join(__dirname, "..", "..", "..", "chrome-extension", "projects.json");
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
export function getConfigValue(key, defaultValue) {
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
export function getScreenshotStoragePath() {
    const projectsConfig = loadProjectConfig();
    if (projectsConfig && projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH) {
        return projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH;
    }
    return undefined;
}
// Get active project name
export function getActiveProjectName() {
    const projectsConfig = loadProjectConfig();
    if (projectsConfig) {
        return process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    }
    return undefined;
}
// ==== Port discovery and server utilities ====
/**
 * Check if a port is available
 */
export function isPortAvailable(port) {
    return new Promise((resolve) => {
        // Use dynamic import for ESM compatibility instead of require()
        import("net")
            .then((netMod) => {
            const server = netMod.createServer();
            server.listen(port, () => {
                server.once("close", () => {
                    resolve(true);
                });
                server.close();
            });
            server.on("error", () => {
                resolve(false);
            });
        })
            .catch(() => {
            // If net import somehow fails, mark port as unavailable
            resolve(false);
        });
    });
}
/**
 * Find an available port starting from the requested port
 */
export async function getAvailablePort(requestedPort) {
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
        const portToTry = requestedPort + i;
        const available = await isPortAvailable(portToTry);
        if (available) {
            return portToTry;
        }
    }
    throw new Error(`No available port found in range ${requestedPort}-${requestedPort + maxAttempts - 1}`);
}
// ==== Log management ====
// Global log storage (moved from browser-connector.ts)
export const logs = [];
export const networkLogs = [];
export const detailedNetworkLogCache = [];
/**
 * Clear all logs
 */
export function clearAllLogs() {
    logs.length = 0;
    networkLogs.length = 0;
    detailedNetworkLogCache.length = 0;
    console.log("All logs cleared");
}
