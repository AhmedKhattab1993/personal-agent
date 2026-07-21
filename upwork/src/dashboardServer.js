import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzip as gzipCallback } from 'node:zlib';

import { loadEnv } from './config.js';
import { loadDashboardJobs, refreshDashboardJobs, suggestCoverLetterForJob } from './dashboardStore.js';
import { refineGoalWithPi } from './piGoalAssistant.js';
import {
  createPlanningGoal,
  createPlanningProject,
  deletePlanningProject,
  deletePlanningGoal,
  loadPlanningBoard,
  updatePlanningGoal,
  updatePlanningProject,
} from './planningStore.js';

await loadEnv();

const PORT = Number(process.env.DASHBOARD_PORT ?? 5173);
const HOST = process.env.DASHBOARD_HOST ?? '0.0.0.0';
const PUBLIC_HOST = process.env.DASHBOARD_PUBLIC_HOST ?? 'studio.tailcc4c77.ts.net';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DASHBOARD_ROOT = join(APP_ROOT, 'dashboard');
const DIST_ROOT = join(DASHBOARD_ROOT, 'dist');
const HOURLY_REFRESH_MS = 60 * 60 * 1000;
const gzip = promisify(gzipCallback);
const execFileAsync = promisify(execFile);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
};

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

const DASHBOARD_ACTIONS = [
  { id: 'dashboard.status', method: 'GET', path: '/api', description: 'Check dashboard status and discover actions.' },
  { id: 'dashboard.read', method: 'GET', path: '/api/planning', description: 'List dashboard projects and goals.' },
  { id: 'dashboard.project.create', method: 'POST', path: '/api/planning/projects', description: 'Create a dashboard project.' },
  { id: 'dashboard.project.update', method: 'PATCH', path: '/api/planning/projects/{projectId}', description: 'Update a dashboard project.' },
  { id: 'dashboard.project.delete', method: 'DELETE', path: '/api/planning/projects/{projectId}', description: 'Delete a dashboard project.' },
  { id: 'dashboard.goal.create', method: 'POST', path: '/api/planning/goals', description: 'Create a dashboard goal.' },
  { id: 'dashboard.goal.update', method: 'PATCH', path: '/api/planning/goals/{goalId}', description: 'Update or move a dashboard goal.' },
  { id: 'dashboard.goal.delete', method: 'DELETE', path: '/api/planning/goals/{goalId}', description: 'Delete a dashboard goal.' },
  { id: 'upwork.jobs.list', method: 'GET', path: '/api/jobs', description: 'List cached Upwork jobs.' },
  { id: 'upwork.jobs.refresh', method: 'POST', path: '/api/jobs/refresh', description: 'Refresh and return Upwork jobs.' },
];

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...NO_CACHE_HEADERS,
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function requireDashboardAuth(req, res, secret) {
  const match = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.match(/^Basic (.+)$/i)
    : null;
  const credentials = match ? Buffer.from(match[1], 'base64').toString('utf8') : '';
  const separator = credentials.indexOf(':');
  const supplied = Buffer.from(separator === -1 ? '' : credentials.slice(separator + 1));
  const expected = Buffer.from(secret);
  const valid = credentials.slice(0, separator) === 'agent'
    && supplied.length === expected.length
    && timingSafeEqual(supplied, expected);
  if (valid) return true;

  sendJson(res, 401, { error: 'Authentication required' }, {
    'WWW-Authenticate': 'Basic realm="personal-agent", charset="UTF-8"',
  });
  return false;
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
  if (req.method === 'GET' && url.pathname === '/api') {
    return sendJson(res, 200, {
      service: 'personal-agent-dashboard',
      status: 'ok',
      authentication: { type: 'http-basic', username: 'agent' },
      actions: DASHBOARD_ACTIONS,
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/planning') {
    return sendJson(res, 200, await loadPlanningBoard());
  }
  if (req.method === 'GET' && url.pathname === '/api/planning/choose-directory') {
    if (process.platform !== 'darwin') return sendJson(res, 501, { error: 'Directory picking is currently supported on macOS only' });
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a project directory")']);
      return sendJson(res, 200, { directory: stdout.trim().replace(/\/$/, '') });
    } catch (error) {
      if (error.code === 1) return sendJson(res, 200, { canceled: true });
      throw error;
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/planning/goal-assistant') {
    const body = await readRequestJson(req);
    const board = await loadPlanningBoard();
    const project = board.projects.find((item) => item.id === body.projectId);
    if (!project) return sendJson(res, 400, { error: 'Choose a valid project before chatting with the agent' });
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.some((message) => message?.role === 'user' && String(message.content ?? '').trim())) {
      return sendJson(res, 400, { error: 'Send the agent a message first' });
    }
    return sendJson(res, 200, await refineGoalWithPi({ project, messages, draft: body.draft ?? {} }));
  }
  if (req.method === 'POST' && url.pathname === '/api/planning/projects') {
    const result = await createPlanningProject(await readRequestJson(req));
    return sendJson(res, 201, result.board);
  }
  const projectMatch = url.pathname.match(/^\/api\/planning\/projects\/([^/]+)$/);
  if (req.method === 'PATCH' && projectMatch) {
    const result = await updatePlanningProject(decodeURIComponent(projectMatch[1]), await readRequestJson(req));
    return sendJson(res, 200, result.board);
  }
  if (req.method === 'DELETE' && projectMatch) {
    const result = await deletePlanningProject(decodeURIComponent(projectMatch[1]));
    return sendJson(res, 200, result.board);
  }
  if (req.method === 'POST' && url.pathname === '/api/planning/goals') {
    const result = await createPlanningGoal(await readRequestJson(req));
    return sendJson(res, 201, result.board);
  }
  const goalMatch = url.pathname.match(/^\/api\/planning\/goals\/([^/]+)$/);
  if (req.method === 'PATCH' && goalMatch) {
    const result = await updatePlanningGoal(decodeURIComponent(goalMatch[1]), await readRequestJson(req));
    return sendJson(res, 200, result.board);
  }
  if (req.method === 'DELETE' && goalMatch) {
    const result = await deletePlanningGoal(decodeURIComponent(goalMatch[1]));
    return sendJson(res, 200, result.board);
  }
  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(res, 200, await loadDashboardJobs());
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs/refresh') {
    return sendJson(res, 200, await refreshDashboardJobs());
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
  const extension = extname(candidate);
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const compressible = ['.html', '.js', '.css', '.json', '.svg', '.webmanifest'].includes(extension);
  const compressed = acceptsGzip && compressible;
  const payload = compressed ? await gzip(data) : data;
  const cacheControl = candidate.includes(`${DIST_ROOT}/assets/`)
    ? 'public, max-age=31536000, immutable'
    : candidate.endsWith('/index.html')
      ? 'no-cache'
      : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': payload.length,
    'Cache-Control': cacheControl,
    Vary: 'Accept-Encoding',
    ...(compressed ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(payload);
}

export async function createAppServer({
  dashboardSecret = process.env.DASHBOARD_SECRET,
  development = !IS_PRODUCTION,
} = {}) {
  if (!dashboardSecret) {
    throw new Error('Missing DASHBOARD_SECRET. Set it in ~/.personal-agent/.env');
  }

  let vite = null;
  if (development) {
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
      if (!requireDashboardAuth(req, res, dashboardSecret)) return;
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
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

export function startHourlyDashboardRefresh({
  refresh = refreshDashboardJobs,
  intervalMs = HOURLY_REFRESH_MS,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  logger = console,
} = {}) {
  let refreshing = false;
  const refreshOnInterval = async () => {
    if (refreshing) {
      logger.warn('Skipped dashboard auto-refresh because the previous refresh is still running.');
      return;
    }
    refreshing = true;
    try {
      await refresh();
      logger.log('Dashboard auto-refresh completed.');
    } catch (error) {
      logger.error('Dashboard auto-refresh failed:', error.message);
    } finally {
      refreshing = false;
    }
  };

  const timer = setIntervalFn(refreshOnInterval, intervalMs);
  timer.unref?.();
  return () => clearIntervalFn(timer);
}

export async function startDashboardServer() {
  const server = await createAppServer();
  await new Promise((resolveListen) => {
    server.listen(PORT, HOST, resolveListen);
  });
  const stopHourlyRefresh = startHourlyDashboardRefresh();
  server.on('close', stopHourlyRefresh);
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
  if (PUBLIC_HOST) {
    console.log(`Tailnet URL: http://${PUBLIC_HOST}:${PORT}`);
  }
  console.log('Refresh uses the Upwork API through existing OAuth tokens and runs automatically every hour.');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDashboardServer().catch((error) => {
    console.error('Failed to start dashboard:', error.message);
    process.exit(1);
  });
}
