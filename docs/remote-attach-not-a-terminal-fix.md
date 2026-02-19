# Remote Attach "Not a terminal" Fix

## Overview
Remote tmux attach could fail with:

- `open terminal failed: not a terminal`

## Why this is implemented
The remote shell-compatibility wrapper previously piped decoded command text into `/bin/sh`.
That made stdin non-terminal for the executed command, which breaks interactive tmux attach.

The wrapper now decodes the payload into a temporary script file and executes it with `/bin/sh <tempfile>`, preserving terminal semantics while keeping shell-safe command transport.
