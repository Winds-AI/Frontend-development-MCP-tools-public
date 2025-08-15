# Tool: api.listTags

## What does this tool do?

`api.listTags` scans the configured Swagger/OpenAPI document and returns a list of all tags with a count of how many operations (endpoints) are associated with each tag.

---

## Parameters

This tool takes no parameters.

---

## Output Structure

```json
{
  "totalTags": 7,
  "tags": [
    { "tag": "Users", "count": 14 },
    { "tag": "Auth", "count": 6 },
    { "tag": "Admin", "count": 3 }
  ]
}
```

- `totalTags`: number of unique tags found
- `tags`: array sorted by `count` desc, each entry has:
  - `tag`: tag name (string)
  - `count`: number of operations under that tag (integer)

---

## Notes

- The tool relies on `SWAGGER_URL` being configured via environment or project config.
- Only HTTP methods are counted; any path-level `parameters` objects are ignored.
- If the API doc has no `paths`, the tool returns an empty `tags` array and `totalTags = 0`.

---

## Example Use Cases

- Quickly understand domain grouping of APIs before deeper exploration.
- Pair with `api.searchEndpoints` using the returned tag:

```json
{
  "tag": "Users"
}
```

---

## Error Handling

- Missing or invalid Swagger source results in an error message string.
- Malformed operations without a `tags` array are safely ignored.
