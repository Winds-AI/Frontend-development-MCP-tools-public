**Note:** Keep Chrome DevTools (F12) open on your target tab when using browser/UI tools.

### Local development by cloning the actual repo

```bash
pnpm run setup
```

- Uses repo's `chrome-extension/` as-is (no copy).
- Opens the same Setup UI (Examples, Configure, Environment, Embeddings).

## 📁 Configuration

- `projects.json` (single source of truth): stored at project root.
  - Required fields per project (examples shown in UI Examples tab):
    - `SWAGGER_URL`, `API_BASE_URL`, `AUTH_STORAGE_TYPE`, `AUTH_TOKEN_KEY`, optional `AUTH_ORIGIN`, optional `API_AUTH_TOKEN_TTL_SECONDS`, optional `ROUTES_FILE_PATH`.
  - Optional global: `DEFAULT_SCREENSHOT_STORAGE_PATH`.
- `.env`: stored at `browser-tools-server/.env`.
  - Embedding provider keys: `OPENAI_API_KEY` (and optional `OPENAI_EMBED_MODEL`) or `GEMINI_API_KEY` (and optional `GEMINI_EMBED_MODEL`).
  - Optional logging: `LOG_LEVEL=info`.

## 🔎 Embeddings

- Use Setup UI → Embeddings tab:
  - `GET /api/embed/status?project=<name>` for status
  - `POST /api/embed/reindex` with `{ project }` to rebuild
- Index is stored per-project in `.vectra/<project>`.

## 🔧 Health & Troubleshooting

- Identity: `GET /.identity` returns signature and version
- Health: `GET /connection-health` shows heartbeat and connection details
- If tools don't respond, verify:
  - Server is running and extension is loaded (DevTools open on the tab)
  - Extension reloaded after npx updates

## 🧪 Notes

- `projects.json` must exist at project root for server/tools to resolve config.
- `.env` is always read/written in `browser-tools-server/.env`.
- npx overlays the packaged extension into `chrome-extension/` (skips `projects.json`, no backups). Local dev `pnpm run setup` skips copying entirely.

### Embedding index model/provider mismatch

If you change the embedding provider or model (e.g., switch between OpenAI and Gemini, or change model IDs), the existing semantic index may not match. Symptoms include an error like “Index settings mismatch” or empty/poor results.

Fix:
- Open the Setup UI → Embeddings tab → Reindex for the active project.
- Ensure the correct embedding API key is present in `browser-tools-server/.env`.

**Happy autonomous frontend development!**
