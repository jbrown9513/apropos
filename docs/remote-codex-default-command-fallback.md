# Remote Codex Default Command Fallback

## Overview

Remote Codex session launches now default to `npx -y @openai/codex` when no custom command is provided.

## Why

Some remote hosts have a conflicting or broken global `codex` binary that exits immediately with only Node deprecation warnings.

Using `npx -y @openai/codex` avoids PATH collisions and runs the published CLI package directly, which is more reliable out of the box for remote nodes.
