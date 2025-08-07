/**
 * Console Inspector Module
 * 
 * Provides helpers for the inspectBrowserConsole MCP tool.
 * Handles filtering, sorting, and formatting of console logs, errors, and warnings.
 */

export interface ConsoleLogEntry {
  type: string;
  level: string;
  message: string;
  timestamp: number;
}

export interface ConsoleFilterParams {
  level?: 'log' | 'error' | 'warn' | 'info' | 'debug' | 'all';
  limit?: number;
  since?: number; // timestamp
  search?: string; // search in message content
}

/**
 * Filter console logs based on level and other criteria
 */
export function filterConsoleLogs(
  logs: ConsoleLogEntry[],
  filters: ConsoleFilterParams = {}
): ConsoleLogEntry[] {
  let filtered = [...logs];

  // Filter by level
  if (filters.level && filters.level !== 'all') {
    filtered = filtered.filter(log => log.level === filters.level);
  }

  // Filter by timestamp (since)
  if (filters.since) {
    filtered = filtered.filter(log => log.timestamp >= filters.since!);
  }

  // Filter by search term in message
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    filtered = filtered.filter(log => 
      log.message.toLowerCase().includes(searchTerm)
    );
  }

  return filtered;
}

/**
 * Sort console logs by timestamp (newest first by default)
 */
export function sortConsoleLogs(
  logs: ConsoleLogEntry[],
  order: 'asc' | 'desc' = 'desc'
): ConsoleLogEntry[] {
  return [...logs].sort((a, b) => {
    if (order === 'desc') {
      return b.timestamp - a.timestamp;
    }
    return a.timestamp - b.timestamp;
  });
}

/**
 * Limit the number of results
 */
export function limitConsoleResults(
  logs: ConsoleLogEntry[],
  limit?: number
): ConsoleLogEntry[] {
  if (!limit || limit <= 0) {
    return logs;
  }
  return logs.slice(0, limit);
}

/**
 * Get console log statistics
 */
export function getConsoleLogStats(logs: ConsoleLogEntry[]): {
  total: number;
  byLevel: Record<string, number>;
  timeRange: { oldest?: number; newest?: number };
} {
  const stats = {
    total: logs.length,
    byLevel: {} as Record<string, number>,
    timeRange: {} as { oldest?: number; newest?: number }
  };

  if (logs.length === 0) {
    return stats;
  }

  // Count by level
  logs.forEach(log => {
    stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
  });

  // Find time range
  const timestamps = logs.map(log => log.timestamp).sort((a, b) => a - b);
  stats.timeRange.oldest = timestamps[0];
  stats.timeRange.newest = timestamps[timestamps.length - 1];

  return stats;
}

/**
 * Format console logs for display with enhanced readability
 */
export function formatConsoleLogsForDisplay(logs: ConsoleLogEntry[]): {
  formatted: string;
  summary: string;
} {
  if (logs.length === 0) {
    return {
      formatted: "No console logs found matching the criteria.",
      summary: "0 logs"
    };
  }

  const stats = getConsoleLogStats(logs);
  
  // Create summary
  const levelCounts = Object.entries(stats.byLevel)
    .map(([level, count]) => `${count} ${level}${count !== 1 ? 's' : ''}`)
    .join(', ');
  
  const summary = `${stats.total} total logs (${levelCounts})`;

  // Format logs
  const formatted = logs.map(log => {
    const date = new Date(log.timestamp).toISOString();
    const levelIcon = getLevelIcon(log.level);
    return `${levelIcon} [${date}] ${log.level.toUpperCase()}: ${log.message}`;
  }).join('\n');

  return { formatted, summary };
}

/**
 * Get icon/emoji for log level
 */
function getLevelIcon(level: string): string {
  switch (level) {
    case 'error': return '❌';
    case 'warn': return '⚠️';
    case 'info': return 'ℹ️';
    case 'debug': return '🐛';
    case 'log':
    default: return '📝';
  }
}

/**
 * Build console inspection response with filtering and formatting
 */
export function buildConsoleInspectionResponse(
  consoleLogs: ConsoleLogEntry[],
  consoleErrors: ConsoleLogEntry[],
  consoleWarnings: ConsoleLogEntry[],
  filters: ConsoleFilterParams = {}
): {
  logs: ConsoleLogEntry[];
  stats: ReturnType<typeof getConsoleLogStats>;
  formatted: string;
  summary: string;
  filters: ConsoleFilterParams;
} {
  // Combine all console entries
  let allLogs: ConsoleLogEntry[] = [];
  
  // Add logs with proper typing
  allLogs.push(...consoleLogs.map(log => ({ ...log, level: 'log' })));
  allLogs.push(...consoleErrors.map(log => ({ ...log, level: 'error' })));
  allLogs.push(...consoleWarnings.map(log => ({ ...log, level: 'warn' })));

  // Apply filters
  let filteredLogs = filterConsoleLogs(allLogs, filters);
  
  // Sort by timestamp
  filteredLogs = sortConsoleLogs(filteredLogs);
  
  // Apply limit
  filteredLogs = limitConsoleResults(filteredLogs, filters.limit);

  // Get statistics
  const stats = getConsoleLogStats(filteredLogs);

  // Format for display
  const { formatted, summary } = formatConsoleLogsForDisplay(filteredLogs);

  return {
    logs: filteredLogs,
    stats,
    formatted,
    summary,
    filters
  };
}

export default {
  filterConsoleLogs,
  sortConsoleLogs,
  limitConsoleResults,
  getConsoleLogStats,
  formatConsoleLogsForDisplay,
  buildConsoleInspectionResponse
};