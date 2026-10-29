# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Foundry VTT module (v13+, verified v14) that highlights the grid spaces a hovered token can reach with its movement speed, with a second "dash" band. Module id is `ork-movement-mapper` (from `module.json`), even though the repo directory is `ork-foundry-movement-mapper`.

There is no build step, package manager, linter, or test suite. Files are plain ES modules loaded directly by Foundry via `module.json` → `esmodules: ["scripts/main.js"]`. To test, the module directory must be installed/symlinked into a Foundry `Data/modules/` folder and exercised in a running world. Enable the module's **Debug** client setting to get `debug()` output in the browser console.

## Architecture

- **`scripts/main.js`** — Entry point. Registers settings (every setting's `onChange` invalidates the cache and redraws), and wires Foundry hooks. Tracks a single module-level `hovered` token. `hoverToken` sets/clears it; `updateToken` hides the highlight while the token animates, then redraws if the cursor is still over it. A list of hooks (actor, wall, region, region behavior, combat changes) simply invalidate + redraw.
- **`scripts/mapper.js`** — `Mapper` does the computation and drawing. A new `Mapper` is constructed on every redraw; it reuses a named highlight layer from `canvas.interface.grid`. Results are memoized in the static `Mapper.cache`, keyed by token id/position/elevation/movement action/budgets — anything else that affects reachability must call `Mapper.invalidate()`.
  - `search()` is Dijkstra over grid offsets. State is `(i, j, parity)`, where parity tracks diagonal count for the alternating 5/10/5 diagonal rules; states are collapsed to the cheapest cost per space at the end.
  - Step cost = base step length (from `grid.diagonals`) × a per-edge ratio. The ratio comes from Foundry's own APIs (`token.checkCollision` for walls, `token.createTerrainMovementPath` + `token.measureMovementPath` for region/terrain costs) so results match the core drag ruler. Ratios are memoized per edge within a search.
  - Token positions for each candidate space are computed by translating the token's document `x/y` by the difference in space centers (anchored on top-left space for square grids, center space for hex).
  - `getSpentMovement()` subtracts movement already recorded in `movementHistory` during the token's active combat turn.
  - Distance labels are `PreciseText` children added to the highlight layer; `clearHighlightLayer` doesn't remove them, so `hide()` destroys children explicitly.
- **`scripts/speed.js`** — `getSpeed(token)` reads the actor's speed for the token's `movementAction` via a path template with `{action}` substitution. Per-system presets (dnd5e, pf2e, sf2e, fallback) supply the default path and action-name mapping (e.g. pf2e `walk=land`); world settings `speedPath`/`actionMap` override them. Falls back to walk speed if the action has no speed. Adding support for a new game system means adding an entry to `presets`.
- **`scripts/util.js`** — Imports `module.json` (JSON import attribute) to expose `module.id`/`module.title`, plus `log`/`debug`/`error` console helpers.

## Conventions

- Setting names/hints live in `lang/en.json` under `ork-movement-mapper.settings.<key>.{name,hint}`; the `setting()` helper in `main.js` looks them up by key, so new settings need both a registration and a lang entry. Keep the README settings table in sync.
- Gridless scenes are intentionally unsupported; only owners (and GMs) see highlights; GM tokens still respect walls.
- 4-space indentation, double quotes, `{x, y}` object spacing without inner padding.
