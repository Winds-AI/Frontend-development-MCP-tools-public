# Tool: api.searchEndpoints

## What does this tool do?

`api.searchEndpoints` performs a semantic search over your API spec (Swagger/OpenAPI) using vector embeddings. It returns the minimal fields required for integration: `method`, `path`, minimal `request`/`response` type hints extracted from Swagger, and `requiresAuth` derived from OpenAPI `security` (operation-level first, then top-level).

---

## Key Features

- **Semantic-only retrieval**: Embedding-based similarity over endpoint strings built from method/path/summary/tags.
- **Minimal output**: Returns only `method`, `path`, and minimal `request`/`response` hints.
- **Simple filters**: Provide either a free-text `query` or a `tag` (exclusive), plus optional `method` and `limit`.
- **Per-project index**: Requires a built semantic index for the current project (manual reindex via Dev Panel).

---

## Parameters

| Name   | Type   | Required | Description                                                      |
| ------ | ------ | -------- | ---------------------------------------------------------------- |
| query  | string |          | Free-text semantic query (provide either query or tag, not both) |
| tag    | string |          | Tag to bias retrieval (exclusive with query)                     |
| method | string |          | HTTP method filter (GET, POST, PUT, PATCH, DELETE)               |
| limit  | number |          | Maximum number of endpoints to return (default: 10)              |

---

## Output Structure (minimal)

```json
[
  {
    "method": "GET",
    "path": "/v1/users",
    "request": { "contentType": "application/json", "schemaType": "object" },
    "response": {
      "status": "200",
      "contentType": "application/json",
      "schemaType": "#/components/schemas/UserList"
    },
    "requiresAuth": true
  }
]
```

---

## Notes on types

We provide minimal hints only. For detailed schemas/examples, use your Swagger source directly or pair with `fetchLiveApiResponse` to observe live responses.

---

## Integration with api.request

Use `api.request` for endpoints where you need exact payload/response shapes beyond minimal hints. When `requiresAuth` is true, call it with `{ includeAuthToken: true }` so the token is appended automatically.

---

## Usage Examples

### Text Query Search

```json
{
  "query": "entity"
}
```

### Tag Search

```json
{
  "tag": "Users"
}
```

### Method + Limit

```json
{
  "query": "profile",
  "method": "GET",
  "limit": 5
}
```

---

## Error Handling

- **Index missing**: If the semantic index isn’t built, the tool returns an error instructing you to reindex via Dev Panel.
- **Invalid method**: Validates method filter.
- **Missing Swagger**: Clear error if SWAGGER_URL not configured.

---

## Backend details (for reference)

- **Embedding provider**: OpenAI (default if `OPENAI_API_KEY` is set) or Gemini; configured via env.
- **Batching**: Embeddings generated in micro-batches (16) with backoff and logging.
- **Index compatibility**: If provider/model/dims change, you must reindex.

---

## Summary

- **Semantic-only** API search over your Swagger.
- **Minimal output** tailored for quick integration: method, path, request/response hints.
- **Provider-aware** backend with batching, backoff, and logs; reindex when changing models.
