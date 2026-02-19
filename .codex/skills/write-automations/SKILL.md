---
name: write-automations
description: "Create and update .automations JSON workflows for Apropos."
---

# Write Automations

Use this skill when a user asks to create or edit project automations.

## Goal

Create JSON automation files in `.automations/` that Apropos can run.

## File format

Each automation file must be valid JSON with:
- `name`: string
- `params`: optional array of input parameter definitions (prompted at run time)
- `sessions`: array with at least one item

Each param item supports:
- `name`: string (alphanumeric/underscore identifier, e.g. `BRANCH_NAME`) — **required**
- `label`: string displayed in the input form (defaults to `name`)
- `default`: string default value (defaults to `""`)
- `required`: boolean (defaults to `true`)

Reference params in session commands with `$PARAM_NAME` or `${PARAM_NAME}`. Both forms are substituted at run time.

Each session item supports:
- `kind`: one of `tmux`, `codex`, `claude`, `cursor`, `opencode`
- `command`: optional string (may contain `$PARAM_NAME` / `${PARAM_NAME}` placeholders)

## Steps

1. Ask for the workflow intent if unclear.
2. Propose a short automation file name (kebab-case).
3. If the workflow needs runtime input, add a `params` array with descriptive names and labels.
4. Build a valid JSON payload with practical session order.
5. Save the file under `.automations/<name>.json`.
6. Validate JSON syntax before finishing.

## Example — basic (no params)

```json
{
  "name": "default-workspace",
  "sessions": [
    { "kind": "tmux" },
    { "kind": "codex" },
    { "kind": "claude" },
    { "kind": "tmux", "command": "npm run dev" }
  ]
}
```

## Example — with input params

```json
{
  "name": "feature-branch",
  "params": [
    { "name": "BRANCH", "label": "Branch name", "required": true },
    { "name": "PORT", "label": "Dev server port", "default": "3000", "required": false }
  ],
  "sessions": [
    { "kind": "tmux", "command": "git checkout -b $BRANCH" },
    { "kind": "tmux", "command": "PORT=$PORT npm run dev" },
    { "kind": "claude" }
  ]
}
```

When the user runs this automation, Apropos prompts for `BRANCH` and `PORT` before launching. Every `$BRANCH` / `${BRANCH}` and `$PORT` / `${PORT}` in session commands is replaced with the values entered.
