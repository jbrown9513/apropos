# Remote Project Add Shell Compatibility

## Overview
Adding a remote project could fail with errors like:

- `set: Variable name must begin with a letter.`
- `if: Expression Syntax.`
- `then: Command not found.`

This happened when the remote account defaulted to `csh`/`tcsh` and Apropos sent POSIX-style shell snippets directly over SSH.

## Why this is implemented
Apropos remote setup logic relies on POSIX shell syntax (`set -e`, `if [ ... ]`, `then`, `fi`, etc.).

Some environments (including Oracle Linux hosts with `csh`/`tcsh` as the login shell) can still break when a long command payload is quoted directly for SSH, producing errors like `Unmatched '''` and many `Command not found` lines from skill markdown content.

To make remote project registration reliable across different login shells, SSH command execution now:

- base64-encodes the intended POSIX command payload locally
- decodes it remotely
- executes it through `/bin/sh`

This removes shell-specific quoting pitfalls during remote setup and default skill installation.
