# Folder Removal For Project Grouping

## Overview
Apropos now supports removing project-grouping folders from the Projects view.

## Why This Was Implemented
Folders were useful for organizing projects, but there was no way to delete one once created. That made it hard to clean up old groupings and led to stale UI state over time.

## What Changed
- Added a `- folder` action in the folder toolbar.
- Added a remove flow that lets you pick which folder to delete.
- Added a confirmation step before deleting.
- When a folder is removed, any projects assigned to it are automatically unassigned.
- If the removed folder was the active filter tab, the view safely returns to `All`.
