# Remote tmux Default Shell Stability

## Overview
Remote default tmux sessions could exit immediately in mixed-shell environments.

## Why this is implemented
Default remote tmux startup now uses `/bin/sh -i` directly instead of depending on the remote login shell value.

The tmux alive-check grace period was also increased for remote hosts to avoid false early-exit detections.
