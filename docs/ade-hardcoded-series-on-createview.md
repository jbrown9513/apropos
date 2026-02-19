# ADE Hardcoded Series on Create View

## Overview
Creating a new ADE view now uses a hardcoded series for faster and predictable startup.

## Why this is implemented
Dynamic HEAD/series discovery can be slow in this environment.

Apropos now uses:

- `ade createview -label <view> --series OSS_MAIN_LINUX.X64`

before entering the view.
