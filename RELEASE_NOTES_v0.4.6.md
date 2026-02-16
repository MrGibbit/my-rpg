# Classic RPG v0.4.6
Release drop: February 15, 2026

## Highlights
- Refactored equipment visuals into a data-driven system with shared visual rules.
- Added Blacksmith Torren and forge bank chest upgrade flow with persistence.
- Upgraded Warden's Brand combat effects and equipped visual treatment.
- Tuned armor combat impact so defense now mitigates landed-hit damage in addition to miss chance.
- Expanded regression and smoke coverage for release-critical flows.

## Equipment Visual Overhaul (Armor + Weapons)
- Refactored equipment visuals to use a shared rules source.
- Added `src/equipment-visuals.js` to centralize:
  - equip material inference (`crude`, `iron`, etc.)
  - equip visual-key inference (`helm_iron`, `body_crude`, `iron_shield`, etc.)
  - default `equipVisual` assignment for equipable items
- Updated `game.js` to apply visual defaults once via `applyEquipmentVisualDefaults(Items)`.
- Refactored `src/player-gear-renderer.js` to consume shared visual rules and reduce duplicated inference logic.
- Added renderer extension hook:
  - `registerRenderer(slotName, key, drawFn)`
- Updated render flow so armor drives integrated player appearance while held gear remains prop-based:
  - `head/body/legs/hands/feet` modify base player look
  - `weapon/offhand` render as props
- Added/confirmed explicit crude + iron armor/shield mappings and tuned placement/silhouette readability.

## Blacksmith + Forge Upgrade
- Added Blacksmith Torren at the south keep forge.
- Added forge bank chest unlock upgrade for `10,000` gold.
- Added persistent world-upgrade state for forge bank unlock.
- Added dedicated `blacksmith` upgrade window with range-based auto-close behavior.
- Added blacksmith art pass and a dedicated forge bank chest icon.
- Added Quartermaster talk cooldown to reduce repeat-dialogue spam.

## Warden's Brand Upgrade
- Updated `Warden's Brand` offhand stats to `+1 ACC`, `+1 DMG`, `+6 DEF`.
- Added Warden's Brand passive effects against undead:
  - bonus player hit chance/damage versus `skeleton` and `skeleton_warden`
  - reduces incoming undead damage by 1
- Added dedicated equipped offhand visual treatment for Warden's Brand.

## Armor Mitigation Tuning
- Updated armor so defense now contributes both to enemy miss chance and damage reduction on landed hits.
- Added per-hit reduction scaling from total equipped DEF to strengthen gear progression sustain.
- Added combat text when armor fully negates a landed hit:
  - `Your armor blocks the blow.`

## Tests and Dev Tooling
- Expanded smoke coverage for blacksmith upgrade flow and persistence.
- Added dedicated quest regression suite (`tests/quests.spec.js`) with save/load and anti-duplication guardrails.
- Extended debug API helpers:
  - `getQuests()`
  - `questEvent(...)`
  - `getItemQty(...)`
  - `getGold()`

## Repo Hygiene and Versioning
- Added `.gitignore` entries for:
  - `node_modules/`
  - `test-results/`
  - `.server-*.log`
- Bumped package version from `0.4.5-dev` to `0.4.6-dev`.
