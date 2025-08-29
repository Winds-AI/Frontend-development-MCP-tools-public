import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import fs from "fs";
import { z } from "zod";

// Project configuration management
interface ProjectConfig {
  SWAGGER_URL?: string;
  AUTH_ORIGIN?: string;
  AUTH_STORAGE_TYPE?: string;
  AUTH_TOKEN_KEY?: string;
  API_BASE_URL?: string;
  API_AUTH_TOKEN_TTL_SECONDS?: number;
  SCREENSHOT_STORAGE_PATH?: string;
  BROWSER_TOOLS_HOST?: string;
  BROWSER_TOOLS_PORT?: string;
  ROUTES_FILE_PATH?: string;
}

interface Project {
  config: ProjectConfig;
}

interface ProjectsConfig {
  projects: Record<string, Project>;
  defaultProject: string;
  DEFAULT_SCREENSHOT_STORAGE_PATH?: string;
}

// Load project configuration
function loadProjectConfig(): ProjectsConfig | null {
  try {
    const candidates: string[] = [];
    if (process.env.AFBT_PROJECTS_JSON) {
      candidates.push(path.resolve(process.env.AFBT_PROJECTS_JSON));
    }
    candidates.push(path.resolve(process.cwd(), "projects.json"));
    try {
      const home = require("os").homedir?.() || process.env.HOME;
      if (home) candidates.push(path.resolve(home, ".afbt", "projects.json"));
    } catch {}

    const chosen = candidates.find((p) => fs.existsSync(p));
    if (!chosen) {
      console.error(
        `projects.json not found. Checked: ${candidates.join(", ")}. Set AFBT_PROJECTS_JSON or open the Setup UI to create and save it.`
      );
      return null;
    }
    const configData = fs.readFileSync(chosen, "utf8");
    return JSON.parse(configData);
  } catch (error) {
    console.error("Error loading projects config:", error);
    return null;
  }
}

// Get configuration value with fallback priority:
// 1. Environment variable (highest priority)
// 2. Project config file
// 3. Default value (lowest priority)
function getConfigValue(
  key: string,
  defaultValue?: string
): string | undefined {
  // First check environment variables
  if (process.env[key]) {
    return process.env[key];
  }

  // Then check project config
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    const activeProject =
      process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    const project = projectsConfig.projects[activeProject];
    if (project) {
      const val = project.config[key as keyof ProjectConfig] as any;
      if (val !== undefined && val !== null) {
        if (typeof val === "string") return val;
        if (typeof val === "number") return String(val);
      }
    }
  }

  // Finally return default value
  return defaultValue;
}

// Get active project name
function getActiveProjectName(): string | undefined {
  // First, try environment variable (this is set by the MCP configuration)
  if (process.env.ACTIVE_PROJECT) {
    return process.env.ACTIVE_PROJECT;
  }

  // Fallback to projects config
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    return projectsConfig.defaultProject;
  }

  return undefined;
}

// Generate dynamic description for navigate tool
function generateNavigateToolDescription(): string {
  const baseDescription =
    "Navigates the current active browser tab to a new URL. **Use for automated testing, navigation flows, or redirecting to specific pages.** Requires Chrome extension to be connected.";

  // Get routes file path dynamically each time
  const routesFilePath = getConfigValue("ROUTES_FILE_PATH");

  if (routesFilePath) {
    return `${baseDescription}\n\n**Route Reference**: If unsure about available paths, check the routes file at \`${routesFilePath}\` for the correct routes to use.`;
  } else {
    return `${baseDescription}\n\n**Route Reference**: ROUTES_FILE_PATH variable is not set so make sure you know the routes to use`;
  }
}

// Log active project information
function logActiveProject() {
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    const activeProject =
      process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    const project = projectsConfig.projects[activeProject];
    if (project) {
      console.log(`🚀 Active Project: ${activeProject}`);
      console.log(
        `🌐 API Base URL: ${project.config.API_BASE_URL || "Not set"}`
      );
      console.log(`📋 Swagger URL: ${project.config.SWAGGER_URL || "Not set"}`);
      console.log(
        `📁 Screenshot Path: ${
          projectsConfig.DEFAULT_SCREENSHOT_STORAGE_PATH || "Not set"
        }`
      );
    } else {
      console.log(`❌ Project '${activeProject}' not found in config`);
    }
  } else {
    console.log(
      "📋 Using environment variables (no projects.json config found)"
    );
  }
}

// Validate authentication token format
function isValidAuthToken(token: string): boolean {
  // Check if token is empty or too short
  if (!token || token.trim().length < 10) {
    return false;
  }

  // Check for common token patterns
  const tokenPatterns = [
    // JWT tokens (3 parts separated by dots)
    /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
    // API keys (alphanumeric with possible hyphens/underscores, typically 20+ chars)
    /^[A-Za-z0-9-_]{20,}$/,
    // Bearer tokens (alphanumeric, typically 32+ chars)
    /^[A-Za-z0-9]{32,}$/,
    // OAuth tokens (alphanumeric, typically 40+ chars)
    /^[A-Za-z0-9]{40,}$/,
    // Generic token with reasonable length and valid characters
    /^[A-Za-z0-9-_]{16,}$/,
  ];

  // Check if token matches any of the patterns
  return tokenPatterns.some((pattern) => pattern.test(token));
}

// Create the MCP server
const server = new McpServer({
  name: "Frontend Browser Tools MCP",
  version: "1.2.0",
});

// In-memory cache for dynamically retrieved auth tokens per project
type CachedToken = { token: string; expiresAtMs: number };
const authTokenCacheByProject: Record<string, CachedToken> = {};

function getCachedToken(project: string | undefined): string | undefined {
  if (!project) return undefined;
  const entry = authTokenCacheByProject[project];
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAtMs) {
    delete authTokenCacheByProject[project];
    return undefined;
  }
  return entry.token;
}

function decodeJwtExpirationMs(token: string): number | undefined {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8")
    );
    if (!payload || typeof payload.exp !== "number") return undefined;
    return payload.exp * 1000;
  } catch {
    return undefined;
  }
}

async function retrieveTokenViaExtension(): Promise<string | undefined> {
  const storageType = (getConfigValue("AUTH_STORAGE_TYPE") || "").toString();
  const tokenKey = (getConfigValue("AUTH_TOKEN_KEY") || "").toString();
  const origin = getConfigValue("AUTH_ORIGIN");
  if (!storageType || !tokenKey) return undefined;

  return await withServerConnection(async () => {
    const targetUrl = `http://${discoveredHost}:${discoveredPort}/retrieve-auth-token`;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType, tokenKey, origin }),
    });
    if (!response.ok) {
      return undefined;
    }
    const json = (await response.json()) as any;
    const token = json?.token;
    if (typeof token === "string" && token.length > 0) return token;
    return undefined;
  });
}

async function resolveAuthToken(
  includeAuthToken?: boolean
): Promise<string | undefined | { error: string }> {
  if (includeAuthToken !== true) return undefined;

  const projectName = getActiveProjectName() || "default-project";

  // 1) Use cached token if valid
  const cached = getCachedToken(projectName);
  if (cached) return cached;

  // 2) Mandatory dynamic retrieval via extension (no fallback)
  const storageType = getConfigValue("AUTH_STORAGE_TYPE");
  const tokenKey = getConfigValue("AUTH_TOKEN_KEY");
  if (!storageType || !tokenKey) {
    return {
      error:
        "Auth token retrieval not configured. Set AUTH_STORAGE_TYPE, AUTH_TOKEN_KEY, and optional AUTH_ORIGIN in projects.json.",
    };
  }
  const token = await retrieveTokenViaExtension();
  if (!token) {
    return {
      error:
        "Failed to retrieve auth token from configured browser storage. Ensure the target app is open and DevTools extension connected.",
    };
  }
  const ttlSecondsRaw = getConfigValue("API_AUTH_TOKEN_TTL_SECONDS");
  let expiresAtMs: number | undefined;
  if (ttlSecondsRaw && !isNaN(Number(ttlSecondsRaw))) {
    expiresAtMs = Date.now() + Number(ttlSecondsRaw) * 1000;
  } else {
    expiresAtMs = decodeJwtExpirationMs(token) || Date.now() + 5 * 60 * 1000;
  }
  authTokenCacheByProject[projectName] = { token, expiresAtMs };
  return token;
}

// Log active project on startup
logActiveProject();

// Track the discovered server connection - enhanced for autonomous operation
let discoveredHost = "127.0.0.1";
let discoveredPort = 3025;
let serverDiscovered = false;

// Function to get the default port from environment variable or default
function getDefaultServerPort(): number {
  // Check environment variable or config file
  const portValue = getConfigValue("BROWSER_TOOLS_PORT");
  if (portValue) {
    const envPort = parseInt(portValue, 10);
    if (!isNaN(envPort) && envPort > 0) {
      return envPort;
    }
  }
  // Default port if no configuration found
  return 3025;
}

// Function to get default server host from environment variable or default
function getDefaultServerHost(): string {
  // Check environment variable or config file first
  const hostValue = getConfigValue("BROWSER_TOOLS_HOST");
  if (hostValue) {
    return hostValue;
  }
  // Default to localhost
  return "127.0.0.1";
}

// Server discovery function - similar to what you have in the Chrome extension
async function discoverServer(): Promise<boolean> {
  console.log("Starting server discovery process");

  // Common hosts to try
  const hosts = [getDefaultServerHost(), "127.0.0.1", "localhost"];

  // Ports to try (start with default, then try others)
  const defaultPort = getDefaultServerPort();
  const ports = [defaultPort];

  // Add additional ports (fallback range)
  for (let p = 3025; p <= 3035; p++) {
    if (p !== defaultPort) {
      ports.push(p);
    }
  }

  // console.log(`Will try hosts: ${hosts.join(", ")}`);
  // console.log(`Will try ports: ${ports.join(", ")}`);

  // Try to find the server
  for (const host of hosts) {
    for (const port of ports) {
      try {
        // console.log(`Checking ${host}:${port}...`);

        // Use the identity endpoint for validation
        const response = await fetch(`http://${host}:${port}/.identity`, {
          signal: AbortSignal.timeout(1000), // 1 second timeout
        });

        if (response.ok) {
          const identity = await response.json();

          // Verify this is actually our server by checking the signature
          if (identity.signature === "mcp-browser-connector-24x7") {
            console.log(`Successfully found server at ${host}:${port}`);

            // Save the discovered connection
            discoveredHost = host;
            discoveredPort = port;
            serverDiscovered = true;

            return true;
          }
        }
      } catch (error: any) {
        // Ignore connection errors during discovery
        console.error(`Error checking ${host}:${port}: ${error.message}`);
      }
    }
  }

  console.error("No server found during discovery");
  return false;
}

// Wrapper function to ensure server connection before making requests
async function withServerConnection<T>(
  apiCall: () => Promise<T>
): Promise<T | any> {
  // Attempt to discover server if not already discovered
  if (!serverDiscovered) {
    const discovered = await discoverServer();
    if (!discovered) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to discover browser connector server. Please ensure it's running.",
          },
        ],
        isError: true,
      };
    }
  }

  // Now make the actual API call with discovered host/port
  try {
    return await apiCall();
  } catch (error: any) {
    // If the request fails, try rediscovering the server once
    console.error(
      `API call failed: ${error.message}. Attempting rediscovery...`
    );
    serverDiscovered = false;

    if (await discoverServer()) {
      console.error("Rediscovery successful. Retrying API call...");
      try {
        // Retry the API call with the newly discovered connection
        return await apiCall();
      } catch (retryError: any) {
        console.error(`Retry failed: ${retryError.message}`);
        return {
          content: [
            {
              type: "text",
              text: `Error after reconnection attempt: ${retryError.message}`,
            },
          ],
        };
      }
    } else {
      console.error("Rediscovery failed. Could not reconnect to server.");
      return {
        content: [
          {
            type: "text",
            text: `Failed to reconnect to server: ${error.message}`,
          },
        ],
      };
    }
  }
}

// Tool 1: inspectBrowserNetworkActivity
// Function to generate search suggestions for API call analysis
function generateSearchSuggestions(searchTerm: string): string[] {
  const suggestions: string[] = [];
  const term = searchTerm.toLowerCase();

  // Provide alternate search strategies
  suggestions.push("🔍 **Search Strategy Suggestions:**");

  // Singular/plural variations
  if (term.endsWith("s")) {
    const singular = term.slice(0, -1);
    suggestions.push(`   • Try singular form: "${singular}"`);
  } else {
    suggestions.push(`   • Try plural form: "${term}s"`);
  }

  // Partial matches
  suggestions.push(
    `   • Try partial match: "${term.slice(0, Math.max(3, term.length - 2))}"`
  );

  // Common patterns
  const patterns = [
    { pattern: "user", alternates: ["users", "account", "profile", "auth"] },
    { pattern: "order", alternates: ["orders", "purchase", "transaction"] },
    { pattern: "product", alternates: ["products", "item", "catalog"] },
    { pattern: "admin", alternates: ["administration", "manage", "dashboard"] },
  ];

  const matchingPattern = patterns.find(
    (p) =>
      term.includes(p.pattern) || p.alternates.some((alt) => term.includes(alt))
  );

  if (matchingPattern) {
    suggestions.push(
      `   • Related terms: ${matchingPattern.alternates
        .map((alt) => `"${alt}"`)
        .join(", ")}`
    );
  }

  // Generic suggestions
  suggestions.push("");
  suggestions.push("💡 **Common API Patterns:**");
  suggestions.push(`   • "api" - Find all API calls`);
  suggestions.push(`   • "get-" - Find getter endpoints`);
  suggestions.push(`   • "list" - Find list/collection endpoints`);
  suggestions.push(`   • "auth" - Find authentication calls`);

  return suggestions;
}

async function handleInspectBrowserNetworkActivity(params: any) {
  const { urlFilter, details, timeOffset, orderBy, orderDirection, limit } =
    params;

  const currentTime = Date.now();
  let finalTimeStart: number | undefined;
  let finalTimeEnd: number | undefined;

  if (timeOffset !== undefined) {
    if (timeOffset <= 0) {
      throw new Error("timeOffset must be a positive number");
    }
    if (timeOffset > 86400) {
      throw new Error("timeOffset cannot exceed 24 hours (86400 seconds)");
    }
    finalTimeStart = currentTime - timeOffset * 1000;
    finalTimeEnd = currentTime;
    console.log(
      `Time offset calculation: ${timeOffset}s ago = ${new Date(
        finalTimeStart
      ).toISOString()} to ${new Date(finalTimeEnd).toISOString()}`
    );
  }

  const queryString = `?urlFilter=${encodeURIComponent(
    urlFilter
  )}&details=${details.join(",")}&includeTimestamp=true${
    finalTimeStart ? `&timeStart=${finalTimeStart}` : ""
  }${finalTimeEnd ? `&timeEnd=${finalTimeEnd}` : ""}&orderBy=${
    orderBy || "timestamp"
  }&orderDirection=${orderDirection || "desc"}&limit=${limit || 20}`;
  const targetUrl = `http://${discoveredHost}:${discoveredPort}/network-request-details${queryString}`;

  console.log(`MCP Tool: Fetching network details from ${targetUrl}`);

  return await withServerConnection(async () => {
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Server returned ${response.status}: ${
            errorText || response.statusText
          }`
        );
      }
      const json = await response.json();
      const results = json;
      if (Array.isArray(results) && results.length === 0) {
        const suggestions = generateSearchSuggestions(urlFilter);
        return {
          content: [
            {
              type: "text",
              text: `No API calls found matching '${urlFilter}'. Try these search strategies:\n\n${suggestions.join(
                "\n"
              )}`,
            },
          ],
        } as any;
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      } as any;
    } catch (error: any) {
      console.error("Error fetching network request details:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get network request details: ${error.message}`,
          },
        ],
        isError: true,
      } as any;
    }
  });
}

// New name
server.tool(
  "browser.network.inspect",
  "Inspect recent browser network requests (DevTools-like). Use for debugging HTTP failures (4xx/5xx), payloads, and request sequences. Note: This captures network errors that console tools miss.",
  {
    urlFilter: z
      .string()
      .describe(
        "Substring or pattern to filter request URLs. Tips: Use partial matches; try singular/plural variants if empty."
      ),
    details: z
      .array(
        z.enum([
          "url",
          "method",
          "status",
          "timestamp",
          "requestHeaders",
          "responseHeaders",
          "requestBody",
          "responseBody",
        ])
      )
      .min(1)
      .describe(
        "Fields to include for each entry. 'timestamp' is useful for chronological ordering."
      ),
    timeOffset: z
      .number()
      .optional()
      .describe(
        "Relative window in seconds (e.g., 300 = last 5 minutes, max 86400)."
      ),
    orderBy: z
      .enum(["timestamp", "url"])
      .optional()
      .default("timestamp")
      .describe("Sort field"),
    orderDirection: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .describe("Sort direction"),
    limit: z.number().optional().default(20).describe("Max entries to return"),
  },
  handleInspectBrowserNetworkActivity
);

// Tool: interactWithPage (DOM-first with CDP fallback via extension)
async function handleUiInteract(params: any) {
  return await withServerConnection(async () => {
    try {
      const targetUrl = `http://${discoveredHost}:${discoveredPort}/dom-action`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        const texts: any[] = [
          {
            type: "text",
            text: `✅ Action '${params.action}' succeeded on target (${params.target.by}=${params.target.value}).`,
          },
        ];
        if (result.details) {
          texts.push({
            type: "text",
            text: JSON.stringify(result.details, null, 2),
          });
        }
        return { content: texts };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Action '${params.action}' failed: ${
                result.error || "Unknown error"
              }`,
            },
          ],
          isError: true,
        } as any;
      }
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to perform interaction: ${errorMessage}`,
          },
        ],
        isError: true,
      } as any;
    }
  });
}

// New name
server.tool(
  "ui.interact",
  "Interact with the active browser tab using semantic selectors (data-testid, role+name, label, placeholder, name, text, css, xpath). Supports actions: click, type, select, check/uncheck, keypress, hover, waitForSelector, scroll. Automatically scrolls into view and waits for visibility/enabled. Uses a CDP fallback in the extension when needed.",
  {
    action: z.enum([
      "click",
      "type",
      "select",
      "check",
      "uncheck",
      "keypress",
      "hover",
      "waitForSelector",
      "scroll",
    ]),
    target: z
      .object({
        by: z.enum([
          "testid",
          "role",
          "label",
          "text",
          "placeholder",
          "name",
          "css",
          "xpath",
        ]),
        value: z.string(),
        exact: z.boolean().optional(),
      })
      .describe("How to locate the element"),
    scopeTarget: z
      .object({
        by: z.enum([
          "testid",
          "role",
          "label",
          "text",
          "placeholder",
          "name",
          "css",
          "xpath",
        ]),
        value: z.string(),
        exact: z.boolean().optional(),
      })
      .optional()
      .describe("Optional container to scope the search (e.g., role=tablist)"),
    value: z
      .string()
      .optional()
      .describe("Text/value to type/select/keypress when applicable"),
    options: z
      .object({
        timeoutMs: z.number().optional(),
        waitForVisible: z.boolean().optional(),
        waitForEnabled: z.boolean().optional(),
        waitForNetworkIdleMs: z.number().optional(),
        postActionScreenshot: z.boolean().optional(),
        screenshotLabel: z.string().optional(),
        fallbackToCdp: z.boolean().optional(),
        frameSelector: z.string().optional(),
        // scroll-specific
        scrollX: z.number().optional(),
        scrollY: z.number().optional(),
        to: z.enum(["top", "bottom"]).optional(),
        smooth: z.boolean().optional(),
        // assertion helpers
        assertTarget: z
          .object({
            by: z.enum([
              "testid",
              "role",
              "label",
              "text",
              "placeholder",
              "name",
              "css",
              "xpath",
            ]),
            value: z.string(),
            exact: z.boolean().optional(),
          })
          .optional(),
        assertTimeoutMs: z.number().optional(),
        assertUrlContains: z.string().optional(),
        tabChangeWaitMs: z.number().optional(),
      })
      .optional(),
  },
  handleUiInteract
);

// =============================================
// LIST API TAGS TOOL
// =============================================

async function handleListApiTags() {
  try {
    const swaggerSource = getConfigValue("SWAGGER_URL");
    if (!swaggerSource) {
      throw new Error("SWAGGER_URL environment variable or config is not set");
    }

    const swaggerDoc = await loadSwaggerDoc(swaggerSource);
    if (!swaggerDoc.paths) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ totalTags: 0, tags: [] }, null, 2),
          },
        ],
      } as any;
    }

    const counts: Record<string, number> = {};
    for (const [, pathItem] of Object.entries(swaggerDoc.paths)) {
      for (const [httpMethod, operation] of Object.entries(
        pathItem as object
      )) {
        if (httpMethod === "parameters") continue;
        const op = operation as any;
        if (op.tags && Array.isArray(op.tags)) {
          for (const t of op.tags) {
            if (!t || typeof t !== "string") continue;
            counts[t] = (counts[t] || 0) + 1;
          }
        }
      }
    }

    const tags = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    const result = { totalTags: tags.length, tags };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    } as any;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to list API tags: ${errorMessage}`,
        },
      ],
      isError: true,
    } as any;
  }
}

server.tool(
  "api.listTags",
  "List all API tags with operation counts (from Swagger/OpenAPI).",
  {},
  handleListApiTags
);

async function handleCaptureBrowserScreenshot() {
  return await withServerConnection(async () => {
    try {
      const targetUrl = `http://${discoveredHost}:${discoveredPort}/capture-screenshot`;
      const activeProjectName = getActiveProjectName();
      const requestPayload = {
        returnImageData: true, // Always return image data
        projectName: activeProjectName, // Pass active project name
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      const result = await response.json();

      if (response.ok) {
        const responseContent: any[] = [
          {
            type: "text",
            text: `📁 Project: ${
              result.projectDirectory || "default-project"
            }\n📌 Now Analyze the UI Layout and it's structure properly given the task at hand, then continue`,
          },
        ];

        responseContent.push({
          type: "image",
          data: result.imageData,
          mimeType: "image/png",
        });

        return {
          content: responseContent,
        } as any;
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Error taking screenshot: ${result.error}`,
            },
          ],
          isError: true,
        } as any;
      }
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to take screenshot: ${errorMessage}`,
          },
        ],
        isError: true,
      } as any;
    }
  });
}

// New name
server.tool(
  "browser.screenshot",
  "Capture current browser tab; saves to structured path and returns image. Requires extension connection with DevTools open.",
  { randomString: z.string().describe("any string (ignored)") },
  handleCaptureBrowserScreenshot
);

server.tool(
  "ui.inspectElement",
  `**Enhanced UI Debugging Context Tool** - Gets comprehensive debugging information for the element selected in browser DevTools. 

**Prerequisite**: DevTools open, element selected in Elements panel.

**Returns**:
- **Computed CSS styles** - All applied styles for layout debugging
- **Parent/child context** - Understanding element relationships and layout flow  
- **Layout debugging info** - Automatic detection of common CSS issues with actionable suggestions
- **Accessibility audit** - ARIA attributes, focus management, semantic information
- **Interactive state** - Hover, focus, click handlers, event listeners
- **Material-UI context** - Component type, variants, theme integration (when applicable)
- **Performance hints** - Large images, deep nesting, optimization opportunities

**Autonomous AI Usage**: This tool provides enough context to understand and fix UI issues without additional tool calls. Use the \`layoutDebug.issues\` and \`layoutDebug.suggestions\` arrays for immediate actionable insights.

**Best used in workflow**: Screenshot → Select Element → Enhanced Inspect → Apply Fixes`,
  async () => {
    return await withServerConnection(async () => {
      const response = await fetch(
        `http://${discoveredHost}:${discoveredPort}/selected-element`
      );
      const json = await response.json();

      // Enhanced response formatting for better AI consumption
      let formattedContent = "🔍 **Enhanced Element Debugging Context**\n\n";

      if (json && json.tagName) {
        formattedContent += `**Element**: ${json.tagName}${
          json.id ? "#" + json.id : ""
        }${
          json.className
            ? "." + json.className.split(" ").slice(0, 2).join(".")
            : ""
        }\n\n`;

        // Highlight critical issues first
        if (
          json.layoutDebug &&
          json.layoutDebug.issues &&
          json.layoutDebug.issues.length > 0
        ) {
          formattedContent += "🚨 **Critical Issues Detected**:\n";
          json.layoutDebug.issues.forEach((issue: any) => {
            formattedContent += `• ${issue}\n`;
          });
          formattedContent += "\n";
        }

        // Show actionable suggestions
        if (
          json.layoutDebug &&
          json.layoutDebug.suggestions &&
          json.layoutDebug.suggestions.length > 0
        ) {
          formattedContent += "💡 **Suggested Fixes**:\n";
          json.layoutDebug.suggestions.forEach((suggestion: any) => {
            formattedContent += `• ${suggestion}\n`;
          });
          formattedContent += "\n";
        }

        // Context summary for AI decision making
        if (json.parentContext || json.layoutDebug) {
          formattedContent += "📐 **Layout Context**:\n";
          if (json.parentContext) {
            formattedContent += `• Parent: ${json.parentContext.tagName} (${json.parentContext.display})`;
            if (json.parentContext.isFlexContainer)
              formattedContent += " [Flex Container]";
            if (json.parentContext.isGridContainer)
              formattedContent += " [Grid Container]";
            formattedContent += "\n";
          }
          if (json.layoutDebug) {
            if (json.layoutDebug.isFlexItem)
              formattedContent += "• This is a flex item\n";
            if (json.layoutDebug.isGridItem)
              formattedContent += "• This is a grid item\n";
            if (json.layoutDebug.isFlexContainer)
              formattedContent += "• This is a flex container\n";
            if (json.layoutDebug.isGridContainer)
              formattedContent += "• This is a grid container\n";
          }
          formattedContent += "\n";
        }

        formattedContent += "📄 **Full Debug Data Below**:\n";
      }

      return {
        content: [
          {
            type: "text",
            text: formattedContent + JSON.stringify(json, null, 2),
          },
        ],
      };
    });
  }
);

server.tool(
  "api.request",
  "Execute a live HTTP request to API_BASE_URL; optionally include an Authorization bearer token retrieved from configured browser storage. Use after 'api.searchEndpoints' or for known endpoints.",
  {
    endpoint: z
      .string()
      .describe(
        "The API endpoint path (e.g., '/api/users', '/auth/profile'). Will be combined with API_BASE_URL from environment."
      ),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .optional()
      .default("GET")
      .describe("HTTP method for the API call"),
    requestBody: z
      .any()
      .optional()
      .describe(
        "Request body for POST/PUT/PATCH requests (will be JSON stringified)"
      ),
    queryParams: z
      .record(z.string())
      .optional()
      .describe("Query parameters as key-value pairs"),
    includeAuthToken: z
      .boolean()
      .optional()
      .describe("Whether to include auth token"),
  },
  async (params) => {
    console.log(`[api.request] - Making request to: ${params.endpoint}`);
    try {
      const {
        endpoint,
        method = "GET",
        requestBody,
        queryParams,
        includeAuthToken,
      } = params;

      // Check required environment variables or config
      const apiBaseUrl = getConfigValue("API_BASE_URL");
      const authTokenResolved = await resolveAuthToken(includeAuthToken);

      console.log(`[api.request] - API base URL: ${apiBaseUrl} ${endpoint}`);

      // Validate/resolve auth token if requested
      if (includeAuthToken === true) {
        if (typeof (authTokenResolved as any)?.error === "string") {
          return {
            content: [
              {
                type: "text",
                text: (authTokenResolved as any).error,
              },
            ],
            isError: true,
          };
        }
      }

      if (!apiBaseUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Missing required environment variable. Please set API_BASE_URL in projects.json or as environment variable.",
            },
          ],
          isError: true,
        };
      }

      // Build the full URL
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      // Add query parameters if provided
      if (queryParams && Object.keys(queryParams).length > 0) {
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
          urlParams.append(key, value);
        }
        fullUrl += `?${urlParams.toString()}`;
      }

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add Authorization header if auth token is provided
      if (includeAuthToken === true) {
        const tokenString =
          typeof authTokenResolved === "string" ? authTokenResolved : undefined;
        if (!tokenString) {
          return {
            content: [
              {
                type: "text",
                text: "Auth token requested but could not be resolved.",
              },
            ],
            isError: true,
          };
        }
        headers["Authorization"] = `Bearer ${tokenString}`;
      }

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: method,
        headers: headers,
      };

      // Add request body for POST/PUT/PATCH
      if (
        requestBody &&
        ["POST", "PUT", "PATCH"].includes(method.toUpperCase())
      ) {
        fetchOptions.body = JSON.stringify(requestBody);
      }

      console.log(`[api.request] - Making ${method} request to ${fullUrl}`);

      // Make the API call
      const startTime = Date.now();
      const response = await fetch(fullUrl, fetchOptions);
      const endTime = Date.now();

      console.log(`[api.request] - Response status: ${response.status}`);

      // Parse response
      let responseData;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Build response object
      const result: any = {
        data: responseData,
        details: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          timing: {
            requestDuration: endTime - startTime,
            timestamp: new Date().toISOString(),
          },
          url: fullUrl,
          method: method,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: response.ok,
                method,
                url: fullUrl,
                responseDetails: result.details,
                data: result.data,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error("[api.request] - Error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error executing API call: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Function to load Swagger documentation (either from URL or file)
async function loadSwaggerDoc(swaggerSource: string): Promise<any> {
  try {
    // Check if it's a URL
    if (
      swaggerSource.startsWith("http://") ||
      swaggerSource.startsWith("https://")
    ) {
      const response = await fetch(swaggerSource);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Swagger doc: ${response.status} ${response.statusText}`
        );
      }
      return await response.json();
    }

    // Otherwise, try to parse it as a JSON string
    try {
      return JSON.parse(swaggerSource);
    } catch {
      // If not valid JSON, try to read it as a file path
      const content = fs.readFileSync(swaggerSource, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error loading Swagger documentation: ${error}`);
    throw error;
  }
}

// =============================================
// HELPER FUNCTIONS FOR SEARCH API DOCUMENTATION
// =============================================

/**
 * Extracts parameter information for GET requests
 */
function extractSimpleParameters(operation: any): any[] {
  const parameters: any[] = [];

  if (operation.parameters) {
    operation.parameters.forEach((param: any) => {
      const simpleParam: any = {
        name: param.name,
        in: param.in,
        required: param.required || false,
        type: param.schema?.type || param.type || "string",
      };

      if (param.description) {
        simpleParam.description = param.description;
      }

      if (param.schema?.enum) {
        simpleParam.enum = param.schema.enum;
      }

      if (param.schema?.default !== undefined) {
        simpleParam.default = param.schema.default;
      }

      parameters.push(simpleParam);
    });
  }

  return parameters;
}

/**
 * Extracts simplified request body schema for POST/PUT/PATCH requests
 */
function extractSimpleRequestBody(operation: any): any {
  if (!operation.requestBody?.content) return null;

  const content = operation.requestBody.content;
  const jsonContent = content["application/json"];

  if (!jsonContent?.schema) return null;

  return flattenSchema(jsonContent.schema);
}

/**
 * Extracts successful response schema (200, 201, etc.)
 */
function extractSuccessfulResponse(operation: any): any {
  if (!operation.responses) return null;

  // Look for successful response codes
  const successCodes = ["200", "201", "202", "204"];

  for (const code of successCodes) {
    const response = operation.responses[code];
    if (response) {
      const result: any = {
        statusCode: code,
        description: response.description || "Success",
      };

      const jsonContent = response.content?.["application/json"];

      if (jsonContent?.schema) {
        // Prefer actual schema if available
        result.schema = flattenSchema(jsonContent.schema);
      } else if (jsonContent?.example) {
        // Fallback to example if schema is not available
        result.exampleResponse = jsonContent.example;
        result.note =
          "Response structure inferred from example (no formal schema provided)";
      }

      return result;
    }
  }

  return null;
}

/**
 * Flattens nested schema objects for better readability
 */
function flattenSchema(
  schema: any,
  maxDepth: number = 3,
  currentDepth: number = 0
): any {
  if (!schema || currentDepth >= maxDepth) return schema;

  if (schema.type === "object" && schema.properties) {
    const flattened: any = {
      type: "object",
      properties: {},
    };

    if (schema.required) {
      flattened.required = schema.required;
    }

    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;

      if (propSchema.type === "object" && propSchema.properties) {
        // Nested object - flatten one level
        flattened.properties[key] = flattenSchema(
          propSchema,
          maxDepth,
          currentDepth + 1
        );
      } else if (propSchema.type === "array" && propSchema.items) {
        // Array - include item type info
        flattened.properties[key] = {
          type: "array",
          items: flattenSchema(propSchema.items, maxDepth, currentDepth + 1),
        };
      } else {
        // Simple property
        const simpleProp: any = {
          type: propSchema.type || "string",
        };

        if (propSchema.description)
          simpleProp.description = propSchema.description;
        if (propSchema.enum) simpleProp.enum = propSchema.enum;
        if (propSchema.format) simpleProp.format = propSchema.format;
        if (propSchema.default !== undefined)
          simpleProp.default = propSchema.default;
        if (propSchema.example !== undefined)
          simpleProp.example = propSchema.example;

        flattened.properties[key] = simpleProp;
      }
    }

    return flattened;
  } else if (schema.type === "array" && schema.items) {
    return {
      type: "array",
      items: flattenSchema(schema.items, maxDepth, currentDepth + 1),
    };
  }

  return schema;
}

/**
 * Creates a simplified endpoint object with only essential information
 */
function createSimplifiedEndpoint(
  path: string,
  method: string,
  operation: any
): any {
  const upperMethod = method.toUpperCase();
  const endpoint: any = {
    path,
    method: upperMethod,
    summary: operation.summary || `${upperMethod} ${path}`,
  };

  // Add tags for categorization
  if (operation.tags?.length > 0) {
    endpoint.tags = operation.tags;
  }

  // Handle different HTTP methods
  switch (upperMethod) {
    case "GET":
      const parameters = extractSimpleParameters(operation);
      if (parameters.length > 0) {
        endpoint.parameters = parameters;
      }
      break;

    case "POST":
    case "PUT":
    case "PATCH":
      const requestBody = extractSimpleRequestBody(operation);
      if (requestBody) {
        endpoint.requestBody = requestBody;
      }

      // Also include path parameters if any
      const pathParams = extractSimpleParameters(operation).filter(
        (p) => p.in === "path"
      );
      if (pathParams.length > 0) {
        endpoint.pathParameters = pathParams;
      }
      break;

    case "DELETE":
      const deleteParams = extractSimpleParameters(operation).filter(
        (p) => p.in === "path"
      );
      if (deleteParams.length > 0) {
        endpoint.pathParameters = deleteParams;
      }
      break;
  }

  // Extract successful response
  const successResponse = extractSuccessfulResponse(operation);
  if (successResponse) {
    endpoint.successResponse = successResponse;
  } else {
    // No successful response schema found - recommend using fetchLiveApiResponse
    endpoint.recommendedAction = {
      tool: "fetchLiveApiResponse",
      reason:
        "No response schema found in documentation. Use this tool to make a live API call and understand the actual response structure.",
      suggestion: `fetchLiveApiResponse(endpoint: "${path}", method: "${upperMethod}"${
        upperMethod !== "GET" ? ", requestBody: <your_payload>" : ""
      })`,
    };
  }

  return endpoint;
}

// =============================================
// SEARCH API DOCUMENTATION TOOL
// =============================================

server.tool(
  "api.searchEndpoints",
  "Semantic API documentation search returning essential info: path, method, params (GET), request body (POST/PUT/PATCH/DELETE), and success responses. If schemas are missing, suggests using 'api.request' for live testing.",
  {
    query: z
      .string()
      .optional()
      .describe(
        "Text query to match against path, summary, description, operationId, and tags"
      ),
    tag: z
      .string()
      .optional()
      .describe("Filter by a specific tag (case-insensitive exact match)"),
    // Backward-compatibility: deprecated. Prefer 'query' or 'tag'.
    searchTerms: z
      .array(z.string())
      .optional()
      .describe(
        "[DEPRECATED] Previous array of keywords. If provided, behaves like an OR search across terms."
      ),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .optional()
      .describe("Filter results by HTTP method (optional)"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of endpoints to return (default: 10)"),
    // Backward-compatibility alias for 'limit'
    maxResults: z
      .number()
      .optional()
      .describe("[DEPRECATED] Use 'limit' instead."),
  },
  async (params) => {
    try {
      const { query, tag, method } = params as any;
      const limit = (params as any).limit ?? (params as any).maxResults ?? 10;

      // Derive effective query/tag from deprecated searchTerms if needed
      const terms: string[] | undefined = Array.isArray(
        (params as any).searchTerms
      )
        ? ((params as any).searchTerms as string[]).filter(
            (t) => typeof t === "string" && t.trim().length > 0
          )
        : undefined;
      // If coming from deprecated searchTerms, build an OR-regex of escaped terms
      const effectiveQueryIsRegex = !query && !!terms && terms.length > 0;
      const effectiveQuery =
        query ??
        (terms && terms.length > 0
          ? terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
          : undefined);
      const effectiveTag = tag;
      // Validate filters: require at least one of query or tag
      if (!effectiveQuery && !effectiveTag) {
        return {
          content: [
            {
              type: "text",
              text: "Provide 'query' and/or 'tag' to search.",
            },
          ],
          isError: true,
        };
      }

      // Call backend semantic search endpoint. Pass implicit project via header (no param changes for tool callers).
      const payload = {
        query: effectiveQuery,
        tag: effectiveTag,
        method,
        limit,
      } as any;

      const apiResult = await withServerConnection(async () => {
        const activeProjectHeader = getActiveProjectName();
        const resp = await fetch(
          `http://${discoveredHost}:${discoveredPort}/api/embed/search`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(activeProjectHeader
                ? { "X-ACTIVE-PROJECT": activeProjectHeader }
                : {}),
            },
            body: JSON.stringify(payload),
          }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      });

      // If withServerConnection returned an MCP-style error object, pass it through
      if (!Array.isArray(apiResult) && (apiResult as any)?.content) {
        return apiResult as any;
      }

      const endpoints = Array.isArray(apiResult) ? apiResult : [];

      const result = {
        summary: {
          totalFound: endpoints.length,
          filter:
            effectiveQuery && effectiveTag
              ? {
                  type: "mixed",
                  value: `${effectiveQuery} (tag: ${effectiveTag})`,
                }
              : effectiveQuery
              ? { type: "query", value: effectiveQuery }
              : { type: "tag", value: effectiveTag },
          methodFilter: method || "all",
        },
        endpoints,
        // Hint for callers: include requiresAuth boolean if present
        note: "Each endpoint may include 'requiresAuth' derived from OpenAPI security. If true, call api_request with includeAuthToken: true.",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search API documentation: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register navigate tool with static description (set once at startup)
server.tool(
  "browser.navigate",
  generateNavigateToolDescription(),
  {
    url: z
      .string()
      .describe(
        `The URL to navigate to (must be a valid URL including protocol, e.g., 'https://example.com')`
      ),
  },
  async (params) => {
    return await withServerConnection(async () => {
      try {
        const { url } = params;

        // Validate URL format
        try {
          new URL(url);
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid URL format: ${url}. Please provide a complete URL including protocol (e.g., 'https://example.com')`,
              },
            ],
            isError: true,
          };
        }

        const targetUrl = `http://${discoveredHost}:${discoveredPort}/navigate-tab`;
        const requestPayload = {
          url: url,
        };

        console.log(`MCP Tool: Navigating browser tab to ${url}`);

        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          return {
            content: [
              {
                type: "text",
                text: `✅ Successfully navigated browser tab to: ${url}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Failed to navigate browser tab: ${
                  result.error || "Unknown error"
                }`,
              },
            ],
            isError: true,
          };
        }
      } catch (error: any) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Failed to navigate browser tab: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
);

// Tool 7: inspectBrowserConsole
server.tool(
  "browser.console.read",
  "Read browser console logs with filters; returns formatted summary + stats. Use for JS errors/warnings/logs. Note: Does not include HTTP failures (use 'browser.network.inspect').",
  {
    level: z
      .enum(["log", "error", "warn", "info", "debug", "all"])
      .optional()
      .describe("Filter by console message level. Default: 'all'"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of entries to return. Default: no limit"),
    timeOffset: z
      .number()
      .optional()
      .describe(
        "Time offset in seconds from current time. Use this for relative time filtering (e.g., 10 = last 10 seconds, 300 = last 5 minutes). Maximum allowed: 24 hours (86400 seconds)."
      ),
    search: z
      .string()
      .optional()
      .describe("Search for specific text in console messages"),
  },
  async (args) => {
    if (!serverDiscovered) {
      console.error("Server not discovered, attempting discovery...");
      await discoverServer();
      if (!serverDiscovered) {
        return {
          content: [
            {
              type: "text",
              text: "❌ Browser Tools Server not found. Please ensure the server is running and the Chrome extension is connected.",
            },
          ],
          isError: true,
        };
      }
    }

    try {
      console.error(`Inspecting browser console with filters:`, args);

      // Capture current time when tool is called
      const currentTime = Date.now();
      let finalSince: number | undefined;

      // Handle timeOffset parameter - calculate relative time
      if (args.timeOffset !== undefined) {
        // Validate timeOffset
        if (args.timeOffset <= 0) {
          throw new Error("timeOffset must be a positive number");
        }
        if (args.timeOffset > 86400) {
          throw new Error("timeOffset cannot exceed 24 hours (86400 seconds)");
        }

        // Calculate since timestamp based on offset
        finalSince = currentTime - args.timeOffset * 1000;

        console.log(
          `Time offset calculation: ${args.timeOffset}s ago = ${new Date(
            finalSince
          ).toISOString()}`
        );
      }

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (args.level) queryParams.append("level", args.level);
      if (args.limit) queryParams.append("limit", args.limit.toString());
      if (finalSince) queryParams.append("since", finalSince.toString());
      if (args.search) queryParams.append("search", args.search);

      const url = `http://${discoveredHost}:${discoveredPort}/console-inspection?${queryParams.toString()}`;
      console.error(`Making request to: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.error(
        `Console inspection completed. Found ${
          result.logs?.length || 0
        } entries`
      );

      // Format the response for the AI agent
      let responseText = `🔍 **Browser Console Inspection Results**\n\n`;
      responseText += `📊 **Summary**: ${result.summary}\n\n`;

      if (result.stats && result.stats.total > 0) {
        responseText += `📈 **Statistics**:\n`;
        responseText += `- Total entries: ${result.stats.total}\n`;

        if (result.stats.byLevel) {
          responseText += `- By level: `;
          const levelStats = Object.entries(result.stats.byLevel)
            .map(
              ([level, count]) => `${count} ${level}${count !== 1 ? "s" : ""}`
            )
            .join(", ");
          responseText += levelStats + "\n";
        }

        if (result.stats.timeRange?.oldest && result.stats.timeRange?.newest) {
          const oldestDate = new Date(
            result.stats.timeRange.oldest
          ).toISOString();
          const newestDate = new Date(
            result.stats.timeRange.newest
          ).toISOString();
          responseText += `- Time range: ${oldestDate} to ${newestDate}\n`;
        }
        responseText += "\n";
      }

      if (args.level || args.search || args.timeOffset || args.limit) {
        responseText += `🔧 **Applied Filters**:\n`;
        if (args.level) responseText += `- Level: ${args.level}\n`;
        if (args.search) responseText += `- Search: "${args.search}"\n`;
        if (args.timeOffset)
          responseText += `- Time Offset: ${args.timeOffset} seconds ago\n`;
        if (args.limit) responseText += `- Limit: ${args.limit} entries\n`;
        responseText += "\n";
      }

      if (result.formatted && result.logs?.length > 0) {
        responseText += `📝 **Console Messages**:\n\n`;
        responseText += result.formatted;
      } else {
        responseText += `ℹ️ No console messages found matching the specified criteria.`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Console inspection failed:", errorMessage);

      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to inspect browser console: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

(async () => {
  try {
    // Attempt initial server discovery
    console.error("Attempting initial server discovery on startup...");
    await discoverServer();
    if (serverDiscovered) {
      console.error(
        `Successfully discovered server at ${discoveredHost}:${discoveredPort}`
      );
    } else {
      console.error(
        "Initial server discovery failed. Will try again when tools are used."
      );
    }

    const transport = new StdioServerTransport();

    // Ensure stdout is only used for JSON messages
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any, encoding?: any, callback?: any) => {
      // Only allow JSON messages to pass through
      if (typeof chunk === "string" && !chunk.startsWith("{")) {
        return true; // Silently skip non-JSON messages
      }
      return originalStdoutWrite(chunk, encoding, callback);
    };

    await server.connect(transport);
  } catch (error) {
    console.error("Failed to initialize MCP server:", error);
    process.exit(1);
  }
})();
