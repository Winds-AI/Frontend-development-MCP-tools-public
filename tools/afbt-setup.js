#!/usr/bin/env node
/*
  Autonomous Frontend Browser Tools — Setup (afbt-setup)
  - Minimal local web UI to create/update chrome-extension/projects.json
  - Opens in Chrome automatically when possible
  - Exits when user clicks "Finish & Close"
*/

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");

// Try to require optional chrome-launcher gracefully
let chromeLauncher = null;
try {
  chromeLauncher = require("chrome-launcher");
} catch (_) {}

const PORT = process.env.AFBT_SETUP_PORT
  ? parseInt(process.env.AFBT_SETUP_PORT, 10)
  : 5055;

const repoRoot = process.cwd();
const packageRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(repoRoot, "chrome-extension");
const projectsJsonPath = path.join(extensionDir, "projects.json");
const serverDir = path.join(repoRoot, "browser-tools-server");
const distEntry = path.join(serverDir, "dist", "browser-connector.js");
const afbtDir = path.join(repoRoot, ".afbt");
const pidPath = path.join(afbtDir, "connector.pid");
const embeddedExtensionDir = path.join(packageRoot, "chrome-extension");
const embeddedDocsDir = path.join(packageRoot, "docs");
const embeddedReadme = path.join(packageRoot, "README.md");
const envPath = path.join(repoRoot, ".env");
const serverEnvPath = path.join(serverDir, ".env");

function ensureAfbtDir() {
  if (!fs.existsSync(afbtDir)) fs.mkdirSync(afbtDir, { recursive: true });
}

function resolveConnectorEntry() {
  // 1) Prefer embedded dist inside this installed package
  const embedded = path.join(packageRoot, "browser-tools-server", "dist", "browser-connector.js");
  if (fs.existsSync(embedded)) return embedded;
  // 2) Try resolving from node_modules if the package is installed under a name
  try {
    const nm = require.resolve("afbt/browser-tools-server/dist/browser-connector.js");
    return nm;
  } catch (_) {}
  // 3) Fallback to local working directory (dev) path
  return distEntry;
}

function ensureProjectsJsonExists() {
  if (!fs.existsSync(extensionDir)) {
    fs.mkdirSync(extensionDir, { recursive: true });
  }
  if (!fs.existsSync(projectsJsonPath)) {
    // Create a mock template for first-time users; real values will be added via the UI.
    const skeleton = {
      projects: {
        "my-frontend": {
          config: {
            SWAGGER_URL: "https://api.example.com/openapi.json",
            API_BASE_URL: "https://api.example.com",
            API_AUTH_TOKEN: "<your_bearer_token>",
            ROUTES_FILE_PATH: "src/routes/paths.ts"
          }
        }
      },
      defaultProject: "my-frontend",
      DEFAULT_SCREENSHOT_STORAGE_PATH: path.join(
        require("os").homedir(),
        "Downloads",
        "MCP_Screenshots"
      )
    };
    fs.writeFileSync(projectsJsonPath, JSON.stringify(skeleton, null, 2));
  }
}

function copyExtensionAssetsIfMissing() {
  try {
    const manifestPath = path.join(extensionDir, "manifest.json");
    if (!fs.existsSync(manifestPath) && fs.existsSync(embeddedExtensionDir)) {
      fs.cpSync(embeddedExtensionDir, extensionDir, { recursive: true });
      console.log("Copied chrome-extension assets to:", extensionDir);
    }
  } catch (e) {
    console.warn("Could not copy chrome-extension assets:", e?.message || e);
  }
}

function sendJson(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function serveHtml(res) {
  const launchedByMain = process.env.AFBT_PARENT === 'main';
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autonomous Frontend Browser Tools — Setup</title>
  <style>
    :root { --bg:#0b0f14; --panel:#0f172a; --muted:#9ca3af; --border:#1f2937; --accent:#2563eb; --accent-2:#374151; --ok:#34d399; --err:#f87171; --header-h:64px; --footer-h:40px; }
    html, body { height: 100%; }
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 0; background: var(--bg); color: #e6edf3; }
    header { padding: 12px clamp(12px, 2vw, 24px); background: #111827; border-bottom: 1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:16px; }
    h1 { font-size: 16px; margin: 0; }
    nav { display:flex; gap:8px; }
    nav button { background: transparent; color:#cbd5e1; border:0; padding:8px 10px; border-radius:7px; cursor:pointer; }
    nav button.active, nav button:hover { background:#1f2937; color:#fff; }
    .top-actions { display:flex; gap:8px; }
    main { padding: 16px clamp(12px, 2vw, 24px); width: 100%; box-sizing: border-box; min-height: calc(100dvh - var(--header-h) - var(--footer-h)); }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; flex: 1; min-width: 320px; }
    textarea { width: 100%; height: 55vh; background: #0b1220; color: #e6edf3; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; }
    #config-editor { height: calc(100% - 96px); min-height: 280px; }
    .actions { display: flex; gap: 12px; margin-top: 12px; }
    button { background: var(--accent); color: white; border: 0; padding: 9px 12px; border-radius: 8px; cursor: pointer; }
    button.secondary { background: var(--accent-2); }
    .hint { color: var(--muted); font-size: 12px; margin-top: 8px; }
    .hint.small { font-size: 11px; }
    .success { color: var(--ok); }
    .error { color: var(--err); }
    footer { padding: 14px clamp(12px, 2vw, 24px); color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); }
    .split { display:flex; gap:16px; height: calc(100dvh - var(--header-h) - var(--footer-h) - 32px); }
    .left { width: clamp(280px, 22vw, 420px); background: var(--panel); border:1px solid var(--border); border-radius:10px; padding:12px; overflow:auto; display:flex; flex-direction:column; }
    .right { flex:1; background: var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; overflow:auto; }
    .file { padding:6px 8px; border-radius:6px; cursor:pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file:hover { background:#121a2f; }
    .badge { display:inline-block; padding:2px 6px; border-radius:999px; font-size:11px; margin-left:6px; border:1px solid var(--border); }
    .ok { color: var(--ok); border-color: var(--ok); }
    .warn { color: #f59e0b; border-color: #f59e0b; }
    .fail { color: var(--err); border-color: var(--err); }
    #docs-search { background:#0b1220; color:#e6edf3; border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px; font-size: 13px; }
    #docs-items { overflow:auto; }
    #docs-view h1, #docs-view h2, #docs-view h3 { margin-top: 0.8em; }
    #docs-view code, #docs-view pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    #docs-view code { background:#0b1220; border:1px solid var(--border); border-radius:6px; padding:2px 6px; }
    #docs-view pre { background:#0b1220; border:1px solid var(--border); border-radius:6px; padding:12px; overflow:auto; line-height: 1.5; word-break: normal; white-space: pre; }
    #docs-view pre code { background: transparent; border: none; padding: 0; display: block; line-height: inherit; white-space: inherit; }
    @media (max-width: 900px) {
      .split { flex-direction: column; height: auto; }
      .left { width: 100%; height: 40dvh; }
      .right { width: 100%; height: calc(60dvh - 16px); }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"></script>
  <script>
  const AFBT_LAUNCHED_BY_MAIN = ${launchedByMain ? 'true' : 'false'};
  let activeTab = 'overview';
  let DOCS_FILES = [];
  async function loadConfig() {
    const res = await fetch('/config');
    const json = await res.json();
    document.getElementById('projects').value = JSON.stringify(json, null, 2);
    setStatus('Loaded current configuration.', 'success');
    await reloadEnv();
  }
  function setStatus(msg, cls) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = cls || '';
  }
  function setButtonActive(id) {
    for (const b of document.querySelectorAll('nav button')) b.classList.remove('active');
    document.getElementById(id).classList.add('active');
  }
  function showTab(tab) {
    activeTab = tab;
    for (const s of document.querySelectorAll('.section')) s.style.display = 'none';
    document.getElementById('section-'+tab).style.display = 'block';
    setButtonActive('tab-'+tab);
    if (tab === 'docs') loadDocs();
    if (tab === 'overview') refreshInfo();
  }
  async function saveConfig() {
    try {
      const text = document.getElementById('projects').value;
      const parsed = JSON.parse(text);
      const res = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) });
      if (!res.ok) throw new Error('Save failed');
      setStatus('Saved projects.json successfully.', 'success');
    } catch (e) {
      setStatus('Invalid JSON or save failed: ' + e.message, 'error');
    }
  }
  async function finish() {
    await saveConfig();
    setStatus('Shutting down setup server...', '');
    try { await fetch('/shutdown', { method: 'POST' }); } catch {}
    // Try to close this tab/window; fallback to about:blank
    try { window.open('', '_self'); window.close(); } catch {}
    setTimeout(() => { try { window.location.replace('about:blank'); } catch {} }, 600);
  }
  async function startConnector() {
    await fetch('/server/start', { method: 'POST' });
    await refreshInfo();
  }
  async function stopConnector() {
    await fetch('/server/stop', { method: 'POST' });
    await refreshInfo();
  }
  async function refreshInfo() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const el = document.getElementById('server-status');
      const linkHealth = document.getElementById('btn-open-health');
      const linkId = document.getElementById('btn-open-id');
      const btnStart = document.getElementById('btn-start-conn');
      const btnStop = document.getElementById('btn-stop-conn');
      const managedNote = document.getElementById('server-managed-note');

      if (info.port) {
        linkHealth.dataset.href = 'http://127.0.0.1:' + info.port + '/connection-health';
        linkId.dataset.href = 'http://127.0.0.1:' + info.port + '/.identity';
      }

      if (AFBT_LAUNCHED_BY_MAIN) {
        btnStart.style.display = 'none';
        btnStop.style.display = 'none';
      }

      if (info.running) {
        el.innerHTML = 'Running <span class="badge ok">PID ' + (info.pid || 'unknown') + '</span> <span class="badge">port ' + (info.port || '?') + '</span>';
        if (!AFBT_LAUNCHED_BY_MAIN) {
          btnStart.disabled = true;
          if (info.startedByUi) {
            btnStop.disabled = false;
            managedNote.textContent = 'Managed by this setup UI (PID ' + info.pid + '). You can stop it here or close this UI to leave it running.';
          } else {
            btnStop.disabled = true;
            managedNote.textContent = 'Managed externally. Stop it from your terminal; Start/Stop here are disabled.';
          }
        } else {
          managedNote.textContent = 'Managed by main process (npx afbt-setup). Logs visible in your terminal.';
        }
      } else {
        el.textContent = AFBT_LAUNCHED_BY_MAIN ? 'Detecting...' : 'Stopped';
        if (!AFBT_LAUNCHED_BY_MAIN) {
          btnStart.disabled = false;
          btnStop.disabled = true;
          managedNote.textContent = 'Not running. You can start a background instance from here (logs will not appear in this UI).';
        } else {
          managedNote.textContent = 'This UI is auxiliary. Server is started by main process; please wait while it comes online.';
        }
      }
    } catch {}
  }

  async function openHealth() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const href = document.getElementById('btn-open-health').dataset.href;
      if (info.port && href) {
        window.open(href, '_blank');
      } else {
        setStatus('Connector not detected yet. Try again in a moment.', 'warn');
      }
    } catch { setStatus('Unable to open health endpoint.', 'error'); }
  }
  async function openIdentity() {
    try {
      const res = await fetch('/server/info');
      const info = await res.json();
      const href = document.getElementById('btn-open-id').dataset.href;
      if (info.port && href) {
        window.open(href, '_blank');
      } else {
        setStatus('Connector not detected yet. Try again in a moment.', 'warn');
      }
    } catch { setStatus('Unable to open identity endpoint.', 'error'); }
  }

  async function loadDocs() {
    const listEl = document.getElementById('docs-items');
    if (listEl.dataset.loaded === '1') return; // one-time
    listEl.innerHTML = 'Loading...';
    const res = await fetch('/docs/list');
    const files = await res.json();
    DOCS_FILES = files.slice();
    renderDocsList('');
    listEl.dataset.loaded = '1';
  }
  function renderDocsList(query) {
    const listEl = document.getElementById('docs-items');
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
    counter.textContent = filtered.length + '/' + DOCS_FILES.length + ' files';
  }
  async function loadDoc(p) {
    const res = await fetch('/docs/content?path='+encodeURIComponent(p));
    const txt = await res.text();
    const md = window.markdownit({ html: false, linkify: true, breaks: true });
    document.getElementById('docs-view').innerHTML = md.render(txt);
    document.getElementById('doc-title').textContent = p;
  }
  async function reloadEnv() {
    try {
      const res = await fetch('/env');
      const data = await res.json();
      document.getElementById('envText').value = data.content || '';
      const hint = document.querySelector('#config-guide .hint.small');
      if (hint) hint.textContent = 'Path: ' + (data.path || '.env') + ' (auto-detected)';
    } catch { /* ignore */ }
  }
  async function saveEnv() {
    try {
      const content = document.getElementById('envText').value;
      // Include the current path so we overwrite the same file we loaded
      const info = await (await fetch('/env')).json();
      const res = await fetch('/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, path: info.path }) });
      if (!res.ok) throw new Error('Save .env failed');
      setStatus('Saved .env successfully.', 'success');
    } catch (e) {
      setStatus('Failed to save .env: ' + e.message, 'error');
    }
  }
  window.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    showTab('overview');
    // compute dynamic header/footer heights for perfect fit
    function adjustLayout() {
      const headerH = document.querySelector('header')?.offsetHeight || 64;
      const footerH = document.querySelector('footer')?.offsetHeight || 40;
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
  });
  </script>
</head>
<body>
  <header>
    <h1>Autonomous Frontend Browser Tools — Setup</h1>
    <nav>
      <button id="tab-overview" onclick="showTab('overview')">Overview</button>
      <button id="tab-configure" onclick="showTab('configure')">Configure</button>
      <button id="tab-docs" onclick="showTab('docs')">Docs</button>
    </nav>
    <div class="top-actions">
      <button id="btn-start-conn" class="secondary" onclick="startConnector()">Start Connector</button>
      <button id="btn-stop-conn" class="secondary" onclick="stopConnector()">Stop Connector</button>
      <a id="btn-open-health" class="secondary" style="text-decoration:none; padding:9px 12px; border-radius:8px; background:#374151; color:#fff" href="javascript:void(0)" onclick="openHealth()">Open Health</a>
      <a id="btn-open-id" class="secondary" style="text-decoration:none; padding:9px 12px; border-radius:8px; background:#374151; color:#fff" href="javascript:void(0)" onclick="openIdentity()">Open Identity</a>
      <button id="btn-close-ui" class="secondary" onclick="finish()">Close</button>
    </div>
  </header>
  <main>
    <section id="section-overview" class="section" style="display:none">
      <div class="row">
        <div class="card">
          <h3 style="margin:0 0 6px 0">Extension</h3>
          <div class="hint">Load via chrome://extensions → Developer Mode → Load unpacked → select <code>chrome-extension/</code>.</div>
          <div class="hint" style="margin-top:6px">Keep DevTools open on the active tab when using browser/ui tools.</div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 6px 0">Connector Server</h3>
          <div id="server-status">Detecting...</div>
          <div class="hint" style="margin-top:6px">Health endpoint exposes heartbeat, uptime, pending operations.</div>
          <div id="server-managed-note" class="hint" style="margin-top:6px"></div>
        </div>
      </div>
    </section>
    <section id="section-configure" class="section" style="display:none">
      <div class="split">
        <div class="left" id="config-guide">
          <h3 style="margin:4px 0 8px 0">Configuration</h3>
          <div class="hint">This file is local and intended to be ignored by git.</div>
          <ul style="margin-top:10px; padding-left:18px; line-height:1.5">
            <li><b>SWAGGER_URL</b>: Required for <code>api.searchEndpoints</code> and <code>api.listTags</code>.</li>
            <li><b>API_BASE_URL</b>: Required for <code>api.request</code>.</li>
            <li><b>API_AUTH_TOKEN</b>: Optional; used only when <code>includeAuthToken</code> is true for <code>api.request</code>.</li>
            <li><b>ROUTES_FILE_PATH</b>: Optional; referenced in <code>browser.navigate</code> description.</li>
            <li><b>DEFAULT_SCREENSHOT_STORAGE_PATH</b>: Optional; base folder for screenshots.</li>
            <li><b>Embedding keys</b>: set via env only — <code>OPENAI_API_KEY</code> or <code>GEMINI_API_KEY</code> (do not store in JSON).</li>
          </ul>
          <div class="hint small" style="margin-top:8px">
            Tip: Set <code>defaultProject</code> to the project you work with most. You can keep multiple projects side‑by‑side here.
          </div>
          <h3 style="margin:16px 0 8px 0">Environment (.env)</h3>
          <div class="hint">Keys used by the connector. These are loaded automatically on start.</div>
          <textarea id="envText" spellcheck="false" style="height: 160px; margin-top:8px; background:#0b1220; color:#e6edf3; border:1px solid var(--border); border-radius:8px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px;"></textarea>
          <div class="actions">
            <button onclick="saveEnv()">Save .env</button>
            <button class="secondary" onclick="reloadEnv()">Reload .env</button>
          </div>
          <div class="hint small">Path: .env in the current working directory</div>
        </div>
        <div class="right" id="config-editor-pane">
          <p style="margin-top:0">Edit your per-project configuration below.</p>
          <textarea id="projects" spellcheck="false" class="config-textarea" style="height: calc(100% - 96px)"></textarea>
          <div class="actions">
            <button onclick="saveConfig()">Save</button>
            <button class="secondary" onclick="loadConfig()">Reload</button>
            <button onclick="finish()">Finish & Close</button>
          </div>
          <div id="status" class="hint"></div>
          <div class="hint">Path: chrome-extension/projects.json</div>
        </div>
      </div>
    </section>
    <section id="section-docs" class="section" style="display:none">
      <div class="split">
        <div class="left" id="docs-pane">
          <input id="docs-search" placeholder="Search docs..." />
          <div id="docs-count" class="hint small" style="margin-bottom:6px"></div>
          <div id="docs-items"></div>
        </div>
        <div class="right">
          <div class="hint" id="doc-title" style="margin-bottom:8px">Select a document from the left</div>
          <div id="docs-view"></div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    Autonomous Frontend Browser Tools — Setup UI — Runs only for configuration; safe to close when done.
  </footer>
</body>
</html>`;
  const body = Buffer.from(html);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length
  });
  res.end(body);
}

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
        const json = JSON.parse(fs.readFileSync(projectsJsonPath, "utf8"));
        return sendJson(res, json);
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
        let selectedPath = envPath;
        if (!fs.existsSync(envPath) && fs.existsSync(serverEnvPath)) {
          selectedPath = serverEnvPath;
        }
        let content = template;
        try { if (fs.existsSync(selectedPath)) content = fs.readFileSync(selectedPath, "utf8"); } catch {}
        return sendJson(res, { content, path: selectedPath });
      }
      if (req.method === "POST" && req.url === "/env") {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            let text = "";
            let targetPath = envPath;
            try {
              const parsed = JSON.parse(data || "{}");
              text = typeof parsed.content === "string" ? parsed.content : "";
              if (parsed.path && typeof parsed.path === "string") targetPath = parsed.path;
            } catch {
              text = data || ""; // accept raw text
            }
            // If neither file exists, prefer top-level; else write to whichever path was used to load
            if (!fs.existsSync(targetPath) && fs.existsSync(serverEnvPath) && !fs.existsSync(envPath)) {
              targetPath = serverEnvPath;
            }
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
            fs.writeFileSync(projectsJsonPath, JSON.stringify(parsed, null, 2));
            return sendJson(res, { status: "ok" });
          } catch (e) {
            return sendJson(res, { error: e.message }, 400);
          }
        });
        return;
      }
      if (req.method === "POST" && req.url === "/server/start") {
        startConnectorChild()
          .then((started) => sendJson(res, { started }))
          .catch((e) => sendJson(res, { error: e.message }, 500));
        return;
      }
      if (req.method === "POST" && req.url === "/server/stop") {
        stopConnectorChild()
          .then((stopped) => sendJson(res, { stopped }))
          .catch((e) => sendJson(res, { error: e.message }, 500));
        return;
      }
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
    console.log(`AFBT Setup UI running at ${url}`);
    try {
      if (chromeLauncher) {
        await chromeLauncher.launch({ startingUrl: url });
      } else {
        const cmd = process.platform === "darwin" ? `open ${url}` : process.platform === "win32" ? `start ${url}` : `xdg-open ${url}`;
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

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

async function compileServerIfNeeded() {
  // Prefer resolved dependency entry; if present, nothing to build
  const entry = resolveConnectorEntry();
  if (fs.existsSync(entry)) return;
  if (fs.existsSync(distEntry)) return;
  try {
    await new Promise((resolve, reject) => {
      const p = exec(`npx -y tsc -p ${JSON.stringify(serverDir)}`);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("tsc failed"))));
    });
  } catch (e) {
    if (!fs.existsSync(distEntry)) {
      throw new Error("Server build missing. Please run 'pnpm build:server' once.");
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
  ensureAfbtDir();
  let existingPid = null;
  if (fs.existsSync(pidPath)) {
    try { existingPid = parseInt(fs.readFileSync(pidPath, "utf8"), 10); } catch {}
  }
  if (existingPid && isRunning(existingPid)) {
    return false; // already running
  }
  try { if (existingPid && !isRunning(existingPid)) fs.unlinkSync(pidPath); } catch {}
  await compileServerIfNeeded();
  const entry = resolveConnectorEntry();
  const child = spawn(process.execPath, [entry], {
    cwd: resolveEnvCwdForEntry(entry),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(pidPath, String(child.pid));
  return true;
}

async function stopConnectorChild() {
  if (!fs.existsSync(pidPath)) return false;
  const pid = parseInt(fs.readFileSync(pidPath, "utf8"), 10);
  if (!pid || !isRunning(pid)) {
    try { fs.unlinkSync(pidPath); } catch {}
    return false;
  }
  try { process.kill(pid); } catch {}
  try { fs.unlinkSync(pidPath); } catch {}
  return true;
}

async function findConnectorPort() {
  for (let p = 3025; p <= 3035; p++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${p}/.identity`, { signal: AbortSignal.timeout(500) });
      if (resp.ok) {
        const j = await resp.json();
        if (j && j.signature === "mcp-browser-connector-24x7") return p;
      }
    } catch (_) {}
  }
  return null;
}

async function getConnectorInfo() {
  let pid = null;
  if (fs.existsSync(pidPath)) {
    try { pid = parseInt(fs.readFileSync(pidPath, "utf8"), 10); } catch {}
  }
  const pidRunning = !!pid && isRunning(pid);
  const port = await findConnectorPort();
  const running = port !== null; // running if identity is reachable
  const startedByUi = running && pidRunning;
  return { running, pid: startedByUi ? pid : null, port, startedByUi };
}

function listDocs() {
  const out = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
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
  if (fs.existsSync(path.join(repoRoot, "README.md"))) out.push("README.md");
  if (fs.existsSync(path.join(repoRoot, "docs"))) walk(path.join(repoRoot, "docs"));
  // Also include packaged docs as absolute paths (namespaced under pkg/ for clarity)
  if (fs.existsSync(embeddedReadme)) out.push(path.relative(repoRoot, embeddedReadme));
  if (fs.existsSync(embeddedDocsDir)) {
    const stack = [embeddedDocsDir];
    while (stack.length) {
      const d = stack.pop();
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
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
  const full = path.resolve(repoRoot, rel);
  const allowed = [repoRoot, packageRoot];
  const isAllowed = allowed.some((root) => full.startsWith(root));
  if (!isAllowed) throw new Error("Invalid path");
  if (!fs.existsSync(full)) throw new Error("Not found");
  if (!full.toLowerCase().endsWith(".md")) throw new Error("Only .md files allowed");
  return full;
}

// =============================
// Entrypoint: main vs UI roles
// =============================

async function runMain() {
  // 1) Spawn the UI as a child (temporary process)
  const env = { ...process.env, AFBT_ROLE: "ui", AFBT_SETUP_PORT: String(PORT), AFBT_PARENT: "main" };
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
    try { await fetch(`http://127.0.0.1:${PORT}/shutdown`, { method: "POST", signal: AbortSignal.timeout(500) }); } catch {}
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


