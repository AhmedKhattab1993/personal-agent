import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadEnv } from './config.js';

test('loadEnv reads the configured app-specific env file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'upwork-env-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, [
    'UPWORK_KEY=file-key',
    'UPWORK_SECRET="file-secret"',
    'PORT=4321',
  ].join('\n'));
  const env = {};

  const config = await loadEnv({ env, envFile });

  assert.deepEqual(config, {
    clientId: 'file-key',
    clientSecret: 'file-secret',
    redirectUri: 'http://localhost:3000/callback',
    port: 4321,
  });
});

test('loadEnv preserves values already supplied by the shell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'upwork-env-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'UPWORK_KEY=file-key\nUPWORK_SECRET=file-secret\n');
  const env = { UPWORK_KEY: 'shell-key' };

  const config = await loadEnv({ env, envFile });

  assert.equal(config.clientId, 'shell-key');
  assert.equal(config.clientSecret, 'file-secret');
});

test('loadEnv tolerates a missing app-specific env file', async () => {
  const env = {};

  const config = await loadEnv({ env, envFile: '/definitely/missing/personal-agent/.env' });

  assert.equal(config.clientId, undefined);
  assert.equal(config.clientSecret, undefined);
});
