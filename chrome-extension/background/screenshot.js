// background/screenshot.js

import { validateServerIdentity } from "../common/serverIdentity.js";

export function registerScreenshotHandler() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CAPTURE_SCREENSHOT" && message.tabId) {
      chrome.storage.local.get(["browserConnectorSettings"], (result) => {
        const settings = result.browserConnectorSettings || {
          serverHost: "localhost",
          serverPort: 3025,
        };
        validateServerIdentity(settings.serverHost, settings.serverPort)
          .then((isValid) => {
            if (!isValid) {
              sendResponse({
                success: false,
                error:
                  "Not connected to a valid browser tools server. Please check your connection settings.",
              });
              return;
            }
            captureAndSendScreenshot(message, settings, sendResponse);
          })
          .catch(() => {
            // Proceed but warn
            captureAndSendScreenshot(message, settings, sendResponse);
          });
      });
      return true;
    }
  });
}

function captureAndSendScreenshot(message, settings, sendResponse) {
  chrome.tabs.get(message.tabId, (tab) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    chrome.windows.getAll({ populate: true }, (windows) => {
      const targetWindow = windows.find((w) =>
        w.tabs.some((t) => t.id === message.tabId)
      );
      if (!targetWindow) {
        sendResponse({
          success: false,
          error: "Could not find window containing the inspected tab",
        });
        return;
      }
      chrome.tabs.captureVisibleTab(
        targetWindow.id,
        { format: "png" },
        (dataUrl) => {
          if (
            chrome.runtime.lastError &&
            !chrome.runtime.lastError.message.includes("devtools://")
          ) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/screenshot`;
          fetch(serverUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: dataUrl,
              path: message.screenshotPath,
              url: tab.url,
            }),
          })
            .then((response) => response.json())
            .then((result) => {
              if (result.error) {
                sendResponse({ success: false, error: result.error });
              } else {
                sendResponse({
                  success: true,
                  path: result.path,
                  title: tab.title || "Current Tab",
                });
              }
            })
            .catch((error) => {
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
