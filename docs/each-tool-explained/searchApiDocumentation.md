# Tool: searchApiDocumentation

## What does this tool do?

`searchApiDocumentation` is a **simplified API documentation search tool** designed for efficient API integration workflows. It returns only essential information needed for API calls: paths, parameters (GET), request payloads (POST/PUT/PATCH/DELETE), and success responses. When response schemas are missing from documentation, it provides clear guidance to use `fetchLiveApiResponse` for live testing.

---

## Key Features

- **Essential Information Only**: Returns API path, method, and relevant parameters/payloads
- **Method-Specific Handling**: Different response formats for GET (parameters) vs POST/PUT/PATCH/DELETE (request body)
- **Nested Schema Support**: Properly flattens complex nested objects up to 3 levels deep
- **Smart Response Handling**: Extracts both formal schemas and example responses when available
- **Live Testing Guidance**: Automatically recommends `fetchLiveApiResponse` when response data is missing
- **Clean, Focused Output**: No redundant groupings or unnecessary metadata

---

## Parameters

| Name   | Type   | Required | Description |
| ------ | ------ | -------- | ----------- |
| query  | string |          | Text to match against path, summary, description, operationId, and tags |
| tag    | string |          | Case-insensitive exact tag match (provide either query or tag, not both) |
| method | string |          | HTTP method filter (GET, POST, PUT, PATCH, DELETE) |
| limit  | number |          | Maximum number of endpoints to return (default: 10) |

Deprecated parameters (still supported for backward compatibility):
- searchTerms: string[] — treated as an OR text search across terms (use query instead)
- maxResults: number — use limit instead

---

## Output Structure

### Summary Section

```json
{
  "summary": {
    "totalFound": 5,
    "filter": { "type": "query", "value": "entity" },
    "methodFilter": "all",
    "endpointsNeedingLiveTest": 2
  }
}
```

### Endpoint Structure by Method

#### GET Endpoints

```json
{
  "path": "/demo-admin/get-entity-list",
  "method": "GET",
  "summary": "Get entity list",
  "tags": ["Admin entity Management"],
  "parameters": [
    {
      "name": "page",
      "in": "query",
      "required": false,
      "type": "integer",
      "default": 1,
      "description": "Page number for pagination"
    }
  ],
  "successResponse": {
    "statusCode": "200",
    "description": "entity list retrieved successfully",
    "schema": {
      /* flattened response schema */
    }
  }
}
```

#### POST/PUT/PATCH Endpoints

```json
{
  "path": "/demo-admin/create-entity-addon",
  "method": "POST",
  "summary": "Create entity addon",
  "tags": ["entity Addons"],
  "requestBody": {
    "type": "object",
    "required": ["entityId", "name"],
    "properties": {
      "entityId": { "type": "string" },
      "name": { "type": "string" },
      "pricing": { "type": "number" },
      "pricingBasis": {
        "type": "string",
        "enum": ["PER_PERSON", "PER_SLOT"]
      }
    }
  },
  "successResponse": {
    "statusCode": "201",
    "description": "Addon created successfully"
  }
}
```

#### DELETE Endpoints

```json
{
  "path": "/demo-admin/delete-entity-addon/{id}",
  "method": "DELETE",
  "summary": "Delete entity addon",
  "pathParameters": [
    {
      "name": "id",
      "in": "path",
      "required": true,
      "type": "string",
      "description": "ID of the addon to delete"
    }
  ]
}
```

### When Response Schema is Missing

```json
{
  "path": "/demo-admin/some-endpoint",
  "method": "POST",
  "summary": "Some operation",
  "requestBody": {
    /* request schema */
  },
  "recommendedAction": {
    "tool": "fetchLiveApiResponse",
    "reason": "No response schema found in documentation. Use this tool to make a live API call and understand the actual response structure.",
    "suggestion": "fetchLiveApiResponse(endpoint: '/demo-admin/some-endpoint', method: 'POST', requestBody: <your_payload>)"
  }
}
```

### When Only Examples are Available (No Schema)

```json
{
  "path": "/demo-admin/hash-tag/get-all-hash-tag",
  "method": "POST",
  "summary": "Fetch all hash tags with pagination and optional name filter",
  "requestBody": {
    /* request schema */
  },
  "successResponse": {
    "statusCode": "200",
    "description": "Hash tags fetched successfully",
    "exampleResponse": {
      "rows": [
        {
          "id": 1,
          "name": "exampleHashTag",
          "createdAt": "2023-01-01"
        }
      ],
      "count": 1
    },
    "note": "Response structure inferred from example (no formal schema provided)"
  }
}
```

---

## Nested Schema Handling

The tool automatically flattens complex nested objects for better readability:

### Input Schema (Complex)

```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "profile": {
          "type": "object",
          "properties": {
            "details": {
              "type": "object",
              "properties": {
                "name": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

### Flattened Output (Readable)

```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "profile": {
          "type": "object",
          "properties": {
            "details": {
              "type": "object"
            }
          }
        }
      }
    }
  }
}
```

---

## Integration with fetchLiveApiResponse

### Workflow Pattern

1. **Search for APIs**: Use `searchApiDocumentation` to find relevant endpoints
2. **Check Response Schema**: Look for `successResponse` or `recommendedAction`
3. **Live Testing**: For endpoints with `recommendedAction`, use `fetchLiveApiResponse`
4. **Implementation**: Use the combined information to build your application

### Example Workflow

```javascript
// 1. Search for entity-related APIs
searchApiDocumentation(query: "entity", method: "POST")

// 2. Found endpoint with missing response schema
// Path: /demo-admin/create-entity-addon
// Has requestBody but recommendedAction suggests live testing

// 3. Test live API to understand response
fetchLiveApiResponse(
  endpoint: "/demo-admin/create-entity-addon",
  method: "POST",
  requestBody: {
    "entityId": "test-id",
    "name": "Test Addon",
    "pricing": 100,
    "pricingBasis": "PER_PERSON"
  }
)

// 4. Now you have both request and response structures for implementation
```

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

### Backward Compatibility (deprecated params)

```json
{
  "searchTerms": ["admin", "management"],
  "method": "POST",
  "maxResults": 10
}
```

---

## Error Handling

- **No Results**: Returns empty endpoints array with helpful message
- **Invalid Method**: Tool validates method parameter
- **Missing Swagger**: Clear error if SWAGGER_URL not configured
- **Schema Issues**: Gracefully handles malformed schemas

---

## Tool Synergy

This tool is designed to work seamlessly with:

- **`fetchLiveApiResponse`**: For testing endpoints and getting real response structures
- **`inspectBrowserNetworkActivity`**: For analyzing actual API calls in browser
- **Code generation tools**: Provides clean, structured data for TypeScript interface generation

---

## Summary

The simplified `searchApiDocumentation` tool focuses on **essential API information** needed for development:

✅ **What you get**: API paths, parameters, request payloads, success responses  
✅ **What you don't get**: Verbose schemas, complex inheritance, excessive metadata  
✅ **When schemas are missing**: Clear guidance to use `fetchLiveApiResponse`  
✅ **Nested fields**: Properly handled and flattened for readability  
✅ **Integration ready**: Structured output perfect for code generation and API testing
