#!/usr/bin/env node
/**
 * standalone.js — the engine as a small HTTP service, on node:http.
 *
 *   npm run serve                       → http://localhost:5100/api/jev/health
 *   PORT=5101 npm run serve
 *   JEV_PROVIDER=direct JEV_API_KEY=… npm run serve
 *
 * No framework, no install. It also serves a single-file dashboard at `/` so
 * the whole thing can be looked at without touching the React app.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createApi, ROUTES } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5100);
const BASE = process.env.JEV_API_BASE || '/api/jev';

const api = createApi();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return end(res, 204, '');

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = await readFile(join(__dirname, 'dashboard.html'), 'utf8');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return end(res, 200, html);
    } catch {
      return json(res, 404, { error: 'dashboard not found' });
    }
  }

  if (!url.pathname.startsWith(BASE)) return json(res, 404, { error: 'not found' });
  const path = url.pathname.slice(BASE.length) || '/';
  const route = ROUTES.find((r) => r.path === path && r.method === req.method);
  if (!route) return json(res, 404, { error: `no route for ${req.method} ${path}` });

  try {
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const out = await api[route.handler](body);
    return json(res, 200, out);
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    return json(res, status, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  CX Sentinel — Jev decision layer`);
  console.log(`  http://localhost:${PORT}/            dashboard`);
  console.log(`  http://localhost:${PORT}${BASE}/health   api\n`);
  for (const r of ROUTES) console.log(`    ${r.method.padEnd(4)} ${BASE}${r.path}`);
  console.log('');
});

function json(res, status, payload) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  end(res, status, JSON.stringify(payload));
}

function end(res, status, body) {
  res.writeHead(status);
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 5_000_000) throw Object.assign(new Error('request body too large'), { status: 413 });
    chunks.push(c);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('body is not valid JSON'), { status: 400 });
  }
}
