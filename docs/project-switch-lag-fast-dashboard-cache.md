# Project Switching Lag with Many Local and Remote Sessions

## Overview
Switching between projects was becoming noticeably slow when many sessions were open across local and remote hosts.

The core issue was that every project switch triggered a full dashboard reload that recomputed live project metadata and refreshed tmux sessions across all hosts before returning.

## What Changed
Project switching now uses a lightweight dashboard mode intended for rapid workspace changes.

This mode favors cached project metadata and avoids blocking the switch on expensive global refresh work. Session discovery still runs, but it is throttled and performed in the background during switch-driven loads.

## Why This Was Implemented
The goal is to keep project navigation responsive even when the workspace is busy and distributed across multiple remote machines.

Users should feel immediate project transitions, while deeper refresh work continues safely in the background and still converges to current state.
