# Terminal Output Scrollbar And Wheel Direction

## Overview
Adjusted terminal scrolling so users can navigate full console output history with expected wheel direction and a visible right-side scrollbar.

## Why this was needed
Wheel behavior was inconsistent and output-history navigation was hard to discover without a clear scrollbar indicator.

## What changed
- Inverted wheel mapping so scrolling up reveals older console output.
- Enabled visible xterm viewport vertical scrolling in terminal tiles.

## Result
Terminal panes now expose an explicit right-side scrollbar and predictable output-history scrolling.
