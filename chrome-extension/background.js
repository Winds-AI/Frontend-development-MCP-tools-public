// Listen for messages from the devtools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle auth token retrieval
  if (message.type === "RETRIEVE_AUTH_TOKEN") {
    retrieveAuthToken(message, sender, sendResponse);
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "GET_CURRENT_URL" && message.tabId) {
    getCurrentTabUrl(message.tabId)
      .then((url) => {
        sendResponse({ success: true, url: url });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  // Handle explicit request to update the server with the URL
  if (message.type === "UPDATE_SERVER_URL" && message.tabId && message.url) {
    console.log(
      `Background: Received request to update server with URL for tab ${message.tabId}: ${message.url}`
    );
    updateServerWithUrl(
      message.tabId,
      message.url,
      message.source || "explicit_update"
    )
      .then(() => {
        if (sendResponse) sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Background: Error updating server with URL:", error);
        if (sendResponse)
          sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "CAPTURE_SCREENSHOT" && message.tabId) {
    // First get the server settings
    chrome.storage.local.get(["browserConnectorSettings"], (result) => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };

      // Validate server identity first
      validateServerIdentity(settings.serverHost, settings.serverPort)
        .then((isValid) => {
          if (!isValid) {
            console.error(
              "Cannot capture screenshot: Not connected to a valid browser tools server"
            );
            sendResponse({
              success: false,
              error:
                "Not connected to a valid browser tools server. Please check your connection settings.",
            });
            return;
          }

          // Continue with screenshot capture
          captureAndSendScreenshot(message, settings, sendResponse);
        })
        .catch((error) => {
          console.error("Error validating server:", error);
          sendResponse({
            success: false,
            error: "Failed to validate server identity: " + error.message,
          });
        });
    });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "NAVIGATE_TAB" && message.url) {
    console.log("Background: Received navigation request:", message);

    const targetTabId =
      message.tabId || chrome.devtools?.inspectedWindow?.tabId;

    if (!targetTabId) {
      console.error("Background: No target tab ID available for navigation");
      sendResponse({ success: false, error: "No target tab ID available" });
      return true;
    }

    // Navigate the tab to the specified URL
    chrome.tabs.update(targetTabId, { url: message.url }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Background: Navigation failed:",
          chrome.runtime.lastError
        );
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        console.log("Background: Navigation successful to:", message.url);
        // Update our cache with the new URL
        tabUrls.set(targetTabId, message.url);
        sendResponse({ success: true, url: message.url });
      }
    });
    return true; // Required to use sendResponse asynchronously
  }
});

// Validate server identity
async function validateServerIdentity(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/.identity`, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      console.error(`Invalid server response: ${response.status}`);
      return false;
    }

    const identity = await response.json();

    // Validate the server signature
    if (identity.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating server identity:", error);
    return false;
  }
}

// Track URLs for each tab
const tabUrls = new Map();

// Function to get the current URL for a tab
async function getCurrentTabUrl(tabId) {
  try {
    console.log("Background: Getting URL for tab", tabId);

    // First check if we have it cached
    if (tabUrls.has(tabId)) {
      const cachedUrl = tabUrls.get(tabId);
      console.log("Background: Found cached URL:", cachedUrl);
      return cachedUrl;
    }

    // Otherwise get it from the tab
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        // Cache the URL
        tabUrls.set(tabId, tab.url);
        console.log("Background: Got URL from tab:", tab.url);
        return tab.url;
      } else {
        console.log("Background: Tab exists but no URL found");
      }
    } catch (tabError) {
      console.error("Background: Error getting tab:", tabError);
    }

    // If we can't get the tab directly, try querying for active tabs
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const activeUrl = tabs[0].url;
        console.log("Background: Got URL from active tab:", activeUrl);
        // Cache this URL as well
        tabUrls.set(tabId, activeUrl);
        return activeUrl;
      }
    } catch (queryError) {
      console.error("Background: Error querying tabs:", queryError);
    }

    console.log("Background: Could not find URL for tab", tabId);
    return null;
  } catch (error) {
    console.error("Background: Error getting tab URL:", error);
    return null;
  }
}

// Listen for tab updates to detect page refreshes and URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track URL changes
  if (changeInfo.url) {
    console.log(`URL changed in tab ${tabId} to ${changeInfo.url}`);
    tabUrls.set(tabId, changeInfo.url);

    // Send URL update to server if possible
    updateServerWithUrl(tabId, changeInfo.url, "tab_url_change");
  }

  // Check if this is a page refresh (status becoming "complete")
  if (changeInfo.status === "complete") {
    // Update URL in our cache
    if (tab.url) {
      tabUrls.set(tabId, tab.url);
      // Send URL update to server if possible
      updateServerWithUrl(tabId, tab.url, "page_complete");
    }

    retestConnectionOnRefresh(tabId);
  }
});

// Listen for tab activation (switching between tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  console.log(`Tab activated: ${tabId}`);

  // Get the URL of the newly activated tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab info:", chrome.runtime.lastError);
      return;
    }

    if (tab && tab.url) {
      console.log(`Active tab changed to ${tab.url}`);

      // Update our cache
      tabUrls.set(tabId, tab.url);

      // Send URL update to server
      updateServerWithUrl(tabId, tab.url, "tab_activated");
    }
  });
});

// Function to update the server with the current URL
async function updateServerWithUrl(tabId, url, source = "background_update") {
  if (!url) {
    console.error("Cannot update server with empty URL");
    return;
  }

  console.log(`Updating server with URL for tab ${tabId}: ${url}`);

  // Get the saved settings
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Enhanced retry logic for autonomous operation reliability
    const maxRetries = 5; // Increased for autonomous workflows
    let retryCount = 0;
    let success = false;
    let backoffDelay = 500; // Start with 500ms, will increase exponentially

    while (retryCount < maxRetries && !success) {
      try {
        // Validate server connection before attempting URL update
        const isServerValid = await validateServerIdentity(
          settings.serverHost,
          settings.serverPort
        );

        if (!isServerValid) {
          console.warn(
            `Server validation failed on attempt ${
              retryCount + 1
            }, trying anyway...`
          );
        }

        // Send the URL to the server
        const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/current-url`;
        console.log(
          `Attempt ${
            retryCount + 1
          }/${maxRetries} to update server with URL: ${url} (source: ${source})`
        );

        const response = await fetch(serverUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: url,
            tabId: tabId,
            timestamp: Date.now(),
            source: source,
          }),
          // Longer timeout for autonomous operation stability
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const responseData = await response.json();
          console.log(
            `Successfully updated server with URL: ${url} (attempt ${
              retryCount + 1
            })`,
            responseData
          );
          success = true;
        } else {
          console.error(
            `Server returned error: ${response.status} ${
              response.statusText
            } (attempt ${retryCount + 1})`
          );
          retryCount++;

          // Exponential backoff for better autonomous recovery
          if (retryCount < maxRetries) {
            console.log(`Waiting ${backoffDelay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, backoffDelay));
            backoffDelay = Math.min(backoffDelay * 2, 5000); // Cap at 5 seconds
          }
        }
      } catch (error) {
        console.error(
          `Error updating server with URL (attempt ${retryCount + 1}): ${
            error.message
          }`
        );
        retryCount++;

        // Exponential backoff for network errors too
        if (retryCount < maxRetries) {
          console.log(
            `Network error, waiting ${backoffDelay}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          backoffDelay = Math.min(backoffDelay * 2, 5000);
        }
      }
    }

    if (!success) {
      console.error(
        `Failed to update server with URL after ${maxRetries} attempts`
      );
    }
  });
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrls.delete(tabId);
});

// Function to retest connection when a page is refreshed
async function retestConnectionOnRefresh(tabId) {
  console.log(`Page refreshed in tab ${tabId}, retesting connection...`);

  // Get the saved settings
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // Test the connection with the last known host and port
    const isConnected = await validateServerIdentity(
      settings.serverHost,
      settings.serverPort
    );

    // Notify all devtools instances about the connection status
    chrome.runtime.sendMessage({
      type: "CONNECTION_STATUS_UPDATE",
      isConnected: isConnected,
      tabId: tabId,
    });

    // Always notify for page refresh, whether connected or not
    // This ensures any ongoing discovery is cancelled and restarted
    try {
      console.log(
        `Background: Attempting to send INITIATE_AUTO_DISCOVERY (reason: page_refresh, tabId: ${tabId})`
      );
      chrome.runtime.sendMessage({
        type: "INITIATE_AUTO_DISCOVERY",
        reason: "page_refresh",
        tabId: tabId,
        forceRestart: true, // Add a flag to indicate this should force restart any ongoing processes
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Receiving end does not exist")
      ) {
        console.log(
          `Background: Suppressed 'Receiving end does not exist' for INITIATE_AUTO_DISCOVERY (devtools likely not ready yet)`
        );
      } else {
        // Re-throw other unexpected errors
        console.error(
          "Background: Unexpected error sending INITIATE_AUTO_DISCOVERY:",
          error
        );
      }
    }

    if (!isConnected) {
      console.log(
        "Connection test failed after page refresh, initiating auto-discovery..."
      );
    } else {
      console.log("Connection test successful after page refresh");
    }
  });
}

// Function to retrieve auth token from a tab
async function retrieveAuthToken(request, sender, sendResponse) {
  const { origin, storageType, tokenKey } = request;

  try {
    let authToken = null;
    console.log("Retrieving auth token:", { origin, storageType, tokenKey });

    // Find a tab that matches the requested origin
    // Make the pattern match more flexible by supporting both http and https
    const urlPattern = origin.startsWith("http")
      ? `${origin}/*`
      : `*://${origin}/*`;
    console.log("Looking for tabs matching pattern:", urlPattern);

    const tabs = await chrome.tabs.query({ url: urlPattern });
    console.log("Found tabs:", tabs);

    if (tabs.length === 0) {
      console.log("No matching tabs found");
      sendResponse({ error: `No tabs found for origin: ${origin}` });
      return;
    }

    const tabId = tabs[0].id;
    console.log("Found matching tab:", tabId);

    if (storageType === "cookie") {
      console.log("Reading cookies...");
      // Try both HTTP and HTTPS
      const protocols = origin.startsWith("http")
        ? [origin]
        : [`https://${origin}`, `http://${origin}`];
      let cookies = [];

      for (const url of protocols) {
        console.log(`Trying to get cookies for ${url}`);
        const protocolCookies = await chrome.cookies.getAll({ url });
        cookies = cookies.concat(protocolCookies);
      }

      console.log(`Found ${cookies.length} total cookies`);
      console.log(
        "Available cookies:",
        cookies.map((c) => c.name)
      );

      const authCookie = cookies.find((cookie) => cookie.name === tokenKey);
      console.log("Auth cookie found:", authCookie);

      if (authCookie) {
        authToken = authCookie.value;
      }
    } else if (
      storageType === "localStorage" ||
      storageType === "sessionStorage"
    ) {
      console.log(`Reading from ${storageType}...`);
      try {
        const storage =
          storageType === "localStorage" ? "localStorage" : "sessionStorage";
        const result = await chrome.scripting.executeScript({
          target: { tabId, allFrames: false },
          func: (key, storageType) => {
            try {
              console.log(`Accessing ${storageType}`);
              const storage = window[storageType];
              console.log("Storage access successful");

              const value = storage.getItem(key);
              console.log(`Value for key "${key}":`, value);

              // Get all available keys for debugging
              const allKeys = Object.keys(storage);
              console.log(`Available keys in ${storageType}:`, allKeys);

              return { success: true, value, availableKeys: allKeys };
            } catch (error) {
              console.error(`Error accessing ${storageType}:`, error);
              return { success: false, error: error.message };
            }
          },
          args: [tokenKey, storage],
        });

        console.log("Script execution result:", result);

        if (result && result[0]) {
          const { success, value, error, availableKeys } = result[0].result;
          if (success) {
            authToken = value;
            console.log(`Available keys in ${storageType}:`, availableKeys);
            if (value) {
              console.log("Token found in storage");
            } else {
              console.log("Token not found in storage");
            }
          } else if (error) {
            console.error("Error accessing storage:", error);
            sendResponse({ error: `Error accessing ${storageType}: ${error}` });
            return;
          }
        }
      } catch (scriptError) {
        console.error("Script execution error:", scriptError);
        sendResponse({
          error: `Failed to execute script in tab: ${scriptError.message}`,
        });
        return;
      }
    }

    if (authToken) {
      console.log("Token retrieved successfully:", authToken);
      sendResponse({ token: authToken });
    } else {
      console.log("Token not found");
      sendResponse({
        error: `Token with key '${tokenKey}' not found in ${storageType}`,
      });
    }
  } catch (error) {
    console.error("Error retrieving auth token:", error);
    sendResponse({ error: `Error retrieving auth token: ${error.message}` });
  }
}

// Function to capture and send screenshot
function captureAndSendScreenshot(message, settings, sendResponse) {
  // Get the inspected window's tab
  chrome.tabs.get(message.tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting tab:", chrome.runtime.lastError);
      sendResponse({
        success: false,
        error: chrome.runtime.lastError.message,
      });
      return;
    }

    // Get all windows to find the one containing our tab
    chrome.windows.getAll({ populate: true }, (windows) => {
      const targetWindow = windows.find((w) =>
        w.tabs.some((t) => t.id === message.tabId)
      );

      if (!targetWindow) {
        console.error("Could not find window containing the inspected tab");
        sendResponse({
          success: false,
          error: "Could not find window containing the inspected tab",
        });
        return;
      }

      // Capture screenshot of the window containing our tab
      chrome.tabs.captureVisibleTab(
        targetWindow.id,
        { format: "png" },
        (dataUrl) => {
          // Ignore DevTools panel capture error if it occurs
          if (
            chrome.runtime.lastError &&
            !chrome.runtime.lastError.message.includes("devtools://")
          ) {
            console.error(
              "Error capturing screenshot:",
              chrome.runtime.lastError
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          // Send screenshot data to browser connector using configured settings
          const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/screenshot`;
          console.log(`Sending screenshot to ${serverUrl}`);

          fetch(serverUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: dataUrl,
              path: message.screenshotPath,
              url: tab.url, // Added tab.url for filename generation
            }),
          })
            .then((response) => response.json())
            .then((result) => {
              if (result.error) {
                console.error("Error from server:", result.error);
                sendResponse({ success: false, error: result.error });
              } else {
                console.log("Screenshot saved successfully:", result.path);
                // Send success response even if DevTools capture failed
                sendResponse({
                  success: true,
                  path: result.path,
                  title: tab.title || "Current Tab",
                });
              }
            })
            .catch((error) => {
              console.error("Error sending screenshot data:", error);
              sendResponse({
                success: false,
                error: error.message || "Failed to save screenshot",
              });
            });
        }
      );
    });
  });
}
