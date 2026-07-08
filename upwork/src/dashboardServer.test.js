import assert from 'node:assert/strict';
import test from 'node:test';

import { startHourlyDashboardRefresh } from './dashboardServer.js';

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
