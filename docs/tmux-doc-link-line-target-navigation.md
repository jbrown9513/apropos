# Docs and AGENTS line-target navigation consistency

Docs and AGENTS openings now share the same line-target mechanics across entry points.

## What changed

- Opening from tmux markdown links still supports `:line` and `#L<line>`.
- Opening docs through the docs picker now also accepts `:line` and `#L<line>` in the file path input.
- The shared workspace editor open flow applies line positioning for both `docs` and `AGENTS` views.

## Why this was implemented

Different opening paths were using slightly different behavior, which caused inconsistent positioning and frequent jumps to the top of a file.

A single open flow with consistent line-target handling keeps navigation predictable regardless of how a file is opened.
