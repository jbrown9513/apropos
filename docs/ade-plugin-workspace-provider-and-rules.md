# ADE Plugin Workspace Provider and Rules

## Overview
Apropos now supports a user-scoped ADE plugin under `~/.apropos/plugins/ade` so ADE workflows can be detected and used automatically without per-project setup.

This adds:

- automatic ADE environment detection for non-git projects
- ADE-aware launch options when creating sessions
- ADE command mappings and workflow rules injected into project rule files

## Why this is implemented
Git worktree flows do not cover ADE view/transaction behavior.

This implementation makes ADE a first-class custom environment through the plugin engine, so users can choose:

- default project path
- existing ADE view
- create-and-use new ADE view

Session startup can apply ADE setup commands (including default `ade co -nc`) before opening tmux or agent CLIs.

The ADE plugin also contributes command mapping guidance and workflow notes into generated Apropos VCS rules consumed by Codex/Claude project rule files.
