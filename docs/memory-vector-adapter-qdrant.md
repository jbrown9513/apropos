# Memory Vector Adapter Qdrant

## Overview
Added a Qdrant-backed vector adapter for the Apropos memory engine.

The memory engine now:
- generates deterministic embeddings from memory/query text
- upserts memory vectors into Qdrant when provider is `qdrant`
- uses Qdrant search results during recall ranking

## Why
Core memory functionality needs semantic recall behavior, not only lexical matching.

This adapter keeps the engine framework-agnostic while enabling vector retrieval when configured.
