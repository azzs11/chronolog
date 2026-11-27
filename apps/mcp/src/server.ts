#!/usr/bin/env node
/**
 * chronolog-mcp: an MCP server (stdio) for AI agents. Set CHRONOLOG_API_URL (default
 * http://localhost:5050, the Docker API port). Example client config:
 *   { "command": "node", "args": ["apps/mcp/dist/server.js"], "env": { "CHRONOLOG_API_URL": "http://localhost:5050" } }
 */
import { createInterface } from 'node:readline';
import { handle } from './protocol';
import type { Fetcher } from './tools';

const API = (process.env.CHRONOLOG_API_URL ?? 'http://localhost:5050').replace(/\/$/, '');

const get: Fetcher = async (path) => {
  const res = await fetch(`${API}${path}`);
  const body = (await res.json()) as { data?: unknown; message?: string };
  if (!res.ok) throw new Error(body.message ?? `ChronoLog API answered ${res.status}`);
  return body.data;
};

const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message: Parameters<typeof handle>[0];
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
    return;
  }
  handle(message, get).then((response) => {
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
