# upwork-agent

OAuth2 client + GraphQL helper for the Upwork API. Validates that your Upwork
app credentials can fetch **job postings**.

## Prerequisites

- Your Upwork OAuth2 app registered at <https://www.upwork.com/developer>.
- Its **redirect URI** must include `http://localhost:3000/callback` (the local
  server this app spins up during the one-time consent).

## Setup

Your secrets already live in `~/.env`:

```
UPWORK_KEY=<oauth2 client id>
UPWORK_SECRET=<oauth2 client secret>
```

No dependencies to install — this uses Node 18+ built-ins only.

## Usage

### 1. Authorize (one-time, per app)

```sh
node src/auth.js
```

This prints a consent URL. Open it, log into Upwork, approve. Upwork redirects
to the local server, which exchanges the code and saves tokens to
`~/.upwork-tokens.json`.

> The redirect URI must match what's registered on the app. Set
> `REDIRECT_URI` / `PORT` in `~/.env` if you used a different port/URL.

### 2. Smoke-test the token

```sh
node src/me.js
```

### 3. Fetch jobs

```sh
node src/fetchJobs.js "react node" 10
```

## Files

| File | Purpose |
|------|---------|
| `src/config.js`     | Endpoints, env loading (reads `~/.env`), token file path |
| `src/auth.js`       | OAuth2 authorization-code flow + local callback server |
| `src/tokenStore.js` | Save/load/expire-check the access+refresh tokens |
| `src/client.js`     | GraphQL client with automatic token refresh |
| `src/fetchJobs.js`  | Example job-search query |
| `src/me.js`         | Minimal auth smoke test |

## Notes

- Tokens are stored in `~/.upwork-tokens.json` (gitignored).
- Upwork **rotates** refresh tokens — each refresh issues a new one, which we persist.
- The GraphQL jobs schema changes over time. If `fetchJobs` errors on a field,
  the error names it; trim it from `JOB_QUERY` and re-run. Schema reference:
  <https://www.upwork.com/developer/documentation/graphql/api/docs/index.html>
