# Session last-input seed on launch

## Request

New terminal sessions were showing `last: (no input yet)` even when users expected them to be identifiable immediately.

## Change

Session creation now seeds `lastInput` at launch time:

- First choice: launch prompt text (when provided).
- Second choice: explicit raw command (when provided).
- Fallback for agent sessions: base command (`codex` or `claude`).

## Why

The previous behavior only updated `lastInput` after interactive input was committed in the terminal.

Seeding an initial value makes fresh sessions easier to identify right away, including automation-started and agent sessions.
