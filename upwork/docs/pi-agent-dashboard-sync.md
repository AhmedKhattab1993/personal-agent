# Real-Time Pi Agent and cmux Dashboard Sync

Status: Proposed

## Goal

Add an **Agents** tab to the personal dashboard that shows Pi agents and their containing cmux windows, workspaces, panes, and surfaces in near real time.

The integration must support every current and future Agent type without requiring type-specific code, including:

- top-level interactive Pi sessions
- `general-purpose`, `Explore`, and `Plan` agents
- DeepSeek and GLM custom agents
- future custom Markdown-defined agents
- foreground, background, and queued agents
- scheduled agents and each scheduled firing
- resumed, steered, aborted, stopped, completed, and failed runs
- agents that disable extensions or run in an isolated configuration
- dashboard-launched one-shot, JSON, RPC, or SDK-backed agents
- open cmux windows, workspaces, panes, and surfaces, including those without an Agent
- Pi Agents launched outside cmux, grouped as headless or unattached

The first release should be read-only. It should mirror cmux topology and Agent state, not attempt to reproduce a fully interactive terminal. Remote prompting, terminal input, and workspace control can be added later after authentication, authorization, and single-writer behavior are defined.

## Current System Facts

### Pi runtime

A normally started Pi TUI process does not expose a network endpoint that another process can attach to. Pi RPC mode is selected at process startup and communicates over stdin/stdout JSONL.

Pi session JSONL files are useful for durable recovery, but they are not a complete live event source:

- `message_update` streaming deltas are not persisted
- tool execution progress is not persisted
- finalized user, assistant, and tool-result messages are persisted at `message_end`
- agents using `--no-session` have no session file to watch

Session files should therefore be a recovery source, not the primary real-time transport.

### Subagent runtime

The Agent tools in this environment are supplied by `@tintinweb/pi-subagents`. All embedded and custom Agent types share this execution path:

```text
Agent tool or scheduler
  -> AgentManager
  -> runAgent() / resumeAgent()
  -> createAgentSession()
```

Agent type selection changes configuration such as model, prompt, tools, thinking level, extensions, and skills. It does not change the underlying execution engine.

The common implementation points are:

- `AgentManager.startAgent()` for fresh foreground, background, queued, scheduled, and programmatic runs
- `AgentManager.resume()` for resumed runs
- the child `AgentSession` event subscription for messages, tools, turns, compaction, retry, and usage events

Monitoring only through an extension loaded inside each child is insufficient because an Agent definition can disable extensions or request an isolated runtime. Monitoring must occur in the parent Agent manager.

### Dashboard runtime

The dashboard already has the required application boundaries:

- `src/dashboardServer.js` is the local Node.js HTTP server
- `dashboard/src/main.jsx` is the React application and tab navigation
- the dashboard is reachable over the configured Tailscale hostname
- `src/piCli.js` already launches some one-shot Pi jobs and can observe their JSON event output

The dashboard server can host the local agent bridge. If the native cmux application and dashboard server run on different machines, a small companion must run beside cmux and publish state outward; the cmux socket must not be exposed over the network.

### cmux runtime

The inspected environment has the cmux remote CLI/daemon rather than the native macOS application:

- `~/.cmux/bin/cmux` reports version `0.64.19`
- the CLI exposes JSON-capable commands for windows, workspaces, panes, surfaces, focus, terminal screen snapshots, and control
- the configured remote relay was unavailable during inspection with `failed to read relay auth challenge: EOF`, so live capabilities must be negotiated again while the Mac application is connected
- the installed CLI help does not advertise an events command, while current upstream cmux documents `events.stream`; implementation must use capability detection and retain a snapshot-polling fallback

There is no released official browser interface that mirrors the native cmux application. Important distinctions:

- `cmux browser` controls local browser surfaces; it is not a remote cmux UI
- the official iOS/Mobile Connect feature is beta and is not a general web client
- the official `cmux-tui` React/xterm.js frontend uses a separate headless multiplexer and cannot attach to existing native cmux workspaces
- native cmux can return screen snapshots, but it does not expose a released byte-exact continuous PTY stream suitable for recreating the full terminal in a browser

The supported path for exact native rendering is remote desktop over Tailscale. The dashboard should instead provide a cmux-like control-plane view and an **Open in cmux** or remote-desktop action.

Official references:

- [cmux API](https://cmux.com/docs/api)
- [cmux event stream](https://github.com/manaflow-ai/cmux/blob/main/docs/events.md)
- [cmux-tui web frontend](https://github.com/manaflow-ai/cmux/blob/main/cmux-tui/frontends/web/README.md)
- [cmux iOS/Mobile Connect](https://cmux.com/docs/ios)

## Architecture

Use one joined state model with four collection paths:

```text
Native cmux application
  -> local socket / events -> cmux companion ----+
                                                  |
Top-level Pi TUI                                  |
  -> global dashboard-sync extension ------------+
                                                  |
Agent-tool subagents                              +-> local agent bridge
  -> AgentManager telemetry -> pi.events --------+      -> registry and replay buffer
                                                  |      -> browser event stream
Dashboard-launched Pi jobs                        |      -> React Agents/cmux tab
  -> JSON/RPC/SDK event forwarding --------------+
```

cmux is authoritative for window, workspace, pane, surface, and focus state. Pi is authoritative for Agent lifecycle, messages, tools, and usage. The bridge joins the two sources by stable cmux identity captured when a top-level Pi process starts.

### 1. Top-level Pi collector

Create a global Pi extension, for example:

```text
~/.pi/agent/extensions/dashboard-sync/index.ts
```

The extension should observe top-level session and agent events, normalize them, and send them to the local bridge. Relevant events include:

- `session_start`, `session_info_changed`, `session_tree`, and `session_shutdown`
- `agent_start`, `agent_end`, and `agent_settled`
- `turn_start` and `turn_end`
- `message_start`, `message_update`, and `message_end`
- `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`
- model, thinking-level, and compaction changes

The socket must be opened from `session_start`, not from the extension factory, and closed idempotently during `session_shutdown`. Existing Pi processes must run `/reload` or restart after the extension is installed.

### 2. AgentManager collector

Extend `@tintinweb/pi-subagents` at the common manager/runner layer rather than modifying individual Agent definitions.

The package currently emits useful lifecycle events such as `subagents:started`, `subagents:completed`, `subagents:failed`, and `subagents:compacted`, but those events alone do not provide complete coverage. The integration must additionally cover:

- initial creation and queue position
- resumed-run start and completion
- queued agents stopped before session creation
- streamed assistant output
- complete tool start, progress, result, and error information
- steering and abort requests
- session retry, compaction, and usage updates
- scheduled-job identity and firing relationships

`AgentManager.startAgent()` should attach a telemetry subscription to every created child `AgentSession`. `AgentManager.resume()` must pass through the same invocation lifecycle helper so resumed runs do not bypass telemetry.

The subagent package should emit normalized in-process telemetry through `pi.events`. The separate dashboard-sync extension should own networking, reconnection, and authentication.

Do not patch the installed copy under `node_modules`. Use a maintained fork, a pinned Pi package, or an upstream contribution so package updates cannot silently remove the integration.

### 3. Dashboard-owned Pi jobs

Agents launched by the dashboard should publish events directly from their owner:

- use the Pi SDK when the dashboard server owns an in-process session
- use `pi --mode rpc` when process isolation and bidirectional control are required
- forward JSON-mode events for existing one-shot jobs

`src/piCli.js` intentionally runs the goal assistant with `--no-extensions`. Keep that isolation and forward its JSON events from the launcher instead of enabling global extensions in that subprocess.

### 4. cmux collector

Run the collector beside the native cmux application whenever possible. It should:

1. negotiate API capabilities and fetch a complete JSON snapshot
2. subscribe to `events.stream` when supported
3. track the last cmux event sequence and request replay after reconnecting
4. re-enumerate the complete hierarchy after a replay gap
5. fall back to lightweight topology polling when the connected version lacks event streaming
6. publish sanitized topology events to the dashboard bridge over an outbound authenticated connection

Use stable cmux UUIDs as identifiers. Do not persist positional indexes as identity because indexes can change when workspaces or surfaces are reordered.

The normalized topology is:

```text
host -> window -> workspace -> pane -> surface -> top-level Agent -> child Agents
```

A workspace or surface remains visible even when it has no Pi Agent. A Pi process without cmux identity appears under a headless/unattached group. Subagents inherit their top-level parent Agent's cmux placement unless they are launched through a separate terminal runtime.

Screen text from `read-screen` may be offered as an explicitly enabled, bounded preview. It must not be treated as a live terminal transport. Browser interaction with a terminal requires either a future supported PTY stream, a move to a web-native multiplexer, or remote desktop.

## Identity Model

Do not use a session ID as the sole online-agent identity. A process can switch sessions, a session can be resumed later, and a logical Agent can be invoked more than once.

Each telemetry envelope should contain the applicable identifiers:

| Field | Purpose |
|---|---|
| `source` | `cmux`, `tui`, `pi-subagents`, `json`, `rpc`, or `sdk` |
| `hostId` | Machine running cmux or Pi |
| `agentId` | Stable logical Agent record ID |
| `attemptId` | Unique ID for one initial or resumed invocation |
| `sessionId` | Pi conversation/session ID |
| `processInstanceId` | Unique process-start identity for top-level Pi |
| `cmuxWindowId` | Stable native cmux window UUID, when attached |
| `cmuxWorkspaceId` | Stable native cmux workspace UUID, when attached |
| `cmuxPaneId` | Stable native cmux pane UUID, when attached |
| `cmuxSurfaceId` | Stable native cmux surface UUID, when attached |
| `parentAgentId` | Parent Agent when the run is nested |
| `parentSessionId` | Parent Pi session |
| `scheduleId` | Persistent scheduled-job definition, when applicable |
| `toolCallId` | Parent tool call that created the Agent, when applicable |
| `type` | Agent type such as `Explore`, `Plan`, or a custom type |
| `launchMode` | `foreground`, `background`, `scheduled`, or `programmatic` |
| `sequence` | Monotonic sequence within the producing stream |
| `timestamp` | Event creation time |
| `schemaVersion` | Telemetry contract version |

Every scheduled firing receives a new `agentId` and references its persistent `scheduleId`. Every resume receives a new `attemptId` while retaining the logical `agentId` and `sessionId`.

## Agent State Model

The dashboard should preserve both the cmux containment tree and the Agent state machine:

```text
host
└── window
    └── workspace
        └── pane
            └── surface
                └── top-level Agent
                    └── child Agents

created -> queued -> running -> completed
                            -> steered
                            -> aborted
                            -> stopped
                            -> error
```

The dashboard should display at least:

- cmux window, workspace, pane, surface, and focused/selected state
- cmux title and cwd when available
- Agent type and description
- current status and active tool
- launch mode and parent/child relationship
- cwd, model, and thinking level
- elapsed time and last activity
- turns, tool uses, tokens, and cost when available
- streamed assistant output
- final result or error
- schedule name and next run for scheduled definitions

The dashboard must not infer terminal completion from a closed browser connection. Terminal state comes from a final telemetry event or reconciliation snapshot.

## Transport

### Producer to bridge

Use one long-lived authenticated connection per top-level Pi runtime and one per cmux host companion. A WebSocket or local Unix socket is preferred over one HTTP request per token.

AgentManager events are in-process and should first enter the shared `pi.events` bus. The dashboard-sync extension then sends both top-level and subagent telemetry over its connection.

The cmux companion should connect to the native local socket using cmux's existing authentication, then publish sanitized state outward. If the dashboard is on another machine, the companion initiates an outbound authenticated TLS connection; the native cmux socket and relay credentials never leave the host.

### Bridge to browser

Use WebSocket for future bidirectional control. Server-Sent Events are also acceptable for a strictly read-only first release.

The bridge should expose:

- a current agent snapshot endpoint
- a live event endpoint
- optional historical attempts and finalized transcript endpoints

Exact endpoint names should be selected during implementation and covered by server tests.

## Reliability Requirements

### Ordering and deduplication

- Assign a monotonic `sequence` per producer stream.
- Give every event a stable deduplication key.
- Preserve tool correlation through `toolCallId` because parallel tool updates can interleave.
- Treat finalized `message_end` and terminal lifecycle events as authoritative.

### Reconnection and recovery

- Producers maintain a bounded non-blocking outbox.
- The bridge acknowledges the highest contiguous sequence received.
- Producers reconnect with exponential backoff and resend unacknowledged events.
- On connection or sequence gaps, send a full current snapshot before continuing deltas.
- After a cmux replay gap, re-enumerate windows, workspaces, panes, and surfaces and replace the bridge's cmux snapshot atomically.
- When cmux event streaming is unavailable, poll only topology and focus at a bounded interval; do not poll full terminal screens continuously.
- Use finalized session entries as a recovery source when a persistent session exists.
- Persist final state in the bridge for `--no-session` agents that have no JSONL recovery source.

### Performance and failure isolation

- Never await network delivery in Pi lifecycle handlers.
- Enqueue events and return immediately so dashboard failure cannot slow an Agent.
- Coalesce assistant and tool streaming updates into 30-100 ms batches.
- Bound queues by event count and byte size.
- Never drop terminal events; intermediate deltas may be replaced by a newer accumulated snapshot.
- Use heartbeats and mark disconnected processes stale after a lease timeout.
- A telemetry or dashboard error must not block, abort, or modify Agent execution.

## Security

Pi and its extensions run with the permissions of the local user. Agent prompts and tools can read files, expose credentials, modify repositories, and execute commands. The telemetry channel is therefore sensitive.

Required protections:

- accept producer connections only over loopback or a Unix socket
- authenticate every producer connection
- authenticate dashboard viewers even when transport is provided by Tailscale
- validate browser origin and protect any future mutation endpoints against CSRF
- never expose raw Pi RPC or the cmux socket directly to the network
- treat cmux read-screen, send-key, send-text, focus, create, and close operations as privileged shell/session access
- keep cmux relay credentials on the cmux host with user-only filesystem permissions
- redact secrets from terminal previews, tool arguments, output, paths, and provider errors
- exclude model thinking content by default
- cap transcript and tool payload sizes
- keep the first release read-only
- audit every future prompt, steer, abort, or session-control action

If remote control is added, define one authoritative writer. A TUI and dashboard must not send competing commands to the same Agent without explicit queue and ownership rules.

## Package and Upgrade Strategy

The Agent implementation is currently provided by the installed `@tintinweb/pi-subagents` package. Direct edits under the Pi npm installation are not durable.

Choose one of these supported paths:

1. contribute generic telemetry hooks upstream and pin the first compatible release
2. maintain a small fork installed as a pinned Git Pi package
3. use a temporary patch only during development, never as the deployed solution

The emitted telemetry contract should remain generic and dashboard-independent so other extensions can consume it.

## Implementation Phases

### Phase 1: Read-only lifecycle and topology

- define and test the normalized Agent and cmux event schemas
- add complete AgentManager lifecycle telemetry, including resume and queue cancellation
- create the global dashboard-sync extension
- build the cmux companion with snapshot enumeration and capability detection
- add the local bridge registry and browser event stream
- add an Agents tab with cmux hierarchy, Agent cards, focus state, and terminal status
- group agents without cmux placement as headless/unattached

### Phase 2: Live activity and recovery

- subscribe to cmux events when supported and implement bounded topology polling otherwise
- stream assistant text with batching
- show tool execution and bounded output
- add Agent and cmux snapshot/replay recovery
- add usage, compaction, retry, and scheduled-run details
- add an **Open in cmux** or remote-desktop action instead of browser terminal emulation

### Phase 3: Durability and history

- persist finalized attempts and terminal state
- reconcile persistent Pi sessions after bridge restarts
- retain final output for in-memory and `--no-session` runs
- retain the last known cmux placement when a surface closes during an active run
- provide filters for Agent type, project, cmux workspace, status, and time

### Phase 4: Optional control

Only after a security review:

- focus an existing cmux workspace or surface
- prompt dashboard-owned RPC or SDK agents
- steer or abort an active Agent
- resume a completed Agent
- manage scheduled definitions
- enforce ownership, authorization, and an audit log

Do not add browser terminal input through `send` or `send-key` as a shortcut around the missing live PTY stream.

## Complexity and Delivery Scope

The read-only design is moderate engineering work rather than a new terminal product. The hard parts are lifecycle completeness, cross-machine deployment, reconnection, security, and joining cmux and Pi identity.

Approximate effort for one experienced developer:

| Scope | Complexity | Approximate effort |
|---|---|---:|
| Agent list, status, and hierarchy | Moderate | 3-5 days |
| cmux windows, workspaces, panes, and surfaces | Moderate | 2-4 additional days |
| Live transcripts, tools, snapshot, and replay | Medium-high | 4-7 additional days |
| Remote focus, steering, abort, and scheduling | High | 3-7 additional days plus security review |
| Exact interactive browser terminal matching native cmux | Very high | Several weeks or months; not recommended |
| Exact native cmux through remote desktop | Low | 1-2 days of setup |

A robust read-only first release is therefore a roughly one-to-two-week project. Reimplementing cmux in the browser is explicitly outside this design.

## Acceptance Criteria

The design is complete when all of the following are verified:

1. Every embedded Agent type appears without type-specific dashboard code.
2. DeepSeek, GLM, and a newly added custom Markdown Agent appear automatically.
3. Foreground, background, queued, scheduled, and resumed invocations are represented correctly.
4. Agents with extensions disabled are still visible through AgentManager telemetry.
5. Top-level interactive Pi sessions appear after extension startup or `/reload`.
6. Every open cmux window, workspace, pane, and surface appears even when it contains no Agent.
7. Pi Agents are joined to stable cmux UUIDs; unattached Agents appear in a headless group.
8. cmux focus and topology changes synchronize through events or the documented polling fallback.
9. A cmux replay gap triggers complete re-enumeration without duplicate or orphaned objects.
10. Assistant text and parallel tool activity update without polling Pi session files.
11. A dashboard, cmux companion, or network outage does not slow or fail an Agent.
12. Reconnection restores current state without duplicate terminal records.
13. `--no-session` agents retain their final state in the dashboard bridge.
14. The browser cannot access raw Pi RPC, the cmux socket, or unauthenticated producer endpoints.
15. Existing goal-assistant isolation through `--no-extensions` remains intact.
16. Package upgrades cannot silently overwrite the telemetry implementation.
17. The first release does not claim to provide a live interactive native-cmux terminal in the browser.
