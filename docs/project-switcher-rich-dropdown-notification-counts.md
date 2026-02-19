# Project Switcher Rich Dropdown Notification Counts

## Overview
The project selector in the top-right toolbar now uses a richer custom dropdown instead of a native select.

## Why this was added
The previous selector had limited visual structure and did not surface project-level notification load. It also needed explicit downward expansion behavior.

## What changed
- Replaced the native project `<select>` with a custom trigger + menu.
- Dropdown now opens below the trigger.
- Each project row now shows a notification count badge sourced from project alerts.
- Added active-project highlighting and outside-click / escape close behavior.

## Result
Project switching is easier to scan, and notification-heavy projects are visible directly in the selector.
