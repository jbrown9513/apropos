# Tmux Scrolling: Known-Good Configuration

## Overview

This is the exact configuration that currently works for normal shell-like scrolling in Apropos terminal tiles.

## Exact settings

- tmux history depth: `50000` lines
- initial history preload on attach: `20000` lines
- browser terminal scrollback: `50000` lines
- tmux alternate screen: `off`
- tmux mouse mode: `off`
- wheel behavior: local xterm scroll (`term.scrollLines(...)`), not tmux copy-mode scrolling

## Applied tmux options

On session create and terminal attach, Apropos applies:

- `set-window-option -g history-limit 50000`
- `set-window-option -t <session> history-limit 50000`
- `set-window-option -t <session> alternate-screen off`
- `set-option -t <session> mouse off`

## Browser terminal protections

Terminal output is sanitized to remove control sequences that can wipe scrollback or switch to alternate-screen:

- `CSI ?1049 h/l`
- `CSI ?1047 h/l`
- `CSI ?47 h/l`
- `CSI 3J`

## Why this is the final working setup

This combination keeps tmux history deep, preloads pane history on attach (including fallback mode), and prevents escape sequences from collapsing browser-side scrollback.
