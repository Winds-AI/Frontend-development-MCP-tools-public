// background/url-tracking.js
import { validateServerIdentity } from "../common/serverIdentity.js";

export const tabUrls = new Map();

export function installUrlTracking() {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      tabUrls.set(tabId, changeInfo.url);
      updateServerWithUrl(tabId, changeInfo.url, "tab_url_change");
    }
    if (changeInfo.status === "complete") {
      if (tab.url) {
        tabUrls.set(tabId, tab.url);
        updateServerWithUrl(tabId, tab.url, "page_complete");
      }
      retestConnectionOnRefresh(tabId);
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    const tabId = activeInfo.tabId;
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab && tab.url) {
        tabUrls.set(tabId, tab.url);
        updateServerWithUrl(tabId, tab.url, "tab_activated");
      }
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabUrls.delete(tabId);
  });
}

export async function getCurrentTabUrl(tabId) {
  try {
    if (tabUrls.has(tabId)) {
      return tabUrls.get(tabId);
    }
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url) {
      tabUrls.set(tabId, tab.url);
      return tab.url;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      const activeUrl = tabs[0].url;
      tabUrls.set(tabId, activeUrl);
      return activeUrl;
    }
    return null;
  } catch (_) {
    return null;
  }
}

export async function updateServerWithUrl(
  tabId,
  url,
  source = "background_update"
) {
  if (!url) return;
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    const maxRetries = 5;
    let retryCount = 0;
    let success = false;
    let backoffDelay = 500;
    while (retryCount < maxRetries && !success) {
      try {
        await validateServerIdentity(settings.serverHost, settings.serverPort);
        const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/current-url`;
        const response = await fetch(serverUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, tabId, timestamp: Date.now(), source }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          success = true;
        } else {
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise((r) => setTimeout(r, backoffDelay));
            backoffDelay = Math.min(backoffDelay * 2, 5000);
          }
        }
      } catch (_) {
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise((r) => setTimeout(r, backoffDelay));
          backoffDelay = Math.min(backoffDelay * 2, 5000);
        }
      }
    }
  });
}

async function retestConnectionOnRefresh(tabId) {
  chrome.storage.local.get(["browserConnectorSettings"], async (result) => {
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };
    const isConnected = await validateServerIdentity(
      settings.serverHost,
      settings.serverPort
    );
    chrome.runtime.sendMessage(
      { type: "CONNECTION_STATUS_UPDATE", isConnected, tabId },
      () => {}
    );
    chrome.runtime.sendMessage(
      {
        type: "INITIATE_AUTO_DISCOVERY",
        reason: "page_refresh",
        tabId,
        forceRestart: true,
      },
      () => {}
    );
  });
}
