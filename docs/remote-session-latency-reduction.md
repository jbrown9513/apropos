# Remote Session Latency Reduction

## Overview

Improved responsiveness for remote project sessions by reducing SSH overhead and removing a background polling pattern that could compete with interactive remote tmux usage.

## Why

Remote session control previously opened many short-lived SSH commands and also polled remote agent panes in the background for notifications.

That combination could add noticeable lag while typing or interacting with Codex/Claude sessions on remote hosts.

The update now reuses SSH connections with control multiplexing and skips remote background pane polling, prioritizing interactive session speed.
