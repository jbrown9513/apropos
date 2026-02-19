# Session Last Input ANSI Noise

## Overview
Session tiles could show unreadable `last:` values like `>0;276;0c` instead of meaningful user commands.

## Why this happened
The last-input sanitizer stripped only part of some ANSI control sequences. For private-mode CSI responses (for example `ESC[>...c`), the escape prefix could be removed while parameter text remained.

## What changed
- Updated input sanitization to match full CSI sequences, including private-mode parameters.
- This removes terminal capability response noise before storing `session.lastInput`.

## Result
`last:` labels now stay focused on actual typed commands and no longer surface terminal control garbage.
