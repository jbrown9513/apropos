# Remote tmux session path enforcement

## Problem

When spawning tmux sessions on remote projects, two issues:

1. **Wrong directory** — project paths stored as relative (e.g. `code/kalshi_arb`)
   are not resolved by tmux's `-c` flag because tmux resolves relative paths
   against the tmux server's working directory, not `$HOME`. Remote shell
   profiles (`.bashrc`, `.zshrc`) can also `cd` during initialization, overriding
   the directory tmux set.

2. **Session spawn hangs** — every post-creation tmux operation (send-keys,
   set-option, set-window-option, resize-window) was a separate SSH call. With
   `ControlMaster=no`, each call opens a new TCP + SSH connection.  A single
   session spawn made 15+ sequential SSH calls, causing multi-second hangs.

## Fix

1. **Project creation** (`server.js`): Resolve relative paths to absolute via
   `cd <path> && pwd` over SSH before storing.

2. **Session spawn path resolution** (`sessions.js`): At spawn time, resolve
   relative paths to absolute via SSH for existing projects with relative paths.

3. **Explicit cd via send-keys** (`sessions.js`): Always inject `cd <path>` as
   the first send-keys command for remote sessions, guaranteeing correct working
   directory after shell profile initialization.

4. **Batch SSH calls** (`sessions.js`): All post-creation tmux commands
   (send-keys, settings, resize) are batched into a single SSH call via
   `runTmuxBatchRemote`. This reduces remote session spawn from 15+ SSH calls
   to 3-5.
