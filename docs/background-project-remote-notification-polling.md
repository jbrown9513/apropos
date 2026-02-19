# Background project remote notification polling

Improved notification generation for remote agent sessions in background projects.

## What changed

- Remote agent panes are now polled on a throttled cadence even when explicit pending-input state is not already known.
- Polling remains rate-limited to avoid high-frequency SSH traffic.

## Why this was implemented

Background projects can miss notification signals when remote pane capture is too narrowly gated.

A throttled, always-on remote poll path restores consistent question/completion detection while keeping remote overhead controlled.
