import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
 *   2. ./upwork-agent/.env            (project-local)
 *   3. ~/.env                         (user home — where the secrets live today)
 */
export async function loadEnv() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(homedir(), '.env'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = await readFile(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
  return {
    clientId: process.env.UPWORK_KEY,
    clientSecret: process.env.UPWORK_SECRET,
    redirectUri: process.env.REDIRECT_URI ?? 'http://localhost:3000/callback',
    port: Number(process.env.PORT ?? 3000),
  };
}

/**
 * Where we persist the access/refresh tokens after the one-time consent.
 * Stored next to the secrets so it stays out of git.
 */
export const TOKEN_FILE = join(homedir(), '.upwork-tokens.json');

export function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}
