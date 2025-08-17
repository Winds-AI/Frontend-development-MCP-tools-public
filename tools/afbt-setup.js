#!/usr/bin/env node
/*
  Autonomous Frontend Browser Tools — Setup (afbt-setup)
  - Minimal local web UI to edit/save projects.json at project root and .env in browser-tools-server/
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
// Root-level projects.json (single source of truth)
const projectsJsonPath = path.join(repoRoot, "projects.json");
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
  const embedded = path.join(
    packageRoot,
    "browser-tools-server",
    "dist",
    "browser-connector.js"
  );
  if (fs.existsSync(embedded)) return embedded;
  // 2) Try resolving from node_modules if the package is installed under a name
  try {
    const nm = require.resolve(
      "afbt/browser-tools-server/dist/browser-connector.js"
    );
    return nm;
  } catch (_) {}
  // 3) Fallback to local working directory (dev) path
  return distEntry;
}

// No server-side skeleton creation anymore; UI shows a template client-side
function ensureProjectsJsonExists() {
  // Intentionally no-op; existence is optional until user saves from UI
}

function copyExtensionAssetsIfMissing() {
  try {
    const manifestPath = path.join(extensionDir, "manifest.json");
    // Determine package version (from root package.json of installed package)
    let pkgVersion = "0.0.0";
    try {
      const rootPkg = JSON.parse(
        fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")
      );
      if (rootPkg && typeof rootPkg.version === "string")
        pkgVersion = rootPkg.version;
    } catch {}

    const versionMarker = path.join(afbtDir, "extension.version");
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
      path.resolve(embeddedExtensionDir) === path.resolve(extensionDir);

    // Copy when: (not local dev) and (extension missing, or packaged version differs)
    const needsCopy =
      !isLocalDev &&
      (!fs.existsSync(manifestPath) || localVersion !== pkgVersion) &&
      fs.existsSync(embeddedExtensionDir);

    if (needsCopy) {
      // Overlay copy, skipping projects.json; no backups
      fs.cpSync(embeddedExtensionDir, extensionDir, {
        recursive: true,
        filter: (src) => !src.endsWith(path.sep + "projects.json"),
      });
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
    .invalid { border-color: var(--err) !important; box-shadow: 0 0 0 1px var(--err) inset; }
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
  const AFBT_LAUNCHED_BY_MAIN = ${launchedByMain ? "true" : "false"};
  let activeTab = 'configure';
  let DOCS_FILES = [];
  let __serverInfoCache = null;
  async function loadConfig() {
    try {
      const res = await fetch('/config');
      if (!res.ok) throw new Error('Failed to load config');
      const json = await res.json();
      document.getElementById('projects').value = JSON.stringify(json, null, 2);
      setStatus('Loaded current configuration.', 'success');
    } catch {
      const el = document.getElementById('projects');
      if (el) el.value = '';
      setStatus('No projects.json found. Open the Examples tab to copy a template, then paste here and Save.', 'warn');
    }
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
    if (tab === 'env') reloadEnv();
    if (tab === 'embed') loadEmbeddingsUi();
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
      listEl.innerHTML = '';
      const projects = getProjectsFromEditor();
      const base = await getServerBaseUrl();
      projects.forEach((name) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid #2a2a2a;';
        const left = document.createElement('div');
        left.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
        const title = document.createElement('div');
        title.textContent = name;
        title.style.fontWeight = '600';
        const status = document.createElement('div');
        status.id = 'embed-status-ui-' + name;
        status.textContent = base ? 'Checking...' : 'Server not detected';
        status.style.fontSize = '12px';
        status.style.color = '#ccc';
        left.appendChild(title);
        left.appendChild(status);
        const actions = document.createElement('div');
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'action-button';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.onclick = () => refreshProjectStatusUi(name);
        const reindexBtn = document.createElement('button');
        reindexBtn.className = 'action-button';
        reindexBtn.textContent = 'Reindex';
        reindexBtn.onclick = () => reindexProjectUi(name, reindexBtn);
        actions.appendChild(refreshBtn);
        actions.appendChild(reindexBtn);
        row.appendChild(left);
        row.appendChild(actions);
        listEl.appendChild(row);
        if (base) refreshProjectStatusUi(name);
      });
    } catch {}
  }
  async function refreshProjectStatusUi(project) {
    const base = await getServerBaseUrl();
    const el = document.getElementById('embed-status-ui-' + project);
    if (!base) { if (el) el.textContent = 'Server not detected'; return; }
    try {
      if (el) el.textContent = 'Checking...';
      const resp = await fetch(base + '/api/embed/status?project=' + encodeURIComponent(project));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (data && data.exists && data.meta) {
        const m = data.meta;
        const built = m.builtAt ? new Date(m.builtAt).toLocaleString() : 'unknown';
        if (el) el.textContent = 'Built: ' + built + ' • Vectors: ' + m.vectorCount + ' • Model: ' + m.model;
      } else {
        if (el) el.textContent = 'Index not built. Click Reindex.';
      }
    } catch (e) {
      if (el) el.textContent = 'Status check failed: ' + (e.message || e);
    }
  }
  async function reindexProjectUi(project, buttonEl) {
    const base = await getServerBaseUrl();
    const el = document.getElementById('embed-status-ui-' + project);
    if (!base) { if (el) el.textContent = 'Server not detected'; return; }
    const original = buttonEl ? buttonEl.textContent : null;
    if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Rebuilding...'; }
    if (el) el.textContent = 'Rebuilding...';
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
        if (el) el.textContent = 'Completed • Built: ' + built + ' • Vectors: ' + m.vectorCount + ' • Model: ' + m.model;
      } else {
        if (el) el.textContent = 'Rebuild complete, but no metadata returned';
      }
    } catch (e) {
      if (el) el.textContent = 'Rebuild failed: ' + (e.message || e);
    } finally {
      if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = original || 'Reindex'; }
    }
  }
  function validateProjectsJson(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Root must be an object' };
      if (!parsed.projects || typeof parsed.projects !== 'object') return { ok: false, error: "Missing required 'projects' object" };
      // optional defaultProject if present must be string
      if (parsed.defaultProject !== undefined && typeof parsed.defaultProject !== 'string') return { ok: false, error: "'defaultProject' must be a string if provided" };
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
      setStatus('JSON looks valid.', '');
    } else {
      ta.classList.add('invalid');
      if (btn) btn.disabled = true;
      setStatus('Invalid JSON: ' + result.error, 'error');
    }
  }

  async function saveConfig() {
    try {
      const text = document.getElementById('projects').value;
      const result = validateProjectsJson(text);
      if (!result.ok) {
        setStatus('Invalid JSON: ' + result.error, 'error');
        updateEditorValidation();
        return;
      }
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
        el.innerHTML = 'Running <span class="badge ok">PID ' + (info.pid || 'unknown') + '</span> <span class="badge">port ' + (info.port || '?') + '</span>';
        managedNote.textContent = AFBT_LAUNCHED_BY_MAIN
          ? 'Managed by main process (npx).'
          : (info.startedByUi
              ? 'Managed by this setup UI (PID ' + info.pid + ').'
              : 'Managed externally.');
      } else {
        el.textContent = AFBT_LAUNCHED_BY_MAIN ? 'Detecting...' : 'Stopped';
        managedNote.textContent = AFBT_LAUNCHED_BY_MAIN
          ? 'This UI is auxiliary. Server is started by main process; please wait while it comes online.'
          : 'Not running.';
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
  function copyFromElement(id) {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard.', 'success');
      setTimeout(() => setStatus('', ''), 1200);
    } catch (e) { setStatus('Copy failed: ' + (e.message || e), 'error'); }
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
    try { await loadConfig(); } catch {}
    showTab('configure');
    // Ensure active state in nav for first paint
    try { document.getElementById('tab-configure').classList.add('active'); } catch {}
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
    // Live JSON validation for projects editor
    const ta = document.getElementById('projects');
    if (ta) {
      ta.addEventListener('input', updateEditorValidation);
      updateEditorValidation();
    }
  });
  </script>
</head>
<body>
  <header>
    <h1>Autonomous Frontend Browser Tools — Setup</h1>
    <nav>
      <button id="tab-configure" onclick="showTab('configure')">Configure</button>
      <button id="tab-env" onclick="showTab('env')">Environment</button>
      <button id="tab-examples" onclick="showTab('examples')">Examples</button>
      <button id="tab-embed" onclick="showTab('embed')">Embeddings</button>
      <button id="tab-docs" onclick="showTab('docs')">Docs</button>
    </nav>
    <div class="top-actions">
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
           <ul style="margin-top:12px; padding-left:18px; line-height:1.6">
             <li>
               <b>SWAGGER_URL</b> <span class="badge">Used by: api.searchEndpoints, api.listTags</span>
               <div class="hint small">URL or file path to your OpenAPI/Swagger spec. Loaded by API docs tools for endpoint search and tag listing.</div>
             </li>
             <li>
               <b>API_BASE_URL</b> <span class="badge">Used by: api.request</span>
               <div class="hint small">Base URL for constructing live API requests.</div>
             </li>
             <li>
               <b>AUTH_STORAGE_TYPE</b> <span class="badge">Used by: api.request (auth)</span>
               <div class="hint small">Where the auth token is stored: <code>localStorage</code>, <code>sessionStorage</code>, or <code>cookies</code>.</div>
             </li>
             <li>
               <b>AUTH_TOKEN_KEY</b> <span class="badge">Used by: api.request (auth)</span>
               <div class="hint small">Key or cookie name from which the bearer token is read.</div>
             </li>
             <li>
               <b>AUTH_ORIGIN</b> <span class="badge">Used by: api.request (cookies)</span>
               <div class="hint small">Browser origin for reading cookies, e.g. <code>http://localhost:5173</code>.</div>
             </li>
             <li>
               <b>API_AUTH_TOKEN_TTL_SECONDS</b> <span class="badge">Used by: api.request (auth cache)</span>
               <div class="hint small">Optional TTL for token cache. If token is a JWT, its <code>exp</code> is respected automatically.</div>
             </li>
             <li>
               <b>ROUTES_FILE_PATH</b> <span class="badge">Used by: browser.navigate (helper)</span>
               <div class="hint small">Optional path hint to your app's routes file to improve navigation descriptions.</div>
             </li>
             <li>
               <b>PROJECT_ROOT</b> <span class="badge">Used by: internal (context/reference)</span>
               <div class="hint small">Optional absolute path to your project root for reference in logs or helper features.</div>
             </li>
             <li>
               <b>BROWSER_TOOLS_HOST</b> <span class="badge">Used by: internal (server discovery)</span>
               <div class="hint small">Override for connector host used by tools (default <code>127.0.0.1</code>).</div>
             </li>
             <li>
               <b>BROWSER_TOOLS_PORT</b> <span class="badge">Used by: internal (server discovery)</span>
               <div class="hint small">Override for connector port used by tools (default <code>3025</code> with fallback scanning).</div>
             </li>
             <li>
               <b>SCREENSHOT_STORAGE_PATH</b> <span class="badge">Used by: browser.screenshot</span>
               <div class="hint small">Per-project directory for saving screenshots. If unset, falls back to <code>DEFAULT_SCREENSHOT_STORAGE_PATH</code>.</div>
             </li>
             <li>
               <b>DEFAULT_SCREENSHOT_STORAGE_PATH</b> <span class="badge">Used by: browser.screenshot (fallback)</span>
               <div class="hint small">Top-level default base directory for screenshots across projects.</div>
             </li>
             <li>
               <b>defaultProject</b> <span class="badge">Used by: all tools (project selection)</span>
               <div class="hint small">Fallback active project when not set via environment.</div>
             </li>
           </ul>
           <div class="hint small" style="margin-top:8px">
             Embedding provider keys (<code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code>) are set in the Environment tab, not in this JSON.
           </div>
           <div class="hint small" style="margin-top:8px">
             Tip: Set <code>defaultProject</code> to the project you work with most. You can keep multiple projects side‑by‑side here.
           </div>
        </div>
        <div class="right" id="config-editor-pane">
          <p style="margin-top:0">Edit your per-project configuration below. And then close the ui using the close button in header and don't directly close the tab.</p>
          <textarea id="projects" spellcheck="false" class="config-textarea" style="height: calc(100% - 96px)"></textarea>
              <div class="actions">
            <button id="btn-save-config" onclick="saveConfig()">Save</button>
            <button class="secondary" onclick="loadConfig()">Reload</button>
            <button onclick="finish()">Finish & Close</button>
          </div>
          <div id="status" class="hint"></div>
          <div class="hint">Path: projects.json (project root)</div>
          <div class="hint" style="margin-top:12px">
            Run this UI directly with <code>pnpm run setup:ui</code> or implicitly via <code>pnpm run setup</code> (which also builds and starts the server).
          </div>
        </div>
      </div>
    </section>
    <section id="section-env" class="section" style="display:none">
      <div class="split">
        <div class="left" id="env-guide">
          <h3 style="margin:4px 0 8px 0">Environment (.env)</h3>
          <div class="hint" style="margin-top:8px">
            Embedding provider API keys configured here are used to build and query the semantic index that powers <code>api.searchEndpoints</code> and other API documentation search features. Set one:
            <ul>
              <li><b>OPENAI_API_KEY</b> (+ optional <code>OPENAI_EMBED_MODEL</code>)</li>
              <li><b>GEMINI_API_KEY</b> (+ optional <code>GEMINI_EMBED_MODEL</code>)</li>
            </ul>
            If you change provider/model, reindex from the Embeddings tab.
          </div>
          <div class="hint" style="margin-top:8px">Common keys:
            <ul>
              <li><b>OPENAI_API_KEY</b> or <b>GEMINI_API_KEY</b> (embedding provider)</li>
              <li><b>LOG_LEVEL</b>: error | warn | info | debug</li>
            </ul>
          </div>
        </div>
        <div class="right" id="env-editor-pane">
          <textarea id="envText" spellcheck="false" style="height: calc(100% - 96px); margin-top:0; background:#0b1220; color:#e6edf3; border:1px solid var(--border); border-radius:8px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px;"></textarea>
          <div class="actions">
            <button onclick="saveEnv()">Save .env</button>
            <button class="secondary" onclick="reloadEnv()">Reload .env</button>
          </div>
          <div id="envStatus" class="hint"></div>
          <div class="hint small">Path: <span id="envPathHint">.env</span></div>
        </div>
      </div>
    </section>
    <section id="section-examples" class="section" style="display:none">
      <div class="split">
        <div class="left">
          <h3 style="margin:4px 0 8px 0">Reference Examples</h3>
          <div class="hint">Use these as a guide when editing your config in the Configure/Environment tabs.</div>
        </div>
        <div class="right">
          <h4 style="margin-top:0">projects.json example (two projects)</h4>
          <pre id="example-projects-json" style="white-space: pre; user-select:text;">
{
  "projects": {
    "my-frontend": {
      "config": {
        "SWAGGER_URL": "https://api.example.com/openapi.json",
        "API_BASE_URL": "https://api.example.com",
        "AUTH_STORAGE_TYPE": "localStorage",
        "AUTH_TOKEN_KEY": "access_token",
        "AUTH_ORIGIN": "http://localhost:5173",
        "API_AUTH_TOKEN_TTL_SECONDS": 3300
      }
    },
    "another-frontend": {
      "config": {
        "SWAGGER_URL": "https://staging.example.com/openapi.json",
        "API_BASE_URL": "https://staging.example.com",
        "AUTH_STORAGE_TYPE": "cookies",
        "AUTH_TOKEN_KEY": "auth_token",
        "AUTH_ORIGIN": "https://staging.example.com",
        "API_AUTH_TOKEN_TTL_SECONDS": 1800
      }
    }
  },
  "defaultProject": "my-frontend",
  "DEFAULT_SCREENSHOT_STORAGE_PATH": "/absolute/path/to/screenshots/root"
}
          </pre>
          <div class="actions"><button onclick="copyFromElement('example-projects-json')">Copy projects.json example</button></div>

          <h4>.env example</h4>
          <pre id="example-env" style="white-space: pre; user-select:text;">
# Embedding provider keys (choose one)
OPENAI_API_KEY=
# OPENAI_EMBED_MODEL=text-embedding-3-large
# or
GEMINI_API_KEY=
# GEMINI_EMBED_MODEL=text-embedding-004

# Optional logging
LOG_LEVEL=info
          </pre>
          <div class="actions"><button onclick="copyFromElement('example-env')">Copy .env example</button></div>
        </div>
      </div>
    </section>

    <section id="section-embed" class="section" style="display:none">
      <div class="split">
        <div class="left" id="embed-guide">
          <h3 style="margin:4px 0 8px 0">Embeddings</h3>
          <div class="hint small">Status and reindex are per project. The server must be running.</div>
        </div>
        <div class="right">
          <div id="embed-projects-list-ui"></div>
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
    "Content-Length": body.length,
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
  ensureAfbtDir();
  let existingPid = null;
  if (fs.existsSync(pidPath)) {
    try {
      existingPid = parseInt(fs.readFileSync(pidPath, "utf8"), 10);
    } catch {}
  }
  if (existingPid && isRunning(existingPid)) {
    return false; // already running
  }
  try {
    if (existingPid && !isRunning(existingPid)) fs.unlinkSync(pidPath);
  } catch {}
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
    try {
      fs.unlinkSync(pidPath);
    } catch {}
    return false;
  }
  try {
    process.kill(pid);
  } catch {}
  try {
    fs.unlinkSync(pidPath);
  } catch {}
  return true;
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
  let pid = null;
  if (fs.existsSync(pidPath)) {
    try {
      pid = parseInt(fs.readFileSync(pidPath, "utf8"), 10);
    } catch {}
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
  if (fs.existsSync(path.join(repoRoot, "docs")))
    walk(path.join(repoRoot, "docs"));
  // Also include packaged docs as absolute paths (namespaced under pkg/ for clarity)
  if (fs.existsSync(embeddedReadme))
    out.push(path.relative(repoRoot, embeddedReadme));
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
