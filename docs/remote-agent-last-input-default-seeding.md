# Remote agent last-input default seeding

Remote-discovered agent sessions now seed `last` with the session command (`codex` or `claude`) when there is no captured user input yet.

## Why this was implemented

When sessions were reconstructed from tmux on refresh, `last` could reset to `(no input yet)` even for active agent sessions. This made remote Claude/Codex tiles look like they had no meaningful context.

Seeding from the agent launch command keeps session cards informative and consistent immediately after refresh/discovery.
