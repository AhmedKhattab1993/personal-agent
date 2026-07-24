import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENV_FILE = join(homedir(), '.personal-agent', '.env');

/**
 * Load Personal Agent environment variables without overriding values supplied
 * by the process.
 */
export async function loadEnv({ env = process.env, envFile = ENV_FILE } = {}) {
  try {
    const raw = await readFile(envFile, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (env[key] === undefined) {
        env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return env;
}
