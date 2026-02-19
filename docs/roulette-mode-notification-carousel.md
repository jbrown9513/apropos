# Roulette mode with notification carousel

## Feature request

Add a roulette mode with a dice slider in the top-right toolbar.

When roulette mode is on:

- Apropos keeps exactly one session tile for the active project.
- That session is a single `tmux` window.
- A notification carousel appears at the bottom of the tmux tile with `Prev` and `Next` controls.
- Carousel items rotate in the order notifications were received.

## Why

Roulette mode gives a focused workflow for triaging notifications one at a time without session clutter.

A single tmux tile keeps terminal context stable, and the bottom carousel allows fast forward/backward traversal through incoming items in a predictable sequence.
