# Personal Agent server

Authenticated local server and shared web interface for the Personal Agent.

## Features

- **Planning** manages directory-backed projects and outcome-oriented goals.
- **Upwork** handles OAuth, job discovery, opportunity classification, proposal
  drafting, and proposal-history exports.

Feature-specific code and commands use the `planning` or `upwork` namespace.
The server and web interface remain feature-neutral so more capabilities can be
added without renaming the application again.

## Prerequisites

- Node.js 20.19 or newer.
- An Upwork OAuth2 app registered at <https://www.upwork.com/developer>.
- An Upwork redirect URI containing `http://localhost:3000/callback`, unless a
  different callback is configured.

## Setup

Create the Personal Agent credential file at `~/.personal-agent/.env`:

```dotenv
UPWORK_KEY=<oauth2 client id>
UPWORK_SECRET=<oauth2 client secret>
SERVER_SECRET=<long random value from `openssl rand -hex 32`>
```

Copy the additional optional settings from [`.env.example`](.env.example), then
install dependencies:

```sh
npm install
```

## Run the server

```sh
npm run server
```

Open <http://studio.tailcc4c77.ts.net:5173> and sign in with username `agent`
and `SERVER_SECRET` as the password. The server fails closed when the secret is
missing. It binds to all local interfaces by default for Tailscale access.

The repository includes user services under [`../systemd`](../systemd):

- `personal-agent-server.service` runs the authenticated server.
- `personal-agent-web-build.service` keeps the production frontend build fresh.

## Planning

The **Planning** feature links projects to existing directories and defines work
by desired outcome, completion criteria, and explicit non-goals. Goals move
through Backlog, Ready, In progress, Blocked, and Done and can be copied as
directory-aware agent briefs.

Planning data lives in the Git-tracked `data/planning-board.json` so projects
and goals survive machine migrations. Home-relative paths are stored with `~/`
and resolved for the current machine.

The goal editor includes a read-only PI goal partner. PI runs in the selected
project directory with only read, grep, find, and ls access. Optional overrides
are `PI_GOAL_ASSISTANT_MODEL`, `PI_GOAL_ASSISTANT_THINKING`, and
`PI_GOAL_ASSISTANT_TIMEOUT_MS`.

## Upwork

### Authorize once

```sh
npm run upwork:auth
```

The command prints a consent URL, receives the local callback, and stores
rotating tokens in `~/.upwork-tokens.json`.

### Verify access

```sh
npm run upwork:me
```

### Fetch jobs

```sh
npm run upwork:jobs:sample
npm run upwork:jobs
```

The full job command walks Upwork's native Web, Mobile & Software Dev feed and
writes JSONL plus a summary under `data/`. The server separately maintains the
72-hour, lane-filtered opportunity cache in `data/upwork-jobs.json` and refreshes
it automatically every hour.

The Upwork view classifies opportunities into the lanes documented in
[`docs/upwork/positioning-plan.md`](docs/upwork/positioning-plan.md). Market
Circuit and Work Circuit remain separate projects; their names here are routing
lanes, not names for the Personal Agent.

### Reclassify cached jobs

```sh
npm run upwork:reclassify
```

### Export proposal history

```sh
npm run upwork:proposals
npm run upwork:proposals -- data/upwork-proposal-history.json
```

## HTTP API

Browser and agent clients use the same HTTP Basic authentication. `GET /api`
returns server status and the machine-readable action list.

After exporting `SERVER_SECRET`:

```sh
curl --user "agent:$SERVER_SECRET" http://studio.tailcc4c77.ts.net:5173/api
curl --user "agent:$SERVER_SECRET" http://studio.tailcc4c77.ts.net:5173/api/planning
curl --user "agent:$SERVER_SECRET" http://studio.tailcc4c77.ts.net:5173/api/upwork/jobs
curl --user "agent:$SERVER_SECRET" -X POST http://studio.tailcc4c77.ts.net:5173/api/upwork/jobs/refresh
```

Keep the HTTP server limited to localhost or the encrypted Tailscale network;
HTTP Basic credentials are not safe over untrusted plaintext networks.

## Layout

| Path | Purpose |
|------|---------|
| `src/server.js` | Shared HTTP server, authentication, API routing, and static delivery |
| `src/env.js` | Shared Personal Agent environment loading |
| `src/planning/` | Planning persistence and goal-assistant behavior |
| `src/upwork/` | Upwork OAuth, GraphQL, jobs, classification, and proposal tooling |
| `src/piCli.js` | Shared PI command integration |
| `web/` | Shared React frontend for Planning and Upwork |
| `docs/upwork/` | Upwork positioning and profile references |
| `data/planning-board.json` | Versioned planning state |
| `data/upwork-jobs.json` | Ignored runtime cache for Upwork opportunities |

## Notes

- Upwork rotates refresh tokens; each refreshed token is persisted.
- The GraphQL schema changes over time. When a field is rejected, remove it
  from the query and retry. See the
  [Upwork GraphQL reference](https://www.upwork.com/developer/documentation/graphql/api/docs/index.html).
