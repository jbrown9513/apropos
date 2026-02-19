# MCP Catalog Reference Error On Server Start

## Overview
The server could fail to start with:
`ReferenceError: getMcpCatalog is not defined`.

## Why This Was Implemented
MCP catalog behavior moved toward project-scoped repositories, and some code paths still expected a `getMcpCatalog` helper.
Adding a `getMcpCatalog` helper in `src/server.js` keeps startup stable and provides a single compatibility path that works for both project-scoped and global catalog reads.
