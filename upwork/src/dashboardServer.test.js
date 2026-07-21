import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer, startHourlyDashboardRefresh } from './dashboardServer.js';

function authorization(secret, username = 'agent') {
  return `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`;
}

async function withDashboardServer(run) {
  const server = await createAppServer({ dashboardSecret: 'test-dashboard-secret', development: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('refuses to start without a dashboard secret', async () => {
  await assert.rejects(
    createAppServer({ dashboardSecret: '', development: false }),
    /Missing DASHBOARD_SECRET/,
  );
});

test('protects the dashboard and exposes agent-friendly actions', async () => {
  await withDashboardServer(async (baseUrl) => {
    const missing = await fetch(baseUrl);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /^Basic /);

    const wrong = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('wrong-dashboard-secret') },
    });
    assert.equal(wrong.status, 401);

    const wrongUsername = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('test-dashboard-secret', 'not-agent') },
    });
    assert.equal(wrongUsername.status, 401);

    const response = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('test-dashboard-secret') },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(JSON.stringify(payload).includes('test-dashboard-secret'), false);
    assert.deepEqual(payload.actions.map(({ id, method, path }) => ({ id, method, path })), [
      { id: 'dashboard.status', method: 'GET', path: '/api' },
      { id: 'dashboard.read', method: 'GET', path: '/api/planning' },
      { id: 'dashboard.project.create', method: 'POST', path: '/api/planning/projects' },
      { id: 'dashboard.project.update', method: 'PATCH', path: '/api/planning/projects/{projectId}' },
      { id: 'dashboard.project.delete', method: 'DELETE', path: '/api/planning/projects/{projectId}' },
      { id: 'dashboard.goal.create', method: 'POST', path: '/api/planning/goals' },
      { id: 'dashboard.goal.update', method: 'PATCH', path: '/api/planning/goals/{goalId}' },
      { id: 'dashboard.goal.delete', method: 'DELETE', path: '/api/planning/goals/{goalId}' },
      { id: 'upwork.jobs.list', method: 'GET', path: '/api/jobs' },
      { id: 'upwork.jobs.refresh', method: 'POST', path: '/api/jobs/refresh' },
    ]);
  });
});

test('schedules dashboard refresh every hour', async () => {
  const timers = [];
  let clearedTimer = null;
  const stop = startHourlyDashboardRefresh({
    refresh: async () => {},
    setIntervalFn: (handler, intervalMs) => {
      const timer = { handler, intervalMs, unrefCalled: false, unref() { this.unrefCalled = true; } };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => {
      clearedTimer = timer;
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].intervalMs, 60 * 60 * 1000);
  assert.equal(timers[0].unrefCalled, true);

  stop();
  assert.equal(clearedTimer, timers[0]);
});

test('does not overlap dashboard auto-refresh runs', async () => {
  let intervalHandler = null;
  let resolveRefresh;
  let refreshCount = 0;
  const warnings = [];
  startHourlyDashboardRefresh({
    refresh: async () => {
      refreshCount += 1;
      await new Promise((resolve) => {
        resolveRefresh = resolve;
      });
    },
    setIntervalFn: (handler) => {
      intervalHandler = handler;
      return {};
    },
    clearIntervalFn: () => {},
    logger: {
      log() {},
      warn(message) {
        warnings.push(message);
      },
      error() {},
    },
  });

  const firstRun = intervalHandler();
  await intervalHandler();

  assert.equal(refreshCount, 1);
  assert.equal(warnings.length, 1);

  resolveRefresh();
  await firstRun;
});
