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
    const isLocalDev = resolve(embeddedExtensionDir) === resolve(extensionDir);

    // Copy when: (not local dev) and (extension missing, or packaged version differs)
    const needsCopy =
      !isLocalDev &&
      (!fs.existsSync(manifestPath) || localVersion !== pkgVersion) &&
      fs.existsSync(embeddedExtensionDir);

    if (needsCopy) {
      // Replace extension assets (no backups). Ensure any old content is overwritten.
      fs.cpSync(embeddedExtensionDir, extensionDir, { recursive: true });
      // Ensure no projects.json remains in chrome-extension (config now lives at project root)
      try {
        fs.unlinkSync(join(extensionDir, "projects.json"));
      } catch {}
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
  let html;

  try {
    // Prefer the new minimal UI; fallback to legacy if missing
    const newUiPath = join(__dirname, "ui", "new-setup-ui.html");
    const legacyUiPath = join(__dirname, "setup-ui.html");
    const chosen = fs.existsSync(newUiPath) ? newUiPath : legacyUiPath;
    html = fs.readFileSync(chosen, "utf8");
    // Replace the placeholder with the actual boolean value
    html = html.replace(
      "/*AFBT_LAUNCHED_BY_MAIN_PLACEHOLDER*/false",
      launchedByMain ? "true" : "false"
    );
  } catch (e) {
    // Fallback to a simple error message if the HTML file can't be read
    html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>AFBT Setup Error</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .error { color: red; }
        </style>
      </head>
      <body>
        <h1>Setup UI Error</h1>
        <p class="error">Failed to load setup interface: ${
          e?.message || "Unknown error"
        }</p>
        <p>Please ensure the setup-ui.html file exists in the same directory as this script.</p>
      </body>
      </html>
    `;
  }

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
        const rel = path.relative(repoRoot, full);
        out.push(rel);
      }
    }
  }
  // Add README/docs from current working directory (if present)
  if (fs.existsSync(join(repoRoot, "README.md"))) out.push("README.md");
  if (fs.existsSync(join(repoRoot, "docs"))) walk(join(repoRoot, "docs"));
  // Also include packaged docs as absolute paths (namespaced under pkg/ for clarity)
  if (fs.existsSync(embeddedReadme))
    out.push(path.relative(repoRoot, embeddedReadme));
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
          out.push(path.relative(repoRoot, full));
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
