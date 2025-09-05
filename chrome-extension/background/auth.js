// background/auth.js
// Implements retrieval of auth tokens from cookies/localStorage/sessionStorage

import { getCurrentTabUrl, tabUrls } from "./url-tracking.js";

export async function handleRetrieveAuthToken(message, sendResponse) {
  const targetTabId = message.tabId || chrome.devtools?.inspectedWindow?.tabId;
  const storageType = message.storageType;
  const tokenKey = message.tokenKey;
  const origin = message.origin;

  if (!storageType || !tokenKey) {
    sendResponse({ success: false, error: "Missing storageType or tokenKey" });
    return true;
  }

  const respond = (ok, payload) => {
    if (ok) sendResponse({ success: true, token: payload });
    else sendResponse({ success: false, error: payload });
  };

  try {
    if (storageType === "cookies") {
      const query = {};
      if (origin) query.url = origin;
      const ensureUrl = async () => {
        if (query.url) return query.url;
        const url = await getCurrentTabUrl(targetTabId);
        return url || undefined;
      };
      (async () => {
        const url = await ensureUrl();
        if (!url) {
          respond(false, "Unable to resolve URL for cookie lookup");
          return;
        }
        chrome.cookies.get({ url, name: tokenKey }, (cookie) => {
          if (chrome.runtime.lastError) {
            respond(false, chrome.runtime.lastError.message);
            return;
          }
          if (cookie && cookie.value) respond(true, cookie.value);
          else respond(false, "Cookie not found");
        });
      })();
      return true;
    }

    const executeInTab = (tabId) =>
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: "MAIN",
          func: (type, key) => {
            try {
              if (type === "localStorage") {
                return { ok: true, value: window.localStorage.getItem(key) };
              }
              if (type === "sessionStorage") {
                return { ok: true, value: window.sessionStorage.getItem(key) };
              }
              return { ok: false, error: "Unsupported storageType" };
            } catch (e) {
              return { ok: false, error: e?.message || "Storage access error" };
            }
          },
          args: [storageType, tokenKey],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            respond(false, chrome.runtime.lastError.message);
            return;
          }
          try {
            const first = Array.isArray(results) ? results[0] : results;
            const r = first && first.result ? first.result : first;
            if (
              r &&
              r.ok &&
              typeof r.value === "string" &&
              r.value.length > 0
            ) {
              respond(true, r.value);
            } else {
              respond(false, r?.error || "Token not found");
            }
          } catch (e) {
            respond(false, e?.message || "Failed to parse result");
          }
        }
      );

    if (origin) {
      chrome.tabs.query({}, (tabs) => {
        const match = (tabs || []).find((t) => {
          try {
            const u = new URL(t.url || "");
            const want = new URL(origin);
            return u.origin === want.origin;
          } catch {
            return false;
          }
        });
        if (match && match.id) {
          executeInTab(match.id);
        } else if (targetTabId) {
          executeInTab(targetTabId);
        } else {
          respond(false, "No matching tab for provided origin");
        }
      });
      return true;
    }

    if (!targetTabId) {
      respond(false, "No target tab ID available");
      return true;
    }

    executeInTab(targetTabId);
    return true;
  } catch (e) {
    respond(false, e?.message || "Unexpected error");
    return true;
  }
}

// tabUrls is imported from url-tracking
