# Patch Notes Draft

Use this file as the live notes while building.

## Current (Unreleased)
- Version: `v0.4.6`
- Date: `February 15, 2026`

```md
# Classic RPG - v0.4.6 (Draft)

## Quest System + Journal UI
- Added a new Quests toolbar button and full Quest Journal window.
- Quest Journal now shows `Active`, `New`, `Locked`, and `Completed` sections with objective progress and reward lines.
- Added quest-state tracking runtime in `game.js` with objective matching for:
  - gather item events
  - cook events
  - smelt events
  - NPC talk events
  - mob kill events
  - manual quest triggers
- Added automatic quest start/completion flow for the new quest chain and quest-reward handling.
- Quest progress is now saved/loaded with normal game persistence.

## New Questline Content
- Added quest definitions in `src/game-data.js`:
  - `first_watch`
  - `ashes_under_the_keep`
- Added new quest-related rewards/items:
  - `Warden Key Fragment`
  - `Warden's Brand`
- Added quest giver NPC in starter castle:
  - `Quartermaster Bryn`

## Dungeon Boss-Wing Progression
- Expanded dungeon layout with a sealed boss wing corridor/chamber and gate tiles.
- Added new interactables:
  - `sealed_gate`
  - `brazier`
- Gate flow now supports key-fragment unlock and permanent unseal progression.
- Brazier interaction now supports ritual progression and Warden trigger logic.
- Added Skeleton Warden boss lifecycle:
  - conditional spawn after quest progression
  - custom defeat handling and cleanup
  - Warden-specific gold reward handling
- Added non-respawning behavior for defeated Skeleton Warden.

## Interaction + Event Plumbing
- `src/action-resolver.js` now emits structured quest events for gather, smelt, cook, and kill actions.
- Added interaction handling for new entity kinds:
  - `quest_npc`
  - `sealed_gate`
  - `brazier`
- Added resolver callbacks for quest NPC talk, gate usage, brazier usage, and post-defeat mob hooks.
- Added entity lookup support and examine text for the new interaction targets.

## UI + Art Additions
- Added custom world rendering for:
  - quest NPC
  - sealed gate (open/closed states, segment-aware rendering)
  - dungeon braziers (lit/unlit states)
- Added quest window styling and min-size constraints in `style.css`.
- Added `quests` window state support in `src/state.js`.

## Character Flow Refactor
- Moved character overlay/load/delete orchestration from `game.js` into a new module:
  - `src/character-ui.js`
- Wired `game.js` to use `createCharacterUI(...)` while preserving existing character flow behavior.

## Balance
- Smithing rebalance pass:
  - Smelting XP changed from `45` to `20` per ore in `src/action-resolver.js`.
  - This brings smelt+forge-per-ore progression closer to mining pace.

## Test Coverage
- Expanded Playwright smoke test (`tests/smoke.spec.js`) to cover:
  - opening the Quests window
  - Quartermaster interaction (`quest_npc`)
  - sealed gate interaction in dungeon (`sealed_gate`)
- Added dedicated quest regression suite (`tests/quests.spec.js`) covering:
  - full `first_watch` + `ashes_under_the_keep` progression
  - mid-quest save/load persistence checks
  - guardrails for sealed gate denial without key fragment
  - guardrails for non-duplicating quest rewards after save/load

## Test/Dev Tooling
- Extended debug API in `src/debug-api.js` with test helpers:
  - `getQuests()`
  - `questEvent(...)`
  - `getItemQty(...)`
  - `getGold()`
- Wired `game.js` to expose these hooks only when debug API is enabled.

## Repo Hygiene + Versioning
- Added `.gitignore` entries for:
  - `node_modules/`
  - `test-results/`
  - `.server-*.log`
- Bumped `package.json` version from `0.4.5-dev` to `0.4.6-dev`.

## Warden's Brand Upgrade
- Kept `Warden's Brand` as an offhand shield item and improved combat stats:
  - now grants `+1 ACC`, `+1 DMG`, `+6 DEF`
- Added Warden's Brand passive combat effects in `src/combat-rolls.js`:
  - bonus accuracy + damage versus undead (`skeleton`, `skeleton_warden`)
  - reduces incoming undead hit damage by 1
- Added dedicated equipped offhand sprite rendering for `wardens_brand` in `game.js` so it is visibly distinct from base shields.
```

## Posted
- `v0.4.5` has already been posted.

### Internal Notes
- Keep this section updated as work happens.
- When finalizing a release, copy this into `RELEASE_NOTES_vX.Y.Z.md`.
