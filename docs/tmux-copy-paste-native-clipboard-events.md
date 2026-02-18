# Tmux copy/paste native clipboard events

## Request

Copy and paste inside tmux terminal shells was not working reliably.

## Change

Terminal clipboard behavior now uses native `copy` and `paste` events on the xterm textarea.

- Copy now reads terminal selection and writes it through the clipboard event payload.
- Paste continues to read plain text from the browser paste event and forwards it into xterm input.
- Automatic copy-on-selection behavior was removed.
- Removed custom terminal click-to-focus handling so browser/xterm selection behavior is not interrupted.
- Added a custom key handler so `Cmd+C`/`Ctrl+C` with active selection is treated as copy, not terminal interrupt input.
- Buffered incoming terminal frames (`output` and fallback `screen`) while selection is active, then flushed after selection clears.
- Disabled session tile dragging and removed non-selectable tile behavior so Chrome can keep terminal text highlighted after mouse-up.

## Why

The old copy path depended on async clipboard permissions outside a direct copy event, which is commonly blocked by browsers and feels broken to users.

Using native clipboard events keeps Cmd/Ctrl+C and Cmd/Ctrl+V aligned with browser security rules and makes clipboard behavior more consistent in embedded tmux terminals.

Selection was being cleared by an unconditional focus action triggered on click, so guarding that path allows users to select text and then copy normally.

On Chrome/macOS, forwarding `Cmd+C` into terminal input can collapse selection before copy completes, so the shortcut is now reserved for clipboard copy whenever text is selected.

Some tmux sessions produce continuous stream updates that can wipe visual selection instantly on mouse-up. Temporarily deferring frame writes during active selection preserves highlight long enough to copy.

Chrome can also drop selection inside draggable, `user-select: none` parent containers. Session tiles now prioritize text selection over drag-and-drop reordering.
