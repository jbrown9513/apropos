# Remote Agent Exit Fast Detection

## Overview

Added a fail-fast check for Codex/Claude session launches.

If an agent tmux session exits immediately after startup, Apropos now returns a clear launch error instead of appearing stuck.

## Why

Some remote environments can run the agent command but terminate right away due to install, auth, or shell environment issues.

Without a fast liveness check, this looked like a hanging launch from the UI.

The new check makes the failure explicit and points users to verify the agent directly in the target project directory.
