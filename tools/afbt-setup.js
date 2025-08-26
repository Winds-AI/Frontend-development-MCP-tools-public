const { execSync, spawn, exec } = require("child_process");
const path = require("path");
const { join, resolve } = path;
const fs = require("fs");
const http = require("http");

// Try to require optional chrome-launcher gracefully
let chromeLauncher = null;
try {
  chromeLauncher = require("chrome-launcher");
} catch (_) {}

const PORT = process.env.AFBT_SETUP_PORT
  ? parseInt(process.env.AFBT_SETUP_PORT, 10)
  : 5055;

const repoRoot = process.cwd();
const packageRoot = resolve(__dirname, "..");
const extensionDir = join(repoRoot, "chrome-extension");
// Root-level projects.json (single source of truth)
const projectsJsonPath = process.env.AFBT_PROJECTS_JSON
  ? resolve(process.env.AFBT_PROJECTS_JSON)
  : join(repoRoot, "projects.json");
const serverDir = join(repoRoot, "browser-tools-server");
const distEntry = join(serverDir, "dist", "browser-connector.js");
const afbtDir = join(repoRoot, ".afbt");
const embeddedExtensionDir = join(packageRoot, "chrome-extension");
const embeddedDocsDir = join(packageRoot, "docs");
const embeddedReadme = join(packageRoot, "README.md");
const serverEnvPath = join(serverDir, ".env");

function ensureAfbtDir() {
  if (!fs.existsSync(afbtDir)) fs.mkdirSync(afbtDir, { recursive: true });
}

function resolveConnectorEntry() {
  // 1) Prefer embedded dist inside this installed package
  const embedded = join(
    packageRoot,
    "browser-tools-server",
    "dist",
    "browser-connector.js"
  );
  if (fs.existsSync(embedded)) return embedded;
  // 2) Fallback to local working directory (dev) path
  return distEntry;
}

// No server-side skeleton creation anymore; UI shows a template client-side
function ensureProjectsJsonExists() {
  // Intentionally no-op; existence is optional until user saves from UI
}

function copyExtensionAssetsIfMissing() {
  try {
    const manifestPath = join(extensionDir, "manifest.json");
    // Determine package version (from root package.json of installed package)
    let pkgVersion = "0.0.0";
    try {
      const rootPkg = JSON.parse(
        fs.readFileSync(join(packageRoot, "package.json"), "utf8")
      );
      if (rootPkg && typeof rootPkg.version === "string")
        pkgVersion = rootPkg.version;
    } catch {}

    const versionMarker = join(afbtDir, "extension.version");
    let localVersion = null;
    try {
      if (fs.existsSync(versionMarker)) {
        localVersion = fs.readFileSync(versionMarker, "utf8").trim();
      } else if (fs.existsSync(manifestPath)) {
        const man = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (man && typeof man.version === "string") localVersion = man.version;
      }
    } catch {}

    // Detect local dev: if embedded extension dir is same as extensionDir, skip copying entirely
    const isLocalDev =
      resolve(embeddedExtensionDir) === resolve(extensionDir);

    // Copy when: (not local dev) and (extension missing, or packaged version differs)
    const needsCopy =
      !isLocalDev &&
      (!fs.existsSync(manifestPath) || localVersion !== pkgVersion) &&
      fs.existsSync(embeddedExtensionDir);

    if (needsCopy) {
      // Replace extension assets (no backups). Ensure any old content is overwritten.
      fs.cpSync(embeddedExtensionDir, extensionDir, { recursive: true });
      // Ensure no projects.json remains in chrome-extension (config now lives at project root)
      try { fs.unlinkSync(join(extensionDir, "projects.json")); } catch {}
      console.log("Updated chrome-extension assets at:", extensionDir);
      try {
        if (!fs.existsSync(afbtDir)) fs.mkdirSync(afbtDir, { recursive: true });
        fs.writeFileSync(versionMarker, String(pkgVersion || "0.0.0"));
      } catch {}
    } else {
      if (isLocalDev) {
        console.log("Local dev mode: skipping extension copy.");
      } else {
        console.log(
          "Chrome extension assets up-to-date (package=%s, local=%s). Skipping copy.",
          pkgVersion,
          localVersion || "unknown"
        );
      }
    }
  } catch (e) {
    console.warn("Could not copy chrome-extension assets:", e?.message || e);
  }
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function serveHtml(res) {
  const launchedByMain = process.env.AFBT_PARENT === "main";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autonomous Frontend Browser Tools — Enhanced Setup</title>
  <style>
    :root { 
      --bg: #0f172a;
      --panel: #1e293b;
      --panel-hover: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      --border: #334155;
      --accent-primary: #3b82f6;
      --accent-secondary: #60a5fa;
      --accent-tertiary: #1e40af;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --info: #0ea5e9;
      --header-h: 70px;
      --footer-h: 45px;
      --transition: all 0.2s ease;
    }
    
    * {
      box-sizing: border-box;
    }
    
    html, body { 
      height: 100%; 
      margin: 0;
      padding: 0;
    }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      background: var(--bg);
      color: var(--text-primary);
    }
    
    header { 
      padding: 12px clamp(16px, 2vw, 32px);
      background: #111827;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      height: var(--header-h);
    }
    
    h1 { 
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0;
      letter-spacing: -0.02em;
    }
    
    nav { 
      display: flex;
      gap: 8px;
    }
    
    nav button { 
      background: transparent;
      color: var(--text-secondary);
      border: 0;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: var(--transition);
    }
    
    nav button.active, nav button:hover { 
      background: var(--panel-hover);
      color: var(--text-primary);
    }
    
    .top-actions { 
      display: flex;
      gap: 12px;
    }
    
    .action-button {
      text-decoration: none;
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--panel);
      color: var(--text-primary);
      border: 1px solid var(--border);
      cursor: pointer;
      font-weight: 500;
      transition: var(--transition);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .action-button:hover {
      background: var(--panel-hover);
      border-color: var(--accent-primary);
    }
    
    .action-button.primary {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
    }
    
    .action-button.primary:hover {
      background: var(--accent-secondary);
      border-color: var(--accent-secondary);
    }
    
    main { 
      padding: 20px clamp(16px, 2vw, 32px);
      width: 100%;
      box-sizing: border-box;
      min-height: calc(100dvh - var(--header-h) - var(--footer-h));
    }
    
    .section {
      animation: fadeIn 0.3s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .row { 
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .card { 
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      flex: 1;
      min-width: 300px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: var(--transition);
    }
    
    .card:hover {
      border-color: var(--accent-primary);
    }
    
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .card-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-tertiary);
      color: white;
    }
    
    .card h3 { 
      font-size: 1.25rem;
      margin: 0;
      font-weight: 600;
    }
    
    textarea { 
      width: 100%;
      height: 55vh;
      background: #0b1220;
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      resize: vertical;
      transition: var(--transition);
    }
    
    textarea:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    .actions { 
      display: flex;
      gap: 12px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    
    button { 
      background: var(--accent-primary);
      color: white;
      border: 0;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: var(--transition);
    }
    
    button:hover {
      background: var(--accent-secondary);
      transform: translateY(-1px);
    }
    
    button.secondary { 
      background: var(--panel);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    
    button.secondary:hover {
      background: var(--panel-hover);
      border-color: var(--accent-primary);
    }
    
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .hint { 
      color: var(--text-muted);
      font-size: 13px;
      margin-top: 8px;
    }
    
    .hint.small { 
      font-size: 12px;
    }
    
    .success { 
      color: var(--success);
    }
    
    .error { 
      color: var(--error);
    }
    
    .warning { 
      color: var(--warning);
    }
    
    .info { 
      color: var(--info);
    }
    
    .invalid { 
      border-color: var(--error) !important;
      box-shadow: 0 0 0 1px var(--error) inset;
    }
    
    footer { 
      padding: 16px clamp(16px, 2vw, 32px);
      color: var(--text-muted);
      font-size: 13px;
      border-top: 1px solid var(--border);
      height: var(--footer-h);
    }
    
    .split { 
      display: flex;
      gap: 20px;
      height: calc(100dvh - var(--header-h) - var(--footer-h) - 40px);
    }
    
    .left { 
      width: clamp(300px, 25vw, 450px);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-height: calc(100vh - var(--header-h) - var(--footer-h) - 40px);
    }
    
    .right { 
      flex: 1;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      overflow-y: auto;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - var(--header-h) - var(--footer-h) - 40px);
    }
    
    .file { 
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: var(--transition);
    }
    
    .file:hover { 
      background: var(--panel-hover);
    }
    
    .badge { 
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      margin-left: 8px;
      border: 1px solid var(--border);
      font-weight: 500;
    }
    
    .ok { 
      color: var(--success);
      border-color: var(--success);
    }
    
    .warn { 
      color: var(--warning);
      border-color: var(--warning);
    }
    
    .fail { 
      color: var(--error);
      border-color: var(--error);
    }
    
    .example-header {
      margin-bottom: 16px;
    }
    
    .example-header h4 {
      margin-bottom: 4px;
    }
    
    .example-note {
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    
    .editor-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin: 16px 0;
    }
    
    textarea.config-textarea {
      flex: 1;
      min-height: 400px;
      resize: none;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 13px;
      line-height: 1.5;
    }
    
    .examples-container {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    
    .example-column {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    @media (max-width: 900px) {
      .examples-container {
        flex-direction: column;
      }
    }
    
    .config-search-container {
      position: relative;
      margin: 16px 0;
    }
    
    .config-search-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0b1220;
      color: var(--text-primary);
      font-size: 14px;
      transition: var(--transition);
    }
    
    .config-search-input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    .clear-search-btn {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
    
    .clear-search-btn:hover {
      background: var(--panel-hover);
      color: var(--text-primary);
    }
    
    #docs-search { 
      background: #0b1220;
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 14px;
      width: 100%;
      transition: var(--transition);
    }
    
    #docs-search:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    #docs-items { 
      overflow: auto;
    }
    
    #docs-view h1, #docs-view h2, #docs-view h3 { 
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    
    #docs-view h1 { 
      font-size: 1.75rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.3em;
    }
    
    /* Configuration Guide Styles */
    .config-category {
      margin-bottom: 24px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    
    .category-header {
      background: rgba(59, 130, 246, 0.1);
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    
    .category-header h4 {
      margin: 0 0 4px 0;
      color: var(--accent-primary);
    }
    
    .config-items {
      padding: 16px;
    }
    
    .config-item {
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }
    
    .config-item:last-child {
      border-bottom: none;
    }
    
    .config-name {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .config-description {
      margin-left: 8px;
    }
    
    .config-example {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: rgba(0, 0, 0, 0.2);
      padding: 6px 8px;
      border-radius: 4px;
      margin-top: 8px;
      color: var(--accent-secondary);
    }
    
    .badge.primary {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent-primary);
      border-color: var(--accent-primary);
    }
    
    .badge.warning {
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
      border-color: var(--warning);
    }
    
    .badge.info {
      background: rgba(14, 165, 233, 0.15);
      color: var(--info);
      border-color: var(--info);
    }
    
    .badge.success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border-color: var(--success);
    }
    
    .badge.secondary {
      background: rgba(148, 163, 184, 0.15);
      color: var(--text-muted);
      border-color: var(--text-muted);
    }
    
    .config-note {
      margin-top: 24px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    
    .config-guide-container {
      flex: 1;
      overflow-y: auto;
      margin-top: 16px;
      padding-right: 8px;
    }
    
    /* Custom scrollbar for Webkit browsers */
    .config-guide-container::-webkit-scrollbar {
      width: 8px;
    }
    
    .config-guide-container::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }
    
    .config-guide-container::-webkit-scrollbar-thumb {
      background: var(--accent-primary);
      border-radius: 4px;
    }
    
    .config-guide-container::-webkit-scrollbar-thumb:hover {
      background: var(--accent-secondary);
    }
    
    .editor-header {
      margin-bottom: 16px;
    }
    
    .editor-header h3 {
      margin-top: 0;
    }
    
    .editor-header p {
      margin: 8px 0 0 0;
      color: var(--text-secondary);
    }
    
    #docs-view h2 { 
      font-size: 1.5rem;
    }
    
    #docs-view h3 { 
      font-size: 1.25rem;
    }
    
    #docs-view code, #docs-view pre { 
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    
    #docs-view code { 
      background: #0b1220;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px 6px;
    }
    
    #docs-view pre { 
      background: #0b1220;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      overflow: auto;
      line-height: 1.5;
      word-break: normal;
      white-space: pre;
    }
    
    #docs-view pre code { 
      background: transparent;
      border: none;
      padding: 0;
      display: block;
      line-height: inherit;
      white-space: inherit;
    }
    
    #docs-view a {
      color: var(--accent-primary);
      text-decoration: none;
    }
    
    #docs-view a:hover {
      text-decoration: underline;
    }
    
    #docs-view ul, #docs-view ol {
      padding-left: 1.5em;
    }
    
    #docs-view li {
      margin-bottom: 0.5em;
    }
    
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .status-indicator.ok {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
    }
    
    .status-indicator.warning {
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
    }
    
    .status-indicator.error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
    }
    
    .status-indicator.info {
      background: rgba(14, 165, 233, 0.15);
      color: var(--info);
    }
    
    .progress-bar {
      height: 6px;
      background: var(--panel-hover);
      border-radius: 3px;
      overflow: hidden;
      margin: 12px 0;
    }
    
    .progress-fill {
      height: 100%;
      background: var(--accent-primary);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    
    .dashboard-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .dashboard-card h3 {
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .dashboard-card .status {
      margin: 12px 0;
      padding: 12px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.2);
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
    }
    
    .form-group input, .form-group select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #0b1220;
      color: var(--text-primary);
      font-size: 14px;
      transition: var(--transition);
    }
    
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 50px;
      height: 24px;
    }
    
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--panel-hover);
      transition: .4s;
      border-radius: 24px;
    }
    
    .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }
    
    input:checked + .slider {
      background-color: var(--accent-primary);
    }
    
    input:checked + .slider:before {
      transform: translateX(26px);
    }
    
    .toggle-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    @media (max-width: 900px) {
      .split { 
        flex-direction: column;
        height: auto;
      }
      
      .left { 
        width: 100%;
        height: auto;
        max-height: 40dvh;
      }
      
      .right { 
        width: 100%;
        height: auto;
      }
      
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
    
    @media (max-width: 600px) {
      header {
        flex-direction: column;
        gap: 12px;
        height: auto;
      }
      
      .top-actions {
        width: 100%;
        justify-content: center;
      }
      
      nav {
        flex-wrap: wrap;
        justify-content: center;
      }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"></script>
  <script>
  const AFBT_LAUNCHED_BY_MAIN = ${launchedByMain ? "true" : "false"};
  let activeTab = 'dashboard';
  let DOCS_FILES = [];
  let __serverInfoCache = null;
  
  // Enhanced UI functions
  async function loadConfig() {
    try {
      const res = await fetch('/config');
      if (!res.ok) throw new Error('Failed to load config');
      const json = await res.json();
      document.getElementById('projects').value = JSON.stringify(json, null, 2);
      setStatus('Loaded current configuration.', 'success');
      
      // Update form-based configuration if available
      updateFormConfig(json);
    } catch {
      const el = document.getElementById('projects');
      if (el) el.value = '';
      setStatus('No projects.json found. Open the Examples tab to copy a template, then paste here and Save.', 'warning');
    }
    await reloadEnv();
  }
  
  function updateFormConfig(json) {
    // If we have a form-based configuration UI, update it with the loaded data
    if (json && json.projects) {
      // This would update the form fields with the loaded configuration
      // Implementation would depend on the specific form structure
    }
  }
  
  function setStatus(msg, cls) {
    const el = document.getElementById('status');
    if (el) {
      el.textContent = msg;
      el.className = cls || '';
    }
    
    // Also update any tab-specific status elements
    const tabStatus = document.getElementById('tab-status');
    if (tabStatus) {
      tabStatus.textContent = msg;
      tabStatus.className = cls || '';
    }
  }
  
  function setButtonActive(id) {
    for (const b of document.querySelectorAll('nav button')) b.classList.remove('active');
    const activeBtn = document.getElementById(id);
    if (activeBtn) activeBtn.classList.add('active');
  }
  
  function showTab(tab) {
    activeTab = tab;
    for (const s of document.querySelectorAll('.section')) s.style.display = 'none';
    const section = document.getElementById('section-'+tab);
    if (section) section.style.display = 'block';
    setButtonActive('tab-'+tab);
    
    // Load content specific to the tab
    switch(tab) {
      case 'docs':
        loadDocs();
        break;
      case 'dashboard':
        refreshDashboard();
        break;
      case 'env':
        reloadEnv();
        break;
      case 'embed':
        loadEmbeddingsUi();
        break;
    }
  }
  
  async function getServerBaseUrl() {
    if (!__serverInfoCache) {
      try {
        const res = await fetch('/server/info');
        __serverInfoCache = await res.json();
      } catch {}
    }
    const p = __serverInfoCache && __serverInfoCache.port;
    return p ? 'http://127.0.0.1:' + p : null;
  }
  
  function getProjectsFromEditor() {
    try {
      const txt = document.getElementById('projects')?.value || '{}';
      const j = JSON.parse(txt);
      return Object.keys(j.projects || {});
    } catch { return []; }
  }
  
  async function loadEmbeddingsUi() {
    try {
      const listEl = document.getElementById('embed-projects-list-ui');
      if (!listEl) return;
      listEl.innerHTML = '<div class="hint">Loading embeddings status...</div>';
      
      const projects = getProjectsFromEditor();
      const base = await getServerBaseUrl();
      
      if (projects.length === 0) {
        listEl.innerHTML = '<div class="hint">No projects configured. Add projects in the Configure tab first.</div>';
        return;
      }
      
      listEl.innerHTML = '';
      
      projects.forEach((name) => {
        const row = document.createElement('div');
        row.className = 'card';
        row.style.marginBottom = '16px';
        
        const title = document.createElement('h3');
        title.textContent = name;
        title.style.marginTop = '0';
        
        const status = document.createElement('div');
        status.id = 'embed-status-ui-' + name;
        status.textContent = base ? 'Checking...' : 'Server not detected';
        status.className = 'hint';
        
        const actions = document.createElement('div');
        actions.className = 'actions';
        
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'secondary';
        refreshBtn.innerHTML = '<i>↻</i> Refresh';
        refreshBtn.onclick = () => refreshProjectStatusUi(name);
        
        const reindexBtn = document.createElement('button');
        reindexBtn.className = 'primary';
        reindexBtn.innerHTML = '<i>↺</i> Reindex';
        reindexBtn.onclick = () => reindexProjectUi(name, reindexBtn);
        
        actions.appendChild(refreshBtn);
        actions.appendChild(reindexBtn);
        
        row.appendChild(title);
        row.appendChild(status);
        row.appendChild(actions);
        
        listEl.appendChild(row);
        if (base) refreshProjectStatusUi(name);
      });
    } catch (e) {
      const listEl = document.getElementById('embed-projects-list-ui');
      if (listEl) {
        listEl.innerHTML = '<div class="error">Failed to load embeddings UI: ' + (e.message || e) + '</div>';
      }
    }
  }
  
  async function refreshProjectStatusUi(project) {
    const base = await getServerBaseUrl();
    const el = document.getElementById('embed-status-ui-' + project);
    if (!base) { 
      if (el) el.innerHTML = '<span class="status-indicator error">Server not detected</span>'; 
      return; 
    }
    
    try {
      if (el) el.innerHTML = '<span class="status-indicator info">Checking...</span>';
      const resp = await fetch(base + '/api/embed/status?project=' + encodeURIComponent(project));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      
      if (data && data.exists && data.meta) {
        const m = data.meta;
        const built = m.builtAt ? new Date(m.builtAt).toLocaleString() : 'unknown';
        if (el) {
          el.innerHTML = \`
            <div class="status">
              <div><strong>Built:</strong> \${built}</div>
              <div><strong>Vectors:</strong> \${m.vectorCount}</div>
              <div><strong>Model:</strong> \${m.model}</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: \${Math.min(100, m.vectorCount / 100)}%"></div>
              </div>
            </div>
          \`;
        }
      } else {
        if (el) el.innerHTML = '<span class="status-indicator warning">Index not built. Click Reindex.</span>';
      }
    } catch (e) {
      if (el) el.innerHTML = '<span class="status-indicator error">Status check failed: ' + (e.message || e) + '</span>';
    }
  }
  
  async function reindexProjectUi(project, buttonEl) {
    const base = await getServerBaseUrl();
    const el = document.getElementById('embed-status-ui-' + project);
    if (!base) { 
      if (el) el.innerHTML = '<span class="status-indicator error">Server not detected</span>'; 
      return; 
    }
    
    const original = buttonEl ? buttonEl.innerHTML : null;
    if (buttonEl) { 
      buttonEl.disabled = true; 
      buttonEl.innerHTML = '<i>↺</i> Rebuilding...'; 
    }
    
    if (el) el.innerHTML = '<span class="status-indicator info">Rebuilding...</span>';
    
    try {
      const resp = await fetch(base + '/api/embed/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project })
      });
      
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      
      if (data && data.meta) {
        const m = data.meta;
        const built = m.builtAt ? new Date(m.builtAt).toLocaleString() : 'unknown';
        if (el) {
          el.innerHTML = \`
            <div class="status">
              <div><strong>Completed:</strong> \${built}</div>
              <div><strong>Vectors:</strong> \${m.vectorCount}</div>
              <div><strong>Model:</strong> \${m.model}</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: \${Math.min(100, m.vectorCount / 100)}%"></div>
              </div>
            </div>
          \`;
        }
      } else {
        if (el) el.innerHTML = '<span class="status-indicator warning">Rebuild complete, but no metadata returned</span>';
      }
    } catch (e) {
      if (el) el.innerHTML = '<span class="status-indicator error">Rebuild failed: ' + (e.message || e) + '</span>';
    } finally {
      if (buttonEl) { 
        buttonEl.disabled = false; 
        buttonEl.innerHTML = original || '<i>↺</i> Reindex'; 
      }
    }
  }
  
  function validateProjectsJson(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Root must be an object' };
      if (!parsed.projects || typeof parsed.projects !== 'object') return { ok: false, error: "Missing required 'projects' object" };
      // optional defaultProject if present must be string
      if (parsed.defaultProject !== undefined && typeof parsed.defaultProject !== 'string') return { ok: false, error: "'defaultProject' must be a string if provided" };
      
      // Additional validation for project structure (less strict)
      const projectNames = Object.keys(parsed.projects);
      for (const projectName of projectNames) {
        const project = parsed.projects[projectName];
        if (project.config && typeof project.config !== 'object') {
          return { ok: false, error: "Project '" + projectName + "' has invalid 'config' object" };
        }
      }
      
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || 'Invalid JSON' };
    }
  }

  function updateEditorValidation() {
    const ta = document.getElementById('projects');
    const btn = document.getElementById('btn-save-config');
    if (!ta) return;
    const result = validateProjectsJson(ta.value || '');
    if (result.ok) {
      ta.classList.remove('invalid');
      if (btn) btn.disabled = false;
      setStatus('✅ JSON is valid. Ready to save.', 'success');
    } else {
      ta.classList.add('invalid');
      if (btn) btn.disabled = true;
      setStatus('❌ ' + result.error, 'error');
    }
  }

  async function saveConfig() {
    try {
      const text = document.getElementById('projects').value;
      const result = validateProjectsJson(text);
      if (!result.ok) {
        setStatus('❌ ' + result.error, 'error');
        updateEditorValidation();
        return;
      }
      const parsed = JSON.parse(text);
      const res = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) });
      if (!res.ok) throw new Error('Save failed');
      setStatus('✅ Saved projects.json successfully!', 'success');
      
      // Refresh embeddings UI if on that tab
      if (activeTab === 'embed') {
        loadEmbeddingsUi();
      }
      
      // Show a temporary success indicator
      const saveBtn = document.getElementById('btn-save-config');
      const originalText = saveBtn.innerHTML;
      saveBtn.innerHTML = '✅ Saved!';
      saveBtn.classList.add('secondary');
      setTimeout(() => {
        saveBtn.innerHTML = originalText;
        saveBtn.classList.remove('secondary');
      }, 2000);
    } catch (e) {
      setStatus('❌ Save failed: ' + e.message, 'error');
    }
  }
  
  // Enhanced UI functions for better user experience
  function highlightConfigGuide() {
    // Add visual feedback when user is editing
    const ta = document.getElementById('projects');
    if (!ta) return;
    
    ta.addEventListener('focus', () => {
      const guide = document.getElementById('config-guide');
      if (guide) {
        guide.style.boxShadow = '0 0 0 2px var(--accent-primary)';
        setTimeout(() => {
          guide.style.boxShadow = 'none';
        }, 1000);
      }
    });
  }
  
  function addConfigTooltips() {
    // Add tooltip functionality to config items
    const configItems = document.querySelectorAll('.config-item');
    configItems.forEach(item => {
      const name = item.querySelector('.config-name b').textContent;
      const description = item.querySelector('.hint').textContent;
      
      item.title = name + ': ' + description;
      item.style.cursor = 'help';
      
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
    });
  }
  
  function setupConfigSearch() {
    const searchInput = document.getElementById('config-search');
    const clearButton = document.getElementById('clear-search');
    const configItems = document.querySelectorAll('.config-item');
    const configCategories = document.querySelectorAll('.config-category');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.toLowerCase();
      
      // Show/hide clear button
      clearButton.style.display = searchTerm ? 'block' : 'none';
      
      // Filter config items
      configItems.forEach(item => {
        const name = item.querySelector('.config-name b').textContent.toLowerCase();
        const description = item.querySelector('.hint').textContent.toLowerCase();
        const matches = name.includes(searchTerm) || description.includes(searchTerm);
        
        item.style.display = matches ? 'block' : 'none';
      });
      
      // Hide categories with no visible items
      configCategories.forEach(category => {
        const items = category.querySelectorAll('.config-item');
        const hasVisibleItems = Array.from(items).some(item => item.style.display !== 'none');
        category.style.display = hasVisibleItems ? 'block' : 'none';
      });
    });
    
    // Clear search
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      clearButton.style.display = 'none';
      configItems.forEach(item => item.style.display = 'block');
      configCategories.forEach(category => category.style.display = 'block');
      searchInput.focus();
    });
  }
  
  async function finish() {
    await saveConfig();
    setStatus('Shutting down setup server...', 'info');
    try { await fetch('/shutdown', { method: 'POST' }); } catch {}
    // Try to close this tab/window; fallback to about:blank
    try { window.open('', '_self'); window.close(); } catch {}
    setTimeout(() => { try { window.location.replace('about:blank'); } catch {} }, 600);
  }
  
  async function refreshInfo() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const el = document.getElementById('server-status');
      const linkHealth = document.getElementById('btn-open-health');
      const linkId = document.getElementById('btn-open-id');
      const managedNote = document.getElementById('server-managed-note');

      if (info.port) {
        linkHealth.dataset.href = 'http://127.0.0.1:' + info.port + '/connection-health';
        linkId.dataset.href = 'http://127.0.0.1:' + info.port + '/.identity';
      }

      if (info.running) {
        if (el) el.innerHTML = '<span class="status-indicator ok">Running</span> <span class="badge">PID ' + (info.pid || 'unknown') + '</span> <span class="badge">port ' + (info.port || '?') + '</span>';
        if (managedNote) managedNote.textContent = 'Managed externally or by main process.';
      } else {
        if (el) el.innerHTML = AFBT_LAUNCHED_BY_MAIN ? '<span class="status-indicator info">Detecting...</span>' : '<span class="status-indicator error">Stopped</span>';
        if (managedNote) managedNote.textContent = 'Not running.';
      }
    } catch {}
  }
  
  async function refreshDashboard() {
    // Refresh all dashboard information
    await refreshInfo();
    
    // Check Chrome extension status
    const extStatus = document.getElementById('extension-status');
    if (extStatus) {
      // In a real implementation, we would check the extension status
      // For now, we'll just show a placeholder
      extStatus.innerHTML = '<span class="status-indicator info">Status check not implemented</span>';
    }
    
    // Check configuration status
    const configStatus = document.getElementById('config-status');
    if (configStatus) {
      try {
        const res = await fetch('/config');
        if (res.ok) {
          const json = await res.json();
          if (json && json.projects && Object.keys(json.projects).length > 0) {
            configStatus.innerHTML = '<span class="status-indicator ok">' + Object.keys(json.projects).length + ' project(s) configured</span>';
          } else {
            configStatus.innerHTML = '<span class="status-indicator warning">No projects configured</span>';
          }
        } else {
          configStatus.innerHTML = '<span class="status-indicator error">Configuration not found</span>';
        }
      } catch {
        configStatus.innerHTML = '<span class="status-indicator error">Configuration check failed</span>';
      }
    }
  }

  async function openHealth() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const href = document.getElementById('btn-open-health').dataset.href;
      if (info.port && href) {
        window.open(href, '_blank');
      } else {
        setStatus('Connector not detected yet. Try again in a moment.', 'warning');
      }
    } catch { 
      setStatus('Unable to open health endpoint.', 'error'); 
    }
  }
  
  async function openIdentity() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const href = document.getElementById('btn-open-id').dataset.href;
      if (info.port && href) {
        window.open(href, '_blank');
      } else {
        setStatus('Connector not detected yet. Try again in a moment.', 'warning');
      }
    } catch { 
      setStatus('Unable to open identity endpoint.', 'error'); 
    }
  }

  async function loadDocs() {
    const listEl = document.getElementById('docs-items');
    if (!listEl) return;
    
    if (listEl.dataset.loaded === '1') return; // one-time
    listEl.innerHTML = '<div class="hint">Loading documentation...</div>';
    
    try {
      const res = await fetch('/docs/list');
      const files = await res.json();
      DOCS_FILES = files.slice();
      renderDocsList('');
      listEl.dataset.loaded = '1';
    } catch (e) {
      listEl.innerHTML = '<div class="error">Failed to load documentation: ' + (e.message || e) + '</div>';
    }
  }
  
  function copyFromElement(id) {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      navigator.clipboard.writeText(text);
      setStatus('✅ Copied to clipboard!', 'success');
      
      // Provide visual feedback on the button
      const buttons = document.querySelectorAll('button[onclick*="' + id + '"]');
      buttons.forEach(button => {
        const originalText = button.innerHTML;
        button.innerHTML = '✅ Copied!';
        button.classList.add('secondary');
        setTimeout(() => {
          button.innerHTML = originalText;
          button.classList.remove('secondary');
        }, 2000);
      });
      
      setTimeout(() => setStatus('', ''), 2000);
    } catch (e) { 
      setStatus('❌ Copy failed: ' + (e.message || e), 'error'); 
    }
  }
  
  function renderDocsList(query) {
    const listEl = document.getElementById('docs-items');
    if (!listEl) return;
    
    const q = (query || '').toLowerCase();
    const prioritized = (p) => {
      if (p === 'README.md') return '0';
      if (p.includes('PROJECT_OVERVIEW')) return '1';
      if (p.includes('SETUP_GUIDE')) return '2';
      if (p.includes('HOW_TO_USE')) return '3';
      return '9' + p;
    };
    
    const filtered = DOCS_FILES
      .filter((p) => p.toLowerCase().includes(q))
      .sort((a,b) => prioritized(a).localeCompare(prioritized(b)));
    
    listEl.innerHTML = '';
    filtered.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'file';
      div.title = p;
      div.textContent = p;
      div.onclick = () => loadDoc(p);
      listEl.appendChild(div);
    });
    
    const counter = document.getElementById('docs-count');
    if (counter) counter.textContent = filtered.length + '/' + DOCS_FILES.length + ' files';
  }
  
  async function loadDoc(p) {
    const titleEl = document.getElementById('doc-title');
    const viewEl = document.getElementById('docs-view');
    
    if (titleEl) titleEl.textContent = 'Loading...';
    if (viewEl) viewEl.innerHTML = '<div class="hint">Loading document...</div>';
    
    try {
      const res = await fetch('/docs/content?path='+encodeURIComponent(p));
      const txt = await res.text();
      const md = window.markdownit({ html: false, linkify: true, breaks: true });
      
      if (titleEl) titleEl.textContent = p;
      if (viewEl) viewEl.innerHTML = md.render(txt);
    } catch (e) {
      if (viewEl) viewEl.innerHTML = '<div class="error">Failed to load document: ' + (e.message || e) + '</div>';
    }
  }
  
  async function reloadEnv() {
    try {
      const res = await fetch('/env');
      const data = await res.json();
      const envText = document.getElementById('envText');
      if (envText) envText.value = data.content || '';
      const envPathHint = document.getElementById('envPathHint');
      if (envPathHint) envPathHint.textContent = data.path || '.env';
    } catch { /* ignore */ }
  }
  
  async function saveEnv() {
    try {
      const content = document.getElementById('envText').value;
      // Include the current path so we overwrite the same file we loaded
      const info = await (await fetch('/env')).json();
      const res = await fetch('/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, path: info.path }) });
      if (!res.ok) throw new Error('Save .env failed');
      
      const envStatus = document.getElementById('envStatus');
      if (envStatus) {
        envStatus.textContent = 'Saved .env successfully.';
        envStatus.className = 'hint success';
        try { clearTimeout(window.__afbtEnvStatusTimer); } catch {}
        window.__afbtEnvStatusTimer = setTimeout(() => {
          try { envStatus.textContent = ''; envStatus.className = 'hint'; } catch {}
        }, 2500);
      } else {
        setStatus('Saved .env successfully.', 'success');
      }
    } catch (e) {
      const envStatus = document.getElementById('envStatus');
      if (envStatus) {
        envStatus.textContent = 'Failed to save .env: ' + e.message;
        envStatus.className = 'hint error';
      } else {
        setStatus('Failed to save .env: ' + e.message, 'error');
      }
    }
  }
  
  window.addEventListener('DOMContentLoaded', async () => {
    try { 
      await loadConfig(); 
    } catch {}
    
    showTab('dashboard');
    
    // Ensure active state in nav for first paint
    try { 
      document.getElementById('tab-dashboard').classList.add('active'); 
    } catch {}
    
    // compute dynamic header/footer heights for perfect fit
    function adjustLayout() {
      const headerH = document.querySelector('header')?.offsetHeight || 70;
      const footerH = document.querySelector('footer')?.offsetHeight || 45;
      document.documentElement.style.setProperty('--header-h', headerH + 'px');
      document.documentElement.style.setProperty('--footer-h', footerH + 'px');
    }
    
    adjustLayout();
    window.addEventListener('resize', adjustLayout);
    
    // Short polling to avoid initial detection race when main is launching server
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      await refreshInfo();
      if (tries >= 8) clearInterval(t);
    }, 1200);
    
    const search = document.getElementById('docs-search');
    if (search) search.addEventListener('input', (e) => renderDocsList(e.target.value));
    
    // Live JSON validation for projects editor
    const ta = document.getElementById('projects');
    if (ta) {
      ta.addEventListener('input', updateEditorValidation);
      updateEditorValidation();
      highlightConfigGuide();
    }
    
    // Add tooltips to config items
    addConfigTooltips();
    
    // Setup configuration search
    setupConfigSearch();
  });
  </script>
</head>
<body>
  <header>
    <h1>Autonomous Frontend Browser Tools</h1>
    <nav>
      <button id="tab-dashboard" onclick="showTab('dashboard')">Dashboard</button>
      <button id="tab-configure" onclick="showTab('configure')">Projects</button>
      <button id="tab-env" onclick="showTab('env')">Environment</button>
      <button id="tab-embed" onclick="showTab('embed')">Embeddings</button>
      <button id="tab-examples" onclick="showTab('examples')">Examples</button>
      <button id="tab-docs" onclick="showTab('docs')">Docs</button>
    </nav>
    <div class="top-actions">
      <a id="btn-open-health" class="action-button" href="javascript:void(0)" onclick="openHealth()">
        <i>❤️</i> Health
      </a>
      <a id="btn-open-id" class="action-button" href="javascript:void(0)" onclick="openIdentity()">
        <i>🆔</i> Identity
      </a>
      <button id="btn-close-ui" class="action-button primary" onclick="finish()">
        <i>✅</i> Finish
      </button>
    </div>
  </header>
  <main>
    <!-- Dashboard Section -->
    <section id="section-dashboard" class="section" style="display:none">
      <div class="dashboard-grid">
        <div class="dashboard-card">
          <h3><i>🌐</i> Chrome Extension</h3>
          <div class="status">
            <div id="extension-status"><span class="status-indicator info">Checking...</span></div>
            <div class="hint small">Load via chrome://extensions → Developer Mode → Load unpacked → select <code>chrome-extension/</code>.</div>
            <div class="hint small" style="margin-top:8px">Keep DevTools open on the active tab when using browser/ui tools.</div>
          </div>
        </div>
        <div class="dashboard-card">
          <h3><i>🔌</i> Connector Server</h3>
          <div class="status">
            <div id="server-status"><span class="status-indicator info">Detecting...</span></div>
            <div class="hint small">Health endpoint exposes heartbeat, uptime, pending operations.</div>
            <div id="server-managed-note" class="hint small" style="margin-top:8px"></div>
          </div>
        </div>
        <div class="dashboard-card">
          <h3><i>⚙️</i> Configuration</h3>
          <div class="status">
            <div id="config-status"><span class="status-indicator info">Checking...</span></div>
            <div class="hint small">Project configuration status.</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3><i>⚡</i> Quick Actions</h3>
        <div class="actions">
          <button onclick="showTab('configure')">Configure Projects</button>
          <button onclick="showTab('env')">Set Environment</button>
          <button onclick="showTab('embed')">Manage Embeddings</button>
          <button onclick="showTab('docs')">View Documentation</button>
        </div>
      </div>
    </section>
    
    <!-- Configure Section -->
    <section id="section-configure" class="section" style="display:none">
      <div class="split">
        <div class="left" id="config-guide">
          <h3><i>📋</i> Project Configuration Guide</h3>
          <div class="hint">This file is local and intended to be ignored by git.</div>
          
          <div class="config-search-container">
            <input type="text" id="config-search" placeholder="Search configuration options..." class="config-search-input">
            <button id="clear-search" class="clear-search-btn" style="display: none;">×</button>
          </div>
          
          <div class="config-guide-container">
            <div class="config-category">
              <div class="category-header">
                <h4>🔑 Required Fields</h4>
                <div class="hint small">Essential configuration for basic tool functionality</div>
              </div>
              <div class="config-items">
                <div class="config-item">
                  <div class="config-name">
                    <b>SWAGGER_URL</b> 
                    <span class="badge primary">api.searchEndpoints, api.listTags</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">URL or file path to your OpenAPI/Swagger specification</div>
                    <div class="config-example">Example: https://api.example.com/openapi.json</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>API_BASE_URL</b> 
                    <span class="badge primary">api.request</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Base URL for constructing live API requests</div>
                    <div class="config-example">Example: https://api.example.com</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>AUTH_STORAGE_TYPE</b> 
                    <span class="badge warning">api.request (auth)</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Where the auth token is stored</div>
                    <div class="config-example">Values: localStorage, sessionStorage, cookies</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>AUTH_TOKEN_KEY</b> 
                    <span class="badge warning">api.request (auth)</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Key or cookie name from which the bearer token is read</div>
                    <div class="config-example">Example: access_token, auth_token</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="config-category">
              <div class="category-header">
                <h4>🔧 Authentication Fields</h4>
                <div class="hint small">Additional configuration for authentication handling</div>
              </div>
              <div class="config-items">
                <div class="config-item">
                  <div class="config-name">
                    <b>AUTH_ORIGIN</b> 
                    <span class="badge info">api.request (cookies)</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Browser origin for reading cookies</div>
                    <div class="config-example">Example: https://staging.example.com</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>API_AUTH_TOKEN_TTL_SECONDS</b> 
                    <span class="badge info">api.request (auth cache)</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Optional TTL for token cache (in seconds)</div>
                    <div class="config-example">Example: 3600 (1 hour)</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="config-category">
              <div class="category-header">
                <h4>🧭 Navigation & Routing</h4>
                <div class="hint small">Configuration for navigation tools</div>
              </div>
              <div class="config-items">
                <div class="config-item">
                  <div class="config-name">
                    <b>ROUTES_FILE_PATH</b> 
                    <span class="badge success">browser.navigate</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Optional path hint to your app's routes file</div>
                    <div class="config-example">Example: src/routes/paths.ts</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="config-category">
              <div class="category-header">
                <h4>📸 Screenshot Settings</h4>
                <div class="hint small">Configuration for screenshot storage</div>
              </div>
              <div class="config-items">
                <div class="config-item">
                  <div class="config-name">
                    <b>SCREENSHOT_STORAGE_PATH</b> 
                    <span class="badge success">browser.screenshot</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Per-project directory for saving screenshots</div>
                    <div class="config-example">Example: /path/to/project/screenshots</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>DEFAULT_SCREENSHOT_STORAGE_PATH</b> 
                    <span class="badge success">browser.screenshot</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Top-level default base directory for screenshots</div>
                    <div class="config-example">Example: /path/to/all/screenshots</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="config-category">
              <div class="category-header">
                <h4>⚙️ Internal Configuration</h4>
                <div class="hint small">Advanced settings for internal tool behavior</div>
              </div>
              <div class="config-items">
                <div class="config-item">
                  <div class="config-name">
                    <b>BROWSER_TOOLS_HOST</b> 
                    <span class="badge secondary">internal</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Override for connector host</div>
                    <div class="config-example">Default: 127.0.0.1</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>BROWSER_TOOLS_PORT</b> 
                    <span class="badge secondary">internal</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Override for connector port</div>
                    <div class="config-example">Default: 3025</div>
                  </div>
                </div>
                
                <div class="config-item">
                  <div class="config-name">
                    <b>defaultProject</b> 
                    <span class="badge secondary">all tools</span>
                  </div>
                  <div class="config-description">
                    <div class="hint">Fallback active project when not set via environment</div>
                    <div class="config-example">Example: my-frontend</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="config-note">
            <div class="hint small">
              <i>💡</i> <strong>Tip:</strong> Set <code>defaultProject</code> to the project you work with most.
            </div>
            <div class="hint small">
              <i>🔑</i> <strong>API Keys:</strong> Embedding provider keys (<code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code>) are set in the Environment tab.
            </div>
          </div>
        </div>
        <div class="right" id="config-editor-pane">
          <div class="editor-header">
            <h3><i>📝</i> Configuration Editor</h3>
            <p>Edit your per-project configuration below. When finished, click "Save Configuration".</p>
          </div>
          <div class="editor-container">
            <textarea id="projects" spellcheck="false" class="config-textarea"></textarea>
          </div>
          <div class="actions">
            <button id="btn-save-config" onclick="saveConfig()">Save Configuration</button>
            <button class="secondary" onclick="loadConfig()">Reload</button>
            <button onclick="showTab('examples')">View Examples</button>
          </div>
          <div id="status" class="hint"></div>
          <div class="hint">Path: projects.json (project root)</div>
          <div class="hint" style="margin-top:12px">
            Run this UI directly with <code>pnpm run setup:ui</code> or implicitly via <code>pnpm run setup</code>.
          </div>
        </div>
      </div>
    </section>
    
    <!-- Environment Section -->
    <section id="section-env" class="section" style="display:none">
      <div class="split">
        <div class="left" id="env-guide">
          <h3><i>🌍</i> Environment Variables</h3>
          <div class="hint" style="margin-top:8px">
            Embedding provider API keys configured here are used to build and query the semantic index that powers <code>api.searchEndpoints</code> and other API documentation search features. Set one:
            <ul>
              <li><b>OPENAI_API_KEY</b> (+ optional <code>OPENAI_EMBED_MODEL</code>)</li>
              <li><b>GEMINI_API_KEY</b> (+ optional <code>GEMINI_EMBED_MODEL</code>)</li>
            </ul>
            If you change provider/model, reindex from the Embeddings tab.
          </div>
          <div class="hint" style="margin-top:16px">
            <h4>Common Keys:</h4>
            <ul>
              <li><b>OPENAI_API_KEY</b> or <b>GEMINI_API_KEY</b> (embedding provider)</li>
              <li><b>LOG_LEVEL</b>: error | warn | info | debug</li>
            </ul>
          </div>
        </div>
        <div class="right" id="env-editor-pane">
          <textarea id="envText" spellcheck="false"></textarea>
          <div class="actions">
            <button onclick="saveEnv()">Save Environment</button>
            <button class="secondary" onclick="reloadEnv()">Reload</button>
          </div>
          <div id="envStatus" class="hint"></div>
          <div class="hint small">Path: <span id="envPathHint">.env</span></div>
        </div>
      </div>
    </section>
    
    <!-- Embeddings Section -->
    <section id="section-embed" class="section" style="display:none">
      <div class="split">
        <div class="left" id="embed-guide">
          <h3><i>🧠</i> Embeddings Management</h3>
          <div class="hint">
            Manage semantic indexes for your API documentation. Status and reindexing are per project.
            The server must be running for these features to work.
          </div>
          <div class="hint" style="margin-top:16px">
            <h4>How it works:</h4>
            <ul>
              <li>API documentation is parsed from your SWAGGER_URL</li>
              <li>Embeddings are created using your configured provider</li>
              <li>Semantic search is enabled for api.searchEndpoints</li>
              <li>Reindex when documentation or provider changes</li>
            </ul>
          </div>
        </div>
        <div class="right">
          <div id="embed-projects-list-ui"></div>
        </div>
      </div>
    </section>
    
    <!-- Examples Section -->
    <section id="section-examples" class="section" style="display:none">
      <div class="split">
        <div class="left">
          <h3><i>📝</i> Configuration Examples</h3>
          <div class="hint">Use these as a guide when editing your config in the Projects/Environment tabs.</div>
          <div class="hint" style="margin-top: 16px;">
            <i>💡 Tip:</i> Click "Copy" buttons to copy examples to clipboard, then paste in the configuration editor.
          </div>
        </div>
        <div class="right">
          <div class="examples-container">
            <div class="example-column">
              <div class="example-header">
                <h4 style="margin-top:0">projects.json example (two projects)</h4>
                <div class="hint small">This example shows configuration for two different projects with different auth setups</div>
              </div>
              <pre id="example-projects-json" style="white-space: pre; user-select:text; max-height: 400px; overflow: auto;">{
  "projects": {
    "my-frontend": {
      "config": {
        "SWAGGER_URL": "https://api.example.com/openapi.json",
        "API_BASE_URL": "https://api.example.com",
        "AUTH_STORAGE_TYPE": "localStorage",
        "AUTH_TOKEN_KEY": "access_token",
        "AUTH_ORIGIN": "http://localhost:5173",
        "API_AUTH_TOKEN_TTL_SECONDS": 3300,
        "ROUTES_FILE_PATH": "src/routes/paths.ts"
      }
    },
    "another-frontend": {
      "config": {
        "SWAGGER_URL": "https://staging.example.com/openapi.json",
        "API_BASE_URL": "https://staging.example.com",
        "AUTH_STORAGE_TYPE": "cookies",
        "AUTH_TOKEN_KEY": "auth_token",
        "AUTH_ORIGIN": "https://staging.example.com",
        "API_AUTH_TOKEN_TTL_SECONDS": 1800,
        "ROUTES_FILE_PATH": "src/routes/paths.ts"
      }
    }
  },
  "defaultProject": "my-frontend",
  "DEFAULT_SCREENSHOT_STORAGE_PATH": "/absolute/path/to/screenshots/root"
}</pre>
              <div class="actions"><button onclick="copyFromElement('example-projects-json')">📋 Copy projects.json example</button></div>
            </div>
            
            <div class="example-column">
              <div class="example-header">
                <h4>.env example</h4>
                <div class="hint small">Set your embedding provider API key in this file</div>
              </div>
              <pre id="example-env" style="white-space: pre; user-select:text; max-height: 400px; overflow: auto;"># Embedding provider keys (choose one)
OPENAI_API_KEY=
# OPENAI_EMBED_MODEL=text-embedding-3-large
# or
GEMINI_API_KEY=
# GEMINI_EMBED_MODEL=text-embedding-004

# Optional logging
LOG_LEVEL=info</pre>
              <div class="actions"><button onclick="copyFromElement('example-env')">📋 Copy .env example</button></div>
            </div>
          </div>
          
          <div class="example-note" style="margin-top: 24px;">
            <div class="hint">
              <i>ℹ️</i> <strong>Note:</strong> After copying an example, paste it into the configuration editor in the Projects tab and customize the values for your specific project.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Docs Section -->
    <section id="section-docs" class="section" style="display:none">
      <div class="split">
        <div class="left" id="docs-pane">
          <input id="docs-search" placeholder="Search documentation..." />
          <div id="docs-count" class="hint small" style="margin-bottom:8px"></div>
          <div id="docs-items"></div>
        </div>
        <div class="right">
          <div class="hint" id="doc-title" style="margin-bottom:12px">Select a document from the left</div>
          <div id="docs-view"></div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    Autonomous Frontend Browser Tools — Enhanced Setup UI — Runs only for configuration; safe to close when done.
  </footer>
</body>
</html>`;
  const body = Buffer.from(html);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

// ... rest of the server functions remain the same ...

function startUiServer() {
  ensureProjectsJsonExists();
  ensureAfbtDir();
  copyExtensionAssetsIfMissing();
  const server = http.createServer((req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        return serveHtml(res);
      }
      if (req.method === "GET" && req.url === "/config") {
        try {
          const json = JSON.parse(fs.readFileSync(projectsJsonPath, "utf8"));
          return sendJson(res, json);
        } catch (e) {
          return sendJson(res, { error: e.message }, 500);
        }
      }
      if (req.method === "GET" && req.url === "/env") {
        const template = [
          "# Embedding provider keys (set only those you use)",
          "# OPENAI_API_KEY=",
          "# OPENAI_EMBED_MODEL=text-embedding-3-large",
          "# GEMINI_API_KEY=",
          "# GEMINI_EMBED_MODEL=text-embedding-004",
          "",
          "# Optional: override connector defaults",
          "# LOG_LEVEL=info",
        ].join("\n");
        // Always prefer browser-tools-server/.env per new spec
        let selectedPath = serverEnvPath;
        let content = template;
        try {
          if (fs.existsSync(selectedPath))
            content = fs.readFileSync(selectedPath, "utf8");
        } catch {}
        return sendJson(res, { content, path: selectedPath });
      }
      if (req.method === "POST" && req.url === "/env") {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            let text = "";
            // Always write to browser-tools-server/.env per new spec
            let targetPath = serverEnvPath;
            try {
              const parsed = JSON.parse(data || "{}");
              text = typeof parsed.content === "string" ? parsed.content : "";
            } catch {
              text = data || ""; // accept raw text
            }
            // Ensure parent dir exists
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, text);
            return sendJson(res, { status: "ok" });
          } catch (e) {
            return sendJson(res, { error: e.message }, 400);
          }
        });
        return;
      }
      if (req.method === "POST" && req.url === "/save") {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            // Minimal validation
            if (!parsed || typeof parsed !== "object")
              throw new Error("Invalid JSON body");
            // Align with client-side validation: require 'projects' object and optional 'defaultProject' as string
            if (!parsed.projects || typeof parsed.projects !== "object") {
              throw new Error("Missing required 'projects' object");
            }
            if (
              parsed.defaultProject !== undefined &&
              typeof parsed.defaultProject !== "string"
            ) {
              throw new Error("'defaultProject' must be a string if provided");
            }
            fs.writeFileSync(projectsJsonPath, JSON.stringify(parsed, null, 2));
            return sendJson(res, { status: "ok" });
          } catch (e) {
            return sendJson(res, { error: e.message }, 400);
          }
        });
        return;
      }
      // Removed /server/start and /server/stop endpoints
      if (req.method === "GET" && req.url === "/server/info") {
        getConnectorInfo().then((info) => sendJson(res, info));
        return;
      }
      if (req.method === "GET" && req.url.startsWith("/docs/list")) {
        const files = listDocs();
        return sendJson(res, files);
      }
      if (req.method === "GET" && req.url.startsWith("/docs/content")) {
        const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
        const p = urlObj.searchParams.get("path") || "";
        try {
          const full = resolveDocPathSafe(p);
          const content = fs.readFileSync(full, "utf8");
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(content);
        } catch (e) {
          sendJson(res, { error: e.message }, 400);
        }
        return;
      }
      if (req.method === "POST" && req.url === "/shutdown") {
        sendJson(res, { status: "shutting-down" });
        setTimeout(() => {
          server.close(() => process.exit(0));
        }, 200);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    } catch (e) {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  server.listen(PORT, "127.0.0.1", async () => {
    const url = `http://127.0.0.1:${PORT}/`;
    console.log(`AFBT Enhanced Setup UI running at ${url}`);
    try {
      if (chromeLauncher) {
        await chromeLauncher.launch({ startingUrl: url });
      } else {
        const cmd =
          process.platform === "darwin"
            ? `open ${url}`
            : process.platform === "win32"
            ? `start ${url}`
            : `xdg-open ${url}`;
        exec(cmd, () => {});
      }
    } catch (e) {
      // Ignore if browser couldn't be opened
    }
  });
}

// =============================
// Connector child process utils
// =============================

async function compileServerIfNeeded() {
  // Prefer resolved dependency entry; if present, nothing to build
  const entry = resolveConnectorEntry();
  if (fs.existsSync(entry)) return;
  if (fs.existsSync(distEntry)) return;
  try {
    await new Promise((resolve, reject) => {
      const p = exec(`npx -y tsc -p ${JSON.stringify(serverDir)}`);
      p.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("tsc failed"))
      );
    });
  } catch (e) {
    if (!fs.existsSync(distEntry)) {
      throw new Error(
        "Server build missing. Please run 'pnpm build:server' once."
      );
    }
  }
}

function resolveEnvCwdForEntry(entry) {
  // If entry is in node_modules (packaged), use the user's current working dir (repoRoot)
  if (entry.includes(`${path.sep}node_modules${path.sep}`)) return repoRoot;
  // If local repo structure exists, prefer serverDir so existing browser-tools-server/.env is respected
  if (fs.existsSync(serverDir)) return serverDir;
  // Fallback to entry directory
  return path.dirname(entry);
}

async function startConnectorChild() {
  await compileServerIfNeeded();
  const entry = resolveConnectorEntry();
  const child = spawn(process.execPath, [entry], {
    cwd: resolveEnvCwdForEntry(entry),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return true;
}

async function stopConnectorChild() {
  return false;
}

async function findConnectorPort() {
  for (let p = 3025; p <= 3035; p++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${p}/.identity`, {
        signal: AbortSignal.timeout(500),
      });
      if (resp.ok) {
        const j = await resp.json();
        if (j && j.signature === "mcp-browser-connector-24x7") return p;
      }
    } catch (_) {}
  }
  return null;
}

async function getConnectorInfo() {
  const port = await findConnectorPort();
  const running = port !== null; // running if identity is reachable
  return { running, pid: null, port, startedByUi: false };
}

function listDocs() {
  const out = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (dir === repoRoot && e.name !== "docs") continue;
        walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        const rel = join.relative(repoRoot, full);
        out.push(rel);
      }
    }
  }
  // Add README/docs from current working directory (if present)
  if (fs.existsSync(join(repoRoot, "README.md"))) out.push("README.md");
  if (fs.existsSync(join(repoRoot, "docs")))
    walk(join(repoRoot, "docs"));
  // Also include packaged docs as absolute paths (namespaced under pkg/ for clarity)
  if (fs.existsSync(embeddedReadme))
    out.push(join.relative(repoRoot, embeddedReadme));
  if (fs.existsSync(embeddedDocsDir)) {
    const stack = [embeddedDocsDir];
    while (stack.length) {
      const d = stack.pop();
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = join(d, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
          out.push(join.relative(repoRoot, full));
        }
      }
    }
  }
  return Array.from(new Set(out)).sort();
}

function resolveDocPathSafe(rel) {
  const full = resolve(repoRoot, rel);
  const allowed = [repoRoot, packageRoot];
  const isAllowed = allowed.some((root) => full.startsWith(root));
  if (!isAllowed) throw new Error("Invalid path");
  if (!fs.existsSync(full)) throw new Error("Not found");
  if (!full.toLowerCase().endsWith(".md"))
    throw new Error("Only .md files allowed");
  return full;
}

// =============================
// Entrypoint: main vs UI roles
// =============================

async function runMain() {
  // 1) Spawn the UI as a child (temporary process)
  const env = {
    ...process.env,
    AFBT_ROLE: "ui",
    AFBT_SETUP_PORT: String(PORT),
    AFBT_PARENT: "main",
  };
  const uiChild = spawn(process.execPath, [__filename], {
    cwd: repoRoot,
    env,
    stdio: "ignore",
    detached: false,
  });
  // 2) Compile server if needed and run in foreground with logs
  await compileServerIfNeeded();
  const entry = resolveConnectorEntry();
  const serverProc = spawn(process.execPath, [entry], {
    cwd: resolveEnvCwdForEntry(entry),
    stdio: "inherit",
  });
  serverProc.on("exit", async () => {
    try {
      await fetch(`http://127.0.0.1:${PORT}/shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(500),
      });
    } catch {}
    process.exit(0);
  });
}

if (process.env.AFBT_ROLE === "ui") {
  startUiServer();
} else {
  runMain().catch((e) => {
    console.error("afbt-setup failed:", e?.message || e);
    process.exit(1);
  });
}