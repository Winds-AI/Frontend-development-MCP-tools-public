import path from "path";
import fs from "fs";
import crypto from "crypto";
import fetch from "node-fetch";
import { LocalIndex } from "vectra";
import { loadProjectConfig, getActiveProjectName } from "./shared.js";
async function getProjectSwagger(project) {
    const proj = getProjectName(project);
    if (swaggerCache.has(proj))
        return swaggerCache.get(proj);
    const projectsConfig = loadProjectConfig();
    if (!projectsConfig)
        throw new Error("projects.json not found");
    const active = proj || projectsConfig.defaultProject;
    const cfg = projectsConfig.projects[active]?.config;
    if (!cfg?.SWAGGER_URL)
        throw new Error(`SWAGGER_URL not set for project '${active}'`);
    const resp = await fetch(cfg.SWAGGER_URL);
    if (!resp.ok)
        throw new Error(`Failed to fetch Swagger: ${resp.status}`);
    const swagger = await resp.json();
    swaggerCache.set(proj, swagger);
    return swagger;
}
function resolveSchemaType(schema) {
    if (!schema)
        return undefined;
    if (schema.type)
        return schema.type;
    if (schema.$ref)
        return String(schema.$ref);
    if (schema.oneOf?.length)
        return `oneOf:${schema.oneOf.length}`;
    if (schema.anyOf?.length)
        return `anyOf:${schema.anyOf.length}`;
    if (schema.allOf?.length)
        return `allOf:${schema.allOf.length}`;
    return undefined;
}
function hydrateOperationTypes(swagger, method, apiPath) {
    const p = swagger.paths?.[apiPath];
    const op = p?.[method.toLowerCase()];
    if (!op)
        return { request: {}, response: {} };
    // Request body
    let request = {};
    const rb = op.requestBody?.content;
    if (rb && typeof rb === "object") {
        const ct = rb["application/json"] ? "application/json" : Object.keys(rb)[0];
        if (ct) {
            request.contentType = ct;
            request.schemaType = resolveSchemaType(rb[ct]?.schema);
        }
    }
    // Response (prefer 200, else first)
    let response = {};
    const resps = op.responses || {};
    const preferred = resps["200"] ? "200" : Object.keys(resps)[0];
    if (preferred) {
        response.status = preferred;
        const content = resps[preferred]?.content;
        if (content && typeof content === "object") {
            const ct = content["application/json"] ? "application/json" : Object.keys(content)[0];
            if (ct) {
                response.contentType = ct;
                response.schemaType = resolveSchemaType(content[ct]?.schema);
            }
        }
    }
    return { request, response };
}
function resolveEmbeddingProvider() {
    const env = (process.env.EMBEDDING_PROVIDER || "").toLowerCase();
    if (env === "openai")
        return "openai";
    if (env === "gemini")
        return "gemini";
    if (process.env.OPENAI_API_KEY)
        return "openai"; // auto if key present
    return "gemini";
}
function getProviderModel() {
    const provider = resolveEmbeddingProvider();
    if (provider === "openai")
        return process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small"; // 1536 dims
    return process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"; // 768 dims
}
function getProviderDims() {
    const provider = resolveEmbeddingProvider();
    if (provider === "openai") {
        const m = getProviderModel();
        if (/text-embedding-3-large/i.test(m))
            return 3072;
        // default and 3-small
        return 1536;
    }
    return 768;
}
const MODEL_ID = getProviderModel();
const DEFAULT_DIMS = getProviderDims();
const DEFAULT_LIMIT = 10;
const TOPK = 25; // pre-filter pool
function l2Normalize(vec) {
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (!isFinite(norm) || norm === 0)
        return vec;
    return vec.map((v) => v / norm);
}
function ensureDir(dir) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
function getProjectName(explicit) {
    return explicit || getActiveProjectName() || "default";
}
function getIndexRoot(project) {
    const proj = getProjectName(project);
    const root = path.resolve(process.cwd(), ".vectra", proj);
    ensureDir(root);
    return path.join(root, "index");
}
function getMetaPath(project) {
    const proj = getProjectName(project);
    const root = path.resolve(process.cwd(), ".vectra", proj);
    ensureDir(root);
    return path.join(root, "metadata.json");
}
function computeHashForSwagger(swagger) {
    const json = JSON.stringify(swagger);
    return crypto.createHash("sha256").update(json).digest("hex");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function embedBatch(texts, dims = DEFAULT_DIMS, taskType = "SEMANTIC_SIMILARITY") {
    const provider = resolveEmbeddingProvider();
    const model = getProviderModel();
    console.log(`[embed] provider=${provider} model=${model} batch=${texts.length}`);
    let url = "";
    let headers = { "Content-Type": "application/json" };
    let body = "";
    if (provider === "openai") {
        const oaiKey = process.env.OPENAI_API_KEY;
        if (!oaiKey)
            throw new Error("OPENAI_API_KEY is not set");
        url = "https://api.openai.com/v1/embeddings";
        headers = { ...headers, Authorization: `Bearer ${oaiKey}` };
        body = JSON.stringify({ model, input: texts });
    }
    else {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey)
            throw new Error("GEMINI_API_KEY is not set");
        // Use batchEmbedContents with proper schema per API reference
        const requests = texts.map((t) => ({
            model: `models/${model}`,
            content: { parts: [{ text: t }] },
            taskType,
            outputDimensionality: dims,
        }));
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
        headers = { ...headers, "x-goog-api-key": apiKey };
        body = JSON.stringify({ requests });
    }
    let resp = null;
    let lastErrText = "";
    for (let attempt = 0; attempt < 6; attempt++) {
        resp = await fetch(url, { method: "POST", headers, body });
        if (resp.ok)
            break;
        const status = resp.status;
        const text = await resp.text();
        lastErrText = text;
        if (status === 429 || status === 503) {
            const retryAfter = resp.headers?.get?.("retry-after");
            let delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(16000, 500 * Math.pow(2, attempt));
            delay += Math.floor(Math.random() * 250);
            console.warn(`[embed] rate limited status=${status} attempt=${attempt + 1} delayMs=${delay}`);
            await sleep(isFinite(delay) && delay > 0 ? delay : 1000);
            continue;
        }
        const label = provider === "openai" ? "OpenAI" : "Gemini";
        throw new Error(`${label} embed error: ${status} ${text}`);
    }
    if (!resp || !resp.ok) {
        const label = resolveEmbeddingProvider() === "openai" ? "OpenAI" : "Gemini";
        throw new Error(`${label} embed error: ${resp?.status ?? "unknown"} ${lastErrText}`);
    }
    const json = await resp.json();
    let vectors = [];
    if (provider === "openai") {
        const arr = Array.isArray(json?.data) ? json.data : [];
        vectors = arr.map((d) => d.embedding);
    }
    else {
        const data = json;
        vectors = (data.embeddings || []).map((e) => e.values);
    }
    console.log(`[embed] success batch=${texts.length}`);
    return vectors.map(l2Normalize);
}
function buildEndpointString({ method, path: apiPath, summary, tags, operationId }) {
    const m = (method || "").toUpperCase();
    const tagStr = Array.isArray(tags) ? tags.join(", ") : "";
    const parts = [
        `${m} ${apiPath}`.trim(),
        summary ? `— ${summary}` : "",
        tagStr ? `— tags: ${tagStr}` : "",
        operationId ? `— opId: ${operationId}` : "",
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ");
}
function buildQueryString({ query, tag, method }) {
    const hints = [];
    if (method)
        hints.push(`method: ${(method || "").toUpperCase()}`);
    if (tag)
        hints.push(`tag: ${tag}`);
    const base = (query || "").trim();
    return [hints.join(" "), base].filter(Boolean).join(" — ");
}
const indexCache = new Map();
const swaggerCache = new Map();
async function getOrCreateIndex(project) {
    const proj = getProjectName(project);
    if (indexCache.has(proj))
        return indexCache.get(proj);
    const indexPath = getIndexRoot(proj);
    const idx = new LocalIndex(indexPath);
    if (!(await idx.isIndexCreated())) {
        await idx.createIndex();
    }
    indexCache.set(proj, idx);
    return idx;
}
function writeMeta(meta) {
    fs.writeFileSync(getMetaPath(meta.project), JSON.stringify(meta, null, 2), "utf8");
}
function readMeta(project) {
    const p = getMetaPath(project);
    if (!fs.existsSync(p))
        return null;
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
export async function getStatus(project) {
    const meta = readMeta(project);
    return { exists: !!meta, meta };
}
export async function rebuildIndex(project) {
    const proj = getProjectName(project);
    const projectsConfig = loadProjectConfig();
    if (!projectsConfig)
        throw new Error("projects.json not found");
    const active = proj || projectsConfig.defaultProject;
    const cfg = projectsConfig.projects[active]?.config;
    if (!cfg?.SWAGGER_URL)
        throw new Error(`SWAGGER_URL not set for project '${active}'`);
    const swaggerResp = await fetch(cfg.SWAGGER_URL);
    if (!swaggerResp.ok)
        throw new Error(`Failed to fetch Swagger: ${swaggerResp.status}`);
    const swagger = await swaggerResp.json();
    const swaggerHash = computeHashForSwagger(swagger);
    const items = [];
    const paths = swagger.paths || {};
    const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
    for (const p of Object.keys(paths)) {
        const obj = paths[p] || {};
        for (const m of METHODS) {
            if (obj[m]) {
                const op = obj[m];
                items.push({
                    method: m,
                    path: p,
                    summary: op.summary || op.description || "",
                    tags: op.tags || [],
                    operationId: op.operationId || undefined,
                });
            }
        }
    }
    const docs = items.map((it) => buildEndpointString(it));
    console.log(`[index] Rebuild start project=${proj} items=${items.length} provider=${resolveEmbeddingProvider()} model=${getProviderModel()} dims=${getProviderDims()}`);
    const BATCH = 16;
    const vectors = [];
    for (let i = 0; i < docs.length; i += BATCH) {
        const chunk = docs.slice(i, i + BATCH);
        console.log(`[index] Embedding batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(docs.length / BATCH)} size=${chunk.length}`);
        const vecs = await embedBatch(chunk, getProviderDims(), "RETRIEVAL_DOCUMENT");
        vectors.push(...vecs);
        // small inter-batch delay to avoid rate limiting
        await sleep(200);
    }
    console.log(`[index] Inserted vectors: ${vectors.length}`);
    // Recreate index folder
    const indexFolder = getIndexRoot(proj);
    if (fs.existsSync(indexFolder)) {
        fs.rmSync(indexFolder, { recursive: true, force: true });
    }
    const freshIdx = new LocalIndex(indexFolder);
    await freshIdx.createIndex();
    indexCache.set(proj, freshIdx);
    for (let i = 0; i < vectors.length; i++) {
        const it = items[i];
        const vector = vectors[i];
        const md = {
            method: it.method.toUpperCase(),
            path: it.path,
        };
        if (it.summary)
            md.summary = it.summary;
        if (it.tags && it.tags.length)
            md.tags = it.tags.join(", ");
        if (it.operationId)
            md.operationId = it.operationId;
        await freshIdx.insertItem({
            vector,
            metadata: md,
        });
    }
    const meta = {
        project: proj,
        builtAt: new Date().toISOString(),
        model: getProviderModel(),
        dims: getProviderDims(),
        vectorCount: vectors.length,
        swaggerHash,
    };
    writeMeta(meta);
    console.log(`[index] Rebuild complete project=${proj} model=${meta.model} dims=${meta.dims} vectors=${meta.vectorCount}`);
    return meta;
}
export async function searchSemantic(params) {
    const project = getProjectName(); // Use ACTIVE_PROJECT
    const status = await getStatus(project);
    if (!status.exists) {
        throw new Error("Semantic index not built. Open Dev Panel and re-index.");
    }
    const meta = status.meta;
    const needDims = getProviderDims();
    const needModel = getProviderModel();
    if (meta.dims !== needDims || meta.model !== needModel) {
        console.warn(`[search] Index settings mismatch: have model=${meta.model} dims=${meta.dims}, need model=${needModel} dims=${needDims}`);
        throw new Error("Semantic index was built with different embedding settings. Please open the Dev Panel and Reindex for the current provider/model.");
    }
    const idx = await getOrCreateIndex(project);
    const swagger = await getProjectSwagger(project);
    const qStr = buildQueryString({ query: params.query, tag: params.tag, method: params.method });
    console.log(`[search] Embedding query provider=${resolveEmbeddingProvider()} model=${getProviderModel()}`);
    const [qVec] = await embedBatch([qStr], getProviderDims(), "RETRIEVAL_QUERY");
    const pool = await idx.queryItems(qVec, "", TOPK);
    const method = params.method ? params.method.toUpperCase() : undefined;
    const tag = params.tag;
    const methodTagMatch = (md) => {
        const methodOk = method ? md.method === method : true;
        let tagOk = true;
        if (tag) {
            if (Array.isArray(md.tags)) {
                tagOk = md.tags.includes(tag);
            }
            else if (typeof md.tags === "string") {
                const parts = md.tags.split(",").map((s) => s.trim()).filter(Boolean);
                tagOk = parts.includes(tag);
            }
            else {
                tagOk = false;
            }
        }
        return methodOk && tagOk;
    };
    const filtered = pool.filter((r) => methodTagMatch(r.item.metadata));
    // Backfill if needed
    const needed = (params.limit ?? DEFAULT_LIMIT) - filtered.length;
    let candidates = filtered;
    if (needed > 0) {
        const extras = pool.filter((r) => !filtered.find((f) => f.item.metadata.path === r.item.metadata.path && f.item.metadata.method === r.item.metadata.method));
        candidates = [...filtered, ...extras.slice(0, needed)];
    }
    const top = candidates.slice(0, params.limit ?? DEFAULT_LIMIT);
    // Hydrate request/response minimal types from Swagger
    const results = top.map((r) => {
        const md = r.item.metadata || {};
        const { request, response } = hydrateOperationTypes(swagger, md.method, md.path);
        return {
            method: md.method,
            path: md.path,
            request,
            response,
        };
    });
    return results;
}
