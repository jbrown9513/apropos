# Remote Terminal Fallback Cursor and Performance

## Overview
In remote terminal fallback mode, Apropos renders tmux output by polling `capture-pane` snapshots over SSH.

This mode can feel slower than direct PTY attach and can make the cursor appear offset (for example after `clear`) because pane snapshots may include trailing right-padding spaces.

## Why this is implemented
Captured pane text is now normalized before being sent to the browser:

- strip carriage returns
- trim trailing spaces/tabs per line
- remove trailing blank lines

This reduces payload size and prevents cursor drift caused by padded snapshot lines in fallback rendering.
