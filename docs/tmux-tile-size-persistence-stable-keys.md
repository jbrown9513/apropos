# Tmux Tile Size Persistence Stable Keys

## Overview

Updated terminal tile size persistence to use a stable tmux identity key (host + tmux session name) instead of relying only on runtime session IDs.

## Why

Session IDs can vary across refresh/reconcile paths even when the underlying tmux session is the same.

Using stable tmux identity keys makes tile width/height settings survive refreshes more reliably.
