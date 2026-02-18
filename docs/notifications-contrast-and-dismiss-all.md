# Notifications Contrast And Dismiss All

## Overview
The notification center now uses higher-contrast colors, and includes a `Dismiss all` control to clear the full list in one action.

## Why This Was Implemented
Notification text and controls were difficult to read against the previous background styling. Also, dismissing alerts one-by-one slowed down workflow when many session alerts were present.

## What Changed
- Updated notification panel, group, item, and metadata colors to improve readability and visual separation.
- Added a `Dismiss all` button in the notification header.
- Added server support for clearing all alerts in a single request.
