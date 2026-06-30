import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadDashboardJobs, refreshDashboardJobs, suggestCoverLetterForJob } from './dashboardStore.js';

const PORT = Number(process.env.DASHBOARD_PORT ?? 5173);
const HOST = process.env.DASHBOARD_HOST ?? '127.0.0.1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DASHBOARD_ROOT = resolve('dashboard');
const DIST_ROOT = resolve('dashboard/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendError(res, error) {
  sendJson(res, 500, {
    error: error.message,
  });
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(res, 200, await loadDashboardJobs());
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs/refresh') {
    const body = await readRequestJson(req);
    const limit = body.limit ?? url.searchParams.get('limit') ?? 200;
    return sendJson(res, 200, await refreshDashboardJobs(limit));
  }
  const coverLetterMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/cover-letter$/);
  if (req.method === 'POST' && coverLetterMatch) {
    const body = await readRequestJson(req);
    return sendJson(res, 200, await suggestCoverLetterForJob(decodeURIComponent(coverLetterMatch[1]), {
      force: body.force === true || url.searchParams.get('force') === 'true',
    }));
  }
  return sendJson(res, 404, { error: 'API route not found' });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = join(DIST_ROOT, requested);
  const safePath = resolve(filePath);
  const rootPath = `${DIST_ROOT}/`;
  const candidate = safePath.startsWith(rootPath) && existsSync(safePath)
    ? safePath
    : join(DIST_ROOT, 'index.html');
  const data = await readFile(candidate);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(candidate)] ?? 'application/octet-stream',
  });
  res.end(data);
}

async function createAppServer() {
  let vite = null;
  if (!IS_PRODUCTION) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: DASHBOARD_ROOT,
      configFile: join(DASHBOARD_ROOT, 'vite.config.js'),
      server: {
        allowedHosts: true,
        middlewareMode: true,
      },
      appType: 'spa',
    });
  }

  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res);
        return;
      }
      if (vite) {
        vite.middlewares(req, res);
        return;
      }
      await serveStatic(req, res);
    } catch (error) {
      sendError(res, error);
    }
  });
}

export async function startDashboardServer() {
  const server = await createAppServer();
  await new Promise((resolveListen) => {
    server.listen(PORT, HOST, resolveListen);
  });
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
  console.log('Refresh uses the Upwork API through existing OAuth tokens.');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDashboardServer().catch((error) => {
    console.error('Failed to start dashboard:', error.message);
    process.exit(1);
  });
}
