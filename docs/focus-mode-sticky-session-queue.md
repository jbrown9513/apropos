# Focus mode sticky session with queued notifications

Focus mode no longer auto-switches the visible terminal when new notifications arrive.

## What changed

- Focus mode now pins the currently visible session per active project.
- Incoming notifications are still queued in FIFO order, but they do not force an immediate session switch.
- Session changes in focus mode now happen only when the user navigates with `NEXT` or `PREV` (or if the pinned session disappears).
- Queue traversal still prioritizes notification-linked sessions and falls back to random tmux sessions when the queue is empty.

## Why

Focus mode should preserve user control of attention. Notifications are work items to process in order, not interrupts that forcibly replace the current terminal context.
