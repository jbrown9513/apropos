# Session tile resize controls consistency

## Request

Some terminal tiles exposed `+H/-H/+V/-V` resize controls, but sessions spawned as `codex` or `claude` did not.

There was also confusion about whether `H` represented horizontal or height.

## Change

Tile resize controls are now shown for all session kinds (`tmux`, `codex`, and `claude`).

The button labels were updated to explicit dimensions:

- `+W/-W` controls width
- `+H/-H` controls height

## Why

All session tiles use the same grid sizing behavior, so the controls should be available consistently.

Using `W/H` removes ambiguity from `H/V` and matches how people reason about dimensions.
