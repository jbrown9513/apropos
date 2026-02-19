# Remote tmux Tile Refresh Button

## Overview
Remote tmux session tiles now include a refresh control in the top-right tile action row (next to resize/close).

## Why this is implemented
SSH transport interruptions can disconnect the terminal stream while the tmux session itself is still alive.

The refresh control re-attaches the browser terminal connection for that session without stopping tmux.
