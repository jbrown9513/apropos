# Remote agent completion notifications

Remote Codex/Claude sessions now emit completion notifications when they become idle after user input.

## What changed

- Background remote pane polling is now enabled only when a remote agent session has pending input that has not yet produced a completion alert.
- Remote polling is throttled to reduce SSH overhead and avoid continuous polling behavior.

## Why this was implemented

Remote sessions were not producing `session.agent_idle` notifications because remote pane polling had been fully disabled.

This update restores completion notifications for remote agent workflows while keeping polling constrained to active, notification-relevant moments.
