# Real-Time Pi Agent Dashboard Sync

Status: Proposed

## Goal

Add an **Agents** tab to the personal dashboard that shows Pi agents running on the local machine in near real time.

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

The first release should be read-only. Remote prompting and agent control can be added later after authentication, authorization, and single-writer behavior are defined.

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

The dashboard server can host the local agent bridge; a separate daemon is not required initially.

## Architecture

Use one event schema with three collection paths:

```text
Top-level Pi TUI
  -> global dashboard-sync extension -----------+
                                                  |
Agent-tool subagents                              |
  -> AgentManager telemetry -> pi.events --------+-> local agent bridge
                                                  |      -> registry and replay buffer
Dashboard-launched Pi jobs                        |      -> browser event stream
  -> JSON/RPC/SDK event forwarding --------------+      -> React Agents tab
```

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

## Identity Model

Do not use a session ID as the sole online-agent identity. A process can switch sessions, a session can be resumed later, and a logical Agent can be invoked more than once.

Each telemetry envelope should contain the applicable identifiers:

| Field | Purpose |
|---|---|
| `source` | `tui`, `pi-subagents`, `json`, `rpc`, or `sdk` |
| `agentId` | Stable logical Agent record ID |
| `attemptId` | Unique ID for one initial or resumed invocation |
| `sessionId` | Pi conversation/session ID |
| `processInstanceId` | Unique process-start identity for top-level Pi |
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

The normalized dashboard state should support:

```text
created -> queued -> running -> completed
                            -> steered
                            -> aborted
                            -> stopped
                            -> error
```

The dashboard should display at least:

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

Use one long-lived authenticated connection per top-level Pi runtime. A WebSocket or local Unix socket is preferred over one HTTP request per token.

AgentManager events are in-process and should first enter the shared `pi.events` bus. The dashboard-sync extension then sends both top-level and subagent telemetry over its connection.

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
- never expose raw Pi RPC directly to the network
- redact secrets from tool arguments, output, paths, and provider errors
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

### Phase 1: Read-only lifecycle

- define and test the normalized event schema
- add complete AgentManager lifecycle telemetry, including resume and queue cancellation
- create the global dashboard-sync extension
- add the local bridge registry and browser event stream
- add an Agents tab with cards, hierarchy, and terminal status

### Phase 2: Live transcript and tools

- stream assistant text with batching
- show tool execution and bounded output
- add snapshot/replay recovery
- add usage, compaction, retry, and scheduled-run details

### Phase 3: Durability and history

- persist finalized attempts and terminal state
- reconcile persistent Pi sessions after bridge restarts
- retain final output for in-memory and `--no-session` runs
- provide filters for Agent type, project, status, and time

### Phase 4: Optional control

Only after a security review:

- prompt dashboard-owned RPC or SDK agents
- steer or abort an active Agent
- resume a completed Agent
- manage scheduled definitions
- enforce ownership, authorization, and an audit log

## Acceptance Criteria

The design is complete when all of the following are verified:

1. Every embedded Agent type appears without type-specific dashboard code.
2. DeepSeek, GLM, and a newly added custom Markdown Agent appear automatically.
3. Foreground, background, queued, scheduled, and resumed invocations are represented correctly.
4. Agents with extensions disabled are still visible through AgentManager telemetry.
5. Top-level interactive Pi sessions appear after extension startup or `/reload`.
6. Assistant text and parallel tool activity update without polling session files.
7. A dashboard or network outage does not slow or fail an Agent.
8. Reconnection restores current state without duplicate terminal records.
9. `--no-session` agents retain their final state in the dashboard bridge.
10. The browser cannot access raw Pi RPC or unauthenticated producer endpoints.
11. Existing goal-assistant isolation through `--no-extensions` remains intact.
12. Package upgrades cannot silently overwrite the telemetry implementation.
