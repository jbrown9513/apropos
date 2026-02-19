---
name: pr-manager
description: Manage pull requests from local repository state through publication with GitHub CLI. Use when Codex must inspect current git changes, draft a PR title/body, open or update a PR with `gh`, or confirm PR metadata and status before handoff or merge.
---

# Pr Manager

## Overview

Use this skill to convert local git work into a high-quality pull request quickly and consistently. Inspect the branch state, produce a clear PR narrative, and publish via `gh` with explicit verification steps.

## Workflow

Follow this order every time:
1. Validate repository and branch context.
2. Inspect and summarize code changes.
3. Build PR title and body from evidence.
4. Publish or update the PR with `gh`.
5. Verify resulting PR state and share links.

## Mode Selection

Choose mode based on user intent:
- Standard mode: default. Use full workflow and richer PR narrative.
- Fast mode: use when user asks for speed, "loose", "quick", or "just ship it". Keep checks minimal but do not skip verification.

For fast mode, use this compact flow:
1. Run `git status --short --branch` and `git diff --stat`.
2. Create a short title plus 2-4 summary bullets.
3. Include a minimal testing line with what was run or `Not run`.
4. Create or update PR with `gh pr create` or `gh pr edit`.
5. Run `gh pr view --json number,title,url,state,isDraft` and return URL.

## Step 1: Validate Context

Run:
```bash
git status --short --branch
git remote -v
git branch --show-current
```

Enforce:
- Confirm you are inside the intended repo.
- Confirm current branch is not `main` or `master` unless explicitly requested.
- Confirm GitHub remote exists.
- Call out untracked/staged/unstaged state before drafting PR content.

## Step 2: Inspect Changes Thoroughly

Run the smallest useful set:
```bash
git diff --stat
git diff
git diff --cached
git log --oneline --decorate --max-count=15
```

If changes are large, prioritize:
- User-facing behavior changes.
- Data model or contract changes.
- Risky areas (auth, persistence, migrations, concurrency).
- Missing tests or validation gaps.

## Step 3: Draft PR Content

Create evidence-based PR content from the diff, not assumptions.

Generate:
- Title: concise, action-oriented, scoped to the primary change.
- Summary: what changed and why.
- Testing: exact commands run and outcomes.
- Risks: known tradeoffs, follow-ups, or areas needing reviewer focus.

Use this body template:
```markdown
## Summary
- ...

## Why
- ...

## Testing
- `...` -> pass/fail

## Risks / Follow-ups
- ...
```

Fast-mode body template:
```markdown
## Summary
- ...

## Testing
- Not run
```

## Step 4: Publish or Update the PR

For new PRs:
```bash
gh pr create --title "<title>" --body-file <body-file>
```

For draft PRs:
```bash
gh pr create --draft --title "<title>" --body-file <body-file>
```

For existing PR updates:
```bash
gh pr edit <number-or-url> --title "<title>" --body-file <body-file>
```

If the branch is not pushed yet, push first:
```bash
git push -u origin <branch>
```

## Step 5: Verify and Report

Run:
```bash
gh pr view --json number,title,url,baseRefName,headRefName,state,isDraft
```

Return to the user:
- PR URL.
- Final title.
- High-level summary bullets.
- Testing and any unresolved risks.

## Quality Bar

Require:
- No fabricated test results.
- No generic PR descriptions that ignore concrete files changed.
- No silent assumption about base branch; state it explicitly.
- Clear reviewer guidance when risk is non-trivial.
