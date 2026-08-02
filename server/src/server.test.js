import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer, startHourlyUpworkRefresh } from './server.js';

function authorization(secret, username = 'agent') {
  return `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`;
}

async function withServer(run) {
  const server = await createAppServer({ serverSecret: 'test-server-secret', development: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('refuses to start without a server secret', async () => {
  await assert.rejects(
    createAppServer({ serverSecret: '', development: false }),
    /Missing SERVER_SECRET/,
  );
});

test('protects the server and exposes feature-scoped actions', async () => {
  await withServer(async (baseUrl) => {
    const missing = await fetch(baseUrl);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /^Basic /);

    const wrong = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('wrong-server-secret') },
    });
    assert.equal(wrong.status, 401);

    const wrongUsername = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('test-server-secret', 'not-agent') },
    });
    assert.equal(wrongUsername.status, 401);

    const response = await fetch(`${baseUrl}/api`, {
      headers: { Authorization: authorization('test-server-secret') },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'personal-agent-server');
    assert.equal(JSON.stringify(payload).includes('test-server-secret'), false);
    assert.deepEqual(payload.actions.map(({ id, method, path }) => ({ id, method, path })), [
      { id: 'server.status', method: 'GET', path: '/api' },
      { id: 'planning.read', method: 'GET', path: '/api/planning' },
      { id: 'planning.project.create', method: 'POST', path: '/api/planning/projects' },
      { id: 'planning.project.update', method: 'PATCH', path: '/api/planning/projects/{projectId}' },
      { id: 'planning.project.delete', method: 'DELETE', path: '/api/planning/projects/{projectId}' },
      { id: 'planning.goal.create', method: 'POST', path: '/api/planning/goals' },
      { id: 'planning.goal.update', method: 'PATCH', path: '/api/planning/goals/{goalId}' },
      { id: 'planning.goal.delete', method: 'DELETE', path: '/api/planning/goals/{goalId}' },
      { id: 'upwork.jobs.list', method: 'GET', path: '/api/upwork/jobs' },
      { id: 'upwork.jobs.refresh', method: 'POST', path: '/api/upwork/jobs/refresh' },
      { id: 'upwork.jobs.classify', method: 'PATCH', path: '/api/upwork/jobs/{jobId}/classification' },
    ]);
  });
});

test('schedules Upwork refresh every hour', async () => {
  const timers = [];
  let clearedTimer = null;
  const stop = startHourlyUpworkRefresh({
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

test('does not overlap Upwork auto-refresh runs', async () => {
  let intervalHandler = null;
  let resolveRefresh;
  let refreshCount = 0;
  const warnings = [];
  startHourlyUpworkRefresh({
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
