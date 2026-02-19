# Remote Agent Launch POSIX Shell

## Overview
Remote agent sessions (including Codex) could exit immediately even when the binary existed and was resolvable.

## Why this is implemented
Agent launch previously used `"$SHELL" -lic ...` for remote startup. On hosts where the login shell is `csh`/`tcsh`, those flags are not compatible with POSIX shell expectations and can terminate the session before the agent starts.

Remote agent startup now uses `/bin/sh -lc ...` explicitly.

This keeps launch behavior consistent across shell types and avoids immediate-exit failures caused by shell flag incompatibility.
