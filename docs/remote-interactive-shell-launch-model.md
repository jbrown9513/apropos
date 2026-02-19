# Remote Interactive Shell Launch Model

## Overview
Remote sessions now launch through the remote user's native interactive shell behavior inside tmux, without forcing a specific interpreter wrapper.

## Why this is implemented
Remote environments can use different shell interpreters (`csh`, `zsh`, `bash`, etc.), and forcing one shell wrapper for setup/launch can break startup.

Apropos now:

- starts tmux in the target workspace path with default shell behavior
- sends setup and launch commands through tmux `send-keys`

This keeps startup interactive and interpreter-compatible across heterogeneous remote shell environments.
