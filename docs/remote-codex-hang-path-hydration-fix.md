# Remote Codex Hang Launch Fix

## Overview

Adjusted remote Codex/Claude startup to run from the remote login shell context.

## Why

Codex can appear to hang when launched from a reduced non-login environment on remote hosts.

Running startup through the login shell ensures required environment/auth exports are present before `exec`ing the agent.

This keeps remote Codex startup reliable while preserving the broader SSH latency improvements.
