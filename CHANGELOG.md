## 1.4.1
- Setup UI: auto-refresh Chrome extension folder when packaged version changes (backs up and replaces local `chrome-extension/`, writes `.afbt/extension.version`).
# Changelog

## 1.4.0
- api.searchEndpoints now returns `requiresAuth` derived from OpenAPI security (operation-level first, then top-level).
- fetch requests: dynamic token-only path clarified in docs; recommend using `requiresAuth` to decide `includeAuthToken`.
- Setup UI: added dedicated Environment tab; expanded auth config guidance.
- Test script: `tools/test-token-latency.js` for timing token retrieval and API calls.

## 1.3.6
- Internal interim build prior to minor version bump.

# Changelog

All notable changes to this project will be documented in this file.

This project adheres to Semantic Versioning.

## [1.3.0] - 2025-08-14
### Added
- npx launcher `@winds-ai/autonomous-frontend-browser-tools` (main process runs connector; Setup UI runs as child)
- Docs tab in Setup UI with responsive layout and search
- Configure tab: two-column layout with Environment (.env) editor
- Auto-detect `.env` from repo root or `browser-tools-server/.env`; show path and save back to the same file
- Copy `chrome-extension/` assets on first run if missing
- New tool names and backward-compatible aliases (`api.*`, `browser.*`, `ui.*`)
- MCP server bin `afbt-mcp` for npx-based MCP configuration in editors

### Changed
- Improved health/status UI, header actions (Open Health, Open Identity, Close)
- README and SETUP_GUIDE updated for npx-first flow

### Security
- `.env` and `chrome-extension/projects.json` excluded from npm package via `.npmignore`

## [1.2.x]
- Internal iterations prior to public npx flow
