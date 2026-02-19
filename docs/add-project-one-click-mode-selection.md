# Add Project One-Click Mode Selection

## Overview
The Add Project chooser now starts the selected path immediately when `Local` or `Remote` is clicked.

## Why This Was Implemented
The prior flow required an extra submit click after choosing Local/Remote, which made project creation feel repetitive and slower than necessary.

## What Changed
- The first Add Project chooser now has no submit action.
- Clicking `Local` immediately opens the local folder picker flow.
- Clicking `Remote` immediately opens the remote project form flow.
