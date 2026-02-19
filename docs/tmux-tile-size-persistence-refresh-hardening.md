# Tmux Tile Size Persistence Refresh Hardening

## Overview

Hardened tmux tile size persistence so width/height settings survive refresh more reliably.

## Why

Two issues could make tile sizes appear reset:

- A workspace render regression during session reconciliation.
- Session-identity drift where a new runtime session key did not match a previously saved tile-size key.

The update restores stable reconciliation and adds a project-scoped kind fallback for saved sizes.
