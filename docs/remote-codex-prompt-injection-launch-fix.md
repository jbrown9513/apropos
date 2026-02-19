# Remote Codex Prompt Injection Launch Fix

## Overview

Adjusted agent session startup so Codex/Claude launch first, then receive preload prompts via tmux keystrokes.

## Why

Passing large preload prompts directly as startup command arguments can be brittle on remote shells and may cause Codex startup stalls.

Launching the agent cleanly first and injecting the prompt after startup makes remote behavior more reliable for skill authoring and other built-in prompt-driven workflows.
