// panel/logs.js
export function registerWipeLogs(wipeLogsButton, getSettings) {
  wipeLogsButton.addEventListener("click", () => {
    const settings = getSettings();
    const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/wipelogs`;
    fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => response.json())
      .then(() => {
        wipeLogsButton.textContent = "Logs Wiped!";
        setTimeout(() => {
          wipeLogsButton.textContent = "Wipe All Logs";
        }, 2000);
      })
      .catch(() => {
        wipeLogsButton.textContent = "Failed to Wipe Logs";
        setTimeout(() => {
          wipeLogsButton.textContent = "Wipe All Logs";
        }, 2000);
      });
  });
}

export function createInfoLogger(getSettings) {
  return function logInfoToBrowserConnector(message, data = {}) {
    const logData = { type: "info-log", message, data, timestamp: Date.now() };
    chrome.storage.local.get(["browserConnectorSettings"], (result) => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };
      const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/extension-log`;
      fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: logData }),
      }).catch(() => {});
    });
  };
}
