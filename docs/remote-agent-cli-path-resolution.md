# Remote Agent CLI Path Resolution

## Overview
Remote agent launches (for example Codex) could fail with immediate-exit errors even when the binary existed on the host, due to shell/PATH differences between checks and tmux runtime.

## Why this is implemented
Before launching a remote agent session, Apropos now resolves the executable to an absolute path when possible (including common directories such as `/usr/dev_infra/generic/bin`).

This avoids false launch failures caused by nonstandard PATH layouts in remote environments.
