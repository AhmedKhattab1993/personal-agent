import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadEnv } from '../env.js';

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

export async function loadUpworkConfig({ env = process.env, envFile } = {}) {
  await loadEnv({ env, envFile });
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
