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
- Follow any repository-specific instructions found in `AGENTS.md`, `CONTRIBUTING.md`, or relevant package documentation.
- Update `README.md` only for high-level changes to the project structure, public contracts, architecture, or workflow expectations.
- Do not update `README.md` for routine implementation details, small refactors, or bug fixes.

### Design and Verification

- Do not add ad hoc scripts for work expected to be reused. Determine the appropriate integration point in the existing workflow.
- Run focused, relevant checks for every change.
- Report checks that could not be run and explain why.
- Do not modify, discard, or commit unrelated changes already present in the working tree.

### Git Workflow

- After completing requested code or documentation changes, run the relevant checks, commit the completed work, and push the task branch to its tracked remote unless the user explicitly says not to.
- If committing or pushing is impossible because of repository configuration, authentication, network access, or branch protections, report the blocker explicitly.
- Keep commits focused and use concise, specific commit messages.
- Exclude unrelated working-tree changes from commits.

#### Worktrees and Branches

- Keep the primary repository checkout on `main`, or the repository's default branch when it does not use `main`.
- Use the primary checkout for discussion, investigation, and other read-only work. Do not implement code or technical-documentation changes directly in it.
- Before modifying files, determine whether the current task is already running in an isolated worktree.
- If the task is already in a worktree, continue using that worktree. Do not create another worktree or fork merely because implementation begins or discussion continues.
- When implementation is requested from a task running in the primary checkout:
  1. Fork the current task into a new Codex-managed worktree based on the default branch.
  2. Send the fork a complete implementation prompt containing the user's request, the agreed requirements, relevant decisions from the discussion, and the required verification.
  3. Instruct the fork to begin implementation immediately without waiting for the user to repeat or confirm the request.
  4. Continue all implementation work in the fork. The original task must not modify project files.
- In the worktree, create a task-specific `codex/` branch before modifying files. If the worktree already has the correct task branch, reuse it.
- Use one worktree and one branch per independent task. Create another worktree only when the work is genuinely separate or must proceed independently.
- Keep unrelated local changes in the primary checkout out of the task worktree, branch, and commits.
- Run checks, commit, and push the task branch from the task worktree. Do not switch the primary checkout away from its default branch.

## Codex-Specific Tooling

### Image Generation

- For image generation or editing, use the Codex CLI and explicitly invoke its `imagegen` skill, for example: `codex exec '$imagegen Generate ...'`.
- Follow the skill's workflow and save final project assets inside the repository.
- Do not substitute handwritten SVG, HTML, or other placeholders when the request requires a generated raster image.

## Repository-Specific Guidelines

### Application Structure

- The runnable application lives under `server/`.
- Keep feature-specific code, API routes, commands, and documentation in the `planning` or `upwork` namespace. Keep shared runtime code directly under `server/`.
- Treat `server/data/planning-board.json` as user-owned planning state. Modify it only when the requested work changes planning data.

### Verification

- Run `npm test` from `server/` after server, planning, Upwork, or shared frontend logic changes.
- Run `npm run web:build` from `server/` after frontend or production-build changes.
