# Roulette Mode Session Preservation And Notification Targeting

## Overview

Roulette mode was breaking active work by deleting all existing sessions and creating a brand-new tmux session. This made the dice toggle destructive and disconnected roulette from the notifications it is supposed to guide.

## What changed

- Roulette mode no longer stops sessions or creates replacement tmux sessions.
- Enabling or disabling roulette only changes workspace rendering behavior.
- Roulette now picks the tmux session associated with the current notification item (using notification session metadata) and shows that real session.
- If a notification points to a session that no longer exists, roulette keeps an existing tmux session visible and clearly reports that the notification session is gone.

## Why this is implemented

The intent of roulette mode is to process notification-triggering sessions one by one, not to reset session state. Preserving all ongoing sessions and targeting the notification-linked tmux session keeps the workflow safe and useful.
