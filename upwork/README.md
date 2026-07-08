# upwork-agent

OAuth2 client + GraphQL helper for the Upwork API. Validates that your Upwork
app credentials can fetch **job postings**.

## Prerequisites

- Node.js 20.19+.
- Your Upwork OAuth2 app registered at <https://www.upwork.com/developer>.
- Its **redirect URI** must include `http://localhost:3000/callback` (the local
  server this app spins up during the one-time consent).

## Setup

Your secrets already live in `~/.env`:

```
UPWORK_KEY=<oauth2 client id>
UPWORK_SECRET=<oauth2 client secret>
```

Install dependencies before running the dashboard:

```sh
npm install
```

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

### 3. Fetch latest software-development jobs

```sh
npm run jobs:sample
npm run jobs
```

`fetchJobs` does not use keyword search. It fetches Upwork's native latest feed
for the `Web, Mobile & Software Dev` category (`531770282580668418`) with the
GraphQL `RECENCY` sort. Upwork caps each response at 50 jobs, so the 1000-job
run walks 20 pages and writes JSONL plus a summary file under `data/`.

Use [docs/classification-guide.md](docs/classification-guide.md) when assigning
semantic trend tags to fetched jobs.
Use [docs/upwork-ai-agents-profile.md](docs/upwork-ai-agents-profile.md) for
copy-ready Upwork profile text focused on AI agents and workflow automation.

### 4. Run Upwork Dashboard

```sh
npm run dashboard
```

Open <http://studio.tailcc4c77.ts.net:5173>. The personal Upwork dashboard
binds to all local interfaces by default so it is reachable over Tailscale. It
shows only jobs that match the three lanes in [docs/positioning-plan.md](docs/positioning-plan.md):
Market Circuit, Upwork Circuit, and Automation.

The **Refresh** button calls the Upwork API, fetches the latest software-dev
jobs, filters out unrelated work, excludes Market Circuit jobs involving betting,
prediction markets, Polymarket, or options trading, and reconciles the results
into `data/dashboard-lane-jobs.json`.

### 5. Export proposal history

```sh
npm run proposals
npm run proposals -- data/upwork-proposal-history.json
```

This walks every readable freelancer proposal status bucket, deduplicates
overlapping API results by proposal id, and writes a JSON document with a
summary plus full proposal records under `data/`. Each record includes the
proposal cover letter, proposal terms/status/timestamps, and the linked job
posting details that the current OAuth app can read.

## Files

| File | Purpose |
|------|---------|
| `src/config.js`     | Endpoints, env loading (reads `~/.env`), token file path |
| `src/auth.js`       | OAuth2 authorization-code flow + local callback server |
| `src/tokenStore.js` | Save/load/expire-check the access+refresh tokens |
| `src/client.js`     | GraphQL client with automatic token refresh |
| `src/upworkJobs.js` | Shared latest-job GraphQL query and fetch helpers |
| `src/fetchJobs.js`  | Native-recency software-development job exporter |
| `src/dashboardServer.js` | Local dashboard server and API refresh endpoint |
| `src/dashboardStore.js` | Lane-filtered dashboard cache and reconciliation logic |
| `src/positioningLanes.js` | Market Circuit / Upwork Circuit / Automation lane classifier |
| `src/fetchProposalHistory.js` | Freelancer proposal-history JSON exporter |
| `src/me.js`         | Minimal auth smoke test |

## Notes

- Tokens are stored in `~/.upwork-tokens.json` (gitignored).
- Upwork **rotates** refresh tokens — each refresh issues a new one, which we persist.
- The GraphQL jobs schema changes over time. If `fetchJobs` errors on a field,
  the error names it; trim it from `JOB_QUERY` and re-run. Schema reference:
  <https://www.upwork.com/developer/documentation/graphql/api/docs/index.html>
