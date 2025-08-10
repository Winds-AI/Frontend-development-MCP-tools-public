# Research for New Tools and Improvements

This document outlines the research and brainstorming process for identifying and evaluating new tools and improvements for the Frontend Development Tools MCP Extension.

## To-Do

- [x] Explore tools for interacting with the DOM.
  - **Findings:**
    - jQuery is a powerful but potentially heavy option.
    - Umbrella JS and QueryX are lightweight alternatives.
    - Modern JavaScript has robust native DOM APIs.
  - **Next Steps:**
    - Investigate Umbrella JS in more detail.
    - Evaluate the native DOM APIs for sufficiency.
- [x] Investigate tools for performance profiling.
  - **Findings:**
    - Browser-based tools like Chrome DevTools are powerful but not easily automated.
    - Libraries like Clinic.js and js-profiler offer programmatic control and structured output.
    - Cloud-based solutions like Google Cloud Profiler are also available.
  - **Next Steps:**
    - Investigate Clinic.js to assess its suitability for creating an MCP tool.
- [x] Research tools for accessibility testing.
  - **Findings:**
    - `axe-core` is a prominent open-source library for automated web UI accessibility testing.
    - Playwright also provides accessibility testing features.
  - **Next Steps:**
    - Investigate `axe-core` for its programmatic integration capabilities and suitability for an MCP tool.
- [x] Explore options for more advanced state management inspection.
  - **Findings:**
    - Existing tools (Redux DevTools, MobX-State-Tree) are framework-specific.
    - A generic state inspection tool would require runtime introspection and potentially framework-specific adapters.
  - **Next Steps:**
    - Investigate methods for generic state inspection, possibly starting with global scope and common patterns.
    - Consider building adapters for popular frameworks if a generic approach proves too limited.
- [x] Research tools for local file system access.
  - **Findings:**
    - Direct, unrestricted local file system access from Chrome extensions is limited due to security.
    - The File System Access API offers user-permissioned access for web apps.
    - Leveraging the existing Node.js server is the most practical and secure approach for file system operations.
  - **Next Steps:**
    - Design an API on the Node.js server to expose file system operations that can be called by the Chrome extension or MCP server.
- [x] Investigate the feasibility of a "live coding" tool.
  - **Findings:**
    - "Live coding" in frontend development often refers to online sandboxes, interview scenarios, or hot-reloading in development environments.
    - For an MCP tool, this could involve real-time code injection/execution and interactive code modification in the browser.
  - **Next Steps:**
    - Explore mechanisms for injecting and executing JavaScript code into the browser from the Node.js server or Chrome extension.
    - Consider how to provide feedback to the AI on the visual or functional outcome of injected code.

## Improving `searchApiDocumentation` Tool

- [x] Research indexing and caching strategies for large JSON files in Node.js.
  - **Findings:**
    - In-memory caching is feasible for parsed Swagger documents.
    - Simple in-memory indexing (e.g., using a hash map or array of objects) can significantly speed up lookups.
    - Libraries like `node-cache` or custom implementations can manage cache invalidation and size.
  - **Next Steps:**
    - Implement an in-memory cache for the parsed Swagger document in `mcp-server.ts`.
    - Create a simple index of API endpoints (e.g., by path, summary, tags) to enable faster searching.
- [ ] Research codebase analysis for API details.
- [x] Research interactive API exploration tools.
  - **Findings:**
    - Existing interactive tools like Swagger UI are designed for human users.
    - For an AI, interactive exploration would involve a set of guided discovery tools.
  - **Next Steps:**
    - Propose new MCP tools: `listApiTags`, `listEndpointsByTag`, `getEndpointDetails`.
    - Design the input and output schemas for these new tools.
    - Consider how these tools would interact with the cached Swagger document.

## Semantic API Search Research — OpenAI/Gemini Embeddings + Vectra

This section captures research, options, and implementation details for semantic-only API search using either OpenAI (text-embedding-3-*) or Gemini (gemini-embedding-001) for embedding generation, with Vectra for local vector storage.

### Sources
- __OpenAI Embeddings__: https://platform.openai.com/docs/guides/embeddings
- __Gemini Embeddings__: https://ai.google.dev/gemini-api/docs/embeddings
- __Vectra README__: Stevenic/vectra (LocalIndex usage, persistence)

### Embedding Input Design (co-sensible formatting)
- __[endpoint_string]__
  - Format: `[METHOD] {PATH} — {SUMMARY} — tags: {tag1, tag2} — opId: {operationId}`
  - Normalize: lowercase method/tags; keep path casing; strip multiple spaces; remove newlines.
  - Optional extras: short description first sentence if available, capped to ~200 chars.
- __[query_string]__
  - If `method` provided: prefix `method: {METHOD}`.
  - If `tag` provided: suffix `tag: {tag}`.
  - Otherwise: raw user query.
- __Rationale__: Keeps query and doc representations aligned (co-sensible) and leverages method/tag hints without hard filters.

### Models and Task Types
- __OpenAI__: `text-embedding-3-small` (1536 dims), `text-embedding-3-large` (3072 dims). REST: `POST /v1/embeddings { model, input }` → `data[].embedding`.
- __Gemini__: `gemini-embedding-001` (supports outputDimensionality reduction; use `batchEmbedContents`). REST requires `x-goog-api-key` and `{ requests: [EmbedContentRequest...] }`.
- __Task types (Gemini only)__: `SEMANTIC_SIMILARITY`, `RETRIEVAL_DOCUMENT` (index), `RETRIEVAL_QUERY` (query). We currently pass task types to Gemini; OpenAI has no task type.

### Dimensionality, Normalization, and Storage
- __Dims__: Determined by provider/model. OpenAI small=1536, large=3072. Gemini typically 768/1536/3072 via `outputDimensionality`.
- __Normalization__: We L2-normalize vectors before storage and at query time for consistent cosine similarity across dims.
- __Persistence Layout__ (Vectra):
  - Per-project index folder: `.vectra/{project}/index/`.
  - Store metadata: `{ id, method, path, summary, tags[], opId, swaggerHash, builtAt, dims, model }`.
  - Keep `swaggerHash` and `builtAt` for status UI and staleness checks.

### Batching, Backoff, and Limits
- __Micro-batching__: We chunk endpoint strings into batches of 16 and embed per batch (OpenAI: `input` array; Gemini: `requests[]`).
- __Backoff__: Exponential backoff with jitter for 429/503; respects `Retry-After` where available.
- __Inter-batch delay__: Small sleep (200ms) to smooth request rate; configurable in code.
- __Truncation__: Keep embedding strings concise (method, path, summary, tags) to avoid token overruns.

### Vectra Usage (LocalIndex)
- __Create__: `const index = new LocalIndex(<folder>); if (!(await index.isIndexCreated())) await index.createIndex();`
- __Insert__: `await index.insertItem({ vector, metadata });`
- __Query__: `await index.queryItems(vector, k)` returns `{ score, item }[]` (cosine similarity).
- __Persistence__: File-backed; safe to load on server start; fast in-memory ranking.

### Filtering Strategy (method, tag)
- __Primary__: Always retrieve via similarity, then post-filter by `method`/`tag` in results; if too few remain, fill with next-best regardless of filter.
- __Alternative ideas__:
  - Maintain lightweight in-memory maps `{tag -> ids[]}`, `{method -> ids[]}` to preselect candidate IDs, then re-score only those vectors.
  - Optional per-tag sub-indexes for very large specs (trade-off: write amplification, more management).

### Search Pipeline (implemented)
1. Ensure index present; if missing, return clear message to trigger manual re-index.
2. Build `query_string` from user `query` + optional method/tag hints.
3. Generate query embedding with selected `taskType` and dims.
4. Run Vectra similarity search `topK` (e.g., 25).
5. Post-filter by method/tag; re-rank by score; take `limit`.
6. Hydrate full endpoint details from cached Swagger JSON using stored identifiers.

### Re-indexing Flow (manual only)
- Trigger via Dev Panel -> backend `POST /api/embed/reindex?project=<name>`.
- Backend steps:
  - Fetch Swagger JSON, compute `swaggerHash`.
  - Extract operations -> build `endpoint_string`s.
  - Embed in batches (respect rate limits), normalize if dims != 3072.
  - Create/overwrite Vectra index folder; insert vectors with metadata.
  - Save status: vector count, dims, model, builtAt, swaggerHash.

### Evaluation Ideas
- __Accuracy__: Prepare 30–50 natural queries + expected endpoints; report top-1/top-3 accuracy.
- __A/B__: Compare `SEMANTIC_SIMILARITY` vs `RETRIEVAL_QUERY/DOCUMENT` two-tower; compare dims 768 vs 1536 vs 3072.
- __Latency__: Measure embed (ms/text) and search latency; ensure P95 under target.
- __Ablations__: With vs without method/tag hints in `query_string`.

### Error Handling, Logging, and UX
- __Missing index__: return message “Semantic index not built. Open Dev Panel → Re-index.”
- __Provider switch__: If stored index `model/dims` mismatch current provider/model, we warn and require reindex.
- __Env errors__: Clear setup errors for missing `OPENAI_API_KEY` (OpenAI) or `GEMINI_API_KEY` (Gemini).
- __Logging__: Server logs progress: provider/model, batch numbers/sizes, rate-limit retries, totals, and completion.

### Open Questions / Risks
- Does pre-filtering within Vectra exist natively? If not, local candidate filtering maps are sufficient for our scale.
- Best default dims for large specs (≥10k ops). Start with 768; revisit if quality suffers.
- Swagger drift: Decide whether to warn if `swaggerHash` differs from cached copy (we will only rebuild on manual trigger).

### Code Patterns (concise)
- __Gemini embed (JS)__: `ai.models.embedContent({ model: 'gemini-embedding-001', contents: [text1, text2], taskType, outputDimensionality })` → `response.embeddings[].values`
- __Normalization__: For dims 768/1536, L2-normalize vectors before `insertItem` and when querying.
- __Vectra__: `LocalIndex`, `isIndexCreated()`, `createIndex()`, `insertItem({ vector, metadata })`, `queryItems(vector, k)`.

### Defaults
- Provider: OpenAI (if `OPENAI_API_KEY` present or `EMBEDDING_PROVIDER=openai`), else Gemini (requires `GEMINI_API_KEY`).
- Model: OpenAI `text-embedding-3-small` by default (override with `OPENAI_EMBED_MODEL`), Gemini `gemini-embedding-001` (override with `GEMINI_EMBED_MODEL`).
- Dims: Derived from model (OpenAI small=1536, large=3072; Gemini commonly 768/1536/3072).
- TopK: 25 pre-filter → final `limit`.
- Index path: `.vectra/{project}/index/`.

### Environment Variables
- `EMBEDDING_PROVIDER`: `openai` or `gemini` (optional; auto-resolves to OpenAI if `OPENAI_API_KEY` set, else Gemini).
- `OPENAI_API_KEY`: required for OpenAI provider.
- `OPENAI_EMBED_MODEL`: optional (`text-embedding-3-small` or `text-embedding-3-large`).
- `GEMINI_API_KEY`: required for Gemini provider.
- `GEMINI_EMBED_MODEL`: optional (e.g., `gemini-embedding-001`).
