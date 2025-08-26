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
export function getDefaultDownloadsFolder(): string {
  const homeDir = os.homedir();
  // Downloads folder is typically the same path on Windows, macOS, and Linux
  const downloadsPath = path.join(homeDir, "Downloads", "mcp-screenshots");
  return downloadsPath;
}

/**
 * Helper to recursively truncate strings in any data structure
 * (moved from browser-connector.ts)
 */
export function truncateStringsInData(data: any, maxLength: number): any {
  if (typeof data === "string") {
    return data.length > maxLength
      ? data.substring(0, maxLength) + "... (truncated)"
      : data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => truncateStringsInData(item, maxLength));
  }

  if (typeof data === "object" && data !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = truncateStringsInData(value as any, maxLength);
    }
    return result;
  }

  return data;
}

/**
 * Helper to safely parse and process JSON strings
 * (moved from browser-connector.ts)
 */
export function processJsonString(
  jsonString: string,
  maxLength: number
): string {
  try {
    // Try to parse the string as JSON
    const parsed = JSON.parse(jsonString);
    // Process any strings within the parsed JSON
    const processed = truncateStringsInData(parsed, maxLength);
    // Stringify the processed data
    return JSON.stringify(processed);
  } catch {
    // If it's not valid JSON, treat it as a regular string
    return truncateStringsInData(jsonString, maxLength);
  }
}

/**
 * Helper to calculate size of a log entry
 * (moved from browser-connector.ts)
 */
export function calculateLogSize(log: any): number {
  return JSON.stringify(log).length;
}

/**
 * Helper to process logs based on current settings
 * (moved from browser-connector.ts)
 */
export function processLogsWithSettings(
  logs: any[],
  currentSettings: {
    showRequestHeaders: boolean;
    showResponseHeaders: boolean;
  }
): any[] {
  return logs.map((log) => {
    const processedLog = { ...(log as any) };

    if ((log as any).type === "network-request") {
      // Handle headers visibility
      if (!currentSettings.showRequestHeaders) {
        delete (processedLog as any).requestHeaders;
      }
      if (!currentSettings.showResponseHeaders) {
        delete (processedLog as any).responseHeaders;
      }
    }

    return processedLog;
  });
}

/**
 * Helper to truncate logs based on character limit
 * (moved from browser-connector.ts)
 */
export interface TruncateSettings {
  queryLimit: number;
  showRequestHeaders: boolean;
  showResponseHeaders: boolean;
}

/**
 * Network logging types and limits (shared across tools)
 * (moved from browser-connector.ts)
 */
export interface NetworkLogEntry {
  url: string;
  method: string;
  status: number;
  requestHeaders: any;
  responseHeaders: any;
  requestBody?: string;
  responseBody?: string;
  timestamp: number;
}

/** Maximum in-memory cache size for detailed network logs */
export const MAX_DETAILED_NETWORK_LOG_CACHE = 50;

/**
 * Keep a backward-compatible signature: if settings are omitted, defaults are used.
 */
export function truncateLogsToQueryLimit(
  logs: any[],
  currentSettings?: TruncateSettings
): any[] {
  // Overload support: original single-arg signature (logs only)
  // and new two-arg signature (logs, settings). If settings omitted,
  // return logs unchanged to preserve original behavior at call sites
  // that expect default processing in the caller.
  if (logs.length === 0) return logs;

  const effectiveSettings: TruncateSettings = currentSettings ?? {
    queryLimit: 30000,
    showRequestHeaders: false,
    showResponseHeaders: false,
  };

  // First process logs according to current settings
  const processedLogs = processLogsWithSettings(logs, effectiveSettings);

  let currentSize = 0;
  const result: any[] = [];

  for (const log of processedLogs) {
    const logSize = calculateLogSize(log);

    // Check if adding this log would exceed the limit
    if (currentSize + logSize > effectiveSettings.queryLimit) {
      console.log(
        `Reached query limit (${currentSize}/${effectiveSettings.queryLimit}), truncating logs`
      );
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
export function convertPathForCurrentPlatform(inputPath: string): string {
  const platform = os.platform();

  // If no path provided, return as is
  if (!inputPath) return inputPath;

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
          const index = parts.findIndex(
            (part) => part === dist || part.toLowerCase() === dist.toLowerCase()
          );
          if (index !== -1) {
            distIndex = index;
            break;
          }
        }

        if (distIndex !== -1 && distIndex + 1 < parts.length) {
          // Reconstruct the path as a native Linux path
          const linuxPath = "/" + parts.slice(distIndex + 1).join("/");
          console.log(
            `Converted Windows WSL path "${inputPath}" to Linux path "${linuxPath}"`
          );
          return linuxPath;
        }

        // If we couldn't find a distribution name but it's clearly a WSL path,
        // try to extract everything after wsl.localhost or wsl$
        const wslIndex = parts.findIndex(
          (part) =>
            part === "wsl.localhost" ||
            part === "wsl$" ||
            part.toLowerCase() === "wsl.localhost" ||
            part.toLowerCase() === "wsl$"
        );

        if (wslIndex !== -1 && wslIndex + 2 < parts.length) {
          // Skip the WSL prefix and distribution name
          const linuxPath = "/" + parts.slice(wslIndex + 2).join("/");
          console.log(
            `Converted Windows WSL path "${inputPath}" to Linux path "${linuxPath}"`
          );
          return linuxPath;
        }
      }

      // For non-WSL Windows paths, just normalize the slashes
      const normalizedPath = inputPath
        .replace(/\\\\/g, "/")
        .replace(/\\/g, "/");
      console.log(
        `Converted Windows UNC path "${inputPath}" to "${normalizedPath}"`
      );
      return normalizedPath;
    }

    // Handle Windows drive letters (e.g., C:\path\to\file)
    if (/^[A-Z]:\\/i.test(inputPath)) {
      // Convert Windows drive path to Linux/Mac compatible path
      const normalizedPath = inputPath
        .replace(/^[A-Z]:\\/i, "/")
        .replace(/\\/g, "/");
      console.log(
        `Converted Windows drive path "${inputPath}" to "${normalizedPath}"`
      );
      return normalizedPath;
    }
  }

  // Return the original path if no conversion was needed or possible
  return inputPath;
}

// ==== Project configuration management (moved) ====
export interface ProjectConfig {
  SWAGGER_URL?: string;
  AUTH_ORIGIN?: string;
  AUTH_STORAGE_TYPE?: string;
  AUTH_TOKEN_KEY?: string;
  API_BASE_URL?: string;
  SCREENSHOT_STORAGE_PATH?: string;
  BROWSER_TOOLS_HOST?: string;
  BROWSER_TOOLS_PORT?: string;
  ROUTES_FILE_PATH?: string;
}

export interface Project {
  config: ProjectConfig;
}

export interface ProjectsConfig {
  projects: Record<string, Project>;
  defaultProject: string;
  DEFAULT_SCREENSHOT_STORAGE_PATH?: string;
}

// Load project configuration
// Lightweight in-process cache to avoid repeated filesystem reads and duplicate logs
let cachedProjectsConfig: ProjectsConfig | null = null;
let cachedProjectsConfigPath: string | null = null;
let cachedProjectsConfigMtimeMs: number | null = null;
let hasLoggedProjectsConfig: boolean = false;

/**
 * Resolve the path to projects.json with priority:
 * 1) env AFBT_PROJECTS_JSON (absolute path)
 * 2) CWD/chrome-extension/projects.json (Setup UI writes here)
 * 3) Packaged fallback relative to this module (node_modules/...)
 */
function resolveProjectsJsonPath(): string {
  const candidates: string[] = [];
  if (process.env.AFBT_PROJECTS_JSON) {
    candidates.push(path.resolve(process.env.AFBT_PROJECTS_JSON));
  }
  candidates.push(path.join(process.cwd(), "projects.json"));
  try {
    const home = os.homedir();
    if (home) candidates.push(path.resolve(home, ".afbt", "projects.json"));
  } catch {}

  const chosen = candidates.find((p) => fs.existsSync(p));
  if (!chosen) {
    throw new Error(
      `projects.json not found. Checked: ${candidates.join(", ")}. Set AFBT_PROJECTS_JSON or use the Setup UI.`
    );
  }
  return chosen;
}

export function loadProjectConfig(): ProjectsConfig | null {
  try {
    const configPath = resolveProjectsJsonPath();

    // Only log once for discoverability (shows chosen path)
    if (!hasLoggedProjectsConfig) {
      console.log(
        `[INFO] Browser Connector: Loading projects.json from ${configPath}`
      );
    }

    if (!fs.existsSync(configPath)) {
      if (!hasLoggedProjectsConfig) {
        console.log(
          `[WARN] Browser Connector: projects.json not found at: ${configPath}`
        );
      }
      cachedProjectsConfig = null;
      cachedProjectsConfigPath = null;
      cachedProjectsConfigMtimeMs = null;
      hasLoggedProjectsConfig = true;
      return null;
    }

    // Reload when the file changes or path differs
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(configPath);
    } catch {
      stat = null;
    }
    const mtimeMs = stat ? stat.mtimeMs : null;

    const shouldReload =
      !cachedProjectsConfig ||
      cachedProjectsConfigPath !== configPath ||
      (mtimeMs !== null && cachedProjectsConfigMtimeMs !== mtimeMs);

    if (shouldReload) {
      const configData = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(configData) as ProjectsConfig;
      cachedProjectsConfig = parsed;
      const previousPath = cachedProjectsConfigPath;
      cachedProjectsConfigPath = configPath;
      cachedProjectsConfigMtimeMs = mtimeMs;
      if (previousPath && previousPath !== configPath) {
        console.log(
          `[INFO] Browser Connector: Reloaded projects.json from ${configPath} (was ${previousPath})`
        );
      }
      if (!hasLoggedProjectsConfig) {
        const projectCount = Object.keys(parsed.projects || {}).length;
        console.log(
          `[INFO] Browser Connector: Loaded projects.json (projects=${projectCount}, defaultProject=${parsed.defaultProject})`
        );
      }
    }

    hasLoggedProjectsConfig = true;
    return cachedProjectsConfig;
  } catch (error) {
    console.error("Browser Connector: Error loading projects config:", error);
    return null;
  }
}

// Get configuration value with fallback priority:
// 1. Environment variable (highest priority)
// 2. Project config file
// 3. Default value (lowest priority)
export function getConfigValue(
  key: string,
  defaultValue?: string
): string | undefined {
  // First check environment variables
  if (process.env[key]) {
    return process.env[key];
  }

  // Security: never read embedding API keys from projects.json
  if (key === "OPENAI_API_KEY" || key === "GEMINI_API_KEY") {
    return defaultValue;
  }

  // Then check project config
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    const activeProject =
      process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    const project = projectsConfig.projects[activeProject];
    if (project && project.config[key as keyof ProjectConfig]) {
      return project.config[key as keyof ProjectConfig];
    }
  }

  // Finally return default value
  return defaultValue;
}

// Get screenshot storage path from project config
export function getScreenshotStoragePath(): string | undefined {
  const projectsConfig = loadProjectConfig();
  if (projectsConfig && projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH) {
    return projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH;
  }
  return undefined;
}

// Get active project name
export function getActiveProjectName(): string | undefined {
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    const active = process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    return active;
  }
  return undefined;
}

// ==== Port discovery and server utilities ====

/**
 * Check if a port is available
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Use dynamic import for ESM compatibility instead of require()
    import("net")
      .then((netMod: any) => {
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
export async function getAvailablePort(requestedPort: number): Promise<number> {
  const maxAttempts = 10;

  for (let i = 0; i < maxAttempts; i++) {
    const portToTry = requestedPort + i;
    const available = await isPortAvailable(portToTry);

    if (available) {
      return portToTry;
    }
  }

  throw new Error(
    `No available port found in range ${requestedPort}-${
      requestedPort + maxAttempts - 1
    }`
  );
}

// ==== Log management ====

// Global log storage (moved from browser-connector.ts)
export const logs: any[] = [];
export const networkLogs: any[] = [];
export const detailedNetworkLogCache: NetworkLogEntry[] = [];

/**
 * Clear all logs
 */
export function clearAllLogs(): void {
  logs.length = 0;
  networkLogs.length = 0;
  detailedNetworkLogCache.length = 0;
  console.log("All logs cleared");
}
