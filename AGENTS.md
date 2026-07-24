# Agent Guidelines

## Generic Agent Guidelines

### Applicability

- These guidelines govern project development and maintenance work, including changes to code, tests, configuration, tooling, and technical documentation.
- If a repository supports content generation, these guidelines do not govern the content-generation activity itself. Follow the repository-specific content-generation skills and workflow instructions instead.

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

### Git Workflow
- After completing code or documentation changes, commit them and push the current branch to its tracked remote unless the user explicitly says not to.
- Keep commits focused and exclude unrelated working-tree changes.
