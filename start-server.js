const { execSync } = require("child_process");
const { join } = require("path");
const fs = require("fs");

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

// Helper functions for colored output
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) =>
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  instruction: (msg) =>
    console.log(
      `\n${colors.cyan}[CHROME EXTENSION SETUP]${colors.reset}\n${msg}\n`
    ),
};

// Show Chrome extension reminder
function showChromeInstructions() {
  log.instruction(
    `Please ensure the Chrome extension is loaded:

1. Open Chrome and navigate to chrome://extensions/
2. Enable 'Developer mode' in the top right corner
3. Click 'Load unpacked' button
4. Navigate to the 'chrome-extension' folder in this project
5. Select the folder to load the extension
6. Verify that the extension appears in your Chrome extensions list

The server will start after these instructions. The extension is required for full functionality.`
  );
}

// Main function
async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (Number.isFinite(major) && major < 20) {
    log.error(
      `Node ${process.versions.node} detected. Node 20+ is required. Please upgrade Node (e.g., via nvm: nvm install 20 && nvm use 20).`
    );
    process.exit(1);
  }
  const rootDir = process.cwd();
  const serverPath = join(rootDir, "browser-tools-server");

  // Check if server directory exists
  if (!fs.existsSync(serverPath)) {
    log.error("browser-tools-server directory not found!");
    log.error("Please run the initial setup first: node setup.js");
    process.exit(1);
  }

  // Show Chrome extension instructions
  showChromeInstructions();

  // Start the server
  log.info("Starting the server...");
  try {
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
