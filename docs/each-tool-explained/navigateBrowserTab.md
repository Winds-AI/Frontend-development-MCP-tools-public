# navigateBrowserTab Tool

## Overview

The `navigateBrowserTab` tool navigates the current active browser tab to a new URL. It provides programmatic control over browser navigation for automated testing, navigation flows, and redirecting to specific pages.

**Primary Use Cases:**

- Automated testing and navigation flows
- Redirecting users to specific pages
- Multi-step workflow automation
- Integration testing across different pages
- Navigation-based debugging and troubleshooting

## Tool Signature

```typescript
navigateBrowserTab({
  url: string, // The URL to navigate to (required)
});
```
Note: The tool description is augmented at startup to reference your routes file if `ROUTES_FILE_PATH` is set in the environment or project config.

## Parameters

### `url` (required)

- **Type**: `string`
- **Description**: The complete URL to navigate to, including protocol
- **Format**: Must be a valid URL with protocol (e.g., `https://example.com`)
- **Examples**:
  - "https://google.com"
  - "http://localhost:3000/dashboard"
  - "https://api.example.com/v1/users"

## Response Format

### Success Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Successfully navigated browser tab to: https://example.com"
    }
  ]
}
```

### Error Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "Failed to navigate browser tab: Chrome extension not connected"
    }
  ],
  "isError": true
}
```

## Usage Examples

### Basic Navigation

```typescript
// Navigate to a simple website
await navigateBrowserTab({
  url: "https://google.com",
});
```

### Local Development Navigation

```typescript
// Navigate to a local development server
await navigateBrowserTab({
  url: "http://localhost:3000/dashboard",
});
```

### API Endpoint Navigation

```typescript
// Navigate to an API documentation page
await navigateBrowserTab({
  url: "https://api.example.com/docs",
});
```

## Common Use Cases

### 1. Automated Testing Flows

```typescript
// Multi-step testing workflow
await navigateBrowserTab({ url: "https://app.example.com/login" });
// Wait for page load, then navigate to dashboard
await navigateBrowserTab({ url: "https://app.example.com/dashboard" });
// Navigate to specific feature
await navigateBrowserTab({ url: "https://app.example.com/users" });
```

### 2. Development Workflow

```typescript
// Navigate to local development environment
await navigateBrowserTab({ url: "http://localhost:3000" });
// Navigate to specific feature being developed
await navigateBrowserTab({ url: "http://localhost:3000/feature/new-ui" });
```

### 3. API Testing

```typescript
// Navigate to API documentation
await navigateBrowserTab({ url: "https://swagger.io/docs/" });
// Navigate to specific API endpoint
await navigateBrowserTab({ url: "https://api.example.com/v1/users" });
```

### 4. Integration Testing

```typescript
// Test navigation between different environments
await navigateBrowserTab({ url: "https://staging.example.com" });
await navigateBrowserTab({ url: "https://production.example.com" });
```

## Error Handling

### Common Error Scenarios

1. **Invalid URL Format**

   ```
   Invalid URL format: example.com. Please provide a complete URL including protocol (e.g., 'https://example.com')
   ```

2. **Chrome Extension Not Connected**

   ```
   Failed to navigate browser tab: Chrome extension not connected
   ```

3. **Navigation Timeout**

   ```
   Failed to navigate browser tab: Navigation timeout
   ```

4. **DevTools Tab Context Unavailable**
   ```
   Failed to navigate browser tab: No target tab ID available
   ```

### Error Recovery

```typescript
try {
  await navigateBrowserTab({ url: "https://example.com" });
} catch (error) {
  // Handle navigation errors
  console.error("Navigation failed:", error);

  // Retry with different URL or wait and retry
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await navigateBrowserTab({ url: "https://fallback.example.com" });
}
```

## Technical Architecture

### Component Flow

1. **MCP Server** → Receives tool call and validates URL format
2. **Browser Connector Server** → Processes request via WebSocket
3. **Chrome Extension DevTools** → Receives navigation request
4. **Chrome Extension Background** → Executes `chrome.tabs.update()` API
5. **Browser** → Performs actual navigation
6. **Response** → Success/error flows back through the chain

### WebSocket Communication

```typescript
// Browser Connector → Chrome Extension
{
  "type": "navigate-tab",
  "url": "https://example.com",
  "requestId": "1705311045123"
}

// Chrome Extension → Browser Connector
{
  "type": "navigation-response",
  "requestId": "1705311045123",
  "success": true,
  "url": "https://example.com"
}
```

### Chrome Extension API Usage

```javascript
// Background script uses Chrome Tabs API
chrome.tabs.update(targetTabId, { url: message.url }, (tab) => {
  if (chrome.runtime.lastError) {
    // Handle error
  } else {
    // Navigation successful
  }
});
```

## Prerequisites

### Required Setup

1. **Chrome Extension Installed**

   - Browser Tools MCP extension must be installed
   - Extension must be enabled and connected

2. **Browser Tools Server Running**

   - Server must be running on configured port (default: 3025)
   - Server must be discoverable by the MCP client

3. **Valid URL Format**

   - URL must include protocol (http:// or https://)
   - URL must be accessible from the browser

4. **Tab Context**
   - The active DevTools-inspected tab is used implicitly. If unavailable, navigation may fail.

### Permissions Required

The Chrome extension requires these permissions (already included):

- "tabs" - For tab manipulation
- "activeTab" - For accessing the current tab
- "<all_urls>" - For navigating to any URL

## Best Practices

### 1. URL Validation

Always provide complete URLs with protocol:

```typescript
// ✅ Good
await navigateBrowserTab({ url: "https://example.com" });

// ❌ Bad
await navigateBrowserTab({ url: "example.com" });
```

### 2. Error Handling

Implement proper error handling for navigation failures:

```typescript
const result = await navigateBrowserTab({ url: "https://example.com" });
if (result.isError) {
  // Handle navigation error
  console.error("Navigation failed:", result.content[0].text);
}
```

### 3. Navigation Timing

Consider page load times when chaining navigation calls:

```typescript
// Navigate to first page
await navigateBrowserTab({ url: "https://example.com/login" });

// Wait for page to load before next navigation
await new Promise((resolve) => setTimeout(resolve, 2000));

// Navigate to next page
await navigateBrowserTab({ url: "https://example.com/dashboard" });
```

### 4. Environment-Specific URLs

Use environment variables for different environments:

```typescript
const baseUrl = process.env.APP_URL || "http://localhost:3000";
await navigateBrowserTab({ url: `${baseUrl}/dashboard` });
```

## Integration with Other Tools

### Combined with Screenshot Tool

```typescript
// Navigate to page and capture screenshot
await navigateBrowserTab({ url: "https://example.com/dashboard" });
await captureBrowserScreenshot({ filename: "dashboard-page" });
```

### Combined with Network Inspection

```typescript
// Navigate to page and inspect network entity
await navigateBrowserTab({ url: "https://api.example.com/users" });
await inspectBrowserNetworkActivity({
  urlFilter: "users",
  details: ["url", "method", "status"],
});
```

## Troubleshooting

### Common Issues

1. **"Chrome extension not connected"**

   - Ensure the Chrome extension is installed and enabled
   - Check that the extension is connected to the browser tools server
   - Verify the server is running and discoverable

2. **"Invalid URL format"**

   - Always include the protocol (http:// or https://)
   - Ensure the URL is properly formatted
   - Check for typos in the URL

3. **"Navigation timeout"**

   - The target URL might be slow to load
   - Check network connectivity
   - Verify the URL is accessible

4. **"No target tab ID available"**
   - Ensure there's an active tab in the browser
   - Open DevTools so the inspected tab context exists
   - Verify the tab is not in a restricted state

### Debug Steps

1. **Check Extension Status**

   - Open Chrome DevTools
   - Look for the Browser Tools MCP panel
   - Verify connection status

2. **Check Server Status**

   - Verify the browser tools server is running
   - Check the server logs for any errors
   - Ensure the server is on the expected port

3. **Test URL Accessibility**
   - Try navigating to the URL manually in the browser
   - Check if the URL is accessible from your network
   - Verify there are no firewall or proxy issues

## Environment Variables

No specific environment variables are required for this tool, but it uses the same server discovery mechanism as other tools:

- `BROWSER_TOOLS_HOST` - Server host (default: "127.0.0.1")
- `BROWSER_TOOLS_PORT` - Server port (default: 3025)
