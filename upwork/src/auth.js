import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

import {
  ENDPOINTS,
  loadEnv,
} from './config.js';
import { saveTokens } from './tokenStore.js';

/**
 * Run the one-time OAuth2 authorization-code flow:
 *   1. Start a local HTTP server to receive the ?code= redirect.
 *   2. Print the Upwork consent URL.
 *   3. User authorizes in their browser.
 *   4. Upwork redirects to localhost with ?code=...
 *   5. We exchange the code for access+refresh tokens and persist them.
 *
 * NOTE on scopes: Upwork does NOT accept a `scope` param in the authorize
 * URL (it returns "Scope parameter is not supported") and does not use PKCE.
 * Scopes are granted per-app in the developer portal. We therefore send only
 * response_type / client_id / redirect_uri / state.
 *
 * Usage:  node src/auth.js
 */
async function main() {
  const { clientId, clientSecret, redirectUri, port } = await loadEnv();

  if (!clientId || !clientSecret) {
    console.error('✗ Missing UPWORK_KEY / UPWORK_SECRET. Set them in ~/.personal-agent/.env');
    process.exit(1);
  }

  // `state` protects against CSRF on the redirect.
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL(ENDPOINTS.authorize);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname !== '/callback') {
      res.writeHead(404).end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const err = url.searchParams.get('error');

    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>Authorization failed</h1><pre>${err}: ${url.searchParams.get('error_description') ?? ''}</pre>`);
      console.error(`✗ Upwork returned an error: ${err}`);
      server.close();
      process.exit(1);
    }

    if (returnedState !== state) {
      res.writeHead(400).end('State mismatch — possible CSRF, aborting.');
      console.error('✗ State mismatch.');
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400).end('No code in callback.');
      server.close();
      process.exit(1);
    }

    try {
      const tokens = await exchangeCodeForToken({
        code, redirectUri, clientId, clientSecret,
      });
      await saveTokens(tokens);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Authorized</h1><p>You can close this tab and return to the terminal.</p>');
      console.log('\n✅ Tokens obtained and saved.');
      console.log('   access_token expires in', tokens.expires_in, 'seconds');
      console.log('   scope:', tokens.scope ?? '(none)');
      server.close();
      process.exit(0);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Token exchange failed</h1><pre>${e.message}</pre>`);
      console.error('✗ Token exchange failed:', e.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`\n↪ Local callback server listening on http://localhost:${port}`);
    console.log('  (Upwork will redirect here after you authorize.)\n');
    console.log('────────────────────────────────────────────────────────────');
    console.log(' Open this URL in your browser to authorize:\n');
    console.log(authUrl.toString());
    console.log('────────────────────────────────────────────────────────────');
    console.log('\nWaiting for authorization… (Ctrl+C to cancel)');
  });
}

/**
 * Exchange an authorization code for tokens.
 */
async function exchangeCodeForToken({ code, redirectUri, clientId, clientSecret }) {
  // Upwork requires client_id + client_secret in the BODY, not as Basic auth.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
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
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok || !json.access_token) {
    throw new Error(`token endpoint returned ${res.status}: ${text}`);
  }
  return json;
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
