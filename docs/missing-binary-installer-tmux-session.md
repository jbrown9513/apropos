# Missing binary installer tmux session

Session launch now detects when an agent CLI binary is unavailable on both local and remote projects before attempting to start the agent.

## What changed

- Agent launch preflight now runs for local and remote project sessions.
- If the required binary is missing (for example `cursor-agent`), Apropos opens a `tmux` session in the target workspace instead of failing.
- That fallback tmux session runs an install flow with `brew install ...`, includes verification guidance (`command -v ...`), and keeps an interactive shell open.
- The fallback is logged as a warning alert so missing-tool incidents are visible.

## Why

When binaries are missing, launch failures require manual diagnosis and often break user momentum. Automatically opening a focused installer terminal in the same project path gives a direct recovery path for both local and SSH-hosted projects.
