import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";

/**
 * Unified Screenshot Service
 *
 * Provides a centralized system for organizing and saving screenshots
 * with intelligent project-based directory structure and URL categorization.
 */

export interface ScreenshotConfig {
  filename?: string;
  returnImageData?: boolean;
  projectName?: string;
  baseDirectory?: string;
}

export interface ScreenshotResult {
  filePath: string;
  filename: string;
  imageData?: string;
  projectDirectory: string;
  urlCategory: string;
}

export interface ScreenshotPathResolution {
  baseDirectory: string;
  projectDirectory: string;
  urlCategory: string;
  filename: string;
  fullPath: string;
}

export class ScreenshotService {
  private static instance: ScreenshotService;
  private readonly DEFAULT_BASE_FOLDER = "MCP_Screenshots";

  private constructor() {}

  public static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService();
    }
    return ScreenshotService.instance;
  }

  /**
   * Main method to save screenshots with unified organization
   */
  public async saveScreenshot(
    base64Data: string,
    url?: string,
    config: ScreenshotConfig = {}
  ): Promise<ScreenshotResult> {
    // Clean base64 data
    const cleanBase64 = this.cleanBase64Data(base64Data);

    // Resolve the complete path structure
    const pathResolution = this.resolveScreenshotPath(url, config);

    // Ensure directory exists
    await this.ensureDirectoryExists(path.dirname(pathResolution.fullPath));

    // Save the file
    await this.writeScreenshotFile(pathResolution.fullPath, cleanBase64);

    // Build result object
    const result: ScreenshotResult = {
      filePath: pathResolution.fullPath,
      filename: pathResolution.filename,
      projectDirectory: pathResolution.projectDirectory,
      urlCategory: pathResolution.urlCategory,
    };

    // Include image data if requested
    if (config.returnImageData) {
      result.imageData = cleanBase64;
    }

    console.log(`Screenshot saved: ${pathResolution.fullPath}`);
    return result;
  }

  /**
   * Resolve the complete path structure for a screenshot
   */
  private resolveScreenshotPath(
    url?: string,
    config: ScreenshotConfig = {}
  ): ScreenshotPathResolution {
    // 1. Determine base directory
    const baseDirectory = this.resolveBaseDirectory(config.baseDirectory);

    // 2. Determine project directory
    const projectDirectory = this.resolveProjectDirectory(config.projectName);

    // 3. Determine URL category (subfolder based on URL)
    const urlCategory = this.resolveUrlCategory(url);

    // 4. Generate filename
    const filename = this.generateFilename(url, config.filename);

    // 5. Build full path
    const fullPath = path.join(
      baseDirectory,
      projectDirectory,
      urlCategory,
      filename
    );

    return {
      baseDirectory,
      projectDirectory,
      urlCategory,
      filename,
      fullPath,
    };
  }

  /**
   * Determine the base directory for screenshots
   */
  private resolveBaseDirectory(configuredPath?: string): string {
    if (configuredPath && path.isAbsolute(configuredPath)) {
      return configuredPath;
    }

    // Check environment variable
    const envPath = process.env.SCREENSHOT_STORAGE_PATH;
    if (envPath && path.isAbsolute(envPath)) {
      return envPath;
    }

    // Default to Downloads/MCP_Screenshots
    const downloadsFolder = this.getDefaultDownloadsFolder();
    return path.join(downloadsFolder, this.DEFAULT_BASE_FOLDER);
  }

  /**
   * Determine project directory name
   */
  private resolveProjectDirectory(configuredProject?: string): string {
    console.log("Screenshot Service: Resolving project directory");

    // First priority: configuredProject parameter (from MCP server)
    if (configuredProject && configuredProject.trim()) {
      console.log(
        "Screenshot Service: Using configured project name:",
        configuredProject
      );
      return this.sanitizeDirectoryName(configuredProject);
    }

    // Fallback to generic folder
    console.log(
      "Screenshot Service: Using fallback project name: default-project"
    );
    return "default-project";
  }

  /**
   * Determine URL category (subfolder based on URL path)
   */
  private resolveUrlCategory(url?: string): string {
    if (!url || url === "about:blank") {
      return "general";
    }

    try {
      const urlObj = new URL(url);

      // Handle localhost with specific logic
      if (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1") {
        return this.categorizeLocalUrl(urlObj);
      }

      // Handle staging/production environments
      if (
        urlObj.hostname.includes("staging") ||
        urlObj.hostname.includes("dev")
      ) {
        return this.categorizeEnvironmentUrl(urlObj, "staging");
      }

      if (
        urlObj.hostname.includes("prod") ||
        !urlObj.hostname.includes("localhost")
      ) {
        return this.categorizeEnvironmentUrl(urlObj, "production");
      }

      // Default path-based categorization
      return this.categorizeByPath(urlObj.pathname);
    } catch (error) {
      console.warn(`Failed to parse URL for categorization: ${url}`, error);
      return "uncategorized";
    }
  }

  /**
   * Categorize localhost URLs
   */
  private categorizeLocalUrl(urlObj: URL): string {
    const pathSegments = urlObj.pathname
      .split("/")
      .filter((segment) => segment.length > 0);

    if (pathSegments.length === 0) {
      return "home";
    }

    // Use first meaningful path segment
    const category = pathSegments[0];
    return this.sanitizeDirectoryName(category);
  }

  /**
   * Categorize URLs by environment
   */
  private categorizeEnvironmentUrl(urlObj: URL, environment: string): string {
    const pathCategory = this.categorizeByPath(urlObj.pathname);
    return `${environment}/${pathCategory}`;
  }

  /**
   * Categorize by URL path
   */
  private categorizeByPath(pathname: string): string {
    const pathSegments = pathname
      .split("/")
      .filter((segment) => segment.length > 0);

    if (pathSegments.length === 0) {
      return "home";
    }

    // Use first meaningful path segment
    return this.sanitizeDirectoryName(pathSegments[0]);
  }

  /**
   * Generate screenshot filename
   */
  private generateFilename(url?: string, customFilename?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (customFilename && customFilename.trim()) {
      const sanitized = this.sanitizeFilename(customFilename);
      return `${timestamp}_${sanitized}.png`;
    }

    // Generate filename from URL
    if (url) {
      const urlBasedName = this.generateUrlBasedFilename(url);
      return `${timestamp}_${urlBasedName}.png`;
    }

    // Fallback to timestamp only
    return `${timestamp}_screenshot.png`;
  }

  /**
   * Generate filename based on URL content
   */
  private generateUrlBasedFilename(url: string): string {
    try {
      const urlObj = new URL(url);

      // Extract meaningful parts from the URL
      const pathSegments = urlObj.pathname
        .split("/")
        .filter((segment) => segment.length > 0);

      if (pathSegments.length === 0) {
        return "homepage";
      }

      // Use last meaningful segment or combine multiple segments
      if (pathSegments.length === 1) {
        return this.sanitizeFilename(pathSegments[0]);
      }

      // Combine last 2 segments for more context
      const lastTwoSegments = pathSegments.slice(-2).join("-");
      return this.sanitizeFilename(lastTwoSegments);
    } catch (error) {
      return "page";
    }
  }

  /**
   * Detect git repository name
   */
  private detectGitProjectName(): string | null {
    try {
      // Try to get git remote origin URL
      const { execSync } = require("child_process");
      const remoteUrl = execSync("git config --get remote.origin.url", {
        encoding: "utf8",
        cwd: process.cwd(),
        timeout: 1000,
      }).trim();

      // Extract repository name from git URL
      const match = remoteUrl.match(/\/([^\/]+?)(?:\.git)?$/);
      if (match && match[1]) {
        return match[1];
      }
    } catch (error) {
      // Git not available or not in a git repository
    }

    return null;
  }

  /**
   * Clean base64 data by removing data URL prefix
   */
  private cleanBase64Data(base64Data: string): string {
    return base64Data.replace(/^data:image\/[^;]+;base64,/, "");
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Write screenshot file to disk
   */
  private async writeScreenshotFile(
    filePath: string,
    base64Data: string
  ): Promise<void> {
    try {
      await fs.promises.writeFile(filePath, base64Data, "base64");
    } catch (error) {
      throw new Error(`Failed to write screenshot file ${filePath}: ${error}`);
    }
  }

  /**
   * Get default downloads folder based on OS
   */
  private getDefaultDownloadsFolder(): string {
    const homeDir = os.homedir();

    switch (os.platform()) {
      case "darwin": // macOS
        return path.join(homeDir, "Downloads");
      case "win32": // Windows
        return path.join(homeDir, "Downloads");
      default: // Linux and others
        return path.join(homeDir, "Downloads");
    }
  }

  /**
   * Sanitize directory name for filesystem
   */
  private sanitizeDirectoryName(name: string): string {
    return name
      .replace(/[\/\\?%*:|"<>\s#&+=]/g, "-") // Replace invalid chars with dash
      .replace(/-+/g, "-") // Replace multiple dashes with single dash
      .replace(/^-+|-+$/g, "") // Remove leading/trailing dashes
      .toLowerCase() // Convert to lowercase for consistency
      .substring(0, 50); // Limit length
  }

  /**
   * Sanitize filename for filesystem
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[\/\\?%*:|"<>\s#&+=]/g, "_") // Replace invalid chars with underscore
      .replace(/_+/g, "_") // Replace multiple underscores with single underscore
      .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
      .substring(0, 100); // Limit length
  }

  /**
   * Execute auto-paste functionality on macOS
   */
  public async executeAutoPaste(filePath: string): Promise<void> {
    if (os.platform() !== "darwin") {
      console.log("Auto-paste is only supported on macOS");
      return;
    }

    const appleScript = `
      set imagePath to "${filePath}"
      
      try
        set the clipboard to (read (POSIX file imagePath) as «class PNGf»)
      on error errMsg
        log "Error copying image to clipboard: " & errMsg
        return "Failed to copy image to clipboard: " & errMsg
      end try
      
      try
        tell application "Cursor"
          activate
        end tell
      on error errMsg
        log "Error activating Cursor: " & errMsg
        return "Failed to activate Cursor: " & errMsg
      end try
      
      delay 3
      
      try
        tell application "System Events"
          tell process "Cursor"
            if (count of windows) is 0 then
              return "No windows found in Cursor"
            end if
            
            keystroke "v" using command down
            delay 1
            keystroke "here is the screenshot"
            delay 1
            key code 36
            delay 0.5
            keystroke return
            return "Successfully pasted screenshot into Cursor"
          end tell
        end tell
      on error errMsg
        log "Error in System Events: " & errMsg
        return "Failed in System Events: " & errMsg
      end try
    `;

    return new Promise((resolve, reject) => {
      exec(`osascript -e '${appleScript}'`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Auto-paste error: ${error.message}`);
          console.error(`stderr: ${stderr}`);
          reject(error);
        } else {
          console.log(`Auto-paste executed successfully: ${stdout}`);
          resolve();
        }
      });
    });
  }
}

export default ScreenshotService;
