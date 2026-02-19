# Remote Codex Launch Latency

## Overview

Improved remote Codex/Claude session startup speed by reducing SSH preflight work before tmux launch.

## Why

Remote agent session startup previously did extra checks before launch and always forced a login-shell PATH hydration step.

That increased time-to-first-prompt on remote hosts.

The launch path now favors a fast start and only falls back to login-shell PATH hydration when the agent binary is not already available on PATH.
