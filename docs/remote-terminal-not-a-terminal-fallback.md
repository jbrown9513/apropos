# Remote Terminal Fallback For "Not a terminal"

## Overview

Remote session terminals could disconnect with:

- `open terminal failed: not a terminal`

This happened when the web terminal bridge attempted to run a remote `tmux attach` through an SSH PTY path that was not always accepted as a true interactive terminal by the remote environment.

## Why this is implemented

Apropos should reliably open and stream remote agent terminals without users needing to debug SSH/PTY edge cases.

The default behavior is now:

- local sessions: continue using PTY attach for rich terminal behavior
- remote sessions: use the stable fallback terminal bridge (`capture-pane` + `send-keys`) by default

An env override is available when needed:

- `APROPOS_ENABLE_REMOTE_PTY_ATTACH=1`

This keeps onboarding and day-to-day remote usage stable while still allowing PTY attach to be re-enabled for environments where it is known to work.
