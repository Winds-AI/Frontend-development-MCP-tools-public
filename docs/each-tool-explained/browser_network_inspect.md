# browser.network.inspect Tool

## Overview

Logs recent browser network requests (similar to DevTools → Network) captured by the Chrome extension. Use it to debug failed requests, verify payloads, and analyze request sequences.

## Tool Signature

```typescript
inspectBrowserNetworkActivity({
  urlFilter: string,
  details: Array<
    | "url"
    | "method"
    | "status"
    | "timestamp"
    | "requestHeaders"
    | "responseHeaders"
    | "requestBody"
    | "responseBody"
  >,
  timeOffset: number, // seconds (e.g., 300 = last 5 minutes)
  orderBy: "timestamp" | "url",
  orderDirection: "asc" | "desc",
  limit: number, // default 20
});
```

## Parameters

- **urlFilter**: substring to match URLs (case-insensitive)
- **details**: select which fields to include in each entry
- **timeOffset**: relative time window ending now; max 86400 seconds
- **orderBy/orderDirection**: sorting controls
- **limit**: maximum number of entries

## Response

Returns an array of entries with only the requested fields. `timestamp` is included when requested or when `includeTimestamp` is true server-side.

If no matches are found, the tool returns search strategy suggestions (singular/plural, partial terms, related terms).

## Usage Examples

```typescript
// Get last 20 "users" API calls with URL/method/status and timestamp
await inspectBrowserNetworkActivity({
  urlFilter: "users",
  details: ["url", "method", "status", "timestamp"],
});

// Inspect payloads for recent failures
await inspectBrowserNetworkActivity({
  urlFilter: "/api/orders",
  details: ["url", "status", "requestBody", "responseBody"],
  timeOffset: 600, // last 10 minutes
  orderBy: "timestamp",
  orderDirection: "desc",
  limit: 10,
});
```

## Notes

- Ensure the Chrome extension is connected and DevTools is open.
- Trigger the relevant API calls in the browser before running the tool.
