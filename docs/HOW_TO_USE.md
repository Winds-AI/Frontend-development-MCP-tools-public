# List of All Tools

1. `searchApiDocumentation`
2. `fetchLiveApiResponse`
3. `captureBrowserScreenshot`
4. `inspectSelectedElementCss`
5. `inspectBrowserNetworkActivity`
6. `navigateBrowserTab`

# How to Use Browser Tools MCP

To use these tools at their 100% potential you need to understand how all of these fit in the flow and how to explain that to LLM until I perfect the description and names of all tools and make it self-explanatory for most LLMs.

## Updated Workflow with Unified API Testing

### **Workflow 1: API Integration**

Use `searchApiDocumentation` tool to get the expected payload and request types then use `fetchLiveApiResponse` tool to get the real response and then start writing code based on the memory you have setup. It can make new pages/modules/sub-modules etc if that is how you have structured your project.

1. **Automatic API Testing**: Use `fetchLiveApiResponse` tool with just the endpoint and method:

   ```
   Tool: executeAuthenticatedApiCall
   - endpoint: "/api/users"
   - method: "GET"
   ```

   The tool automatically:

   - Retrieves auth token from browser session
   - Makes authenticated API call
   - Returns structured response data
   - Provides detailed response analysis

2. **Development & Integration**
   Based on real API responses from Step 2, the agent can:

- Define accurate TypeScript interfaces
- Use helper functions and custom hooks based on your setup
- Create components with proper data handling
- I have seen 80-90% accuracy in JS projects and 60-70% in TypeScript projects

### **Workflow 2: UI Development & Debugging**

- Use context7 for component library integration
- Use `captureBrowserScreenshot` for UI analysis with Google's 2.5 pro model because it has world knowledge capabilities
- Use `inspectSelectedElementCss` for CSS debugging. ( This tool has the capability of getting the CSS of any element that you have selected in your browser when your developer tools are open)
- Use `inspectBrowserNetworkActivity` for debugging network issues and changes in API responses

### **Workflow 3: Recursive UI Improvements**

- Use `captureBrowserScreenshot` instruct it to use this tool in loop to take screenshot, understand the UI structure and then progressivly improve the UI

### **Workflow 4: Automated Testing & Navigation**

- Use `navigateBrowserTab` for automated testing flows and multi-step workflows
- Combine with `captureBrowserScreenshot` for visual regression testing
- Use for integration testing across different pages and environments
- Navigate between development, staging, and production environments
- Example workflow:
  ```
  1. navigateBrowserTab({ url: "https://app.example.com/login" })
  2. captureBrowserScreenshot({ filename: "login-page" })
  3. navigateBrowserTab({ url: "https://app.example.com/dashboard" })
  4. captureBrowserScreenshot({ filename: "dashboard-page" })
  ```
