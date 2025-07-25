import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { z } from "zod";

// Helper constants for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project configuration management
interface ProjectConfig {
  SWAGGER_URL?: string;
  AUTH_ORIGIN?: string;
  AUTH_STORAGE_TYPE?: string;
  AUTH_TOKEN_KEY?: string;
  API_BASE_URL?: string;
  SCREENSHOT_STORAGE_PATH?: string;
  BROWSER_TOOLS_HOST?: string;
  BROWSER_TOOLS_PORT?: string;
}

interface Project {
  name: string;
  description: string;
  config: ProjectConfig;
}

interface ProjectsConfig {
  projects: Record<string, Project>;
  defaultProject: string;
}

// Load project configuration
function loadProjectConfig(): ProjectsConfig | null {
  try {
    const configPath = path.join(__dirname, "..", "projects.json");
    console.log(`[DEBUG] Looking for projects.json at: ${configPath}`);
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf8");
      console.log(`[DEBUG] Successfully loaded projects.json`);
      return JSON.parse(configData);
    } else {
      console.log(`[DEBUG] projects.json not found at: ${configPath}`);
    }
  } catch (error) {
    console.error("Error loading projects config:", error);
  }
  return null;
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
    if (project && project.config[key as keyof ProjectConfig]) {
      return project.config[key as keyof ProjectConfig];
    }
  }

  // Finally return default value
  return defaultValue;
}

// Log active project information
function logActiveProject() {
  const projectsConfig = loadProjectConfig();
  if (projectsConfig) {
    const activeProject =
      process.env.ACTIVE_PROJECT || projectsConfig.defaultProject;
    const project = projectsConfig.projects[activeProject];
    if (project) {
      console.log(`🚀 Active Project: ${project.name} (${activeProject})`);
      console.log(`📝 Description: ${project.description}`);
      console.log(
        `🌐 API Base URL: ${project.config.API_BASE_URL || "Not set"}`
      );
      console.log(`📋 Swagger URL: ${project.config.SWAGGER_URL || "Not set"}`);
    } else {
      console.log(`❌ Project '${activeProject}' not found in config`);
    }
  } else {
    console.log(
      "📋 Using environment variables (no projects.json config found)"
    );
  }
}

// Create the MCP server
const server = new McpServer({
  name: "Frontend-development-tools",
  version: "1.2.0",
});

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
server.tool(
  "inspectBrowserNetworkActivity",
  "Logs recent browser network requests (like DevTools Network tab). **User should trigger relevant API calls in browser first.** Use for debugging data fetching or API call sequences.",
  {
    urlFilter: z
      .string()
      .describe(
        "Substring or pattern to filter request URLs. **Tips**: Use partial matches (e.g., 'activity' finds both 'get-activity-list' and 'activity-categories'). Try both singular/plural forms if first search returns empty results."
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
        "Specific details to retrieve for matching requests. Note: 'timestamp' is always included by default for chronological ordering."
      ),
    timeStart: z
      .number()
      .optional()
      .describe(
        "Optional Unix timestamp (in milliseconds) to filter requests that occurred after this time"
      ),
    timeEnd: z
      .number()
      .optional()
      .describe(
        "Optional Unix timestamp (in milliseconds) to filter requests that occurred before this time"
      ),
    orderBy: z
      .enum(["timestamp", "url"])
      .optional()
      .default("timestamp")
      .describe("Order results by this field"),
    orderDirection: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .describe("Order direction, newest first (desc) or oldest first (asc)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of results to return"),
  },
  async (params) => {
    const {
      urlFilter,
      details,
      timeStart,
      timeEnd,
      orderBy,
      orderDirection,
      limit,
    } = params;

    // Build query parameters with includeTimestamp=true to always include timestamps but only for filtered results
    const queryString = `?urlFilter=${encodeURIComponent(
      urlFilter
    )}&details=${details.join(",")}&includeTimestamp=true${timeStart ? `&timeStart=${timeStart}` : ""
      }${timeEnd ? `&timeEnd=${timeEnd}` : ""}&orderBy=${orderBy || "timestamp"
      }&orderDirection=${orderDirection || "desc"}&limit=${limit || 20}`;
    const targetUrl = `http://${discoveredHost}:${discoveredPort}/network-request-details${queryString}`;

    console.log(`MCP Tool: Fetching network details from ${targetUrl}`);

    return await withServerConnection(async () => {
      try {
        const response = await fetch(targetUrl);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Server returned ${response.status}: ${errorText || response.statusText
            }`
          );
        }

        const json = await response.json(); // Expecting an array of results from the server
        const results = json;

        // If no results found, provide search suggestions
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
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
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
        };
      }
    });
  }
);

// Tool 2: captureBrowserScreenshot
server.tool(
  "captureBrowserScreenshot",
  "Captures current browser tab. Returns image data directly **and** saves file. **Use for UI inspection, visual verification, or recursive UI improvement loops.**",
  { randomString: z.string().describe("any random string") },
  async () => {
    return await withServerConnection(async () => {
      try {
        const targetUrl = `http://${discoveredHost}:${discoveredPort}/capture-screenshot`;
        const requestPayload = {
          returnImageData: true, // Always return image data
          projectName: getConfigValue("PROJECT_NAME"), // Pass project name from environment
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
              text: `📁 Project: ${result.projectDirectory || "default-project"
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
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Error taking screenshot: ${result.error}`,
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
              text: `Failed to take screenshot: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
);

server.tool(
  "inspectSelectedElementCss",
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
        formattedContent += `**Element**: ${json.tagName}${json.id ? "#" + json.id : ""
          }${json.className
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
  "fetchLiveApiResponse",
  "Executes a live, authenticated API call to a known endpoint. **Use after `searchApiDocumentation` or for known endpoints** to get real server responses and verify data structures.",
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
    additionalHeaders: z
      .record(z.string())
      .optional()
      .describe("Additional headers to include in the request"),
  },
  async (params) => {
    return await withServerConnection(async () => {
      try {
        const {
          endpoint,
          method = "GET",
          requestBody,
          queryParams,
          additionalHeaders,
        } = params;

        // Check required environment variables or config
        const authOrigin = getConfigValue("AUTH_ORIGIN");
        const authStorageType = getConfigValue("AUTH_STORAGE_TYPE");
        const authTokenKey = getConfigValue("AUTH_TOKEN_KEY");
        const apiBaseUrl = getConfigValue("API_BASE_URL");

        if (!authOrigin || !authStorageType || !authTokenKey || !apiBaseUrl) {
          return {
            content: [
              {
                type: "text",
                text: "Missing required environment variables. Please set: AUTH_ORIGIN, AUTH_STORAGE_TYPE, AUTH_TOKEN_KEY, and API_BASE_URL",
              },
            ],
            isError: true,
          };
        }

        const targetUrl = `http://${discoveredHost}:${discoveredPort}/authenticated-api-call`;
        const requestPayload = {
          // Auth configuration from environment
          authConfig: {
            origin: authOrigin,
            storageType: authStorageType,
            tokenKey: authTokenKey,
          },
          // API call configuration
          apiCall: {
            baseUrl: apiBaseUrl,
            endpoint: endpoint,
            method: method,
            requestBody: requestBody,
            queryParams: queryParams,
            additionalHeaders: additionalHeaders || {},
          },
          options: {
            includeResponseDetails: true,
          },
        };

        console.log(
          `[DEBUG] executeAuthenticatedApiCall - Making request to: ${endpoint}`
        );
        console.log(`[DEBUG] executeAuthenticatedApiCall - Method: ${method}`);
        console.log(
          `[DEBUG] executeAuthenticatedApiCall - Auth origin: ${authOrigin}`
        );

        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to execute authenticated API call: ${result.error || "Unknown error"
                  }`,
              },
            ],
            isError: true,
          };
        }

        // Build a structured JSON response
        const jsonResponse: any = {
          success: true,
          method,
          url: `${apiBaseUrl}${endpoint}`,
        };
        if (result.details) {
          jsonResponse.responseDetails = {
            status: result.details.status,
            statusText: result.details.statusText,
            headers: result.details.headers,
            timing: result.details.timing,
          };
        }
        jsonResponse.data = result.data;

        return {
          content: [
            {
              type: "json",
              data: jsonResponse,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing authenticated API call: ${error instanceof Error ? error.message : String(error)
                }`,
            },
          ],
          isError: true,
        };
      }
    });
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
// HELPER FUNCTIONS FOR SIMPLIFIED SEARCH API DOCUMENTATION
// =============================================

/**
 * Extracts simplified parameter information for GET requests
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
      suggestion: `fetchLiveApiResponse(endpoint: "${path}", method: "${upperMethod}"${upperMethod !== "GET" ? ", requestBody: <your_payload>" : ""
        })`,
    };
  }

  return endpoint;
}

// =============================================
// SIMPLIFIED SEARCH API DOCUMENTATION TOOL
// =============================================

server.tool(
  "searchApiDocumentation",
  "Simplified API documentation search that returns only essential information: API paths, parameters (GET), request payloads (POST/PUT/PATCH/DELETE), and success responses. If response schemas are missing, provides guidance to use fetchLiveApiResponse for live testing.",
  {
    searchTerms: z
      .array(z.string())
      .describe(
        "Keywords to search for in API paths, summaries, descriptions, or tags. Use specific terms like 'activity', 'user', 'admin', etc."
      ),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .optional()
      .describe("Filter results by HTTP method (optional)"),
    maxResults: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum number of endpoints to return (default: 10)"),
  },
  async (params) => {
    try {
      const { searchTerms, method, maxResults } = params;

      const swaggerSource = getConfigValue("SWAGGER_URL");
      if (!swaggerSource) {
        throw new Error(
          "SWAGGER_URL environment variable or config is not set"
        );
      }

      const swaggerDoc = await loadSwaggerDoc(swaggerSource);
      const endpoints: any[] = [];

      // Remove duplicates from search terms
      const uniqueSearchTerms = [...new Set(searchTerms)];

      if (!swaggerDoc.paths) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  endpoints: [],
                  message: "No API paths found in documentation",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Search through all paths and methods
      for (const [path, pathItem] of Object.entries(swaggerDoc.paths)) {
        for (const [httpMethod, operation] of Object.entries(
          pathItem as object
        )) {
          // Skip non-HTTP method entries
          if (httpMethod === "parameters") continue;

          const op = operation as any;
          const upperMethod = httpMethod.toUpperCase();

          // Apply method filter if specified
          if (method && upperMethod !== method.toUpperCase()) continue;

          // Check if any search term matches
          const matchesTerm = uniqueSearchTerms.some((term) => {
            const searchRegex = new RegExp(
              term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              "i"
            );
            return (
              searchRegex.test(path) ||
              (op.summary && searchRegex.test(op.summary)) ||
              (op.description && searchRegex.test(op.description)) ||
              (op.tags &&
                op.tags.some((tag: string) => searchRegex.test(tag))) ||
              (op.operationId && searchRegex.test(op.operationId))
            );
          });

          if (matchesTerm) {
            const simplifiedEndpoint = createSimplifiedEndpoint(
              path,
              httpMethod,
              op
            );
            endpoints.push(simplifiedEndpoint);

            // Stop if we've reached max results
            if (endpoints.length >= (maxResults || 10)) {
              break;
            }
          }
        }

        if (endpoints.length >= (maxResults || 10)) {
          break;
        }
      }

      // Count endpoints that need live testing
      const needsLiveTesting = endpoints.filter(
        (e) => e.recommendedAction
      ).length;

      const result = {
        summary: {
          totalFound: endpoints.length,
          searchTerms: uniqueSearchTerms,
          methodFilter: method || "all",
          endpointsNeedingLiveTest: needsLiveTesting,
        },
        endpoints,
        usage: {
          nextSteps: [
            "For endpoints with 'recommendedAction', use fetchLiveApiResponse to get actual response structure",
            "Use the path, method, and requestBody/parameters to make API calls",
            "For complex nested objects, refer to the flattened schema provided",
          ],
        },
      };

      if (needsLiveTesting > 0) {
        result.usage.nextSteps.unshift(
          `${needsLiveTesting} endpoint(s) missing response schemas - use fetchLiveApiResponse for these`
        );
      }

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

server.tool(
  "navigateBrowserTab",
  "Navigates the current active browser tab to a new URL. **Use for automated testing, navigation flows, or redirecting to specific pages.** Requires Chrome extension to be connected.",
  {
    url: z
      .string()
      .describe(
        "The URL to navigate to (must be a valid URL including protocol, e.g., 'https://example.com')"
      ),
    tabId: z
      .number()
      .optional()
      .describe(
        "Optional: Specific tab ID to navigate. If not provided, navigates the currently active tab."
      ),
  },
  async (params) => {
    return await withServerConnection(async () => {
      try {
        const { url, tabId } = params;

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
          tabId: tabId,
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
                text: `Failed to navigate browser tab: ${result.error || "Unknown error"
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
