# Focus mode prev control and source badge removal

Updated focus mode footer controls to reduce noise and improve navigation.

## What changed

- Removed the focus source badge line (for example `Random fallback`).
- Added a `PREV` button next to `NEXT` so users can navigate backward through focus-mode tmux targets.
- `PREV`/`NEXT` behavior is wired in both standard and split terminal grids.

## Why this was implemented

The source badge text added visual clutter without helping primary workflow decisions.

Adding backward navigation makes focus-mode session traversal more practical when reviewing recent context.
