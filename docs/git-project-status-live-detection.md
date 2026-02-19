# Git project status is now live-detected

## Overview
Project git status is now determined dynamically from the project path instead of relying on stored `isGit` state.

## Why this was changed
Projects that were added before git support could remain permanently labeled as non-git, even after becoming valid git repositories.

## What changed
- Removed persisted `isGit` from new project records.
- Legacy stored `isGit` values are ignored when loading project state.
- Dashboard project payloads now compute `isGit` live per project.
- Worktree and workspace git gating now uses live detection instead of stored flags.

## Result
Existing and new projects automatically reflect current git reality, including repos that gained git support after initial project creation.
