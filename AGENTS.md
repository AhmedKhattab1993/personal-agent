# Agent Guidelines

## Generic Agent Guidelines

### Applicability

- These guidelines govern project development and maintenance work, including changes to code, tests, configuration, tooling, and technical documentation.
- If a repository supports content generation, these guidelines do not govern the content-generation activity itself. Follow the repository-specific content-generation skills and workflow instructions instead.

### Primary Agent Role

- The primary agent owns the work end to end: user communication, scope, investigation strategy, hypotheses, planning, architecture, tradeoffs, sequencing, decisions, synthesis, and the final response.
- Answer quick user questions directly. Perform small, obvious, low-risk reads, edits, commands, and checks directly when delegation would cost more than the work.
- Lead complex investigations and reasoning. Use multiple subagents in parallel for targeted evidence gathering, then evaluate their findings, resolve conflicts, and decide the path forward; never delegate synthesis or cross-cutting decisions.
- Before implementation, define the simplest design, affected files, behavioral boundaries, invariants, and verification plan. Delegate bounded implementation tasks with explicit file names, instructions, and definitions of done; the primary agent reviews and integrates the results.
- Decompose independent work to maximize useful parallelism without overlapping files or decisions. Match agent depth to task risk and launch dependent follow-ups promptly.
- Delegate broad repository searches, routine execution, and long-running tests, builds, benchmarks, or runs while retaining active supervision and ownership of outcomes.
- If delegation is unavailable, continue any work that can be completed safely and report only genuine blockers.

### Background Delegation and Supervision

- Use only GLM models for subagents. Do not launch a subagent with any non-GLM model.
- Use foreground subagents only for short tasks whose results are immediately required. Run long explorations, tests, builds, benchmarks, or other independent work in the background.
- Launch independent parallel assignments together. Record every background agent ID and continue unrelated work rather than blocking on completion.
- Do not poll or sleep while background work runs. Supervise through completion notifications and retrieve a result when it is needed for synthesis.
- Steer a running background agent when its scope, direction, or assignment needs correction.
- The primary agent must enforce dependency ordering, review every result, and verify any changes made by a subagent before reporting completion.
- Stop relying on nonessential background work when it is no longer needed.

### Simplicity-First Engineering

- Prefer the simplest design that fully satisfies the current requirement.
- Do not add abstractions, extension points, configuration, or features for hypothetical future needs.
- Choose obvious, maintainable code over clever or overly generic code.
- Remove obsolete code instead of preserving compatibility paths unless compatibility is explicitly required.
- Fail fast when an unsupported path is used instead of silently falling back.
- Add complexity only when there is concrete evidence it reduces real duplication, risk, or operational cost.
- Follow KISS, YAGNI, Occam's Razor, Lean waste reduction, and XP simple design principles.

### Git Workflow

- After making requested code or documentation changes, run the relevant checks, commit the completed work, and push the current branch to its tracked remote unless the user explicitly says not to commit or push.
- Do not stop after editing or verification. If a push is impossible because the repository has no tracked remote or because authentication or network access fails, report that blocker explicitly.
- Keep commits focused, use concise and specific commit messages, and exclude unrelated working-tree changes.

## Repository Guidelines

### Agent Selection and Reporting
- Before delegating work, inspect `~/.pi/agent/agents/*.md` and choose the agent whose description best matches the task.
- Every subagent must read `README.md` before starting its assignment and follow all repository instructions in this file.
- Require subagents to report the files inspected or changed, commands run, verification results, risks, and unresolved questions. The primary agent reviews those reports, resolves cross-cutting decisions, and delegates follow-up work when needed.

### Startup and README Rules
- Read `README.md` before making changes so the repository layout and workflow expectations are loaded first.
- Update `README.md` only for high-level changes to the project shape, public contracts, architecture, or workflow expectations.
- Do not update `README.md` for routine implementation details, small refactors, bug fixes, or other low-level changes.

### Design and Verification Rules
- Never add ad hoc scripts for work expected to be reused. First determine the best integration point in the existing workflow, then implement the capability there.
- Run focused, relevant checks for every change. Report any checks that could not be run and why.
- Do not modify, discard, or commit unrelated user changes already present in the working tree.

### Image Generation
- For image generation or image editing, use the Codex CLI and explicitly invoke its `imagegen` skill (for example, `codex exec '$imagegen Generate ...'`).
- Follow the skill's own workflow and save final project assets inside the repository; do not substitute hand-written SVG, HTML, or other placeholders when the request calls for a generated raster image.

### Working Directory and Worktrees
- All primary-agent and subagent repository work must occur in the current main repository directory supplied by the harness.
- Creating or using additional git worktrees, task-specific worktrees, sibling clones, or alternate checkouts is prohibited.
- Agents share the main checkout, must partition non-overlapping file ownership, and must serialize overlapping mutations.
- If the main checkout cannot be used safely, report the blocker instead of creating another checkout.

### Git Workflow
- After completing code or documentation changes, commit them and push the current branch to its tracked remote unless the user explicitly says not to.
- Keep commits focused and exclude unrelated working-tree changes.
