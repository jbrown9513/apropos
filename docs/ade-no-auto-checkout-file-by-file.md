# ADE No Auto-Checkout (File-by-File)

## Overview
Automatic ADE checkout during session startup is disabled.

## Why this is implemented
In ADE, checkout must be done per file and only when needed for edits.

Apropos now avoids running bulk checkout commands by default, and plugin rules emphasize:

- `ade co -nc <file>` before editing specific files.
