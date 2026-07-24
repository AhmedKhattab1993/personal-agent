# personal-agent

Personal automation workspace for planning work, operating Upwork workflows,
and adding future agent capabilities.

Personal Agent manages all repositories in the `projects/` folder. Users may
ask questions about those projects or plan work across them, and Personal Agent
should access the relevant project repository whenever repository context is
needed. When a user asks Personal Agent to perform an operation supported by
the server, Personal Agent should use the authenticated server API.

## Managed projects

All managed repositories live under `~/projects/`:

| Project | Path | Description |
|---------|------|-------------|
| Daniel-HumbleBot | `~/projects/Daniel-HumbleBot` | HumbleBot/Nexora algorithmic-trading platform with screening, backtesting, optimization, Lean execution, and a web application. |
| Halla We Tasa | `~/projects/halla-we-tasa` | Arabic short-video production runtime with creative contracts, narration, HyperFrames motion design, validation, delivery, and social publishing. |
| Market Circuit | `~/projects/market-circuit` | Brand workspace for market intelligence, trading research, educational content, workflow documentation, and visual assets. |
| Personal Agent | `~/projects/personal-agent` | Central planning and automation application with repository-aware goals, an authenticated web interface, and Upwork workflows. |
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

Market Circuit and Work Circuit are maintained in separate sibling repositories. Their positioning lanes and references remain part of the Upwork feature.
