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
  },
  progress: (current, total, message) => {
    const width = 40;
    const progress = Math.floor((current / total) * width);
    const bar = `${uiChars.boxHorizontal.repeat(progress)}${" ".repeat(width - progress)}`;
    const percentage = Math.floor((current / total) * 100);
    console.log(`\r${colors.cyan}[${colors.green}${bar.substring(0, progress)}${colors.dim}${bar.substring(progress)}${colors.cyan}]${colors.reset} ${percentage}% ${message}${" ".repeat(20)}`);
  },
  clearProgress: () => {
    process.stdout.write('\r\x1b[K');
  }
};

// Execute command and handle errors
function execCommand(command, cwd = process.cwd()) {
  try {
    execSync(command, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    return true;
  } catch (error) {
    log.error(`Failed to execute: ${command}`);
    log.error(error.message);
    return false;
  }
}

// Check if pnpm is installed
async function checkPnpm() {
  log.section("Dependency Check");
  try {
    execSync("pnpm --version", { stdio: "ignore" });
    log.success("pnpm is already installed");
    return true;
  } catch {
    log.warning("pnpm is not installed. Installing pnpm...");
    try {
      execSync("npm install -g pnpm", { stdio: "inherit" });
      log.success("pnpm installed successfully!");
      return true;
    } catch (error) {
      log.error("Failed to install pnpm. Please install it manually:");
      console.log(`${colors.dim}https://pnpm.io/installation${colors.reset}`);
      console.log(`First install Node.js from ${colors.dim}https://nodejs.org/${colors.reset}`);
      return false;
    }
  }
}

// Setup a specific project
async function setupProject(projectName, projectPath, step, totalSteps) {
  log.section(`Setting up ${projectName}`);
  
  if (!fs.existsSync(projectPath)) {
    log.error(`${projectName} directory not found at: ${projectPath}`);
    return false;
  }

  // Install dependencies
  log.progress(step, totalSteps, `Installing dependencies for ${projectName}...`);
  if (!execCommand("pnpm install", projectPath)) {
    log.clearProgress();
    return false;
  }
  log.clearProgress();

  // Build project
  log.progress(step + 1, totalSteps, `Building ${projectName}...`);
  if (!execCommand("pnpm build", projectPath)) {
    log.clearProgress();
    return false;
  }
  log.clearProgress();

  log.success(`${projectName} setup completed!`);
  return true;
}

// Show Chrome extension setup instructions
function showChromeInstructions() {
  log.header("Chrome Extension Setup");
  
  const instructions = `
While the server is starting, please load the Chrome extension:

1. Open Chrome and navigate to ${colors.underscore}chrome://extensions/${colors.reset}
2. Enable ${colors.bright}'Developer mode'${colors.reset} in the top right corner
3. Click ${colors.bright}'Load unpacked'${colors.reset} button
4. Navigate to the ${colors.bright}'chrome-extension'${colors.reset} folder in this project
5. Select the folder to load the extension
6. Verify that the extension appears in your Chrome extensions list

${colors.yellow}The extension is required for full functionality.${colors.reset}
  `.trim();
  
  log.box("Chrome Extension Setup Instructions", instructions);
}

// Show next steps
function showNextSteps() {
  log.header("Setup Complete!");
  
  const nextSteps = `
${uiChars.tick} The browser tools server has been set up successfully!

${colors.bright}Next steps:${colors.reset}

1. ${uiChars.bullet} Load the Chrome extension (if you haven't already)
2. ${uiChars.bullet} Start the server with: ${colors.bright}pnpm start${colors.reset}
3. ${uiChars.bullet} Configure your projects in the Setup UI
4. ${uiChars.bullet} Connect your MCP client (e.g., Cursor) to the server

${colors.bright}Documentation:${colors.reset}
${uiChars.bullet} README: ${colors.dim}README.md${colors.reset}
${uiChars.bullet} Setup Guide: ${colors.dim}docs/SETUP_GUIDE.md${colors.reset}
${uiChars.bullet} How to Use: ${colors.dim}docs/HOW_TO_USE.md${colors.reset}

${colors.bright}Need help?${colors.reset}
${uiChars.bullet} Check the documentation files in the ${colors.dim}docs/${colors.reset} directory
${uiChars.bullet} Report issues on GitHub
  `.trim();
  
  console.log(nextSteps);
}

// Main setup function
async function main() {
  log.header("Autonomous Frontend Browser Tools Setup");
  
  console.log(`${colors.dim}This setup will install dependencies and build the required components${colors.reset}\n`);
  
  const [major] = process.versions.node.split(".").map(Number);
  if (Number.isFinite(major) && major < 20) {
    log.error(`Node ${process.versions.node} detected. Node 20+ is required.`);
    console.log(`Please upgrade Node (e.g., via nvm: ${colors.dim}nvm install 20 && nvm use 20${colors.reset}).`);
    process.exit(1);
  }
  
  // Check for pnpm
  if (!(await checkPnpm())) {
    process.exit(1);
  }

  const rootDir = process.cwd();
  const totalSteps = 4; // pnpm check + 2 projects setup + start UI

  // Setup browser-tools-mcp
  const mcpPath = join(rootDir, "browser-tools-mcp");
  if (!(await setupProject("browser-tools-mcp", mcpPath, 1, totalSteps))) {
    process.exit(1);
  }

  // Setup browser-tools-server
  const serverPath = join(rootDir, "browser-tools-server");
  if (!(await setupProject("browser-tools-server", serverPath, 2, totalSteps))) {
    process.exit(1);
  }

  // Show Chrome extension instructions
  showChromeInstructions();

  // Launch Setup UI (same experience as npx afbt-setup)
  log.section("Launching Setup UI");
  log.info("Launching Setup UI on http://127.0.0.1:5055 ...");
  try {
    execCommand("node tools/afbt-setup.js", rootDir);
  } catch (e) {
    log.warning("Setup UI could not be launched automatically.");
    console.log(`You can run it manually with: ${colors.dim}pnpm run setup:ui${colors.reset}`);
  }

  // Show next steps
  showNextSteps();
}

// Run the setup
main().catch((error) => {
  log.error("Unexpected error occurred:");
  log.error(error.message);
  process.exit(1);
});