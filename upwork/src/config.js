import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Upwork OAuth2 endpoints (confirmed against official node-upwork-oauth2 library).
 */
export const ENDPOINTS = {
  authorize: 'https://www.upwork.com/ab/account-security/oauth2/authorize',
  token: 'https://www.upwork.com/api/v3/oauth2/token',
  graphql: 'https://api.upwork.com/graphql',
};

/**
 * Scopes: Upwork does NOT accept a `scope` parameter in the authorize URL
 * (it errors with "Scope parameter is not supported"). Scopes are granted
 * per-app in the developer portal, so nothing is requested at authorize time.
 */

/**
 * Load environment variables.
 *
 * Resolution order:
 *   1. process.env (already set in the shell)
 *   2. ~/.personal-agent/.env
 *
 * The app-specific file is the only dotenv file read. This keeps credentials
 * out of the repository and avoids inheriting unrelated values from ~/.env.
 */
export const ENV_FILE = join(homedir(), '.personal-agent', '.env');

export async function loadEnv({ env = process.env, envFile = ENV_FILE } = {}) {
  try {
    const raw = await readFile(envFile, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (env[key] === undefined) {
        env[key] = val;
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    clientId: env.UPWORK_KEY,
    clientSecret: env.UPWORK_SECRET,
    redirectUri: env.REDIRECT_URI ?? 'http://localhost:3000/callback',
    port: Number(env.PORT ?? 3000),
  };
}

/**
 * Where we persist the access/refresh tokens after the one-time consent.
 * Stored next to the secrets so it stays out of git.
 */
export const TOKEN_FILE = join(homedir(), '.upwork-tokens.json');
