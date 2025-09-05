// panel/screenshot.js
export function registerPanelScreenshot(
  captureScreenshotButton,
  getSettings,
  logInfoToBrowserConnector
) {
  captureScreenshotButton.addEventListener("click", () => {
    captureScreenshotButton.textContent = "Capturing...";
    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_SCREENSHOT",
        tabId: chrome.devtools.inspectedWindow.tabId,
        screenshotPath: getSettings().screenshotPath,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          captureScreenshotButton.textContent = "Failed to capture!";
        } else if (!response || !response.success) {
          captureScreenshotButton.textContent = "Failed to capture!";
        } else {
          captureScreenshotButton.textContent = `Captured: ${response.title}`;
          logInfoToBrowserConnector("Screenshot captured successfully", {
            path: response.path,
            title: response.title,
          });
        }
        setTimeout(() => {
          captureScreenshotButton.textContent = "Capture Screenshot";
        }, 2000);
      }
    );
  });
}
