# Patch Notes Draft

Use this file as the live notes while building.

## Current (Unreleased)
- Version: `v0.4.6`
- Date: `February 16, 2026`

```md
# Classic RPG - v0.4.6 (Draft)

## Equipment Visual Overhaul (Armor + Weapons)
- Refactored equipment visuals to be data-driven with a single shared rules source.
- Added `src/equipment-visuals.js` for:
  - equip material inference (`crude`, `iron`, etc.)
  - equip visual-key inference (`helm_iron`, `body_crude`, `iron_shield`, etc.)
  - default `equipVisual` application for all equipable items
- Updated `game.js` to apply visual defaults once via `applyEquipmentVisualDefaults(Items)`.
- Refactored `src/player-gear-renderer.js` to consume shared visual rules instead of duplicating inference logic.
- Added extension hook for future content:
  - `registerRenderer(slotName, key, drawFn)`
- Updated render flow so armor drives integrated character appearance:
  - `head/body/legs/hands/feet` modify base player look
  - `weapon/offhand` remain prop renders
- Added explicit crude + iron armor/shield mappings and placement tuning to improve silhouette/readability.

## Blacksmith + Forge Upgrade Content
- Added Blacksmith Torren at the south keep forge.
- Added forge bank chest unlock upgrade for `10,000` gold.
- Added persistent world-upgrade state for forge bank unlock.
- Added dedicated `blacksmith` upgrade window with range-based auto-close behavior.
- Added blacksmith NPC art pass and dedicated forge bank chest icon.
- Added Quartermaster talk cooldown to reduce repeat-dialogue spam.

## Warden's Brand Combat Upgrade
- Upgraded `Warden's Brand` offhand combat profile to `+1 ACC`, `+1 DMG`, `+6 DEF`.
- Added Warden's Brand passive effects vs undead:
  - bonus player hit chance/damage versus `skeleton` and `skeleton_warden`
  - reduces incoming undead damage by 1
- Added dedicated equipped offhand visual treatment for Warden's Brand.

## Armor Mitigation Tuning
- Updated armor behavior so defense now improves survivability in two ways:
  - increases enemy miss chance (existing behavior)
  - reduces damage taken from landed hits (new behavior)
- Added a small per-hit mitigation based on equipped total DEF, making crude and iron sets feel meaningfully different in sustain.
- Added combat log feedback for full negation cases:
  - `Your armor blocks the blow.`

## Tests + Dev Tooling
- Expanded smoke test coverage for blacksmith upgrade flow and persistence.
- Added dedicated quest regression suite (`tests/quests.spec.js`) with save/load and anti-duplication guardrails.
- Extended debug API test helpers:
  - `getQuests()`
  - `questEvent(...)`
  - `getItemQty(...)`
  - `getGold()`

## Repo Hygiene + Versioning
- Added `.gitignore` entries for:
  - `node_modules/`
  - `test-results/`
  - `.server-*.log`
- Bumped package version from `0.4.5-dev` to `0.4.6-dev`.
```

## Posted
- `v0.4.5` has already been posted.

### Internal Notes
- Keep this section updated as work happens.
- When finalizing a release, copy this into `RELEASE_NOTES_vX.Y.Z.md`.
