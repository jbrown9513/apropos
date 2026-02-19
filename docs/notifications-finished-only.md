# Notifications Finished Only

## Overview
Workspace notifications now only surface completion alerts.

Specifically, the notification pipeline now includes only:
- `session.agent_idle`

## Why
During ongoing chat or script interaction, intermediate alerts can create noise.

Restricting notifications to completion events keeps the notification center focused on "done" states.
