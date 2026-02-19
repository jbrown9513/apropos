# Folder Projects Hidden Without Active Sessions

## Overview

Fixed a Projects view bug where folder tabs could show fewer projects than were assigned.

In some cases, only projects with active sessions were rendered in a selected folder, which made assigned projects appear missing.

## Why

Folder membership should control which projects are visible in a folder tab.

Tying folder visibility to active sessions creates confusing behavior, especially as projects are added and sessions start/stop.

This fix ensures all projects assigned to the selected folder render consistently, regardless of current session state.
