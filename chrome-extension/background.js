import { validateServerIdentity } from "./common/serverIdentity.js";
import {
  handleRetrieveAuthToken,
  tabUrls as authTabUrls,
} from "./background/auth.js";
import { registerScreenshotHandler } from "./background/screenshot.js";
import {
  installUrlTracking,
  getCurrentTabUrl,
  updateServerWithUrl,
  tabUrls,
} from "./background/url-tracking.js";

// Listen for messages from the devtools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  // CAPTURE_SCREENSHOT handled via registerScreenshotHandler

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

  if (
    message.type === "PERFORM_DOM_ACTION" &&
    message.tabId &&
    message.payload
  ) {
    try {
      const { tabId, payload } = message;
      // Default to DOM-injection path using scripting API
      chrome.scripting.executeScript(
        {
          target: { tabId },
          world: "MAIN",
          func: performDomAction,
          args: [payload],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          try {
            const first = Array.isArray(results) ? results[0] : results;
            const value = first && first.result ? first.result : first;
            sendResponse(
              value || { success: false, error: "No result returned" }
            );
          } catch (e) {
            sendResponse({
              success: false,
              error: e?.message || "Failed to parse result",
            });
          }
        }
      );
      return true; // async sendResponse
    } catch (e) {
      sendResponse({ success: false, error: e?.message || "Unexpected error" });
      return true;
    }
  }

  if (message.type === "RETRIEVE_AUTH_TOKEN") {
    return handleRetrieveAuthToken(message, sendResponse);
  }
});

// In-page function executed via chrome.scripting.executeScript
function performDomAction(payload) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  };
  const isDisabled = (el) =>
    !!(el && (el.disabled || el.getAttribute("aria-disabled") === "true"));
  const hasPointerEvents = (el) => {
    const style = window.getComputedStyle(el);
    return style.pointerEvents !== "none";
  };
  const isCenterOnTop = (el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(cx, cy);
    return topEl && (topEl === el || el.contains(topEl));
  };
  const isScrollable = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY =
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight;
    const canScrollX =
      (overflowX === "auto" || overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth;
    return canScrollY || canScrollX;
  };
  const findPrimaryScrollContainer = () => {
    // Prefer explicit containers
    const candidates = [
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      document.querySelector("[data-scroll-container]"),
    ].filter(Boolean);
    for (const c of candidates) if (isScrollable(c)) return c;
    // Heuristic: pick visible element with largest (scrollHeight - clientHeight)
    let best = null;
    let bestDelta = 0;
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (!isVisible(el)) continue;
      const delta = Math.max(0, el.scrollHeight - el.clientHeight);
      if (delta > bestDelta && isScrollable(el)) {
        best = el;
        bestDelta = delta;
      }
    }
    return best || document.scrollingElement || document.documentElement;
  };
  const closestClickable = (el) => {
    if (!el) return null;
    const selector = [
      "button",
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
      '[role="button"]',
      "a[href]",
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="menuitemcheckbox"]',
      '[role="menuitemradio"]',
      '[role="option"]',
      '[role="switch"]',
      "[onclick]",
      "[tabindex]",
    ].join(", ");
    const node = el.closest(selector) || el;
    return node;
  };
  const getAccessibleName = (el) => {
    if (!el) return "";
    return (
      el.getAttribute("aria-label") ||
      (el.getAttribute("aria-labelledby")
        ? document.getElementById(el.getAttribute("aria-labelledby"))
            ?.textContent || ""
        : "") ||
      el.innerText ||
      el.textContent ||
      ""
    ).trim();
  };
  const byText = (text, exact) => {
    const hay = exact ? [text] : [text, text.trim()];
    // Prefer interactive candidates first (broad set)
    const interactive = document.querySelectorAll(
      "button, input[type='button'], input[type='submit'], input[type='reset'], [role='button'], a[href], [role='link'], [role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='option'], [role='switch'], [onclick], [tabindex]"
    );
    for (const el of interactive) {
      const name = getAccessibleName(el);
      if (!name || isDisabled(el) || !isVisible(el)) continue;
      if (hay.some((t) => t && name.includes(t))) return el;
    }
    // Fallback: any element containing text
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const name = getAccessibleName(el);
      if (!name) continue;
      if (hay.some((t) => t && name.includes(t))) return el;
    }
    return null;
  };
  const byLabel = (labelText, exact) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((l) =>
      exact
        ? l.textContent === labelText
        : (l.textContent || "").includes(labelText)
    );
    if (!match) return null;
    const forId = match.getAttribute("for");
    if (forId) return document.getElementById(forId);
    const input = match.querySelector("input,textarea,select");
    return input || null;
  };
  const byRole = (role, name, exact) => {
    const qAll = Array.from(document.querySelectorAll("*"));
    let candidates = [];
    const matchRole = (el, role) => {
      if (el.getAttribute("role") === role) return true;
      if (role === "button" && el.tagName === "BUTTON") return true;
      if (role === "link" && el.tagName === "A" && el.hasAttribute("href"))
        return true;
      return false;
    };
    candidates = qAll.filter((el) => matchRole(el, role));
    // Prefer enabled candidates
    candidates = candidates.filter((el) => !isDisabled(el) && isVisible(el));
    if (role === "tab") {
      // Prefer tabs that are not already selected
      const unselected = candidates.filter(
        (el) => el.getAttribute("aria-selected") !== "true"
      );
      if (unselected.length) candidates = unselected;
    }
    if (!name) return candidates[0] || null;
    const pick = candidates.find((el) => {
      const txt = getAccessibleName(el);
      return exact ? txt === name : txt.includes(name);
    });
    return pick || null;
  };
  const byTestId = (value) =>
    document.querySelector(`[data-testid="${CSS.escape(value)}"]`);
  const byPlaceholder = (value, exact) =>
    Array.from(document.querySelectorAll("input,textarea")).find((el) => {
      const ph = el.getAttribute("placeholder") || "";
      return exact ? ph === value : ph.includes(value);
    }) || null;
  const byName = (value, exact) =>
    Array.from(document.querySelectorAll("input,textarea,select")).find(
      (el) => {
        const nm = el.getAttribute("name") || "";
        return exact ? nm === value : nm.includes(value);
      }
    ) || null;

  const queryWithin = (root, sel) => {
    const { by, value, exact } = sel || {};
    if (!by || !value) return null;
    if (by === "testid")
      return root.querySelector(`[data-testid="${CSS.escape(value)}"]`);
    if (by === "role") {
      const parts = value.split(":");
      const role = parts[0];
      const name = parts.slice(1).join(":") || undefined;
      let candidates = Array.from(root.querySelectorAll("*")).filter(
        (el) =>
          el.getAttribute("role") === role ||
          (role === "button" &&
            (el.tagName === "BUTTON" || el.getAttribute("role") === "button"))
      );
      candidates = candidates.filter(
        (el) => el.getAttribute("aria-disabled") !== "true" && !el.disabled
      );
      if (role === "tab") {
        const unselected = candidates.filter(
          (el) => el.getAttribute("aria-selected") !== "true"
        );
        if (unselected.length) candidates = unselected;
      }
      if (!name) return candidates[0] || null;
      return (
        candidates.find((el) => {
          const txt = getAccessibleName(el);
          return exact ? txt === name : txt.includes(name);
        }) || null
      );
    }
    if (by === "label") {
      const labels = Array.from(root.querySelectorAll("label"));
      const match = labels.find((l) =>
        exact ? l.textContent === value : (l.textContent || "").includes(value)
      );
      if (!match) return null;
      const forId = match.getAttribute("for");
      if (forId)
        return root.getElementById
          ? root.getElementById(forId)
          : document.getElementById(forId);
      return match.querySelector("input,textarea,select");
    }
    if (by === "placeholder")
      return (
        Array.from(root.querySelectorAll("input,textarea")).find((el) =>
          (el.getAttribute("placeholder") || "").includes(value)
        ) || null
      );
    if (by === "name")
      return (
        Array.from(root.querySelectorAll("input,textarea,select")).find((el) =>
          (el.getAttribute("name") || "").includes(value)
        ) || null
      );
    if (by === "text") {
      const hay = exact ? [value] : [value, value.trim()];
      const interactive = root.querySelectorAll(
        "button, [role='tab'], [role='button'], a, [onclick], [tabindex]"
      );
      for (const el of interactive) {
        const name = getAccessibleName(el);
        if (hay.some((t) => t && name.includes(t))) return el;
      }
      const all = root.querySelectorAll("*");
      for (const el of all) {
        const name = getAccessibleName(el);
        if (hay.some((t) => t && name.includes(t))) return el;
      }
      return null;
    }
    if (by === "css") return root.querySelector(value);
    if (by === "xpath") {
      try {
        const r = document.evaluate(
          value,
          root === document ? document : root,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return r.singleNodeValue;
      } catch (_) {
        return null;
      }
    }
    return null;
  };

  const resolveElement = (target, scope) => {
    const { by, value, exact } = target || {};
    if (!by || !value) return null;
    let root = document;
    if (scope && scope.by) {
      const scoped = queryWithin(document, scope);
      if (scoped) root = scoped.shadowRoot || scoped;
    }
    return queryWithin(root, target);
  };

  const { action, target, value, options = {} } = payload || {};

  const timeoutMs =
    typeof options.timeoutMs === "number" ? options.timeoutMs : 5000;
  const waitForVisible = options.waitForVisible !== false;
  const waitForEnabled = options.waitForEnabled !== false;

  const start = performance.now();
  let el = null;
  return (async () => {
    while (performance.now() - start < timeoutMs) {
      el = resolveElement(target, payload.scopeTarget);
      if (el && (!waitForVisible || isVisible(el))) break;
      await wait(100);
    }
    if (!el) return { success: false, error: "ELEMENT_NOT_FOUND" };

    el.scrollIntoView({ block: "center", inline: "center" });
    await wait(50);

    if (
      waitForEnabled &&
      (el.disabled || el.getAttribute("aria-disabled") === "true")
    ) {
      return {
        success: false,
        error: "NOT_ENABLED",
        details: { selectorUsed: target?.by + "=" + target?.value },
      };
    }

    const rect = el.getBoundingClientRect();

    const clickSequence = (node) => {
      // Ensure in-viewport and not covered
      node.scrollIntoView({ block: "center", inline: "center" });
      if (!hasPointerEvents(node)) return;
      const rect2 = node.getBoundingClientRect();
      // If center point is not on the element (covered), try top-left fallback
      if (!isCenterOnTop(node)) {
        const ev = (type, opts) =>
          node.dispatchEvent(new MouseEvent(type, { bubbles: true, ...opts }));
        ev("mousemove", { clientX: rect2.left + 1, clientY: rect2.top + 1 });
        ev("mousedown", { clientX: rect2.left + 1, clientY: rect2.top + 1 });
        ev("mouseup", { clientX: rect2.left + 1, clientY: rect2.top + 1 });
        ev("click", { clientX: rect2.left + 1, clientY: rect2.top + 1 });
      } else {
        node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
      if (typeof node.click === "function") node.click();
    };

    if (action === "click") {
      const node = closestClickable(el) || el;
      if (node.getAttribute && node.getAttribute("aria-disabled") === "true") {
        return { success: false, error: "DISABLED_ELEMENT" };
      }
      clickSequence(node);
      // Optional assertion phase (e.g., wait for panel or URL change)
      if (options && (options.assertTarget || options.assertUrlContains)) {
        const endBy = performance.now() + (options.assertTimeoutMs || 5000);
        while (performance.now() < endBy) {
          let ok = true;
          if (options.assertTarget) {
            const assertEl = resolveElement(
              options.assertTarget,
              payload.scopeTarget
            );
            ok = !!assertEl && (!waitForVisible || isVisible(assertEl));
          }
          if (ok && options.assertUrlContains) {
            ok = (location.href || "").includes(options.assertUrlContains);
          }
          if (ok) break;
          await wait(100);
        }
      }
      if (options && options.tabChangeWaitMs)
        await wait(options.tabChangeWaitMs);
      return {
        success: true,
        details: {
          selectorUsed: `${target.by}=${target.value}`,
          matchedCount: 1,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        },
      };
    }
    if (action === "type") {
      el.focus();
      if (typeof value === "string") {
        if ("value" in el) {
          el.value = value;
        } else {
          el.textContent = value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return {
        success: true,
        details: { selectorUsed: `${target.by}=${target.value}` },
      };
    }
    if (action === "select") {
      if (el.tagName === "SELECT" && typeof value === "string") {
        const sel = el;
        const opt = Array.from(sel.options).find(
          (o) => o.value === value || o.text === value
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("input", { bubbles: true }));
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return {
            success: true,
            details: { selectorUsed: `${target.by}=${target.value}` },
          };
        }
        return { success: false, error: "OPTION_NOT_FOUND" };
      }
      return { success: false, error: "UNSUPPORTED_SELECT_TARGET" };
    }
    if (action === "check" || action === "uncheck") {
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        const shouldBe = action === "check";
        if (el.checked !== shouldBe) {
          el.checked = shouldBe;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return {
          success: true,
          details: { selectorUsed: `${target.by}=${target.value}` },
        };
      }
      return { success: false, error: "UNSUPPORTED_CHECK_TARGET" };
    }
    if (action === "keypress") {
      const key = typeof value === "string" ? value : "Enter";
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      return {
        success: true,
        details: { selectorUsed: `${target.by}=${target.value}` },
      };
    }
    if (action === "hover") {
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      return {
        success: true,
        details: { selectorUsed: `${target.by}=${target.value}` },
      };
    }
    if (action === "scroll") {
      const behavior = options.smooth ? "smooth" : "auto";
      const hasOffsets =
        typeof options.scrollX === "number" ||
        typeof options.scrollY === "number";
      const dx = typeof options.scrollX === "number" ? options.scrollX : 0;
      const dy = typeof options.scrollY === "number" ? options.scrollY : 0;

      // If a specific target is given and exists
      if (target && el) {
        if (hasOffsets && isScrollable(el)) {
          el.scrollBy({ left: dx, top: dy, behavior });
          return {
            success: true,
            details: {
              selectorUsed: `${target.by}=${target.value}`,
              offset: { x: dx, y: dy },
            },
          };
        }
        if (options && options.to === "top") {
          if (isScrollable(el)) {
            el.scrollTo({ top: 0, behavior });
          } else {
            el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
          }
          return {
            success: true,
            details: {
              selectorUsed: `${target.by}=${target.value}`,
              to: "top",
            },
          };
        }
        if (options && options.to === "bottom") {
          if (isScrollable(el)) {
            el.scrollTo({ top: el.scrollHeight, behavior });
          } else {
            el.scrollIntoView({ behavior, block: "end", inline: "nearest" });
          }
          return {
            success: true,
            details: {
              selectorUsed: `${target.by}=${target.value}`,
              to: "bottom",
            },
          };
        }
        // Default: bring it into view
        el.scrollIntoView({ behavior, block: "center", inline: "center" });
        return {
          success: true,
          details: { selectorUsed: `${target.by}=${target.value}` },
        };
      }

      // No specific target: use primary scroll container or window
      const container = findPrimaryScrollContainer();
      if (hasOffsets) {
        if (
          container &&
          container !== document.scrollingElement &&
          container !== document.documentElement &&
          container !== document.body &&
          isScrollable(container)
        ) {
          container.scrollBy({ left: dx, top: dy, behavior });
        } else {
          window.scrollBy({ left: dx, top: dy, behavior });
        }
        return {
          success: true,
          details: {
            offset: { x: dx, y: dy },
            container: container?.tagName?.toLowerCase() || "window",
          },
        };
      }
      if (options && options.to === "top") {
        if (
          container &&
          container !== document.scrollingElement &&
          isScrollable(container)
        ) {
          container.scrollTo({ top: 0, behavior });
        } else {
          window.scrollTo({ top: 0, behavior });
        }
        return {
          success: true,
          details: {
            to: "top",
            container: container?.tagName?.toLowerCase() || "window",
          },
        };
      }
      if (options && options.to === "bottom") {
        if (
          container &&
          container !== document.scrollingElement &&
          isScrollable(container)
        ) {
          container.scrollTo({ top: container.scrollHeight, behavior });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior });
        }
        return {
          success: true,
          details: {
            to: "bottom",
            container: container?.tagName?.toLowerCase() || "window",
          },
        };
      }
      return { success: false, error: "INVALID_SCROLL_PARAMS" };
    }
    if (action === "waitForSelector") {
      return {
        success: true,
        details: {
          selectorUsed: `${target.by}=${target.value}`,
          matchedCount: el ? 1 : 0,
        },
      };
    }

    return { success: false, error: "UNSUPPORTED_ACTION" };
  })();
}

// validateServerIdentity now imported from common/serverIdentity.js

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

// URL tracking moved to background/url-tracking.js

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

// Register screenshot message handler and install URL tracking listeners
registerScreenshotHandler();
installUrlTracking();

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

    // Notify all devtools instances about the connection status (safely handle no receiver)
    chrome.runtime.sendMessage(
      {
        type: "CONNECTION_STATUS_UPDATE",
        isConnected: isConnected,
        tabId: tabId,
      },
      () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("Receiving end does not exist")) {
            console.log(
              "Background: No receiver for CONNECTION_STATUS_UPDATE (DevTools likely closed). Suppressing."
            );
          } else {
            console.warn(
              "Background: sendMessage callback error (CONNECTION_STATUS_UPDATE):",
              chrome.runtime.lastError
            );
          }
        }
      }
    );

    // Always notify for page refresh, whether connected or not
    // This ensures any ongoing discovery is cancelled and restarted
    console.log(
      `Background: Attempting to send INITIATE_AUTO_DISCOVERY (reason: page_refresh, tabId: ${tabId})`
    );
    chrome.runtime.sendMessage(
      {
        type: "INITIATE_AUTO_DISCOVERY",
        reason: "page_refresh",
        tabId: tabId,
        forceRestart: true, // Force restart any ongoing processes
      },
      () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("Receiving end does not exist")) {
            console.log(
              "Background: Suppressed 'Receiving end does not exist' for INITIATE_AUTO_DISCOVERY (DevTools likely not ready yet)"
            );
          } else {
            console.warn(
              "Background: sendMessage callback error (INITIATE_AUTO_DISCOVERY):",
              chrome.runtime.lastError
            );
          }
        }
      }
    );

    if (!isConnected) {
      console.log(
        "Connection test failed after page refresh, initiating auto-discovery..."
      );
    } else {
      console.log("Connection test successful after page refresh");
    }
  });
}

// Screenshot handling moved to background/screenshot.js
