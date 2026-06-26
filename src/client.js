import {
  ENDPOINTS,
  loadEnv,
  basicAuthHeader,
} from './config.js';
import {
  loadTokens,
  saveTokens,
  isExpired,
} from './tokenStore.js';

/**
 * Execute a GraphQL request against Upwork, automatically refreshing the
 * access token if it has expired.
 *
 * @param {string} query      - GraphQL operation (query/mutation) string.
 * @param {object} [variables] - Operation variables.
 * @returns {Promise<object>}   - The `data` object from the GraphQL response.
 */
export async function graphql(query, variables = {}) {
  const tokens = await getValidTokens();

  const res = await fetch(ENDPOINTS.graphql, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  // If the token was revoked/expired mid-flight, force one refresh + retry.
  if (res.status === 401 && !variables.__retried) {
    console.warn('  ! access token rejected (401), refreshing once…');
    await refreshToken();
    return graphql(query, { ...variables, __retried: true });
  }

  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
  }
  if (json.errors?.length) {
    const msgs = json.errors.map((e) => e.message).join('; ');
    throw new Error(`GraphQL errors: ${msgs}`);
  }
  return json.data;
}

/**
 * Return non-expired tokens, refreshing first if needed.
 */
async function getValidTokens() {
  let tokens = await loadTokens();
  if (!tokens) {
    throw new Error(
      'No tokens found. Run `node src/auth.js` first to complete OAuth consent.'
    );
  }
  if (isExpired(tokens)) {
    await refreshToken();
    tokens = await loadTokens();
  }
  return tokens;
}

/**
 * Use the refresh token to get a fresh access token. Persistes the new pair.
 */
export async function refreshToken() {
  const { clientId, clientSecret } = await loadEnv();
  const tokens = await loadTokens();
  if (!tokens?.refresh_token) {
    throw new Error('No refresh_token — run `node src/auth.js` to authorize again.');
  }

  // Upwork requires client_id + client_secret in the BODY, not as Basic auth
  // (Basic auth yields "Missing parameters: client_id").
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(ENDPOINTS.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }

  if (!res.ok || !json.access_token) {
    throw new Error(`refresh failed (${res.status}): ${text}`);
  }

  // Upwork returns a new refresh_token on each refresh (rotating tokens). Keep
  // the old one as fallback only if a new one isn't returned.
  const merged = {
    ...json,
    refresh_token: json.refresh_token ?? tokens.refresh_token,
  };
  await saveTokens(merged);
  console.log('  ↻ access token refreshed.');
}
