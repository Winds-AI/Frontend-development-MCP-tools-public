const { execSync } = require("child_process");
const { join } = require("path");
const fs = require("fs");

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

// Helper functions for colored output
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) =>
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) =>
    console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  instruction: (msg) =>
    console.log(
      `\n${colors.cyan}[CHROME EXTENSION SETUP]${colors.reset}\n${msg}\n`
    ),
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
  try {
    execSync("pnpm --version", { stdio: "ignore" });
    return true;
  } catch {
    log.warning("pnpm is not installed. Installing pnpm...");
    try {
      execSync("npm install -g pnpm", { stdio: "inherit" });
      log.success("pnpm installed successfully!");
      return true;
    } catch (error) {
      log.error(
        "Failed to install pnpm. Please install it manually: https://pnpm.io/installation"
      );
      log.error("First install Node.js from https://nodejs.org/");
      return false;
    }
  }
}

// Setup a specific project
async function setupProject(projectName, projectPath) {
  log.info(`Setting up ${projectName}...`);

  if (!fs.existsSync(projectPath)) {
    log.error(`${projectName} directory not found at: ${projectPath}`);
    return false;
  }

  // Install dependencies
  log.info(`Installing dependencies for ${projectName}...`);
  if (!execCommand("pnpm install", projectPath)) return false;

  // Build project
  log.info(`Building ${projectName}...`);
  if (!execCommand("pnpm build", projectPath)) return false;

  log.success(`${projectName} setup completed!`);
  return true;
}

// Show Chrome extension setup instructions
function showChromeInstructions() {
  log.instruction(
    `While the server is starting, please load the Chrome extension:

1. Open Chrome and navigate to chrome://extensions/
2. Enable 'Developer mode' in the top right corner
3. Click 'Load unpacked' button
4. Navigate to the 'chrome-extension' folder in this project
5. Select the folder to load the extension
6. Verify that the extension appears in your Chrome extensions list

The server will start after these instructions. The extension is required for full functionality.`
  );
}

// Main setup function
async function main() {
  // Check for pnpm
  if (!(await checkPnpm())) {
    process.exit(1);
  }

  const rootDir = process.cwd();

  // Setup browser-tools-mcp
  const mcpPath = join(rootDir, "browser-tools-mcp");
  if (!(await setupProject("browser-tools-mcp", mcpPath))) {
    process.exit(1);
  }

  // Setup browser-tools-server
  const serverPath = join(rootDir, "browser-tools-server");
  if (!(await setupProject("browser-tools-server", serverPath))) {
    process.exit(1);
  }

  // Show Chrome extension instructions
  showChromeInstructions();

  // Start the server
  log.info("Starting the server...");
  if (!execCommand("pnpm start", serverPath)) {
    process.exit(1);
  }
}

// Run the setup
main().catch((error) => {
  log.error("Unexpected error occurred:");
  log.error(error.message);
  process.exit(1);
});
