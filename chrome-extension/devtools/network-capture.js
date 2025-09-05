// devtools/network-capture.js
export function installNetworkCapture(sendToBrowserConnector) {
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
}
