/**
 * Refactor Temp: Tool — inspectBrowserNetworkActivity
 * Stateless helpers to filter, sort, and format network logs captured from the extension.
 * Keep HTTP bindings and in-memory caches in browser-connector.ts.
 */
/**
 * Apply URL substring filter and optional time window to logs.
 */
export function filterNetworkLogs(logs, params) {
    const term = (params.urlFilter || "").toLowerCase();
    return logs.filter((log) => {
        const urlMatch = term ? (log.url || "").toLowerCase().includes(term) : true;
        const ts = typeof log.timestamp === "number" ? log.timestamp : undefined;
        const afterStart = params.timeStart
            ? ts
                ? ts >= params.timeStart
                : false
            : true;
        const beforeEnd = params.timeEnd
            ? ts
                ? ts <= params.timeEnd
                : false
            : true;
        return urlMatch && afterStart && beforeEnd;
    });
}
/**
 * Sort logs by timestamp or url with direction.
 */
export function sortNetworkLogs(logs, orderBy = "timestamp", orderDirection = "desc") {
    const sorted = [...logs];
    sorted.sort((a, b) => {
        if (orderBy === "url") {
            const ua = (a.url || "").toLowerCase();
            const ub = (b.url || "").toLowerCase();
            const cmp = ua.localeCompare(ub);
            return orderDirection === "asc" ? cmp : -cmp;
        }
        else {
            const ta = typeof a.timestamp === "number" ? a.timestamp : 0;
            const tb = typeof b.timestamp === "number" ? b.timestamp : 0;
            const cmp = ta - tb;
            return orderDirection === "asc" ? cmp : -cmp;
        }
    });
    return sorted;
}
/**
 * Project only requested details to reduce payload size.
 */
export function projectNetworkLogDetails(logs, details, includeTimestamp = true) {
    const want = new Set(details);
    return logs.map((log) => {
        const out = {};
        if (want.has("url"))
            out.url = log.url;
        if (want.has("method"))
            out.method = log.method;
        if (want.has("status"))
            out.status = log.status;
        if (includeTimestamp)
            out.timestamp = log.timestamp;
        if (want.has("requestHeaders"))
            out.requestHeaders = log.requestHeaders;
        if (want.has("responseHeaders"))
            out.responseHeaders = log.responseHeaders;
        if (want.has("requestBody"))
            out.requestBody = log.requestBody;
        if (want.has("responseBody"))
            out.responseBody = log.responseBody;
        return out;
    });
}
/**
 * Enforce a hard limit on number of results.
 */
export function limitResults(logs, limit = 20) {
    if (limit <= 0)
        return [];
    return logs.slice(0, limit);
}
