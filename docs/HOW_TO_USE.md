# List of All Tools

1. [`searchApiDocumentation`](./each-tool-explained/searchApiDocumentation.md)
2. [`fetchLiveApiResponse`](./each-tool-explained/fetchLiveApiResponse.md)
3. [`captureBrowserScreenshot`](./each-tool-explained/captureBrowserScreenshot.md)
4. [`inspectSelectedElementCss`](./each-tool-explained/inspectSelectedElementCss.md)
5. [`inspectBrowserNetworkActivity`](./each-tool-explained/inspectBrowserNetworkActivity.md)
6. [`navigateBrowserTab`](./each-tool-explained/navigateBrowserTab.md)
7. [`listApiTags`](./each-tool-explained/listApiTags.md)
8. [`inspectBrowserConsole`](./each-tool-explained/inspectBrowserConsole.md)

# How to Use Browser Tools MCP

To use these tools at their 100% potential you need to understand how all of these fit in the flow and how to explain that to LLM until I perfect the description and names of all tools and make it self-explanatory for most LLMs.

## Updated Workflow with Unified API Testing

### **Workflow 1: API Integration**

Use `searchApiDocumentation` to identify endpoints and request/response shapes. Then use `fetchLiveApiResponse` to validate the real response.

1. **Live API Test**: Call `fetchLiveApiResponse` with an endpoint and method.

   ```
   Tool: fetchLiveApiResponse
   - endpoint: "/api/users"
   - method: "GET"
   - includeAuthToken: true // requires API_AUTH_TOKEN to be set
   ```

   The tool:

   - Builds the full URL using `API_BASE_URL`
   - Optionally adds `Authorization: Bearer ${API_AUTH_TOKEN}` if `includeAuthToken` is true
   - Returns structured response details (status, headers, timing) and parsed data

2. **Development & Integration**
   Based on real API responses, the agent can:

   - Define accurate TypeScript interfaces
   - Use your project’s helpers/hooks
   - Create components with proper data handling

### **Workflow 2: UI Development & Debugging**

- Use `captureBrowserScreenshot` for UI analysis (requires a dummy `randomString` param; always returns image)
- Use `inspectSelectedElementCss` for CSS/layout context of the DevTools-selected element
- Use `inspectBrowserNetworkActivity` to inspect recent API calls
- Use `inspectBrowserConsole` to capture JS errors/warnings/logs with filters

### **Workflow 3: Recursive UI Improvements**

- Loop `captureBrowserScreenshot({ randomString: "anything" })` → analyze → apply edits → repeat

### **Workflow 4: Automated Testing & Navigation**

- Use `navigateBrowserTab` for multi-step workflows
- Combine with `captureBrowserScreenshot` for visual checks
- Example:
  ```
  1. navigateBrowserTab({ url: "https://app.example.com/login" })
  2. captureBrowserScreenshot()
  3. navigateBrowserTab({ url: "https://app.example.com/dashboard" })
  4. captureBrowserScreenshot()
  ```

- For environment/config setup, see `docs/SETUP_GUIDE.md`. For architecture and features, see `docs/PROJECT_OVERVIEW.md`.

### End-to-end Example (API + UI)

1. Search docs: [`searchApiDocumentation`](./each-tool-explained/searchApiDocumentation.md) for "users" endpoints
2. Validate live response: [`fetchLiveApiResponse`](./each-tool-explained/fetchLiveApiResponse.md) with includeAuthToken if needed
3. Open page: [`navigateBrowserTab`](./each-tool-explained/navigateBrowserTab.md) to your feature URL
4. Visual check: [`captureBrowserScreenshot`](./each-tool-explained/captureBrowserScreenshot.md) with `{ randomString: "any" }`
5. Inspect failures: [`inspectBrowserNetworkActivity`](./each-tool-explained/inspectBrowserNetworkActivity.md) and [`inspectBrowserConsole`](./each-tool-explained/inspectBrowserConsole.md)
6. Debug CSS: [`inspectSelectedElementCss`](./each-tool-explained/inspectSelectedElementCss.md)
