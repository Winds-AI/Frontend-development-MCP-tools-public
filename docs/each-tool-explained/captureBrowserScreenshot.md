# captureBrowserScreenshot Tool

## Overview

The `captureBrowserScreenshot` tool captures the current browser tab and saves it as a PNG file with intelligent organization. It always returns the base64 image data and the saved file path.

**Primary Use Cases:**

- UI inspection and visual verification
- Recursive UI improvement loops
- Documentation and bug reporting
- Visual regression testing

## Tool Signature

```typescript
captureBrowserScreenshot();
```

This tool currently takes no parameters.

## File Organization System

The tool uses a sophisticated directory structure for organizing screenshots:

### Base Directory

1. **Project config** `DEFAULT_SCREENSHOT_STORAGE_PATH` in `chrome-extension/projects.json`
2. **Environment variable** `SCREENSHOT_STORAGE_PATH`
3. **Default**: `~/Downloads/MCP_Screenshots`

### Project Directory

1. **Environment variable** `ACTIVE_PROJECT`
2. **`projects.json`** `defaultProject`
3. **Fallback**: `"default-project"`

### URL Category (Subfolder)

- **Localhost URLs**: Uses first path segment
  - `http://localhost:3000/dashboard` → `dashboard/`
  - `http://localhost:8080/api/users` → `api/`
- **Staging/Dev**: `staging/{path-segment}/`
- **Production**: `production/{path-segment}/`
- **General**: `general/` (for about:blank or unparseable URLs)

### Filename Generation

- **URL-based**: `{timestamp}_{url-segment}.png`
- **Fallback**: `{timestamp}_screenshot.png`

## Response Format

### Success Response

The tool returns a text block with project/category info and an image payload with `mimeType: "image/png"`.

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
await captureBrowserScreenshot();
```

Custom filenames are not currently supported via the MCP tool. Filenames are generated from the URL.

Project name is determined by `ACTIVE_PROJECT` or `projects.json` → `defaultProject`.

The tool always returns image data for analysis.

## File Path Examples

### Localhost Development

**URL**: `http://localhost:3000/dashboard`
**Git Repo**: `my-project`
**Result**: `~/Downloads/MCP_Screenshots/my-project/dashboard/2024-01-15T10-30-45-123Z_dashboard.png`

### Staging Environment

**URL**: `https://staging.example.com/admin/users`
**Result**: `~/Downloads/MCP_Screenshots/default-project/staging/admin/2024-01-15T10-30-45-123Z_admin-users.png`

### Custom Project

**URL**: `http://localhost:8080/api/auth/login`
**Custom Project**: `auth-service`
**Custom Filename**: `login-page`
**Result**: `~/Downloads/MCP_Screenshots/auth-service/api/2024-01-15T10-30-45-123Z_login-page.png`

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
