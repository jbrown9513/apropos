# Roulette Nav Controls Only In Roulette Mode

## Overview

Prev/Next roulette controls were still present in session tiles outside roulette mode, which made the workspace UI confusing.

## What changed

- Roulette nav controls are now explicitly hidden unless roulette mode is enabled.
- Roulette nav click and keyboard handlers now no-op when roulette mode is off.
- Added a CSS guard so any roulette element with `[hidden]` is forced out of layout.

## Why this is implemented

Roulette navigation should only appear when roulette behavior is active. This keeps normal workspace mode focused and avoids controls that imply inactive behavior.
