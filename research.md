# Research for New Tools and Improvements

This document outlines the research and brainstorming process for identifying and evaluating new tools and improvements for the Frontend Development Tools MCP Extension.

## To-Do

- [x] Explore tools for interacting with the DOM.
  - **Findings:**
    - jQuery is a powerful but potentially heavy option.
    - Umbrella JS and QueryX are lightweight alternatives.
    - Modern JavaScript has robust native DOM APIs.
  - **Next Steps:**
    - Investigate Umbrella JS in more detail.
    - Evaluate the native DOM APIs for sufficiency.
- [x] Investigate tools for performance profiling.
  - **Findings:**
    - Browser-based tools like Chrome DevTools are powerful but not easily automated.
    - Libraries like Clinic.js and js-profiler offer programmatic control and structured output.
    - Cloud-based solutions like Google Cloud Profiler are also available.
  - **Next Steps:**
    - Investigate Clinic.js to assess its suitability for creating an MCP tool.
- [x] Research tools for accessibility testing.
  - **Findings:**
    - `axe-core` is a prominent open-source library for automated web UI accessibility testing.
    - Playwright also provides accessibility testing features.
  - **Next Steps:**
    - Investigate `axe-core` for its programmatic integration capabilities and suitability for an MCP tool.
- [x] Explore options for more advanced state management inspection.
  - **Findings:**
    - Existing tools (Redux DevTools, MobX-State-Tree) are framework-specific.
    - A generic state inspection tool would require runtime introspection and potentially framework-specific adapters.
  - **Next Steps:**
    - Investigate methods for generic state inspection, possibly starting with global scope and common patterns.
    - Consider building adapters for popular frameworks if a generic approach proves too limited.
- [x] Research tools for local file system access.
  - **Findings:**
    - Direct, unrestricted local file system access from Chrome extensions is limited due to security.
    - The File System Access API offers user-permissioned access for web apps.
    - Leveraging the existing Node.js server is the most practical and secure approach for file system operations.
  - **Next Steps:**
    - Design an API on the Node.js server to expose file system operations that can be called by the Chrome extension or MCP server.
- [x] Investigate the feasibility of a "live coding" tool.
  - **Findings:**
    - "Live coding" in frontend development often refers to online sandboxes, interview scenarios, or hot-reloading in development environments.
    - For an MCP tool, this could involve real-time code injection/execution and interactive code modification in the browser.
  - **Next Steps:**
    - Explore mechanisms for injecting and executing JavaScript code into the browser from the Node.js server or Chrome extension.
    - Consider how to provide feedback to the AI on the visual or functional outcome of injected code.

## Improving `searchApiDocumentation` Tool

- [x] Research indexing and caching strategies for large JSON files in Node.js.
  - **Findings:**
    - In-memory caching is feasible for parsed Swagger documents.
    - Simple in-memory indexing (e.g., using a hash map or array of objects) can significantly speed up lookups.
    - Libraries like `node-cache` or custom implementations can manage cache invalidation and size.
  - **Next Steps:**
    - Implement an in-memory cache for the parsed Swagger document in `mcp-server.ts`.
    - Create a simple index of API endpoints (e.g., by path, summary, tags) to enable faster searching.
- [ ] Research codebase analysis for API details.
- [x] Research interactive API exploration tools.
  - **Findings:**
    - Existing interactive tools like Swagger UI are designed for human users.
    - For an AI, interactive exploration would involve a set of guided discovery tools.
  - **Next Steps:**
    - Propose new MCP tools: `listApiTags`, `listEndpointsByTag`, `getEndpointDetails`.
    - Design the input and output schemas for these new tools.
    - Consider how these tools would interact with the cached Swagger document.
