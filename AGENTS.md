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

- After completing requested code or documentation changes, run the relevant checks, commit the completed work, and push the current branch to its tracked remote unless the user explicitly says not to.
- If committing or pushing is impossible because of repository configuration, authentication, network access, or branch protections, report the blocker explicitly.
- Keep commits focused and use concise, specific commit messages.
- Exclude unrelated working-tree changes from commits.

## Codex-Specific Tooling

### Image Generation

- For image generation or editing, use the Codex CLI and explicitly invoke its `imagegen` skill, for example: `codex exec '$imagegen Generate ...'`.
- Follow the skill's workflow and save final project assets inside the repository.
- Do not substitute handwritten SVG, HTML, or other placeholders when the request requires a generated raster image.

## Repository-Specific Guidelines

- Add project-specific architecture, commands, conventions, and restrictions here.
