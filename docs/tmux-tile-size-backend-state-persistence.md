# Tmux Tile Size Backend State Persistence

## Overview

Terminal tile width/height settings are now persisted in Apropos backend state (`~/.apropos/config.json`) and returned from the dashboard payload.

## Why

Browser-only storage can feel inconsistent across hard refresh and cache-bypass reload workflows.

Persisting tile dimensions in backend state makes workspace sizing durable and consistent across refreshes, including `Cmd+Shift+R`.
