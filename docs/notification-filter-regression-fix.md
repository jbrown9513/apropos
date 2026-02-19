# Notification filter regression fix

Notification rendering was unintentionally restricted, causing far fewer notifications to appear than expected in active session workflows.

## What changed
- Restored notification intake to all `session.*` alert types instead of only `session.agent_idle`.
- Updated notification dedupe keying to include alert type, so different session alert categories do not collapse into one.

## Why
Filtering to a single alert type made notification volume appear broken in real usage, especially with many active sessions.
Including all session alerts and deduping by type preserves visibility while still preventing noisy duplicates.
