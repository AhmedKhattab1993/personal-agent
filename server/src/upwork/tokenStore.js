import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TOKEN_FILE } from './config.js';

/**
 * Persisted token shape:
 *   {
 *     "access_token": "...",
 *     "refresh_token": "...",
 *     "expires_at": 1234567890,   // epoch ms
 *     "scope": "...",
 *     "obtained_at": 1234567890
 *   }
 */
export async function loadTokens() {
  if (!existsSync(TOKEN_FILE)) return null;
  const raw = await readFile(TOKEN_FILE, 'utf8');
  return JSON.parse(raw);
}

export async function saveTokens(tokenResponse) {
  const now = Date.now();
  const data = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    // expires_in is in seconds; subtract a 60s safety margin.
    expires_at: now + (tokenResponse.expires_in - 60) * 1000,
    scope: tokenResponse.scope ?? '',
    obtained_at: now,
  };
  await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2));
  return data;
}

/** True if the access token is missing or past its expiry margin. */
export function isExpired(tokens) {
  if (!tokens?.access_token) return true;
  if (!tokens.expires_at) return true;
  return Date.now() >= tokens.expires_at;
}
