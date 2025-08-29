# List of All Tools

1. [`api.searchEndpoints`](./each-tool-explained/api_searchEndpoints.md)
2. [`api.request`](./each-tool-explained/api_request.md)
3. [`browser.screenshot`](./each-tool-explained/browser_screenshot.md)
4. [`ui.inspectElement`](./each-tool-explained/ui_inspectElement.md)
5. [`browser.network.inspect`](./each-tool-explained/browser_network_inspect.md)
6. [`browser.navigate`](./each-tool-explained/browser_navigate.md)
7. [`api.listTags`](./each-tool-explained/api_listTags.md)
8. [`browser.console.read`](./each-tool-explained/browser_console_read.md)

# How to Use Browser Tools MCP

To use these tools at their 100% potential you need to understand how all of these fit in the flow and how to explain that to LLM until I perfect the description and names of all tools and make it self-explanatory for most LLMs.

## Updated Workflow with Unified API Testing

### **Workflow 1: API Integration**

tell agent to use `api.searchEndpoints` to identify endpoints required for specific feature and then use `api.request` to validate the real responses and use those to do api integration with error handling and user feedback handling.
Tip: most models will halucinate the user feedback toast every time and will not use the toast setup you have done so always mention the refrence of where to find this for accurate api integration.

1. **Live API Test**

   ```
   Tool: api.request
   - endpoint: "/api/users"
   - method: "GET"
   - includeAuthToken: true // dynamic token retrieval when AUTH_STORAGE_TYPE + AUTH_TOKEN_KEY (+ optional AUTH_ORIGIN) are configured
   ```

   - Builds URL using `API_BASE_URL`
   - If `includeAuthToken` is true, retrieves a token via the extension and caches it per project (TTL from `API_AUTH_TOKEN_TTL_SECONDS` or JWT exp)
   - Returns structured details (status, headers, timing) and parsed data

2. **Development & Integration**
   - Define accurate TypeScript interfaces
   - Use your project’s helpers/hooks
   - Create components with proper data handling

### **Workflow 2: UI Development & Debugging**

- Use `browser.screenshot` for UI analysis (requires a dummy `randomString` param; always returns image)
- Use `ui.inspectElement` for CSS/layout context of the DevTools-selected element
- Use `browser.network.inspect` to inspect recent API calls
- Use `browser.console.read` to capture JS errors/warnings/logs with filters

### **Workflow 3: Recursive UI Improvements**

- Loop `browser.screenshot({ randomString: "anything" })` → analyze → apply edits → repeat along with `browser.console.read` to capture JS errors/warnings/logs with filters. 

### **Workflow 4: Automated Testing & Navigation**

- Use `browser.navigate` for multi-step workflows
- Combine with `browser.screenshot` for visual checks
- Example:

  ```
  1. browser.navigate({ url: "https://app.example.com/login" })
  2. browser.screenshot({ randomString: "any" })
  3. browser.navigate({ url: "https://app.example.com/dashboard" })
  4. browser.screenshot({ randomString: "any" })
  ```

- For environment/config setup, see `docs/SETUP_GUIDE.md` (root `projects.json`, `browser-tools-server/.env`, Setup UI tabs). For architecture and features, see `docs/PROJECT_OVERVIEW.md`.

### End-to-end Example (API + UI)

1. Search docs: [`api.searchEndpoints`](./each-tool-explained/api_searchEndpoints.md) for "users" endpoints
2. Validate live response: [`api.request`](./each-tool-explained/api_request.md) with `includeAuthToken` if needed
3. Open page: [`browser.navigate`](./each-tool-explained/browser_navigate.md) to your feature URL
4. Visual check: [`browser.screenshot`](./each-tool-explained/browser_screenshot.md) with `{ randomString: "any" }`
5. Inspect failures: [`browser.network.inspect`](./each-tool-explained/browser_network_inspect.md) and [`browser.console.read`](./each-tool-explained/browser_console_read.md)
6. Debug CSS: [`ui.inspectElement`](./each-tool-explained/ui_inspectElement.md)

Note: `ui.interact` is planned but disabled in the current build.
