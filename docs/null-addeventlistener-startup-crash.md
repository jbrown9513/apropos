# Null addEventListener startup crash

## What happened
Some users hit a startup crash in the browser with:
`Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')`

This happened when the app tried to bind workspace-related click/change handlers before confirming those DOM nodes exist in the active page.

## Why this was implemented
The UI should never fail to boot just because one optional element is missing or not rendered in a specific route/state. We now guard those bindings so the app can continue loading instead of crashing at startup.

We also added an explicit favicon asset reference to reduce noisy `/favicon.ico` 404 errors in the browser console.
