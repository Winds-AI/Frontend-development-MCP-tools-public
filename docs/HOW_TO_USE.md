# How to Use Autonomous Frontend Browser Tools

This guide helps you understand and effectively use the Autonomous Frontend Browser Tools for autonomous frontend development workflows.

## Prerequisites

Before using these tools:

- ✅ **Setup Complete**: Run `pnpm run setup` or `npx @winds-ai/autonomous-frontend-browser-tools`
- ✅ **Chrome Extension**: Load the extension from `chrome-extension/` folder
- ✅ **DevTools Open**: Keep Chrome DevTools open when using browser tools
- ✅ **Project Configured**: Set up `projects.json` with your API endpoints and auth settings

## Available Tools

| Tool                                                                          | Purpose                               | Key Parameters                           |
| ----------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| [`api.searchEndpoints`](./each-tool-explained/api_searchEndpoints.md)         | Find API endpoints by semantic search | `query`, `tag`, `method`, `limit`        |
| [`api.request`](./each-tool-explained/api_request.md)                         | Make authenticated API calls          | `endpoint`, `method`, `includeAuthToken` |
| [`browser.screenshot`](./each-tool-explained/browser_screenshot.md)           | Capture browser screenshots           | `randomString`                           |
| [`ui.inspectElement`](./each-tool-explained/ui_inspectElement.md)             | Analyze DOM elements                  | _(from DevTools selection)_              |
| [`browser.network.inspect`](./each-tool-explained/browser_network_inspect.md) | Monitor network requests              | `urlFilter`, `details`, `timeOffset`     |
| [`browser.navigate`](./each-tool-explained/browser_navigate.md)               | Navigate to URLs                      | `url`                                    |
| [`api.listTags`](./each-tool-explained/api_listTags.md)                       | List API tags                         | _(no parameters)_                        |
| [`browser.console.read`](./each-tool-explained/browser_console_read.md)       | Read console logs                     | `level`, `limit`, `timeOffset`, `search` |

## Updated Workflow with Unified API Testing

### **Workflow 1: API Integration**

**Tell the agent** to use `api.searchEndpoints` to identify endpoints required for specific features, then use `api.request` to validate real responses for API integration with error handling.

**💡 Pro Tip:** Most LLMs will hallucinate user feedback toast notifications. Always reference your existing toast implementation to ensure accurate API integration.

#### **Live API Testing Example:**

```javascript
// Tool: api.request
{
  endpoint: "/api/users",
  method: "GET",
  includeAuthToken: true  // Dynamic token retrieval
}
```

**Features:**

#### **Development Integration:**

- Define accurate TypeScript interfaces from API responses
- Use your project's helpers and custom hooks
- Implement proper error handling and loading states
- Reference existing UI patterns for consistency

### **Workflow 2: UI Development & Debugging**

**Perfect for visual testing and debugging frontend issues:**

- **`browser.screenshot`**: Capture UI state (use any `randomString`)
- **`ui.inspectElement`**: Analyze CSS/layout of selected elements
- **`browser.network.inspect`**: Monitor API calls and responses
- **`browser.console.read`**: Capture JavaScript errors and logs

### **Workflow 3: Automated UI Testing**

**Iterative improvement loop for UI development:**

1. **Take Screenshot**: `browser.screenshot({ randomString: "ui-test" })`
2. **Analyze Issues**: Use LLM to identify UI/UX problems
3. **Apply Fixes**: Implement CSS/JavaScript changes
4. **Verify Results**: Screenshot again + `browser.console.read` for errors
5. **Repeat**: Continue until UI meets requirements

### **Workflow 4: Navigation & E2E Testing**

**Multi-step user journey testing:**

```javascript
// Navigate through user flows
browser.navigate({ url: "https://app.example.com/login" });
browser.screenshot({ randomString: "login-page" });

browser.navigate({ url: "https://app.example.com/dashboard" });
browser.screenshot({ randomString: "dashboard" });

// Monitor throughout the journey
browser.network.inspect({ urlFilter: "/api/", timeOffset: 30000 });
browser.console.read({ level: "error", limit: 10 });
```

## Configuration & Setup

- **Projects**: Configure in `projects.json` (see `docs/SETUP_GUIDE.md`)
- **Environment**: Set API keys in `browser-tools-server/.env`
- **Chrome Extension**: Required for browser tools functionality
- **DevTools**: Keep open when using browser inspection tools

## Complete Example: API + UI Integration

**Scenario**: Building a user management feature

1. **Discover API**: `api.searchEndpoints({ query: "users", method: "GET" })`
2. **Validate Endpoint**: `api.request({ endpoint: "/api/users", method: "GET", includeAuthToken: true })`
3. **Navigate to Page**: `browser.navigate({ url: "/users" })`
4. **Visual Verification**: `browser.screenshot({ randomString: "users-page" })`
5. **Monitor Network**: `browser.network.inspect({ urlFilter: "/api/users" })`
6. **Check Console**: `browser.console.read({ level: "error" })`
7. **Inspect Elements**: Select element in DevTools → `ui.inspectElement()`

## Troubleshooting

### Common Issues:

- **🔴 "Tool not available"**: Ensure Chrome extension is loaded and DevTools is open
- **🔴 "Authentication failed"**: Check `AUTH_STORAGE_TYPE` and `AUTH_TOKEN_KEY` in projects.json
- **🔴 "Screenshot failed"**: Verify DevTools panel is open and extension is active
- **🔴 "Network requests empty"**: Make sure to trigger the requests before inspecting
- **🔴 "API endpoints not found"**: Ensure `SWAGGER_URL` is correctly configured

### Getting Help:

- 📖 **Documentation**: Check `docs/` folder for detailed guides
- 🔧 **Setup Issues**: Run `pnpm run setup:ui` for configuration help
- 🐛 **Bug Reports**: Check existing issues or create new ones

---

**Note**: `ui.interact` tool is currently planned but not yet implemented. Check future releases for interactive UI automation capabilities.
