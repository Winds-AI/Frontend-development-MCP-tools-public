#!/usr/bin/env node
/*
  Autonomous Frontend Browser Tools — Single entry
  - If launched non-interactively (e.g., by an MCP client over stdio), run the MCP server
  - If launched interactively (TTY), run the Setup UI + Connector
  - You can force behavior with an explicit subcommand:
      npx @winds-ai/autonomous-frontend-browser-tools mcp
      npx @winds-ai/autonomous-frontend-browser-tools setup
*/

const path = require("path");
const { spawnSync } = require("child_process");

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function getNodeMajor() {
  try {
    const v = String(process.versions.node || "0");
    const major = Number(v.split(".")[0]);
    return Number.isNaN(major) ? 0 : major;
  } catch (_) {
    return 0;
  }
}

function runWithCurrentNode(targetFile, args = []) {
  const result = spawnSync(process.execPath, [targetFile, ...args], {
    stdio: "inherit",
  });
  process.exit(result.status == null ? 1 : result.status);
}

function runWithNode20(targetFile, args = []) {
  const env = { ...process.env, AFBT_SHIMMED: "1" };
  const result = spawnSync(
    "npx",
    ["-y", "-p", "node@20", "node", targetFile, ...args],
    { stdio: "inherit", env }
  );
  process.exit(result.status == null ? 1 : result.status);
}

function main() {
  const packageRoot = path.resolve(__dirname, "..");
  const mcpEntry = path.join(packageRoot, "browser-tools-mcp", "dist", "mcp-server.js");
  const setupEntry = path.join(packageRoot, "tools", "afbt-setup.js");

  const sub = String(process.argv[2] || "").toLowerCase();
  const nonInteractive = !isInteractive();
  const mode = sub === "mcp" || process.env.AFBT_FORCE_MCP === "1" || nonInteractive ? "mcp" : "setup";
  const target = mode === "mcp" ? mcpEntry : setupEntry;

  const nodeMajor = getNodeMajor();
  if (nodeMajor < 20 && process.env.AFBT_SHIMMED !== "1") {
    return runWithNode20(target);
  }
  return runWithCurrentNode(target);
}

main();