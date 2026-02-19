# Focus mode toggle and full-width tmux session

Roulette mode is now presented as Focus mode, with UI cues aligned to focused, one-by-one notification triage.

## What changed
- The top toggle icon changed from a dice metaphor to a focus/target icon.
- Toggle styling now uses a focus-oriented theme treatment instead of the previous roulette styling.
- User-facing copy now says `Focus mode` (including toggle hints and workspace messages).
- In focus mode, the selected tmux session tile now spans the full available workspace width.

## Why
The mode is intended to process outstanding notifications one at a time while staying anchored in the relevant tmux session.
A focus-oriented icon/theme communicates that intent better than a randomizing dice metaphor, and full-width layout improves readability and concentration during triage.
