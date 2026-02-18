# Agents Editor Toggle

## Overview
The AGENTS workspace action now behaves as a toggle.

## Why This Was Implemented
Clicking `AGENTS` repeatedly always reopened the editor and did not allow a quick hide action from the same button.

## What Changed
- If `AGENTS` is already the active visible editor, clicking `AGENTS` again closes the editor.
- If it is not open, clicking `AGENTS` still opens the AGENTS editor as before.
