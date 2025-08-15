// devtools.js

// Store settings with defaults
let settings = {
  logLimit: 50,
  queryLimit: 30000,
  stringSizeLimit: 500,
  maxLogSize: 20000,
  showRequestHeaders: false,
  showResponseHeaders: false,
  serverHost: "localhost", // Default server host
  serverPort: 3025, // Default server port
  allowAutoPaste: false, // Default auto-paste setting
};

// Keep track of debugger state
let isDebuggerAttached = false;
let attachDebuggerRetries = 0;
const currentTabId = chrome.devtools.inspectedWindow.tabId;
const MAX_ATTACH_RETRIES = 3;
const ATTACH_RETRY_DELAY = 1000; // 1 second

// Load saved settings on startup
chrome.storage.local.get(["browserConnectorSettings"], (result) => {
  if (result.browserConnectorSettings) {
    settings = { ...settings, ...result.browserConnectorSettings };
  }
});

// Listen for settings updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SETTINGS_UPDATED") {
    settings = message.settings;

    // If server settings changed and we have a WebSocket, reconnect
    if (
      ws &&
      (message.settings.serverHost !== settings.serverHost ||
        message.settings.serverPort !== settings.serverPort)
    ) {
      console.log("Server settings changed, reconnecting WebSocket...");
      setupWebSocket();
    }
  }

  // Handle connection status updates from page refreshes
  if (message.type === "CONNECTION_STATUS_UPDATE") {
    console.log(
      `DevTools received connection status update: ${
        message.isConnected ? "Connected" : "Disconnected"
      }`
    );

    // If connection is lost, try to reestablish WebSocket only if we had a previous connection
    if (!message.isConnected && ws) {
      console.log(
        "Connection lost after page refresh, will attempt to reconnect WebSocket"
      );

      // Only reconnect if we actually have a WebSocket that might be stale
      if (
        ws &&
        (ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING)
      ) {
        console.log("WebSocket is already closed or closing, will reconnect");
        setupWebSocket();
      }
    }
  }

  // Handle auto-discovery requests after page refreshes
  if (message.type === "INITIATE_AUTO_DISCOVERY") {
    console.log(
      `DevTools initiating WebSocket reconnect after page refresh (reason: ${message.reason})`
    );

    // For page refreshes with forceRestart, we should always reconnect if our current connection is not working
    if (
      (message.reason === "page_refresh" || message.forceRestart === true) &&
      (!ws || ws.readyState !== WebSocket.OPEN)
    ) {
      console.log(
        "Page refreshed and WebSocket not open - forcing reconnection"
      );

      // Close existing WebSocket if any
      if (ws) {
        console.log("Closing existing WebSocket due to page refresh");
        intentionalClosure = true; // Mark as intentional to prevent auto-reconnect
        try {
          ws.close();
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
        ws = null;
        intentionalClosure = false; // Reset flag
      }

      // Clear any pending reconnect timeouts
      if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
        wsReconnectTimeout = null;
      }

      // Try to reestablish the WebSocket connection
      setupWebSocket();
    }
  }
});

// Utility to recursively truncate strings in any data structure
function truncateStringsInData(data, maxLength, depth = 0, path = "") {
  // Add depth limit to prevent circular references
  if (depth > 100) {
    console.warn("Max depth exceeded at path:", path);
    return "[MAX_DEPTH_EXCEEDED]";
  }

  console.log(`Processing at path: ${path}, type:`, typeof data);

  if (typeof data === "string") {
    if (data.length > maxLength) {
      console.log(
        `Truncating string at path ${path} from ${data.length} to ${maxLength}`
      );
      return data.substring(0, maxLength) + "... (truncated)";
    }
    return data;
  }

  if (Array.isArray(data)) {
    console.log(`Processing array at path ${path} with length:`, data.length);
    return data.map((item, index) =>
      truncateStringsInData(item, maxLength, depth + 1, `${path}[${index}]`)
    );
  }

  if (typeof data === "object" && data !== null) {
    console.log(
      `Processing object at path ${path} with keys:`,
      Object.keys(data)
    );
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = truncateStringsInData(
          value,
          maxLength,
          depth + 1,
          path ? `${path}.${key}` : key
        );
      } catch (e) {
        console.error(`Error processing key ${key} at path ${path}:`, e);
        result[key] = "[ERROR_PROCESSING]";
      }
    }
    return result;
  }

  return data;
}

// Helper to calculate the size of an object
function calculateObjectSize(obj) {
  return JSON.stringify(obj).length;
}

// Helper to process array of objects with size limit
function processArrayWithSizeLimit(array, maxTotalSize, processFunc) {
  let currentSize = 0;
  const result = [];

  for (const item of array) {
    // Process the item first
    const processedItem = processFunc(item);
    const itemSize = calculateObjectSize(processedItem);

    // Check if adding this item would exceed the limit
    if (currentSize + itemSize > maxTotalSize) {
      console.log(
        `Reached size limit (${currentSize}/${maxTotalSize}), truncating array`
      );
      break;
    }

    // Add item and update size
    result.push(processedItem);
    currentSize += itemSize;
    console.log(
      `Added item of size ${itemSize}, total size now: ${currentSize}`
    );
  }

  return result;
}

// Modified processJsonString to handle arrays with size limit
function processJsonString(jsonString, maxLength) {
  console.log("Processing string of length:", jsonString?.length);
  try {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
      console.log(
        "Successfully parsed as JSON, structure:",
        JSON.stringify(Object.keys(parsed))
      );
    } catch (e) {
      console.log("Not valid JSON, treating as string");
      return truncateStringsInData(jsonString, maxLength, 0, "root");
    }

    // If it's an array, process with size limit
    if (Array.isArray(parsed)) {
      console.log("Processing array of objects with size limit");
      const processed = processArrayWithSizeLimit(
        parsed,
        settings.maxLogSize,
        (item) => truncateStringsInData(item, maxLength, 0, "root")
      );
      const result = JSON.stringify(processed);
      console.log(
        `Processed array: ${parsed.length} -> ${processed.length} items`
      );
      return result;
    }

    // Otherwise process as before
    const processed = truncateStringsInData(parsed, maxLength, 0, "root");
    const result = JSON.stringify(processed);
    console.log("Processed JSON string length:", result.length);
    return result;
  } catch (e) {
    console.error("Error in processJsonString:", e);
    return jsonString.substring(0, maxLength) + "... (truncated)";
  }
}

// Helper to send logs to browser-connector
async function sendToBrowserConnector(logData) {
  if (!logData) {
    console.error("No log data provided to sendToBrowserConnector");
    return;
  }

  // First, ensure we're connecting to the right server
  if (!(await validateServerIdentity())) {
    console.error(
      "Cannot send logs: Not connected to a valid browser tools server"
    );
    return;
  }

  console.log("Sending log data to browser connector:", {
    type: logData.type,
    timestamp: logData.timestamp,
  });

  // Process any string fields that might contain JSON
  const processedData = { ...logData };

  if (logData.type === "network-request") {
    console.log("Processing network request");
    if (processedData.requestBody) {
      console.log(
        "Request body size before:",
        processedData.requestBody.length
      );
      processedData.requestBody = processJsonString(
        processedData.requestBody,
        settings.stringSizeLimit
      );
      console.log("Request body size after:", processedData.requestBody.length);
    }
    if (processedData.responseBody) {
      console.log(
        "Response body size before:",
        processedData.responseBody.length
      );
      processedData.responseBody = processJsonString(
        processedData.responseBody,
        settings.stringSizeLimit
      );
      console.log(
        "Response body size after:",
        processedData.responseBody.length
      );
    }
  } else if (
    logData.type === "console-log" ||
    logData.type === "console-error"
  ) {
    console.log("Processing console message");
    if (processedData.message) {
      console.log("Message size before:", processedData.message.length);
      processedData.message = processJsonString(
        processedData.message,
        settings.stringSizeLimit
      );
      console.log("Message size after:", processedData.message.length);
    }
  }

  // Add settings to the request
  const payload = {
    data: {
      ...processedData,
      timestamp: Date.now(),
    },
    settings: {
      logLimit: settings.logLimit,
      queryLimit: settings.queryLimit,
      showRequestHeaders: settings.showRequestHeaders,
      showResponseHeaders: settings.showResponseHeaders,
    },
  };

  const finalPayloadSize = JSON.stringify(payload).length;
  console.log("Final payload size:", finalPayloadSize);

  if (finalPayloadSize > 1000000) {
    console.warn("Warning: Large payload detected:", finalPayloadSize);
    console.warn(
      "Payload preview:",
      JSON.stringify(payload).substring(0, 1000) + "..."
    );
  }

  const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/extension-log`;
  console.log(`Sending log to ${serverUrl}`);

  fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("Log sent successfully:", data);
    })
    .catch((error) => {
      console.error("Error sending log:", error);
    });
}

// Validate server identity
async function validateServerIdentity() {
  try {
    console.log(
      `Validating server identity at ${settings.serverHost}:${settings.serverPort}...`
    );

    // Use fetch with a timeout to prevent long-hanging requests
    const response = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/.identity`,
      {
        signal: AbortSignal.timeout(3000), // 3 second timeout
      }
    );

    if (!response.ok) {
      console.error(
        `Server identity validation failed: HTTP ${response.status}`
      );

      // Notify about the connection failure
      chrome.runtime.sendMessage({
        type: "SERVER_VALIDATION_FAILED",
        reason: "http_error",
        status: response.status,
        serverHost: settings.serverHost,
        serverPort: settings.serverPort,
      });

      return false;
    }

    const identity = await response.json();

    // Validate signature
    if (identity.signature !== "mcp-browser-connector-24x7") {
      console.error("Server identity validation failed: Invalid signature");

      // Notify about the invalid signature
      chrome.runtime.sendMessage({
        type: "SERVER_VALIDATION_FAILED",
        reason: "invalid_signature",
        serverHost: settings.serverHost,
        serverPort: settings.serverPort,
      });

      return false;
    }

    console.log(
      `Server identity confirmed: ${identity.name} v${identity.version}`
    );

    // Notify about successful validation
    chrome.runtime.sendMessage({
      type: "SERVER_VALIDATION_SUCCESS",
      serverInfo: identity,
      serverHost: settings.serverHost,
      serverPort: settings.serverPort,
    });

    return true;
  } catch (error) {
    console.error("Server identity validation failed:", error);

    // Notify about the connection error
    chrome.runtime.sendMessage({
      type: "SERVER_VALIDATION_FAILED",
      reason: "connection_error",
      error: error.message,
      serverHost: settings.serverHost,
      serverPort: settings.serverPort,
    });

    return false;
  }
}

// Function to clear logs on the server
function wipeLogs() {
  console.log("Wiping all logs...");

  const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/wipelogs`;
  console.log(`Sending wipe request to ${serverUrl}`);

  fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("Logs wiped successfully:", data);
    })
    .catch((error) => {
      console.error("Error wiping logs:", error);
    });
}

// Listen for page refreshes
chrome.devtools.network.onNavigated.addListener((url) => {
  console.log("Page navigated/refreshed - wiping logs");
  wipeLogs();

  // Send the new URL to the server
  if (ws && ws.readyState === WebSocket.OPEN && url) {
    console.log(
      "Chrome Extension: Sending page-navigated event with URL:",
      url
    );
    ws.send(
      JSON.stringify({
        type: "page-navigated",
        url: url,
        tabId: chrome.devtools.inspectedWindow.tabId,
        timestamp: Date.now(),
      })
    );
  }
});

// 1) Listen for network requests
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (request._resourceType === "xhr" || request._resourceType === "fetch") {
    request.getContent((responseBody) => {
      const entry = {
        type: "network-request",
        url: request.request.url,
        method: request.request.method,
        status: request.response.status,
        requestHeaders: request.request.headers,
        responseHeaders: request.response.headers,
        requestBody: request.request.postData?.text ?? "",
        responseBody: responseBody ?? "",
      };
      sendToBrowserConnector(entry);
    });
  }
});

// Helper function to attach debugger
async function attachDebugger() {
  // First check if we're already attached to this tab
  chrome.debugger.getTargets((targets) => {
    const isAlreadyAttached = targets.some(
      (target) => target.tabId === currentTabId && target.attached
    );

    if (isAlreadyAttached) {
      console.log("Found existing debugger attachment, detaching first...");
      // Force detach first to ensure clean state
      chrome.debugger.detach({ tabId: currentTabId }, () => {
        // Ignore any errors during detach
        if (chrome.runtime.lastError) {
          console.log("Error during forced detach:", chrome.runtime.lastError);
        }
        // Now proceed with fresh attachment
        performAttach();
      });
    } else {
      // No existing attachment, proceed directly
      performAttach();
    }
  });
}

function performAttach() {
  console.log("Performing debugger attachment to tab:", currentTabId);
  chrome.debugger.attach({ tabId: currentTabId }, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to attach debugger:", chrome.runtime.lastError);
      isDebuggerAttached = false;
      return;
    }

    isDebuggerAttached = true;
    console.log("Debugger successfully attached");

    // Add the event listener when attaching
    chrome.debugger.onEvent.addListener(consoleMessageListener);

    chrome.debugger.sendCommand(
      { tabId: currentTabId },
      "Runtime.enable",
      {},
      () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to enable runtime:", chrome.runtime.lastError);
          return;
        }
        console.log("Runtime API successfully enabled");
      }
    );
  });
}

// Helper function to detach debugger
function detachDebugger() {
  // Remove the event listener first
  chrome.debugger.onEvent.removeListener(consoleMessageListener);

  // Check if debugger is actually attached before trying to detach
  chrome.debugger.getTargets((targets) => {
    const isStillAttached = targets.some(
      (target) => target.tabId === currentTabId && target.attached
    );

    if (!isStillAttached) {
      console.log("Debugger already detached");
      isDebuggerAttached = false;
      return;
    }

    chrome.debugger.detach({ tabId: currentTabId }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "Warning during debugger detach:",
          chrome.runtime.lastError
        );
      }
      isDebuggerAttached = false;
      console.log("Debugger detached");
    });
  });
}

// Move the console message listener outside the panel creation
const consoleMessageListener = (source, method, params) => {
  // Only process events for our tab
  if (source.tabId !== currentTabId) {
    return;
  }

  if (method === "Runtime.exceptionThrown") {
    const entry = {
      type: "console-error",
      message:
        params.exceptionDetails.exception?.description ||
        JSON.stringify(params.exceptionDetails),
      level: "error",
      timestamp: Date.now(),
    };
    console.log("Sending runtime exception:", entry);
    sendToBrowserConnector(entry);
  }

  if (method === "Runtime.consoleAPICalled") {
    // Process all arguments from the console call
    let formattedMessage = "";
    const args = params.args || [];

    // Extract all arguments and combine them
    if (args.length > 0) {
      // Try to build a meaningful representation of all arguments
      try {
        formattedMessage = args
          .map((arg) => {
            // Handle different types of arguments
            if (arg.type === "string") {
              return arg.value;
            } else if (arg.type === "object" && arg.preview) {
              // For objects, include their preview or description
              return JSON.stringify(arg.preview);
            } else if (arg.description) {
              // Some objects have descriptions
              return arg.description;
            } else {
              // Fallback for other types
              return arg.value || arg.description || JSON.stringify(arg);
            }
          })
          .join(" ");
      } catch (e) {
        // Fallback if processing fails
        console.error("Failed to process console arguments:", e);
        formattedMessage =
          args[0]?.value || "Unable to process console arguments";
      }
    }

    // Map console types to our message types
    let messageType = "console-log"; // default
    if (params.type === "error") {
      messageType = "console-error";
    } else if (params.type === "warning" || params.type === "warn") {
      messageType = "console-warn";
    }

    const entry = {
      type: messageType,
      level: params.type,
      message: formattedMessage,
      timestamp: Date.now(),
    };
    console.log("Sending console entry:", entry);
    sendToBrowserConnector(entry);
  }
};

// 2) Use DevTools Protocol to capture console logs
chrome.devtools.panels.create("BrowserToolsMCP", "", "panel.html", (panel) => {
  // Initial attach - we'll keep the debugger attached as long as DevTools is open
  attachDebugger();

  // Handle panel showing
  panel.onShown.addListener((panelWindow) => {
    if (!isDebuggerAttached) {
      attachDebugger();
    }
  });
});

// Clean up when DevTools closes
window.addEventListener("unload", () => {
  // Detach debugger
  detachDebugger();

  // Set intentional closure flag before closing
  intentionalClosure = true;

  if (ws) {
    try {
      ws.close();
    } catch (e) {
      console.error("Error closing WebSocket during unload:", e);
    }
    ws = null;
  }

  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
});

// Function to capture and send element data - Enhanced for AI debugging
function captureAndSendElement() {
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      const el = $0;  // $0 is the currently selected element in DevTools
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(el);
      
      // Helper function to get computed style properties
      function getComputedStyles() {
        const importantStyles = [
          'display', 'position', 'top', 'right', 'bottom', 'left',
          'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
          'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
          'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          'border', 'border-width', 'border-style', 'border-color',
          'background', 'background-color', 'background-image',
          'color', 'font-size', 'font-family', 'font-weight', 'line-height',
          'text-align', 'text-decoration', 'text-transform',
          'overflow', 'overflow-x', 'overflow-y', 'white-space',
          'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
          'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order',
          'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-area',
          'z-index', 'opacity', 'visibility', 'cursor', 'pointer-events',
          'transform', 'transition', 'animation'
        ];
        
        const styles = {};
        importantStyles.forEach(prop => {
          const value = computedStyle.getPropertyValue(prop);
          if (value && value !== 'auto' && value !== 'normal') {
            styles[prop] = value;
          }
        });
        return styles;
      }

      // Get parent context
      function getParentContext() {
        const parent = el.parentElement;
        if (!parent) return null;
        
        const parentStyle = window.getComputedStyle(parent);
        return {
          tagName: parent.tagName,
          className: parent.className,
          id: parent.id,
          display: parentStyle.display,
          flexDirection: parentStyle.flexDirection,
          gridTemplateColumns: parentStyle.gridTemplateColumns,
          isFlexContainer: parentStyle.display.includes('flex'),
          isGridContainer: parentStyle.display.includes('grid'),
          childrenCount: parent.children.length,
          position: parentStyle.position
        };
      }

      // Get children context
      function getChildrenContext() {
        const children = Array.from(el.children);
        if (children.length === 0) return [];
        
        return children.slice(0, 5).map(child => {
          const childStyle = window.getComputedStyle(child);
          return {
            tagName: child.tagName,
            className: child.className,
            id: child.id,
            display: childStyle.display,
            position: childStyle.position,
            textContent: child.textContent ? child.textContent.substring(0, 50) : ''
          };
        });
      }

      // Get accessibility information
      function getAccessibilityInfo() {
        return {
          role: el.getAttribute('role') || el.getAttribute('aria-role'),
          label: el.getAttribute('aria-label'),
          labelledBy: el.getAttribute('aria-labelledby'),
          describedBy: el.getAttribute('aria-describedby'),
          hidden: el.getAttribute('aria-hidden'),
          expanded: el.getAttribute('aria-expanded'),
          selected: el.getAttribute('aria-selected'),
          disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled'),
          tabIndex: el.tabIndex,
          focusable: el.tabIndex >= 0 || ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A'].includes(el.tagName)
        };
      }

      // Detect layout issues and provide suggestions
      function getLayoutDebugInfo() {
        const issues = [];
        const suggestions = [];
        
        // Check for common layout issues
        if (rect.width === 0 || rect.height === 0) {
          issues.push('Element has zero dimensions');
          suggestions.push('Check if element has content or explicit dimensions');
        }
        
        if (computedStyle.overflow === 'hidden' && el.scrollHeight > el.clientHeight) {
          issues.push('Content is being clipped by overflow:hidden');
          suggestions.push('Consider using overflow:auto or increasing height');
        }
        
        if (computedStyle.position === 'absolute' && (!computedStyle.top || !computedStyle.left)) {
          issues.push('Absolutely positioned element missing position values');
          suggestions.push('Add top/left/right/bottom values for absolute positioning');
        }
        
        // Check flex issues
        const parent = el.parentElement;
        if (parent && window.getComputedStyle(parent).display.includes('flex')) {
          const flexGrow = computedStyle.flexGrow;
          const flexShrink = computedStyle.flexShrink;
          
          if (flexGrow === '0' && flexShrink === '1' && rect.width < 50) {
            issues.push('Flex item might be shrinking too much');
            suggestions.push('Consider setting flex-shrink: 0 or min-width');
          }
        }
        
        // Check for Material-UI specific issues
        if (el.className && el.className.includes('Mui')) {
          if (computedStyle.boxSizing !== 'border-box') {
            suggestions.push('Material-UI components work best with box-sizing: border-box');
          }
        }

        return {
          issues,
          suggestions,
          isFlexItem: parent && window.getComputedStyle(parent).display.includes('flex'),
          isGridItem: parent && window.getComputedStyle(parent).display.includes('grid'),
          isFlexContainer: computedStyle.display.includes('flex'),
          isGridContainer: computedStyle.display.includes('grid'),
          hasOverflow: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
          isVisible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== 'hidden',
          isPositioned: ['absolute', 'relative', 'fixed', 'sticky'].includes(computedStyle.position)
        };
      }

      // Get interactive state information
      function getInteractiveState() {
        return {
          isHovered: el.matches(':hover'),
          isFocused: el.matches(':focus'),
          isActive: el.matches(':active'),
          isDisabled: el.matches(':disabled'),
          hasEventListeners: getEventListeners ? !!getEventListeners(el) : false,
          isClickable: ['BUTTON', 'A', 'INPUT'].includes(el.tagName) || 
                      el.hasAttribute('onclick') || 
                      computedStyle.cursor === 'pointer'
        };
      }

      // Get Material-UI specific context
      function getMaterialUIContext() {
        if (!el.className || !el.className.includes('Mui')) return null;
        
        const muiClasses = el.className.split(' ').filter(cls => cls.includes('Mui') || cls.includes('css-'));
        const component = muiClasses.find(cls => cls.startsWith('Mui'))?.replace('Mui', '').split('-')[0];
        
        return {
          component,
          classes: muiClasses,
          variant: el.getAttribute('variant') || 'default',
          size: el.getAttribute('size') || 'medium',
          color: el.getAttribute('color') || 'default'
        };
      }

      return {
        // Basic element info
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        textContent: el.textContent?.substring(0, 200), // Increased limit
        innerHTML: el.innerHTML.substring(0, 1000), // Increased limit
        
        // Enhanced attribute info
        attributes: Array.from(el.attributes).map(attr => ({
          name: attr.name,
          value: attr.value
        })),
        
        // Dimensional info
        dimensions: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        },
        
        // NEW: Computed styles for debugging
        computedStyles: getComputedStyles(),
        
        // NEW: Contextual relationships
        parentContext: getParentContext(),
        childrenContext: getChildrenContext(),
        
        // NEW: Accessibility information
        accessibility: getAccessibilityInfo(),
        
        // NEW: Layout debugging info
        layoutDebug: getLayoutDebugInfo(),
        
        // NEW: Interactive state
        interactiveState: getInteractiveState(),
        
        // NEW: Framework-specific context
        materialUI: getMaterialUIContext(),
        
        // NEW: Performance hints
        performanceHints: {
          hasLargeImage: Array.from(el.querySelectorAll('img')).some(img => 
            img.naturalWidth > 2000 || img.naturalHeight > 2000
          ),
          deepNesting: el.querySelectorAll('*').length > 50,
          manyChildren: el.children.length > 20
        },
        
        // Enhanced metadata
        metadata: {
          timestamp: Date.now(),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          url: window.location.href,
          selector: (() => {
            // Generate a unique CSS selector for this element
            let selector = el.tagName.toLowerCase();
            if (el.id) selector += '#' + el.id;
            if (el.className) selector += '.' + el.className.split(' ').join('.');
            return selector;
          })()
        }
      };
    })()`,
    (result, isException) => {
      if (isException || !result) return;

      console.log("Enhanced element captured:", {
        tagName: result.tagName,
        issues: result.layoutDebug?.issues,
        isFlexItem: result.layoutDebug?.isFlexItem,
      });

      // Send to browser connector
      sendToBrowserConnector({
        type: "selected-element",
        timestamp: Date.now(),
        element: result,
      });
    }
  );
}

// Listen for element selection in the Elements panel
chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
  captureAndSendElement();
});

// WebSocket connection management - optimized for autonomous operation
let ws = null;
let wsReconnectTimeout = null;
let heartbeatInterval = null;
const WS_RECONNECT_DELAY = 3000; // Reduced to 3 seconds for faster autonomous recovery
const HEARTBEAT_INTERVAL = 25000; // Match server interval
const MAX_RECONNECT_ATTEMPTS = 10; // Increased for autonomous reliability
let reconnectAttempts = 0;
// Add a flag to track if we need to reconnect after identity validation
let reconnectAfterValidation = false;
// Track if we're intentionally closing the connection
let intentionalClosure = false;

// Function to send a heartbeat to keep the WebSocket connection alive
function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log("Chrome Extension: Sending WebSocket heartbeat");
    ws.send(
      JSON.stringify({
        type: "heartbeat",
        timestamp: Date.now(),
        tabId: currentTabId,
      })
    );
  } else if (ws) {
    console.warn(
      `Chrome Extension: Cannot send heartbeat - WebSocket state: ${ws.readyState}`
    );
  }
}

async function setupWebSocket() {
  // Clear any pending timeouts
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Close existing WebSocket if any
  if (ws) {
    // Set flag to indicate this is an intentional closure
    intentionalClosure = true;
    try {
      ws.close();
    } catch (e) {
      console.error("Error closing existing WebSocket:", e);
    }
    ws = null;
    intentionalClosure = false; // Reset flag
  }

  // Validate server identity before connecting
  console.log("Validating server identity before WebSocket connection...");
  const isValid = await validateServerIdentity();

  if (!isValid) {
    console.error(
      "Cannot establish WebSocket: Not connected to a valid browser tools server"
    );
    // Set flag to indicate we need to reconnect after a page refresh check
    reconnectAfterValidation = true;

    // Try again after delay
    wsReconnectTimeout = setTimeout(() => {
      console.log("Attempting to reconnect WebSocket after validation failure");
      setupWebSocket();
    }, WS_RECONNECT_DELAY);
    return;
  }

  // Reset reconnect flag since validation succeeded
  reconnectAfterValidation = false;

  const wsUrl = `ws://${settings.serverHost}:${settings.serverPort}/extension-ws`;
  console.log(`Connecting to WebSocket at ${wsUrl}`);

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`Chrome Extension: WebSocket connected to ${wsUrl}`);

      // Reset reconnection attempts on successful connection
      reconnectAttempts = 0;

      // Start heartbeat to keep connection alive
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

      // Notify that connection is successful
      chrome.runtime.sendMessage({
        type: "WEBSOCKET_CONNECTED",
        serverHost: settings.serverHost,
        serverPort: settings.serverPort,
      });

      // Send the current URL to the server right after connection
      // This ensures the server has the URL even if no navigation occurs
      chrome.runtime.sendMessage(
        {
          type: "GET_CURRENT_URL",
          tabId: chrome.devtools.inspectedWindow.tabId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Chrome Extension: Error getting URL from background on connection:",
              chrome.runtime.lastError
            );

            // If normal method fails, try fallback to chrome.tabs API directly
            tryFallbackGetUrl();
            return;
          }

          if (response && response.url) {
            console.log(
              "Chrome Extension: Sending initial URL to server:",
              response.url
            );

            // Send the URL to the server via the background script
            chrome.runtime.sendMessage({
              type: "UPDATE_SERVER_URL",
              tabId: chrome.devtools.inspectedWindow.tabId,
              url: response.url,
              source: "initial_connection",
            });
          } else {
            // If response exists but no URL, try fallback
            tryFallbackGetUrl();
          }
        }
      );

      // Fallback method to get URL directly
      function tryFallbackGetUrl() {
        console.log("Chrome Extension: Trying fallback method to get URL");

        // Try to get the URL directly using the tabs API
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Chrome Extension: Fallback URL retrieval failed:",
              chrome.runtime.lastError
            );
            return;
          }

          if (tabs && tabs.length > 0 && tabs[0].url) {
            console.log(
              "Chrome Extension: Got URL via fallback method:",
              tabs[0].url
            );

            // Send the URL to the server
            chrome.runtime.sendMessage({
              type: "UPDATE_SERVER_URL",
              tabId: chrome.devtools.inspectedWindow.tabId,
              url: tabs[0].url,
              source: "fallback_method",
            });
          } else {
            console.warn(
              "Chrome Extension: Could not retrieve URL through fallback method"
            );
          }
        });
      }
    };

    ws.onerror = (error) => {
      console.error(`Chrome Extension: WebSocket error for ${wsUrl}:`, error);
    };
    ws.onclose = (event) => {
      console.log(`Chrome Extension: WebSocket closed for ${wsUrl}:`, event);

      // Stop heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      // Don't reconnect if this was an intentional closure
      if (intentionalClosure) {
        console.log(
          "Chrome Extension: Intentional WebSocket closure, not reconnecting"
        );
        return;
      }

      // Enhanced reconnection logic for autonomous operation
      const isAbnormalClosure = !(event.code === 1000 || event.code === 1001);

      // Check if this was an abnormal closure or if we need to reconnect after validation
      if (isAbnormalClosure || reconnectAfterValidation) {
        reconnectAttempts++;

        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            WS_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts - 1),
            30000
          ); // Exponential backoff, cap at 30s

          console.log(
            `Chrome Extension: Will attempt to reconnect WebSocket (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms (closure code: ${event.code})`
          );

          // Try to reconnect after delay
          wsReconnectTimeout = setTimeout(() => {
            console.log(
              `Chrome Extension: Attempting to reconnect WebSocket to ${wsUrl} (attempt ${reconnectAttempts})`
            );
            setupWebSocket();
          }, delay);
        } else {
          console.error(
            `Chrome Extension: Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`
          );
          // Reset attempts for potential future manual reconnection
          reconnectAttempts = 0;
        }
      } else {
        console.log(
          `Chrome Extension: Normal WebSocket closure, not reconnecting automatically`
        );
        // Reset attempts for clean state
        reconnectAttempts = 0;
      }
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // Don't log heartbeat responses to reduce noise
        if (message.type !== "heartbeat-response") {
          console.log("Chrome Extension: Received WebSocket message:", message);

          if (message.type === "server-shutdown") {
            console.log("Chrome Extension: Received server shutdown signal");
            // Clear any reconnection attempts
            if (wsReconnectTimeout) {
              clearTimeout(wsReconnectTimeout);
              wsReconnectTimeout = null;
            }
            // Close the connection gracefully
            ws.close(1000, "Server shutting down");
            return;
          }
        }

        if (message.type === "heartbeat") {
          // Enhanced heartbeat response for autonomous operation debugging
          console.log(
            `Chrome Extension: Received heartbeat from server (connectionId: ${
              message.connectionId || "unknown"
            })`
          );
          ws.send(
            JSON.stringify({
              type: "heartbeat-response",
              timestamp: Date.now(),
              connectionId: message.connectionId,
            })
          );
        } else if (message.type === "heartbeat-response") {
          // Just a heartbeat response, no action needed
          // Uncomment the next line for debug purposes only
          // console.log("Chrome Extension: Received heartbeat response");
        } else if (message.type === "take-screenshot") {
          console.log("Chrome Extension: Taking screenshot...");
          console.log(
            "Chrome Extension: Inspected tab ID:",
            chrome.devtools.inspectedWindow.tabId
          );

          // Get the inspected tab information first
          chrome.tabs.get(
            chrome.devtools.inspectedWindow.tabId,
            (inspectedTab) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Chrome Extension: Error getting inspected tab:",
                  chrome.runtime.lastError
                );
                ws.send(
                  JSON.stringify({
                    type: "screenshot-error",
                    error:
                      "Failed to get inspected tab: " +
                      chrome.runtime.lastError.message,
                    requestId: message.requestId,
                  })
                );
                return;
              }

              // Check if it's a DevTools URL
              if (
                inspectedTab.url &&
                inspectedTab.url.startsWith("devtools://")
              ) {
                console.warn(
                  "Chrome Extension: Cannot capture screenshots of DevTools pages"
                );
                ws.send(
                  JSON.stringify({
                    type: "screenshot-error",
                    error:
                      "Cannot capture screenshots of DevTools pages. Please navigate to a regular webpage to take screenshots.",
                    requestId: message.requestId,
                  })
                );
                return;
              }

              // Make sure the target tab is active and focused
              chrome.tabs.update(
                chrome.devtools.inspectedWindow.tabId,
                { active: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.warn(
                      "Chrome Extension: Could not activate target tab:",
                      chrome.runtime.lastError
                    );
                    // Continue anyway, might still work
                  }

                  // Get the window containing the inspected tab
                  chrome.windows.get(inspectedTab.windowId, (targetWindow) => {
                    if (chrome.runtime.lastError) {
                      console.error(
                        "Chrome Extension: Error getting target window:",
                        chrome.runtime.lastError
                      );
                      ws.send(
                        JSON.stringify({
                          type: "screenshot-error",
                          error:
                            "Failed to get target window: " +
                            chrome.runtime.lastError.message,
                          requestId: message.requestId,
                        })
                      );
                      return;
                    }

                    // Focus the target window to ensure it's visible
                    chrome.windows.update(
                      targetWindow.id,
                      { focused: true },
                      () => {
                        if (chrome.runtime.lastError) {
                          console.warn(
                            "Chrome Extension: Could not focus target window:",
                            chrome.runtime.lastError
                          );
                          // Continue anyway
                        }

                        // Small delay to ensure window is focused and rendered
                        setTimeout(() => {
                          // Capture screenshot of the target window (where the inspected tab is)
                          chrome.tabs.captureVisibleTab(
                            targetWindow.id,
                            { format: "png" },
                            (dataUrl) => {
                              if (chrome.runtime.lastError) {
                                console.error(
                                  "Chrome Extension: Screenshot capture failed:",
                                  chrome.runtime.lastError
                                );
                                ws.send(
                                  JSON.stringify({
                                    type: "screenshot-error",
                                    error: chrome.runtime.lastError.message,
                                    requestId: message.requestId,
                                  })
                                );
                                return;
                              }

                              console.log(
                                "Chrome Extension: Screenshot captured successfully"
                              );
                              // Just send the screenshot data, let the server handle paths
                              const response = {
                                type: "screenshot-data",
                                data: dataUrl,
                                requestId: message.requestId,
                              };

                              console.log(
                                "Chrome Extension: Sending screenshot data response",
                                {
                                  ...response,
                                  data: "[base64 data]",
                                }
                              );

                              ws.send(JSON.stringify(response));
                            }
                          );
                        }, 500); // 500ms delay to ensure proper rendering
                      }
                    );
                  });
                }
              );
            }
          );
        } else if (message.type === "get-current-url") {
          console.log("Chrome Extension: Received request for current URL");

          // Get the current URL from the background script instead of inspectedWindow.eval
          let retryCount = 0;
          const maxRetries = 2;

          const requestCurrentUrl = () => {
            chrome.runtime.sendMessage(
              {
                type: "GET_CURRENT_URL",
                tabId: chrome.devtools.inspectedWindow.tabId,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Chrome Extension: Error getting URL from background:",
                    chrome.runtime.lastError
                  );

                  // Retry logic
                  if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(
                      `Retrying URL request (${retryCount}/${maxRetries})...`
                    );
                    setTimeout(requestCurrentUrl, 500); // Wait 500ms before retrying
                    return;
                  }

                  ws.send(
                    JSON.stringify({
                      type: "current-url-response",
                      url: null,
                      tabId: chrome.devtools.inspectedWindow.tabId,
                      error:
                        "Failed to get URL from background: " +
                        chrome.runtime.lastError.message,
                      requestId: message.requestId,
                    })
                  );
                  return;
                }

                if (response && response.success && response.url) {
                  console.log(
                    "Chrome Extension: Got URL from background:",
                    response.url
                  );
                  ws.send(
                    JSON.stringify({
                      type: "current-url-response",
                      url: response.url,
                      tabId: chrome.devtools.inspectedWindow.tabId,
                      requestId: message.requestId,
                    })
                  );
                } else {
                  console.error(
                    "Chrome Extension: Invalid URL response from background:",
                    response
                  );

                  // Last resort - try to get URL directly from the tab
                  chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                      const url = tabs && tabs[0] && tabs[0].url;
                      console.log(
                        "Chrome Extension: Got URL directly from tab:",
                        url
                      );

                      ws.send(
                        JSON.stringify({
                          type: "current-url-response",
                          url: url || null,
                          tabId: chrome.devtools.inspectedWindow.tabId,
                          error:
                            response?.error ||
                            "Failed to get URL from background",
                          requestId: message.requestId,
                        })
                      );
                    }
                  );
                }
              }
            );
          };
          requestCurrentUrl();
        } else if (message.type === "RETRIEVE_AUTH_TOKEN") {
          console.log(
            "Chrome Extension: Received auth token retrieval request:",
            message
          );

          // Forward the request to the background script
          chrome.runtime.sendMessage(
            {
              type: "RETRIEVE_AUTH_TOKEN",
              origin: message.origin,
              storageType: message.storageType,
              tokenKey: message.tokenKey,
              // Provide the inspected tabId for targeted execution
              tabId: chrome.devtools.inspectedWindow.tabId,
              // Preserve correlation id for roundtrip
              requestId: message.requestId,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Chrome Extension: Error getting auth token from background:",
                  chrome.runtime.lastError
                );

                // Send error response back to server
                ws.send(
                  JSON.stringify({
                    type: "RETRIEVE_AUTH_TOKEN_RESPONSE",
                    requestId: message.requestId,
                    error:
                      "Failed to communicate with background script: " +
                      chrome.runtime.lastError.message,
                  })
                );
                return;
              }

              if (response && response.token) {
                console.log(
                  "Chrome Extension: Auth token retrieved successfully"
                );
                // Send success response back to server
                ws.send(
                  JSON.stringify({
                    type: "RETRIEVE_AUTH_TOKEN_RESPONSE",
                    requestId: message.requestId,
                    token: response.token,
                  })
                );
              } else {
                console.log(
                  "Chrome Extension: Auth token retrieval failed:",
                  response?.error
                );
                // Send error response back to server
                ws.send(
                  JSON.stringify({
                    type: "RETRIEVE_AUTH_TOKEN_RESPONSE",
                    requestId: message.requestId,
                    error:
                      response?.error || "Unknown error retrieving auth token",
                  })
                );
              }
            }
          );
        } else if (message.type === "navigate-tab") {
          console.log(
            "Chrome Extension: Received navigation request:",
            message
          );

          // Forward the request to the background script
          chrome.runtime.sendMessage(
            {
              type: "NAVIGATE_TAB",
              url: message.url,
              tabId: message.tabId || chrome.devtools.inspectedWindow.tabId,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Chrome Extension: Error navigating tab:",
                  chrome.runtime.lastError
                );

                // Send error response back to server
                ws.send(
                  JSON.stringify({
                    type: "navigation-response",
                    requestId: message.requestId,
                    success: false,
                    error:
                      "Failed to communicate with background script: " +
                      chrome.runtime.lastError.message,
                  })
                );
                return;
              }

              if (response && response.success) {
                console.log(
                  "Chrome Extension: Navigation successful to:",
                  message.url
                );
                // Send success response back to server
                ws.send(
                  JSON.stringify({
                    type: "navigation-response",
                    requestId: message.requestId,
                    success: true,
                    url: message.url,
                  })
                );
              } else {
                console.log(
                  "Chrome Extension: Navigation failed:",
                  response?.error
                );
                // Send error response back to server
                ws.send(
                  JSON.stringify({
                    type: "navigation-response",
                    requestId: message.requestId,
                    success: false,
                    error: response?.error || "Unknown error during navigation",
                  })
                );
              }
            }
          );
        } else if (message.type === "dom-action") {
          try {
            chrome.runtime.sendMessage(
              {
                type: "PERFORM_DOM_ACTION",
                tabId: chrome.devtools.inspectedWindow.tabId,
                requestId: message.requestId,
                payload: message.payload,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  ws.send(
                    JSON.stringify({
                      type: "dom-action-response",
                      requestId: message.requestId,
                      success: false,
                      error:
                        "Failed to communicate with background script: " +
                        chrome.runtime.lastError.message,
                    })
                  );
                  return;
                }
                const r = response || {};
                ws.send(
                  JSON.stringify({
                    type: "dom-action-response",
                    requestId: message.requestId,
                    success: !!r.success,
                    details: r.details,
                    error: r.error,
                  })
                );
              }
            );
          } catch (e) {
            ws.send(
              JSON.stringify({
                type: "dom-action-response",
                requestId: message.requestId,
                success: false,
                error: e?.message || "Unknown error performing DOM action",
              })
            );
          }
        }
      } catch (error) {
        console.error(
          "Chrome Extension: Error processing WebSocket message:",
          error
        );
      }
    };
  } catch (error) {
    console.error("Error creating WebSocket:", error);
    // Try again after delay
    wsReconnectTimeout = setTimeout(setupWebSocket, WS_RECONNECT_DELAY);
  }
}

// Initialize WebSocket connection when DevTools opens
setupWebSocket();

// Clean up WebSocket when DevTools closes
window.addEventListener("unload", () => {
  if (ws) {
    ws.close();
  }
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
  }
});
