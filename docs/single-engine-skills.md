# Single-engine skills

## Request

Skills currently support a `both` mode and the launcher asks users to pick an orchestrator (`codex` or `claude`) at launch time.

This creates extra decisions and confusing behavior when a skill is intended for only one engine.

## Change

Skills are now single-engine only.

- Skill `target` must be `codex` or `claude`
- Creating a skill no longer allows `both`
- Launching an existing skill always uses the skill's own target engine
- The Skills launcher no longer shows an engine dropdown
- New skill creation from the launcher is explicit via:
  - `+ Create new codex skill`
  - `+ Create new claude skill`

## Why

A skill should declare exactly one execution engine so launch behavior is deterministic.

This removes an unnecessary UI choice, prevents engine mismatch prompts, and simplifies the Skills flow.
