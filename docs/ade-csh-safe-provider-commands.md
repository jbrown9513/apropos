# ADE csh-safe Provider Commands

## Overview
Some ADE environments run under csh/tcsh-style shells where POSIX constructs such as `|| true` and combined redirection patterns can fail inside setup scripts.

## Why this is implemented
The user-scoped ADE plugin command templates were adjusted to shell-neutral forms:

- `listViewsCommand`: `ade lsviews`
- `createViewCommand`: `ade createview ...; ade useview ...`
- `defaultCheckoutCommand`: `ade co -nc .`

This keeps ADE setup compatible with csh-style environments and avoids silent launch setup failures.
