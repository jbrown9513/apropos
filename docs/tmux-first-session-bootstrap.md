# Tmux First Session Bootstrap

## Overview
Session launch now works when no tmux server/socket exists yet on a host.

## Why This Was Implemented
Launching a first session on some hosts failed with:
`error connecting to /private/tmp/tmux-501/default (No such file or directory)`

That happened because a global tmux option command was executed before any tmux session/server existed.

## What Changed
- Session creation now starts with `tmux new-session`.
- Mouse-mode configuration is applied only after the session exists.
- Mouse-mode failures are non-fatal so launch can still proceed.

## Result
First session launch no longer fails due to a missing tmux socket.
