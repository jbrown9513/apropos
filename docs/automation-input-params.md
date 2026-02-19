# Automation Input Params

## What

Automations can now declare `params` — named input values that the user fills in at run time. Param placeholders (`$NAME` or `${NAME}`) in session commands are substituted before launch.

## Why

Previously every automation was fully static: the commands baked into the JSON were the exact commands that ran. This made it impossible to reuse a single automation for different branches, ports, environment names, or any other value that varies per run. Users had to duplicate automation files or manually edit them each time.

With input params, a single `feature-branch.json` automation can prompt for the branch name and dev-server port at launch, then wire those values into the right session commands automatically.

## How it works

1. The automation JSON gains an optional top-level `params` array. Each entry has `name`, `label`, `default`, and `required`.
2. When the user clicks **Run**, Apropos first shows the automation picker. If the chosen automation has params, a second form appears collecting the values.
3. The collected values are sent as `inputParams` to `POST /api/projects/:id/automations/run`.
4. The server validates required params, then substitutes every `$PARAM` / `${PARAM}` occurrence in each session's `command` string before spawning.
