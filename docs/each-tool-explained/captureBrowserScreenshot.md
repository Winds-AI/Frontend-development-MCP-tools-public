# captureBrowserScreenshot Tool

## Overview

The `captureBrowserScreenshot` tool captures the current browser tab and saves it as a PNG file with intelligent organization. It returns both the saved file path and optionally the base64 image data for immediate analysis.

**Primary Use Cases:**

- UI inspection and visual verification
- Recursive UI improvement loops
- Documentation and bug reporting
- Visual regression testing

## Tool Signature

```typescript
captureBrowserScreenshot({
  filename: string, // Optional custom filename (without extension)
  returnImageData: boolean, // Whether to return base64 data (default: true)
  projectName: string, // Optional project name override
});
```

## Parameters

### `filename` (optional)

- **Type**: `string`
- **Description**: Custom filename for the screenshot without extension
- **Example**: `"login-page"` → `2024-01-15T10-30-45-123Z_login-page.png`
- **Default**: Auto-generated from URL content

### `returnImageData` (optional)

- **Type**: `boolean`
- **Description**: Whether to include base64 image data in the response
- **Default**: `true`
- **Use Case**: Set to `false` for faster responses when you only need the file path

### `projectName` (optional)

- **Type**: `string`
- **Description**: Override automatic project detection
- **Example**: `"my-frontend-app"`
- **Default**: Auto-detected environment variables or mcp config

## File Organization System

The tool uses a sophisticated directory structure for organizing screenshots:

### Base Directory

1. **Custom absolute path** (if provided)
2. **Environment variable** `SCREENSHOT_STORAGE_PATH`
3. **Default**: `~/Downloads/browser_mcp_screenshots`

### Project Directory

1. **Custom project name** (from parameter)
2. **Environment variable** `PROJECT_NAME`
3. **Git repository name** (from `git config --get remote.origin.url`)
4. **Current working directory name**
5. **Fallback**: `"default-project"`

### URL Category (Subfolder)

- **Localhost URLs**: Uses first path segment
  - `http://localhost:3000/dashboard` → `dashboard/`
  - `http://localhost:8080/api/users` → `api/`
- **Staging/Dev**: `staging/{path-segment}/`
- **Production**: `production/{path-segment}/`
- **General**: `general/` (for about:blank or unparseable URLs)

### Filename Generation

- **Custom filename**: `{timestamp}_{sanitized-filename}.png`
- **URL-based**: `{timestamp}_{url-segment}.png`
- **Fallback**: `{timestamp}_screenshot.png`

## Response Format

### Success Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "✅ Screenshot captured successfully!\n📁 Project: my-app\n📂 Category: dashboard\n💾 Saved to: /path/to/screenshot.png"
    },
    {
      "type": "image",
      "data": "iVBORw0KGgoAAAANSUhEUgAA...",
      "mimeType": "image/png"
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
      "text": "Error taking screenshot: Chrome extension not connected"
    }
  ],
  "isError": true
}
```

## Usage Examples

### Basic Screenshot

```typescript
// Capture current tab with auto-generated filename
await captureBrowserScreenshot({});
```

### Custom Filename

```typescript
// Save with specific name
await captureBrowserScreenshot({
  filename: "login-form",
});
// Result: 2024-01-15T10-30-45-123Z_login-form.png
```

### Project-Specific Organization

```typescript
// Override project detection
await captureBrowserScreenshot({
  projectName: "my-frontend-app",
  filename: "user-profile",
});
// Result: ~/Downloads/browser_mcp_screenshots/my-frontend-app/users/2024-01-15T10-30-45-123Z_user-profile.png
```

### Fast Capture (No Image Data)

```typescript
// Only get file path, no base64 data
await captureBrowserScreenshot({
  returnImageData: false,
  filename: "quick-test",
});
```

## File Path Examples

### Localhost Development

**URL**: `http://localhost:3000/dashboard`
**Git Repo**: `my-project`
**Result**: `~/Downloads/browser_mcp_screenshots/my-project/dashboard/2024-01-15T10-30-45-123Z_dashboard.png`

### Staging Environment

**URL**: `https://staging.example.com/admin/users`
**Result**: `~/Downloads/browser_mcp_screenshots/default-project/staging/admin/2024-01-15T10-30-45-123Z_admin-users.png`

### Custom Project

**URL**: `http://localhost:8080/api/auth/login`
**Custom Project**: `auth-service`
**Custom Filename**: `login-page`
**Result**: `~/Downloads/browser_mcp_screenshots/auth-service/api/2024-01-15T10-30-45-123Z_login-page.png`

## Technical Architecture

### Component Flow

1. **MCP Server** → Receives tool call and parameters
2. **Browser Connector Server** → Processes request via WebSocket
3. **Chrome Extension** → Captures visible tab using `chrome.tabs.captureVisibleTab()`
4. **Screenshot Service** → Organizes and saves file with intelligent naming

### WebSocket Communication

```typescript
// Browser Connector → Chrome Extension
{
  "type": "take-screenshot",
  "requestId": "1705311045123"
}

// Chrome Extension → Browser Connector
{
  "type": "screenshot-data",
  "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "requestId": "1705311045123"
}
```

## Environment Variables

### `SCREENSHOT_STORAGE_PATH`

- **Purpose**: Override base directory for screenshots
- **Example**: `export SCREENSHOT_STORAGE_PATH="/custom/screenshots"`

### `PROJECT_NAME`

- **Purpose**: Override project detection
- **Example**: `export PROJECT_NAME="my-app"`

## Error Handling

### Common Errors

- **"Chrome extension not connected"**: Extension not installed or not connected
- **"Screenshot timeout"**: Extension didn't respond within 15 seconds
- **"Failed to save screenshot"**: File system permission issues

### Troubleshooting

1. Ensure Chrome extension is installed and connected
2. Check browser connector server is running
3. Verify file system permissions for screenshot directory
4. Check WebSocket connection between extension and server

## Integration with Other Tools

### Visual Analysis Workflow

```typescript
// 1. Capture screenshot
const screenshot = await captureBrowserScreenshot({
  filename: "before-changes",
});

// 2. Make UI changes
// ... code changes ...

// 3. Capture after screenshot
const afterScreenshot = await captureBrowserScreenshot({
  filename: "after-changes",
});

// 4. Compare visually or programmatically
```

### Documentation Workflow

```typescript
// Capture screenshots for documentation
await captureBrowserScreenshot({
  projectName: "user-guide",
  filename: "step-1-login",
});

await captureBrowserScreenshot({
  projectName: "user-guide",
  filename: "step-2-dashboard",
});
```

## Best Practices

1. **Use Descriptive Filenames**: Instead of generic names, use specific descriptions
2. **Leverage Project Organization**: Let the tool auto-organize by project and URL
3. **Consider Performance**: Set `returnImageData: false` for batch operations
4. **Version Control**: Screenshots are timestamped for chronological ordering
5. **Environment Awareness**: The tool automatically detects staging vs production URLs

## Enhanced UI Debugging Workflow

### **Autonomous AI Debugging Pattern**

The most effective pattern for AI-driven UI debugging combines `captureBrowserScreenshot` with the enhanced `inspectSelectedElementCss` tool:

```typescript
// 1. Capture initial state
await captureBrowserScreenshot();

// 2. AI analyzes screenshot and identifies issues
// (Human or AI selects problematic element in DevTools)

// 3. Get comprehensive debugging context
const elementContext = await inspectSelectedElementCss();

// 4. AI receives:
// - Computed CSS styles
// - Parent/child layout context
// - Automatic issue detection
// - Actionable fix suggestions
// - Accessibility audit
// - Material-UI context (if applicable)

// 5. Apply fixes and verify
await captureBrowserScreenshot(); // Compare before/after
```

### **What the Enhanced Element Inspection Provides**

When you select an element and call `inspectSelectedElementCss`, you get:

**🔍 Immediate Issue Detection**:

- Zero dimensions warnings
- Overflow clipping issues
- Positioning problems
- Flex/Grid layout conflicts
- Material-UI best practices violations

**📐 Layout Context**:

- Parent container type (flex/grid/block)
- Child element relationships
- Computed style inheritance
- Positioning context

**♿ Accessibility Audit**:

- ARIA attributes and roles
- Focus management
- Semantic structure
- Keyboard navigation compatibility

**⚡ Performance Insights**:

- Large image detection
- Deep nesting warnings
- Optimization opportunities

### **Example AI Debugging Session**

```typescript
// AI sees layout issue in screenshot
await captureBrowserScreenshot();

// AI instructs: "Select the misaligned button element"
// Human selects element in DevTools Elements panel

// AI gets comprehensive context
const debug = await inspectSelectedElementCss();

// AI receives formatted output like:
/*
🚨 Critical Issues Detected:
• Flex item might be shrinking too much

💡 Suggested Fixes:  
• Consider setting flex-shrink: 0 or min-width

📐 Layout Context:
• Parent: DIV (flex) [Flex Container]
• This is a flex item
*/

// AI can now provide specific fixes without additional tool calls
```

### **Reducing Tool Call Overhead**

This enhanced workflow reduces debugging from **4-5 tool calls** down to **2 tool calls**:

**Old Pattern** (5 calls):

1. `captureBrowserScreenshot`
2. `inspectSelectedElementCss` (basic info)
3. Additional CSS property queries
4. Parent/child context queries
5. Manual accessibility checks

**New Pattern** (2 calls):

1. `captureBrowserScreenshot`
2. `inspectSelectedElementCss` (comprehensive context)

This enables **autonomous AI debugging sessions** lasting 2+ hours without manual intervention, aligning with the core mission of the browser tools ecosystem.
