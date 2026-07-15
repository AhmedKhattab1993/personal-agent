# upwork-agent

OAuth2 client + GraphQL helper for the Upwork API. Validates that your Upwork
app credentials can fetch **job postings**.

## Prerequisites

- Node.js 20.19+.
- Your Upwork OAuth2 app registered at <https://www.upwork.com/developer>.
- Its **redirect URI** must include `http://localhost:3000/callback` (the local
  server this app spins up during the one-time consent).

## Setup

Create the repository-specific credential file at `~/.personal-agent/.env`:

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
> Set `REDIRECT_URI` / `PORT` in `~/.personal-agent/.env` if you use a different port/URL.

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

Open <http://studio.tailcc4c77.ts.net:5173>. The personal dashboard binds to all
local interfaces by default so it is reachable over Tailscale. Its **Upwork**
tab shows only jobs that match the three lanes in [docs/positioning-plan.md](docs/positioning-plan.md):
Market Circuit, Work Circuit, and Automation.

The server refreshes automatically every hour. The **Refresh** button uses the
same Upwork API path on demand, fetching the latest software-dev jobs, filtering
out unrelated work, excluding Market Circuit jobs involving betting, prediction
markets, Polymarket, or options trading, and reconciling the results into
`data/dashboard-lane-jobs.json`.

The **Projects** tab is a local planning system for agent-ready work. Link each
project to an existing directory on disk, then define goals by desired outcome,
definition of done, and explicit non-goals. Goals move through Backlog, Ready,
In progress, Blocked, and Done, and can be copied as a directory-aware agent
brief. Planning data is stored in `data/planning-board.json`.

Opening the goal editor also opens a PI goal partner beside the form. PI runs
with the selected project directory as its working directory and only the
read-only `read`, `grep`, `find`, and `ls` tools; sessions, context files,
extensions, skills, shell execution, and write/edit tools are disabled. It can
investigate repository evidence, discuss the goal, and directly fill validated
goal fields as the conversation becomes clearer. Optional model, thinking, and
timeout overrides are `PI_GOAL_ASSISTANT_MODEL`,
`PI_GOAL_ASSISTANT_THINKING`, and `PI_GOAL_ASSISTANT_TIMEOUT_MS`.

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
| `src/config.js`     | Endpoints, env loading (reads `~/.personal-agent/.env`), token file path |
| `src/auth.js`       | OAuth2 authorization-code flow + local callback server |
| `src/tokenStore.js` | Save/load/expire-check the access+refresh tokens |
| `src/client.js`     | GraphQL client with automatic token refresh |
| `src/upworkJobs.js` | Shared latest-job GraphQL query and fetch helpers |
| `src/fetchJobs.js`  | Native-recency software-development job exporter |
| `src/dashboardServer.js` | Local dashboard server and API refresh endpoint |
| `src/dashboardStore.js` | Lane-filtered dashboard cache and reconciliation logic |
| `src/planningStore.js` | Directory validation and local project/goal persistence |
| `src/piGoalAssistant.js` | Read-only PI project investigator and goal-field response validation |
| `src/positioningLanes.js` | Market Circuit / Work Circuit / Automation lane classifier |
| `src/fetchProposalHistory.js` | Freelancer proposal-history JSON exporter |
| `src/me.js`         | Minimal auth smoke test |

## Notes

- Tokens are stored in `~/.upwork-tokens.json` (gitignored).
- Upwork **rotates** refresh tokens — each refresh issues a new one, which we persist.
- The GraphQL jobs schema changes over time. If `fetchJobs` errors on a field,
  the error names it; trim it from `JOB_QUERY` and re-run. Schema reference:
  <https://www.upwork.com/developer/documentation/graphql/api/docs/index.html>
