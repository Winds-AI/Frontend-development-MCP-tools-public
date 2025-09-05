// devtools/payload-processor.js

/**
 * Recursively truncates strings in arbitrarily nested data structures
 * while guarding against deeply nested/circular structures.
 */
export function truncateStringsInData(data, maxLength, depth = 0, path = "") {
  if (depth > 100) {
    return "[MAX_DEPTH_EXCEEDED]";
  }
  if (typeof data === "string") {
    if (data.length > maxLength) {
      return data.substring(0, maxLength) + "... (truncated)";
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item, index) =>
      truncateStringsInData(item, maxLength, depth + 1, `${path}[${index}]`)
    );
  }
  if (typeof data === "object" && data !== null) {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = truncateStringsInData(
          value,
          maxLength,
          depth + 1,
          path ? `${path}.${key}` : key
        );
      } catch (_) {
        result[key] = "[ERROR_PROCESSING]";
      }
    }
    return result;
  }
  return data;
}

function calculateObjectSize(obj) {
  return JSON.stringify(obj).length;
}

function processArrayWithSizeLimit(array, maxTotalSize, processFunc) {
  let currentSize = 0;
  const result = [];
  for (const item of array) {
    const processedItem = processFunc(item);
    const itemSize = calculateObjectSize(processedItem);
    if (currentSize + itemSize > maxTotalSize) {
      break;
    }
    result.push(processedItem);
    currentSize += itemSize;
  }
  return result;
}

/**
 * Attempts to parse strings as JSON, truncates all strings within,
 * and enforces total size limits for arrays.
 */
export function processJsonString(
  jsonString,
  maxLength,
  maxArrayBytes = 20000
) {
  try {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (_) {
      return truncateStringsInData(jsonString, maxLength, 0, "root");
    }
    if (Array.isArray(parsed)) {
      const processed = processArrayWithSizeLimit(
        parsed,
        maxArrayBytes,
        (item) => truncateStringsInData(item, maxLength, 0, "root")
      );
      return JSON.stringify(processed);
    }
    const processed = truncateStringsInData(parsed, maxLength, 0, "root");
    return JSON.stringify(processed);
  } catch (_) {
    return jsonString.substring(0, maxLength) + "... (truncated)";
  }
}
