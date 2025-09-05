// common/serverIdentity.js
// Shared helpers for validating and fetching the Browser Tools server identity

export const SERVER_SIGNATURE = "mcp-browser-connector-24x7";

/**
 * Fetch the server identity from /.identity and validate signature.
 * Returns the parsed identity object on success, throws on failure.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @param {AbortSignal} [externalSignal]
 */
export async function fetchServerIdentity(
  host,
  port,
  timeoutMs = 3000,
  externalSignal
) {
  const url = `http://${host}:${port}/.identity`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([timeoutSignal, externalSignal])
    : timeoutSignal;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.name = "HttpError";
    throw err;
  }
  const identity = await response.json();
  if (!identity || identity.signature !== SERVER_SIGNATURE) {
    const err = new Error("invalid_signature");
    err.name = "InvalidSignature";
    throw err;
  }
  return identity;
}

/**
 * Convenience boolean validator for server identity.
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 */
export async function validateServerIdentity(host, port, timeoutMs = 3000) {
  try {
    await fetchServerIdentity(host, port, timeoutMs);
    return true;
  } catch (_) {
    return false;
  }
}
