# Home project card width matches default tmux session size

## Overview
Updated home screen project cards to use the same default width baseline as tmux session tiles.

## Why this was changed
Project cards were rendering at about half the width of the default tmux session layout, which made switching between home and workspace feel inconsistent.

## What changed
- The shared default tile min-width token now matches default tmux session tile width.
- Workspace tile sizing now references that shared token directly to keep both surfaces aligned.

## Result
Projects on the home screen now render with the same default width behavior as tmux sessions.
