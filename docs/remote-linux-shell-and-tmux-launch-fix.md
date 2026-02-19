# Remote Linux Shell and Tmux Launch Fix

## Overview
Remote project launch on Linux could fail even when `tmux` was installed, with errors like:

- `syntax error near unexpected token ';'`
- generated shell fragments containing `then;` / `do;`

## Why this is implemented
Apropos builds remote shell scripts for tmux/session startup. Joining control-flow lines with semicolons produced invalid shell syntax in some generated command forms.

The launch script generation now uses newline-joined shell blocks for remote tmux checks and installer command scaffolding. This keeps control-flow syntax valid and prevents false launch failures on Linux hosts.

The default remote codex command was also aligned to `codex` (instead of `npx -y @openai/codex`) so environments without npm/npx can still launch when Codex CLI is already installed.

## Additional behavior fix
Default `+ tmux` launches now rely on tmux's native default shell startup (with `-c <workspace-path>` only) instead of forcing an explicit `exec` shell command.

This prevents sessions that briefly start and immediately exit on remote Linux hosts where non-login shell invocation semantics differ.

## Additional attach-path fix
Remote tmux attach over the browser websocket now uses the same POSIX shell wrapper as other SSH calls.

This prevents `csh`/`tcsh` parsing errors during attach (for example `Illegal variable name` and `tmux_bin: Undefined variable`) even when launch succeeds.
