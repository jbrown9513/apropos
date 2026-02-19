# ADE lsviews Compatibility Fix

## Overview
ADE workspace listing failed when using `ade useview -list` on environments where that flag is not supported.

## Why this is implemented
The ADE plugin now uses `ade lsviews` for view discovery, and workspace view parsing extracts the first column from ADE's table output.

This keeps view dropdowns populated with valid view names across ADE variants.
