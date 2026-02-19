# MCP Remove Single Tool Preservation Fix

## Overview

Removing one MCP tool could clear all MCP tools for a project.

## Why

Project UI lists were built from the effective inspected MCP config, but add/setup/remove writes were using stored project MCP state.
When stored state was empty or stale, write-back could serialize an incomplete set and unintentionally clear other MCP tools.

This fix makes add/setup/remove operations resolve the current writable MCP tool set first, then apply the single requested change.
That keeps unaffected MCP tools preserved.
