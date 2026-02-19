# Focus mode width control respects tile span

Fixed focus mode so width controls visibly apply while focus mode is active.

## Why this was implemented

Focus mode previously forced the active tile to full-width, which made `Remove width` appear broken even though size state was changing.

The tile now respects its configured width span in focus mode, keeping resize controls consistent.
