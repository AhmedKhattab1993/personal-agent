# Agent Guidelines

## Applicability

- These guidelines govern project development and maintenance work, including changes to code, tests, configuration, tooling, and technical documentation.
- If a repository supports content generation, follow its repository-specific content-generation skills and workflow instructions for that activity.

## Simplicity-First Engineering

- Prefer the simplest design that fully satisfies the current requirement.
- Do not add abstractions, extension points, configuration, or features for hypothetical future needs.
- Choose obvious, maintainable code over clever or overly generic code.
- Remove obsolete code instead of preserving compatibility paths unless compatibility is explicitly required.
- Fail fast when an unsupported path is used instead of silently falling back.
- Add complexity only when there is concrete evidence it reduces real duplication, risk, or operational cost.
- Follow KISS, YAGNI, Occam's Razor, Lean waste reduction, and XP simple design principles.

## Development Workflow

### Repository Orientation

- Read the root `README.md`, when present, before making changes.
- Treat the root README's `## Agent Instructions` section as the mandatory repository-specific operating rules.
- Follow any additional instructions found in `CONTRIBUTING.md` or relevant package documentation.
- Update `README.md` only for high-level changes to the project structure, public contracts, architecture, or workflow expectations.
- Do not update `README.md` for routine implementation details, small refactors, or bug fixes.

### Design and Verification

- Do not add ad hoc scripts for work expected to be reused. Determine the appropriate integration point in the existing workflow.
- Run focused, relevant checks for every change.
- Report checks that could not be run and explain why.
- Do not modify, discard, or commit unrelated changes already present in the working tree.

### Git Workflow

- After completing requested code or documentation changes, run the relevant checks, commit the completed work, and push the implementation branch to its configured remote unless the user explicitly says not to.
- If committing or pushing is impossible because of repository configuration, authentication, network access, or branch protections, report the blocker explicitly.
- Keep commits focused and use concise, specific commit messages.
- Exclude unrelated working-tree changes from commits.

#### Default Checkout and Optional Worktrees

- By default, perform implementation directly in the repository's primary checkout on its default branch. Do not create or switch branches, create worktrees, or fork the task unless the user explicitly requests worktree use.
- Task complexity, duration, or potential parallelism does not by itself authorize worktrees.
- When the user explicitly requests a worktree or worktrees, analyze the requested work and use the smallest useful number:
  - Use one worktree for one cohesive implementation or changes that overlap substantially.
  - Use multiple worktrees only for genuinely independent workstreams that can be implemented, verified, committed, and integrated separately.
  - Do not split tightly coupled work merely to create parallel activity.
- If worktrees were not authorized and the primary checkout cannot be used safely, report the exact conflict and ask for direction rather than creating a branch or worktree automatically.
- When worktrees are explicitly authorized:
  1. Continue in an existing correct worktree when one already owns the task; do not create another merely because implementation begins or discussion continues.
  2. Define the independent workstreams and their integration order before creating multiple worktrees.
  3. Move each implementation workstream into its own Codex-managed worktree task based on the default branch.
  4. Send each worktree task a complete prompt containing its scope, agreed requirements, relevant decisions, required verification, and any explicitly requested Codex goal objective and token budget.
  5. Create or reuse one task-specific `codex/` branch in each worktree before modifying files.
  6. Keep implementation, verification, commits, and pushes in the owning worktree task. The original task coordinates and must not modify project files.

#### Direct Work on the Default Branch

- Confirm that the primary checkout is already on the repository's default branch. If it is not, report the mismatch rather than switching branches automatically.
- Inspect the working tree before making changes.
- Preserve and exclude unrelated user changes.
- If unrelated changes overlap files required by the task, stop and ask for direction.
- Stage only task-related files.
- Never force-push, discard user changes, or rewrite existing commits.
- Commit and push the default branch after verification unless the user explicitly says not to.
- If the local branch is behind, diverged, or rejected by branch protection, report the condition instead of reconciling it destructively.

#### Codex Goal Ownership

- Codex goals are task-local state and belong to the task performing the implementation.
- Under the default direct-checkout workflow, create and manage an explicitly requested Codex goal in the current task.
- When worktrees are explicitly requested and implementation moves to a worktree task, the original task must not call `create_goal`. Pass the exact objective and any explicitly requested token budget to the owning worktree task, which creates the goal as its first action before implementation.
- The original task waits for goal-creation confirmation before treating the handoff as complete. Only the owning worktree task may update, complete, or block that goal.
- With multiple worktree tasks, do not duplicate one goal across tasks. Create separate goals only when the user explicitly requests them; ask for direction when ownership of a requested goal is ambiguous.
- Do not create duplicate or mirrored goals in coordinating tasks.
- These rules apply to Codex task goals, not application, domain, or planning goals stored by a repository.

## Codex-Specific Tooling

### Image Generation

- For image generation or editing, use the Codex CLI and explicitly invoke its `imagegen` skill, for example: `codex exec '$imagegen Generate ...'`.
- Follow the skill's workflow and save final project assets inside the repository.
- Do not substitute handwritten SVG, HTML, or other placeholders when the request requires a generated raster image.
