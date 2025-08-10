# Embedding-based API Search: Implementation Plan

## Objective
Add semantic, embedding-powered API endpoint retrieval that complements the current keyword/regex search. Keep compatibility and UX simple while enabling manual re-indexing from the Chrome extension Dev Panel.

---

## Scope
- Server: `browser-tools-mcp/mcp-server.ts`
- Extension UI: Dev Panel (new accordion for Projects + Re-index)
- Config: `chrome-extension/projects.json`, env keys

---

## High-level Design
- Semantic-only retrieval: use embeddings to recall top-K endpoints; apply only strict filters (method, tag) after recall. No keyword/hybrid re-ranking.
- Index per project (projectName from `projects.json`). Detect changes only when you manually trigger re-index from the Dev Panel.
- Index content: only 3 fields per operation: path, summary, tags (as requested).
- Do not index request/response details. Fetch them lazily for matched endpoints.

---

## Embedding Strings (Co-sensible)
- Endpoint string (per operation):
  - Format:
    - `"METHOD /path"`
    - `"Tags: tag1, tag2."`
    - `"Summary: <summary>."`
    - If present: `"OperationId: <operationId>."`
  - Example:
    - `POST /bandar-admin/create-activity-addon.`
    - `Tags: Activity Addons.`
    - `Summary: Create activity addon.`

- Query string (built from tool params):
  - Text only: `"Query: create activity addon."`
  - With method: `"Query: create activity addon. Method: POST."`
  - With tag: `"Query: create activity addon. Tag: Activity Addons."`
  - Optional synonym expansion to improve recall (create↔add/new, list↔get/fetch/all, update↔edit/modify, delete↔remove).

- Normalization: trim, consistent punctuation, keep slash paths intact. Case kept natural; models handle it.

---

## Storage & Infra
- Embedding provider: Gemini `embedding-001` via `@google/generative-ai` (env: `GEMINI_API_KEY`).
- Vector store: Vectra (in-memory), cosine similarity. Keyed by `{projectName, swaggerHash}`.
- Caching: In-memory index with metadata; optional JSON dump for warm start (future enhancement).

---

## Server Changes (MCP)
1) Utilities
- `toEndpointEmbeddingString(op)`: build the endpoint string from path, method, tags, summary, operationId.
- `toQueryEmbeddingString(params)`: build the query string; optional synonym expansion.
   (No keyword/legacy code paths.)

2) Re-index entrypoint (no new MCP tool)
- Implement HTTP endpoints in `browser-tools-server/` to manage indexing:
  - `POST /api/embed/reindex?project=<name>`: builds/rebuilds the embedding index for that project (manual trigger only).
  - `GET /api/embed/status?project=<name>`: returns status (indexed, vectorCount, lastBuiltAt, swaggerHash).
  - `POST /api/embed/search`: accepts `{ projectName, query?: string, tag?: string, method?: string, limit: number }`, returns top results using semantic-only retrieval and strict filters.

3) Search flow (keep existing MCP tool)
- Continue using `server.tool("searchApiDocumentation")` in `browser-tools-mcp/mcp-server.ts`.
- Update its parameters to: `{ query?: string, tag?: string, method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", limit: number }`.
- Validation: exactly one of `query` or `tag` is required; `limit` is required; `method` optional.
- Behavior: always call `browser-tools-server` `/api/embed/search` and hydrate full endpoint details from Swagger for the final results.

2) New tools
- `buildApiEmbeddingIndex` (MCP tool)
  - Params: `{ projectName?: string, forceRebuild?: boolean }` (defaults to active project if omitted)
  - Returns status + counts; clear error if `SWAGGER_URL` missing.

- `semanticSearchApiDocumentation` (MCP tool)
  - Params: `{ query?: string, tag?: string, method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", limit?: number }` (exactly one of `query|tag`)
  - Build query string, embed via Gemini.
  - Vectra top-K (e.g., K=50) for the project’s current index.
  - Re-rank/filter: method hard filter; small keyword boosts on path/summary/tags; then top `limit`.
  - For each result, lazily hydrate full details via existing helpers (`createSimplifiedEndpoint`) from Swagger.
  - Output identical structure to `searchApiDocumentation` for drop-in use.

3) Optional augmentation to existing tool
- Add `mode?: "semantic"|"keyword"|"hybrid"` to `searchApiDocumentation`.
- Default `hybrid` (embedding recall + keyword re-rank). Fallback to keyword-only if embeddings disabled/unavailable.

4) Config & Flags
- No enable/disable toggle. Semantic search is always on.
- `EMBEDDING_PROVIDER=gemini`
- `GEMINI_API_KEY` (required)

---

## Chrome Extension Dev Panel (UX)
- New Accordion: "API Embedding Index"
  - Expand to list projects from `chrome-extension/projects.json`:
    - For each project:
      - Project name, status badge (Indexed/Not Indexed), last built time, vector count, swagger hash prefix.
      - Button: "Re-index" (manual only)
        - Calls `POST /api/embed/reindex?project=<name>`.
  - Optional: "Re-index All Projects" button.

- Wiring options:
  - Option A (proxy): Add a small HTTP endpoint to `browser-tools-server` that invokes the MCP tool (simple REST bridge).
  - Option B (direct): Extension calls the MCP tool directly if the extension already has an MCP client path.
  - Pick A if you want minimal client changes (re-uses existing server discovery in the extension).

---

## Ranking & Scoring
- Cosine similarity from Vectra (semantic-only).
- Apply strict filters after recall:
  - If `method` provided, filter to method match.
  - If `tag` provided (and used as the required input), also ensure the operation includes that tag.
- Tie-break: prefer fewer path params (shorter, more specific paths).

---

## Rebuild Heuristics
- Re-indexing occurs only when triggered manually from the Chrome Extension Dev Panel.
- No background/periodic checks, no startup hashing, and no automatic rebuilds.
- The MCP will cache the current index in memory until a manual re-index event is received.
- Expose current status (lastBuiltAt, vectorCount, swaggerHash) for display only; do not act on it automatically.

---

## Error Handling
- Clear errors when `SWAGGER_URL` is missing or unreachable.
- Rate-limit/backoff on Gemini API; batch size ≈ 64 vectors.
- If embeddings unavailable, auto-fallback to keyword mode with a notice in the tool result.

---

## Security
- Do not log secrets. Use `GEMINI_API_KEY` from env.
- Do not persist embeddings with sensitive data; only path/summary/tags are stored.

---

## Testing
- Indexing: confirm vector count ≈ operations count.
- Queries: golden tests ("create activity addon", "list activities", "delete addon"), verify expected endpoints in top-3.
- Performance: build time on typical spec (<2s/100 ops after warm cache), query latency (<100ms with cached model client).
- UI: manual re-index triggers and status update.

---

## Deliverables
1) Vectra-backed in-memory index keyed by project and swagger hash.
2) HTTP endpoints in `browser-tools-server`: `/api/embed/reindex`, `/api/embed/status`, `/api/embed/search`.
3) Update existing MCP tool `searchApiDocumentation` to semantic-only parameters and flow.
4) Extension Dev Panel accordion with per-project re-index (no enable toggle).
5) Remove legacy keyword/hybrid code and deprecated params; remove temporary hash timing script.
6) Docs: update `searchApiDocumentation` tool docs to reflect new params; add a short page on re-index flow.

---

## Milestones
- M1: Server scaffolding (embedding utils with Gemini `embedding-001`, Vectra, index cache)
- M2: HTTP endpoints for re-index/status/search; manual-only re-index path
- M3: Update MCP `searchApiDocumentation` to semantic-only (params: query|tag, limit required, method optional) and hydrate results
- M4: Dev Panel UI (accordion + Re-index buttons)
- M5: Remove legacy code and temporary hash script; docs, tests, polish

---

## Notes on Minimal Indexing
- We only embed path, summary, tags. No request/response indexing.
- On selection (post-search), we hydrate the chosen endpoints’ requestBody, parameters, and successResponse from Swagger using existing helpers. This keeps the index small and focused while returning full details when needed.
