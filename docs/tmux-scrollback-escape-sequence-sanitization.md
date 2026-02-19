# Tmux scrollback escape-sequence sanitization

## Overview

Fixed terminal scrollback collapsing to only about one extra line in some tmux sessions.

## What changed

- Added a terminal stream sanitizer in the browser client that strips control sequences which can clear local scrollback or force alternate-screen behavior:
  - `CSI ?1049 h/l`
  - `CSI ?1047 h/l`
  - `CSI ?47 h/l`
  - `CSI 3J`

## Why

Even when tmux options requested deep history, some control sequences from tmux/app startup could still reset browser-side scrollback. Removing those sequences keeps normal shell-like scroll depth stable in the Apropos terminal view.
