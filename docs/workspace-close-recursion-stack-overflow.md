# Workspace Close Recursion Stack Overflow

## Overview
Closing a workspace could trigger a `RangeError: Maximum call stack size exceeded` in `public/app.js`.
The error happened when workspace rendering tried to close an invalid project and the close flow immediately triggered another workspace render.

## Why This Was Implemented
The close path called `closeWorkspaceLogs()`, and that function always refreshed workspace layout.
During full workspace teardown, that refresh can happen before active workspace state is fully cleared, which re-enters `renderWorkspace()` and loops.

The fix adds an optional `refresh` flag to `closeWorkspaceLogs()` and disables refresh when called from `closeWorkspace()`.
This preserves normal refresh behavior for logs toggling, while preventing recursive close/render loops.
