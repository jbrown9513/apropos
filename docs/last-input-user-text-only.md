# Last-input now reflects user text only

Adjusted tmux session `last:` behavior so it only shows actual user-entered input, not default agent command names.

## What changed

- Removed command-name seeding (`codex`/`claude`) from session refresh/discovery paths.
- Removed launch-command seeding from initial session creation.
- `last:` and completion notification messages now use an abbreviated preview of real user input.

## Why this was implemented

The purpose of `last:` is to differentiate active tmux sessions and their related notifications based on what the user actually sent.

Showing default command names made sessions look identical and reduced notification usefulness.
