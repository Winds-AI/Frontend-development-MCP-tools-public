// Lightweight global logger installer for subtle, readable colors
// - Colors only for known tags like [search], [embed], [index], [info], [warn], [error]
// - Skips messages that already contain ANSI codes
// - Leaves non-tagged logs mostly unchanged

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  fg: {
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
  },
} as const;

function colorizeKnownTag(line: string): string {
  // Already colored?
  if (line.includes("\x1b[")) return line;

  // Map simple bracket tags to colors
  const mappings: Array<[RegExp, string]> = [
    [/^\[search\]/, `${ANSI.fg.cyan}[search]${ANSI.reset}`],
    [/^\[embed\]/, `${ANSI.fg.green}[embed]${ANSI.reset}`],
    [/^\[index\]/, `${ANSI.fg.magenta}[index]${ANSI.reset}`],
    [/^\[info\]/i, `${ANSI.fg.blue}[info]${ANSI.reset}`],
    [/^\[warn\]/i, `${ANSI.fg.yellow}[warn]${ANSI.reset}`],
    [/^\[error\]/i, `${ANSI.fg.red}[error]${ANSI.reset}`],
    [/^\[debug\]/i, `${ANSI.dim}[debug]${ANSI.reset}`],
  ];

  for (const [re, colored] of mappings) {
    if (re.test(line)) return line.replace(re, colored);
  }
  return line;
}

function resolveLevelFromTag(s: string): number {
  // Levels: error=0, warn=1, info=2, debug=3
  const m = /^\[(\w+)\]/i.exec(s);
  const tag = m?.[1]?.toLowerCase();
  switch (tag) {
    case "error":
      return 0;
    case "warn":
      return 1;
    case "info":
    case "search":
    case "embed":
    case "index":
      return 2;
    case "debug":
      return 3;
    default:
      return 2; // default to info if no recognized tag
  }
}

function currentLogLevel(): number {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  switch (raw) {
    case "error":
      return 0;
    case "warn":
      return 1;
    case "info":
      return 2;
    case "debug":
      return 3;
    default:
      return 2;
  }
}

function shouldEmit(args: any[]): boolean {
  if (args.length === 0) return true;
  const first = args[0];
  if (typeof first !== "string") return true; // non-string heads pass
  const msgLevel = resolveLevelFromTag(first);
  return msgLevel <= currentLogLevel();
}

export function installGlobalLogger(): void {
  const origLog = console.log.bind(console);
  const origInfo = console.info ? console.info.bind(console) : origLog;
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  function formatArgs(args: any[]): any[] {
    if (args.length === 0) return args;
    const [first, ...rest] = args;
    if (typeof first === "string") {
      return [colorizeKnownTag(first), ...rest];
    }
    return args;
  }

  console.log = (...args: any[]) => {
    if (!shouldEmit(args)) return;
    origLog(...formatArgs(args));
  };
  console.info = (...args: any[]) => {
    if (!shouldEmit(args)) return;
    origInfo(...formatArgs(args));
  };
  console.warn = (...args: any[]) => {
    if (!shouldEmit(args)) return;
    const formatted = formatArgs(args);
    origWarn(...formatted);
  };
  console.error = (...args: any[]) => {
    if (!shouldEmit(args)) return;
    const formatted = formatArgs(args);
    origError(...formatted);
  };
}

export const loggerColors = ANSI;
