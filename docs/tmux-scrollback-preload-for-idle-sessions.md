# Tmux Scrollback Preload For Idle Sessions

## Overview
Improved terminal scrollback reliability for sessions that do not emit immediate PTY output on attach.

## Why this was needed
History preload was tied to initial redraw data. Quiet/idle sessions could skip preload, leaving users without prior output scrollback.

## What changed
- Added a timed history preload call during attach, independent of initial output events.
- Kept existing one-time history guards in place.
- Forced terminal viewport scrollbar behavior to `scroll` for clearer output-history navigation.

## Result
Idle sessions now load output history consistently, and the right-side terminal scrollbar remains available.
