# Session Notification Deduplication

## Overview
Session notifications are now de-duplicated in the workspace notification pipeline.

For session-origin alerts, Apropos keeps the newest alert for a given session stream and suppresses older duplicates in the same stream.

## Why
Ongoing chat interaction in a single session can trigger repeated notifications that crowd the notification center and inflate badges.

Deduplication keeps notifications focused on the latest state per session while preserving alert context for action.
