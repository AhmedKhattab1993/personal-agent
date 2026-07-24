# personal-agent

Personal automation workspace for planning work, operating Upwork workflows,
and adding future agent capabilities.

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
