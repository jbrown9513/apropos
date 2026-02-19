# Skill target defaults to codex

## Request

Skill target validation errors appeared from legacy values, and skills should default to running via `codex`.

## Change

- Skill target normalization now falls back to `codex` when a stored target is invalid.
- Skill labels now render only `codex` or `claude`.
- Existing-skill launch flow now defaults invalid targets to `codex` instead of blocking with an error.
- Skill editor file resolution removed the legacy fallback that treated invalid targets as multi-target behavior.

## Why

Legacy target values like `both` should not appear in the product anymore.

Defaulting invalid values to `codex` removes launch friction and keeps the target model consistent.
