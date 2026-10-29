# ORK Movement Mapper

A Foundry VTT module (v13+) that highlights every grid space a token can reach when you hover over it.

## Features

- **Owner/GM only.** The highlight appears only for tokens the current user owns. GMs see it for all tokens.
- **Movement action aware.** Uses the token's active movement action (walk, fly, swim, climb, burrow, …) and the actor's matching speed. If the actor has no speed for that action, it falls back to walk speed.
- **Walls and terrain.** Movement-blocking walls stop the search. Region behaviors that change movement cost (difficult terrain) are applied through Foundry's own terrain measurement, so the result matches the core drag ruler.
- **Grid diagonal rules.** Supports every square-grid diagonal rule, including alternating 5/10/5, and hex grids. Gridless scenes are not supported.
- **Remaining movement in combat.** On the token's turn, the range uses the speed left after the movement already recorded this turn.
- **Dash band.** Spaces reachable only with a dash (default 2× speed) are shown in a second color.

## Settings

| Setting | Scope | Description |
|---|---|---|
| Speed data path | world | Actor data path to the speed, with `{action}` replaced by the movement action. Blank uses the built-in default for the system. |
| Movement action mapping | world | Overrides from core action names to system speed keys, e.g. `walk=land, fly=fly`. |
| Dash multiplier | world | Total movement allowed by a dash, as a multiple of speed. |
| Show dash range | client | Whether to show the dash band. |
| Move color / Dash color | client | Highlight colors. |
| Highlight opacity | client | 0 (transparent) to 1 (solid). |
| Debug | client | Log details to the console. |

### Built-in system defaults

| System | Path | Action mapping |
|---|---|---|
| dnd5e | `system.attributes.movement.{action}` | — |
| pf2e, sf2e | `system.movement.speeds.{action}.value` | `walk=land` |
| other | `system.attributes.movement.{action}` | — |

Speeds are assumed to be in the scene's grid units (e.g. feet).

## Notes

- For tokens larger than one space, the highlighted space is the one the token's top-left corner would occupy.
- GM tokens are blocked by walls in the highlight even though GMs can drag through walls, so the highlight shows the legal path.
