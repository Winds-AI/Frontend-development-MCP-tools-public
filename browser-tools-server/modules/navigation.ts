/**
 * Refactor Temp: Tool — navigate-browser-tab
 * Core, stateless helpers for navigation flow extracted from browser-connector.ts.
 * Keep Express route binding and WebSocket plumbing inside browser-connector.ts.
 */

export interface NavigationRequest {
  url: string;
  requestId: string;
}

export interface NavigationResult {
  success: boolean;
  error?: string;
}

/**
 * Build the navigation message payload to send over WebSocket to the extension.
 */
export function buildNavigationMessage(
  req: { url: string },
  requestId: string
) {
  return JSON.stringify({
    type: "navigate-tab",
    url: req.url,
    requestId,
  });
}

/**
 * Narrow and validate the navigation response coming back over WebSocket.
 */
export function parseNavigationResponse(
  data: any,
  expectedRequestId: string
): NavigationResult | undefined {
  if (
    data &&
    data.type === "navigation-response" &&
    data.requestId === expectedRequestId
  ) {
    if (data.success) {
      return { success: true };
    }
    return { success: false, error: data.error };
  }
  return undefined;
}
