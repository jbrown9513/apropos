# Remote PTY Attach Default Enabled

## Overview
Remote terminals were consistently showing fallback mode (`[fallback terminal mode active]`), which causes lower responsiveness and occasional cursor-position artifacts compared to direct PTY attach.

## Why this is implemented
Remote PTY attach was gated behind `APROPOS_ENABLE_REMOTE_PTY_ATTACH=1`, meaning it was disabled by default.

The default is now enabled, and can be explicitly disabled with:

- `APROPOS_ENABLE_REMOTE_PTY_ATTACH=0`

This restores high-performance remote terminal behavior out of the box while keeping an escape hatch for problematic environments.
