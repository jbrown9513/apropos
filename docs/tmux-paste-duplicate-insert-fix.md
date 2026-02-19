# Tmux paste duplicate insert fix

## Overview
Pasting into terminal sessions could insert the same text twice.

## What changed
The terminal textarea `paste` handler now runs in capture phase and explicitly stops event propagation before calling `term.paste(...)`.

## Why this was implemented
Both xterm's internal paste handling and the custom paste bridge could process the same browser paste event. Stopping propagation in capture phase ensures only one paste path runs, so pasted commands are inserted once.
