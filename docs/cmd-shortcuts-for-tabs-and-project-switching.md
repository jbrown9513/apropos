# CMD Shortcuts For Tabs And Project Switching

## Overview
Apropos now supports CMD-based keyboard shortcuts to quickly switch workspace tabs and jump between projects without using the mouse.

## Why This Was Implemented
When moving quickly between active coding contexts, reaching for toolbar controls slows down flow. Keyboard shortcuts make context changes faster and more consistent.

## What Changed
- Added `Cmd+Ctrl+[` and `Cmd+Ctrl+]` to switch workspace tabs backward/forward.
- Added fallback tab shortcuts `Cmd+Ctrl+,` and `Cmd+Ctrl+.` for keyboards/layouts where brackets are awkward.
- Added `Cmd+Option+[` and `Cmd+Option+]` to switch active project backward/forward.
- Added fallback project shortcuts `Cmd+Option+,` and `Cmd+Option+.`.
- Shortcuts are ignored while typing in text inputs, selects, textareas, rich editable fields, or terminal panes.
