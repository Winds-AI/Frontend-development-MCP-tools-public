# Changelog

All notable changes to this project will be documented in this file.

This project adheres to Semantic Versioning.

## [1.3.0] - 2025-08-14
### Added
- npx launcher `afbt-setup` (main process runs connector; Setup UI runs as child)
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
