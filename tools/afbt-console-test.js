#!/usr/bin/env node
// Simple CLI to fetch console inspection results from the local browser tools server
// Usage: node tools/afbt-console-test.js [host] [port] [level] [seconds]

const http = require('http');

function buildUrl(host, port, level, seconds) {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (seconds && Number(seconds) > 0) {
    const since = Date.now() - Number(seconds) * 1000;
    params.set('since', String(since));
  }
  return `http://${host}:${port}/console-inspection?${params.toString()}`;
}

async function main() {
  const host = process.argv[2] || process.env.BROWSER_TOOLS_HOST || '127.0.0.1';
  const port = Number(process.argv[3] || process.env.BROWSER_TOOLS_PORT || 3025);
  const level = process.argv[4] || 'all';
  const seconds = Number(process.argv[5] || 300);

  const url = buildUrl(host, port, level, seconds);
  console.log(`Fetching console inspection from ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    process.exit(2);
  }
  const json = await res.json();
  console.log('Summary:', json.summary);
  console.log('Stats:', json.stats);
  console.log('Applied Filters:', json.filters);
  console.log('Formatted:');
  console.log(json.formatted);

  if ((json.stats?.total || 0) > 0) {
    console.log('\nSUCCESS: Logs fetched.');
    process.exit(0);
  } else {
    console.log('\nNO LOGS: Nothing matched.');
    process.exit(1);
  }
}

// Node 18+ has global fetch; guard just in case
if (typeof fetch !== 'function') {
  global.fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(2);
});


