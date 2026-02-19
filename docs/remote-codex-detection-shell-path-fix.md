# Remote Codex Detection Shell/PATH Fix

## Overview
Remote agent launches could incorrectly open a "Missing CLI" installer tmux session even when the CLI existed on the remote host.

## Why this is implemented
Remote command preflight checks can be unreliable across shell types and login-path setups, especially in mixed shell environments.

For remote projects, Apropos now skips local-style preflight binary detection and launches the agent directly. Runtime startup checks remain in place and report true launch failures.
