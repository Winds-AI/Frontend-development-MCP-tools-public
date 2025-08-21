#!/usr/bin/env node
/*
  Autonomous Frontend Browser Tools — Single entry
  - If launched non-interactively (e.g., by an MCP client over stdio), run the MCP server
  - If launched interactively (TTY), run the Setup UI + Connector
  - You can force behavior with an explicit subcommand:
      npx @winds-ai/autonomous-frontend-browser-tools mcp
      npx @winds-ai/autonomous-frontend-browser-tools setup
*/
// Enforce Node.js runtime requirement early (undici File/Blob/FormData require Node >= 20)
try {
  const major = Number((process.versions.node || "0").split(".")[0]);
  if (!Number.isNaN(major) && major < 20) {
    console.error(
      `\n@winds-ai/autonomous-frontend-browser-tools requires Node.js >= 20.\nDetected ${process.version}.\n\nPlease upgrade Node and re-run, for example:\n  - nvm install 20 && nvm use 20\n  - or install Node 20/22 LTS from nodejs.org\n\nThen run: npx @winds-ai/autonomous-frontend-browser-tools\n`
    );
    process.exit(1);
  }
} catch (_) {}
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


