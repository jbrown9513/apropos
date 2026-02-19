# Git Detector Duplicate Declaration Fix

## Overview

The server startup path could fail with a syntax error when `detectIsGitRepo` was declared more than once in the same module scope. This blocked `src/server.js` from loading and prevented the app from starting.

## What changed

- In `src/server.js`, the imported git detector is now aliased to `detectIsGitRepoPlugin`.
- The project-create flow now calls the aliased import.

## Why this is implemented

Using an explicit alias avoids identifier collisions with any local helper that may use the same function name. The startup path stays stable, and project creation still performs git-repo detection correctly.
