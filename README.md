# personal-agent

Personal automation workspace for planning work, operating Upwork workflows,
and adding future agent capabilities.

Personal Agent manages all repositories in the `projects/` folder. Users may
ask questions about those projects, request work in them, or plan work across
them. Project work is routed to a Codex task scoped to the relevant repository.
Operations supported by the Personal Agent server use its authenticated API.

## Managed projects

All managed repositories live under `~/projects/`:

| Project | Path | Description |
|---------|------|-------------|
| Daniel-HumbleBot | `~/projects/Daniel-HumbleBot` | HumbleBot/Nexora algorithmic-trading platform with screening, backtesting, optimization, Lean execution, and a web application. |
| Galata Beans | `~/projects/galata-beans` | Project workspace. |
| Halla We Tasa | `~/projects/halla-we-tasa` | Arabic short-video production runtime with creative contracts, narration, HyperFrames motion design, validation, delivery, and social publishing. |
| Maarood | `~/projects/maarood` | Project workspace. |
| Market Circuit | `~/projects/market-circuit` | Brand workspace for market intelligence, trading research, educational content, workflow documentation, and visual assets. |
| Personal Agent | `~/projects/personal-agent` | Central planning and automation application with repository-aware goals, an authenticated web interface, and Upwork workflows. |
| Qayem | `~/projects/qayem` | Project workspace. |
| Sizzle Whisper | `~/projects/sizzle-whisper` | Project workspace. |
| The Ultimate Core | `~/projects/theultimate-core` | Quantitative-trading research and execution runtime with causal features, XGBoost training, Rust scoring, Nautilus execution, and promotion evidence. |
| Work Circuit | `~/projects/work-circuit` | Brand workspace for AI jobs, products, agents, LLM workflows, automation, video work, and visual assets. |

## Naming convention

Names describe scope:

| Scope | Name | Meaning |
|-------|------|---------|
| Whole system | `personal-agent` | This repository and all personal-agent capabilities |
| Runnable application | `server` | The authenticated HTTP API and shared web interface |
| Product capability | `planning` | Projects, goals, and agent-ready work planning |
| External integration | `upwork` | Upwork OAuth, jobs, proposals, and opportunity tooling |
| Browser client | `web` | The frontend shared by the planning and Upwork features |

Generic runtime code belongs directly under `server/`. Feature-specific code,
API routes, commands, and documentation use the `planning` or `upwork`
namespace. Do not use `dashboard` as a synonym for the whole server.

## Layout

| Path | Purpose |
|------|---------|
| `server/` | Personal Agent server, web interface, planning feature, and Upwork feature |
| `systemd/` | User-service definitions that keep the server and production web build running |

See [`server/README.md`](server/README.md) for setup, server operation, and
feature-specific commands.

All managed projects except Personal Agent are maintained in sibling
repositories. Market Circuit and Work Circuit positioning lanes and references
remain part of the Upwork feature.

## Agent Instructions

### Project Task Routing

- When a user asks for work in a managed project, create a new Codex task rooted
  in that project's directory and hand the request to it. Do not perform the
  project work directly from the Personal Agent task.
- Keep the original task as the coordinator when it needs to relay context,
  follow progress, or report the project task's result.
- For dashboard goal planning, use the authenticated Personal Agent API. When
  creating or editing a goal requires repository context or other missing
  information, a project-scoped Codex task may inspect the relevant repository
  and return that context before the goal is created or updated.

### Application Structure

- The runnable application lives under `server/`.
- Keep feature-specific code, API routes, commands, and documentation in the `planning` or `upwork` namespace. Keep shared runtime code directly under `server/`.
- Treat `server/data/planning-board.json` as user-owned planning state. Modify it only when the requested work changes planning data.

### Verification

- Run `npm test` from `server/` after server, planning, Upwork, or shared frontend logic changes.
- Run `npm run web:build` from `server/` after frontend or production-build changes.
