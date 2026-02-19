# PR Manager Skill

This adds a new local Codex skill at `.codex/skills/pr-manager/SKILL.md` for managing pull requests end to end.

The skill is designed to:
- inspect current repository changes,
- draft a clear PR title/body from real diffs,
- publish or update the PR with GitHub CLI, and
- verify final PR metadata before handoff.
- support a fast mode for minimal PR drafting and rapid publishing.

Why this is implemented:
- PR workflows are repeated frequently and benefit from a consistent quality bar.
- A dedicated skill reduces missed steps like branch checks, test reporting, and risk callouts.
- It makes PR outputs more reliable and review-friendly across sessions.
- Fast mode preserves momentum when speed matters, while still keeping a basic verification step.
