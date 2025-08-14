#!/usr/bin/env node
/*
  Autonomous Frontend Browser Tools — Single entry
  - If launched non-interactively (e.g., by an MCP client over stdio), run the MCP server
  - If launched interactively (TTY), run the Setup UI + Connector
  - You can force behavior with an explicit subcommand:
      npx @winds-ai/autonomous-frontend-browser-tools mcp
      npx @winds-ai/autonomous-frontend-browser-tools setup
*/
const path = require('path');
const { spawn } = require('child_process');

const packageRoot = path.resolve(__dirname, '..');
const mcpEntry = path.join(packageRoot, 'browser-tools-mcp', 'dist', 'mcp-server.js');
const setupEntry = path.join(packageRoot, 'tools', 'afbt-setup.js');

function isInteractive() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function runNode(file, args = []) {
  const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code));
}

const sub = (process.argv[2] || '').toLowerCase();
if (sub === 'mcp' || process.env.AFBT_FORCE_MCP === '1' || !isInteractive()) {
  runNode(mcpEntry);
} else {
  // default: interactive Setup UI + Connector
  runNode(setupEntry);
}


