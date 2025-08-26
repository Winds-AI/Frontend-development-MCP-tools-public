const { execSync } = require("child_process");
const { join } = require("path");
const fs = require("fs");

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  // Standard colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  
  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  
  // Bright colors
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  
  // Bright blue for headers
  brightBlue: "\x1b[94m",
};

// Unicode characters for UI elements
const uiChars = {
  tick: "✓",
  cross: "✗",
  warning: "⚠",
  info: "ℹ",
  arrow: "▶",
  bullet: "•",
  boxTopLeft: "┌",
  boxTopRight: "┐",
  boxBottomLeft: "└",
  boxBottomRight: "┘",
  boxHorizontal: "─",
  boxVertical: "│",
  boxLeftT: "├",
  boxRightT: "┤",
  boxTopT: "┬",
  boxBottomT: "┴",
  boxCross: "┼",
};

// Helper functions for colored output
const log = {
  info: (msg) => console.log(`${colors.blue}${uiChars.info}${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}${uiChars.tick}${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}${uiChars.warning}${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}${uiChars.cross}${colors.reset} ${msg}`),
  instruction: (msg) => console.log(`${colors.cyan}${uiChars.arrow}${colors.reset} ${msg}`),
  header: (msg) => {
    const width = 60;
    const padding = Math.max(0, Math.floor((width - msg.length) / 2));
    const headerLine = `${uiChars.boxTopLeft}${uiChars.boxHorizontal.repeat(width)}${uiChars.boxTopRight}`;
    const footerLine = `${uiChars.boxBottomLeft}${uiChars.boxHorizontal.repeat(width)}${uiChars.boxBottomRight}`;
    console.log(`\n${colors.brightBlue}${headerLine}${colors.reset}`);
    console.log(`${colors.brightBlue}${uiChars.boxVertical}${colors.reset}${" ".repeat(padding)}${colors.bright}${msg}${colors.reset}${" ".repeat(width - msg.length - padding)}${colors.brightBlue}${uiChars.boxVertical}${colors.reset}`);
    console.log(`${colors.brightBlue}${footerLine}${colors.reset}\n`);
  },
  section: (title) => {
    const width = 50;
    const padding = Math.max(0, Math.floor((width - title.length) / 2));
    const line = `${uiChars.boxLeftT}${uiChars.boxHorizontal.repeat(padding)}${title}${uiChars.boxHorizontal.repeat(width - title.length - padding)}${uiChars.boxRightT}`;
    console.log(`\n${colors.blue}${line}${colors.reset}`);
  },
  box: (title, content) => {
    const width = 70;
    const titleLine = `${uiChars.boxTopLeft}${uiChars.boxHorizontal.repeat(2)}${title}${uiChars.boxHorizontal.repeat(width - title.length - 2)}${uiChars.boxTopRight}`;
    console.log(`\n${colors.cyan}${titleLine}${colors.reset}`);
    
    const lines = content.split('\n');
    lines.forEach(line => {
      const padding = width - 4 - line.length;
      console.log(`${colors.cyan}${uiChars.boxVertical}${colors.reset}  ${line}${" ".repeat(padding > 0 ? padding : 0)}  ${colors.cyan}${uiChars.boxVertical}${colors.reset}`);
    });
    
    const bottomLine = `${uiChars.boxBottomLeft}${uiChars.boxHorizontal.repeat(width)}${uiChars.boxBottomRight}`;
    console.log(`${colors.cyan}${bottomLine}${colors.reset}\n`);
  }
};

// Show Chrome extension reminder
function showChromeInstructions() {
  log.header("Chrome Extension Required");
  
  const instructions = `
Please ensure the Chrome extension is loaded:

1. Open Chrome and navigate to ${colors.underscore}chrome://extensions/${colors.reset}
2. Enable ${colors.bright}'Developer mode'${colors.reset} in the top right corner
3. Click ${colors.bright}'Load unpacked'${colors.reset} button
4. Navigate to the ${colors.bright}'chrome-extension'${colors.reset} folder in this project
5. Select the folder to load the extension
6. Verify that the extension appears in your Chrome extensions list

${colors.yellow}The extension is required for full functionality.${colors.reset}

${colors.dim}Keep Chrome DevTools (F12) open on your target tab when using browser/UI tools.${colors.reset}
  `.trim();
  
  log.box("Chrome Extension Setup", instructions);
}

// Show server information
function showServerInfo() {
  log.header("Browser Tools Server");
  
  console.log(`${colors.bright}Server is now running!${colors.reset}\n`);
  
  console.log(`${uiChars.info} Connector server is listening on port ${colors.bright}3025${colors.reset}`);
  console.log(`${uiChars.info} Health endpoint: ${colors.dim}http://127.0.0.1:3025/connection-health${colors.reset}`);
  console.log(`${uiChars.info} Identity endpoint: ${colors.dim}http://127.0.0.1:3025/.identity${colors.reset}\n`);
  
  console.log(`${colors.bright}Using the tools:${colors.reset}`);
  console.log(`${uiChars.bullet} Configure your MCP client (e.g., Cursor) to connect to this server`);
  console.log(`${uiChars.bullet} Keep DevTools open on your target tab when using browser tools`);
  console.log(`${uiChars.bullet} The extension must be loaded in Chrome`);
  
  console.log(`\n${colors.yellow}Press Ctrl+C to stop the server${colors.reset}`);
}

// Main function
async function main() {
  log.header("Starting Browser Tools Server");
  
  const [major] = process.versions.node.split(".").map(Number);
  if (Number.isFinite(major) && major < 20) {
    log.error(`Node ${process.versions.node} detected. Node 20+ is required.`);
    console.log(`Please upgrade Node (e.g., via nvm: ${colors.dim}nvm install 20 && nvm use 20${colors.reset}).`);
    process.exit(1);
  }
  
  const rootDir = process.cwd();
  const serverPath = join(rootDir, "browser-tools-server");

  // Check if server directory exists
  if (!fs.existsSync(serverPath)) {
    log.error("browser-tools-server directory not found!");
    console.log(`Please run the initial setup first: ${colors.dim}node setup.js${colors.reset}`);
    process.exit(1);
  }

  // Show Chrome extension instructions
  showChromeInstructions();

  // Start the server
  log.section("Starting Server");
  log.info("Starting the browser tools server...");
  try {
    showServerInfo();
    execSync("pnpm start", {
      cwd: serverPath,
      stdio: "inherit",
      shell: true,
    });
  } catch (error) {
    log.error("Failed to start the server:");
    log.error(error.message);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  log.error("Unexpected error occurred:");
  log.error(error.message);
  process.exit(1);
});