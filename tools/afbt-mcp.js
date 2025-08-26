#!/usr/bin/env node
// Force MCP mode via the unified entry, with Node 20 auto-shim handled there
const path = require("path");
const { spawnSync } = require("child_process");

const entry = path.resolve(__dirname, "./afbt-entry.js");
const result = spawnSync(process.execPath, [entry, "mcp"], { stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);


