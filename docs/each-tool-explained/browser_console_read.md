# browser.console.read Tool

## Overview

Reads browser console logs captured by the Chrome extension. Filter by level, time window, and search term to quickly surface errors and warnings.

As of this update, the tool also captures browser-generated errors via the Chrome DevTools Log domain and Network loading failures, so messages like "Failed to load resource: the server responded with a status of 404" will appear as `error` entries. For full request/response payloads, use `browser.network.inspect`.

## Tool Signature

```typescript
inspectBrowserConsole({
  level: "log" | "error" | "warn" | "info" | "debug" | "all",
  limit: number,
  timeOffset: number, // seconds; last N seconds
  search: string,
});
```

## Response

Formatted text summary plus structured stats and logs, for example:

```
🔍 Browser Console Inspection Results
📊 Summary: 12 total logs (3 errors, 2 warnings, ...)
🔧 Applied Filters: Level: error, Time Offset: 300
📝 Console Messages:
❌ [2025-01-01T12:00:00.000Z] ERROR: Uncaught TypeError: ...
```

## Examples

```typescript
// Recent errors
await inspectBrowserConsole({ level: "error", timeOffset: 300 });

// Search for specific text
await inspectBrowserConsole({ search: "Unauthorized", limit: 20 });
```

## Notes

- DevTools must be open for the active tab to capture console messages.
- After installing/updating the extension, reload DevTools so the Log/Network capture is enabled.
- If you just reproduced an error, call with a `timeOffset` (e.g., 300–600 seconds) to ensure the event is within the window.
