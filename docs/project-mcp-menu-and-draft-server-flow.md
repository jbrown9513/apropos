# Project MCP Menu And Draft Server Flow

## Overview

The Project workspace `MCP` button now opens a small action menu instead of a single setup path.

From that menu, users can:

- Add an MCP tool from a configured GitHub MCP repository into the current project.
- Start a new MCP server creation flow that launches Codex with a dedicated project skill.

## Why

Now that MCP repositories are configured globally, project-level MCP actions should focus on choosing and applying existing tools, not re-entering repository setup details every time.

This change keeps project MCP work aligned with the user’s existing GitHub repo setup and makes MCP server creation a first-class action from the same Project button.

The new draft flow also encourages repeatable server creation through a Codex skill, so creating new MCP servers is consistent and easier to run again from any project.
