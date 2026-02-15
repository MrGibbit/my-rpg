# Classic RPG v0.4.4
Release drop: February 15, 2026

## Highlights
- Full UI icon pass: replaced emoji iconography with handcrafted in-game SVG art.
- Combat + progression updates are included in this drop.
- Skills panel readability pass (larger standalone skill icons and naming cleanup).
- Added dungeon-zone foundation and playable ladder vertical slice.
- Added smithing gameplay loop (smelt + forge) with smithing XP progression.

## Combat & Progression
- Combat level is calculated from Accuracy/Power/Defense/Ranged/Sorcery/Health levels.
- Combat level is shown in both HUD and Skills panel for clearer progression tracking.
- Melee training selector supports directing melee XP to Accuracy, Power, or Defense.
- XP routing by style is now explicit:
  - Melee: Health XP + selected melee skill XP
  - Ranged: Health XP + Ranged XP
  - Sorcery: Health XP + Sorcery XP
- Enemy attack entries in context menus use level-difference coloring for risk readability.
- Save compatibility includes migration support for legacy `combat` XP into modern combat skills.
- Added item combat stats on equipment (`style`, `att`, `dmg`, `def`) and wired equipped stats into live combat math.
- Shield defense now contributes to reducing enemy hit chance.
- Combat style selection now respects weapon-declared style first, with legacy class fallback when needed.

## Smithing
- Added a full smithing loop:
  - Smelt `ore` into `crude_bar` at furnaces.
  - Forge equipment at anvils using bars.
- Added smithing requirements and gating:
  - Hammer requirement for forging.
  - Anvil proximity checks for opening/using smithing UI.
  - Level and material checks on recipe actions.
- Added starter smithing recipes from `crude_bar`:
  - `crude_dagger` (1 bar, Lv 1)
  - `crude_sword` (2 bars, Lv 1)
  - `crude_shield` (2 bars, Lv 2)
- Smelting and forging both award Smithing XP.
- Craft outputs now safely drop to ground if inventory is full (no silent loss).

## Dungeon / Zone Framework
- Added active-zone plumbing in state (`overworld` / `dungeon`).
- Core world collections now resolve against the active zone (`map`, `resources`, `mobs`, `interactables`, `groundLoot`, `manualDropLocks`).
- Added zone-aware pathfinding/nav rebuild hooks for transitions.
- Save format bumped to `v3` with `activeZone` plus per-zone world snapshots.
- Added backward-compatible load handling for legacy saves without zone data.

## Dungeon Ladder Vertical Slice
- Added an overworld `Ladder Down` and a dungeon `Ladder Up` return point.
- Added climb interactions (`Climb Down` / `Climb Up`) with zone transitions.
- Expanded dungeon from a single room into a multi-room layout with corridors and a lower hall.
- Added dungeon-specific tile visuals (torches, pillars, debris, pit-bridge) for distinct zone identity.
- Moved the surface dungeon entrance ladder to tile `(17,4)`.
- Updated dungeon default mob spawns so rats/goblin appear in the chamber next to the ladder room.
- Added migration for legacy dungeon default mob layouts so older saves receive updated spawn positions.
- Added dungeon idle roaming for rats/goblins so they do not remain pinned after load.

## World, Encounters, and Visual Pass
- Added goblins as an additional enemy encounter type.
- Rat enemy visuals received a detailed sprite refresh pass.
- Rat spawn distribution was reworked for more natural spacing.
- Starter rat training cluster was strengthened while keeping a small number of natural strays.
- Rat training packs/top-offs were constrained south of the river for clearer early-game routing.
- Added starter castle visual pass with expanded interior/exterior decor details.
- Added a dedicated vendor shop building and environment dressing.
- Moved the vendor NPC into the new shop location.
- Added in-hand offhand shield rendering when a shield is equipped.
- Added distinct world visuals for `shield`, `crude_shield`, `sword`, `crude_sword`, `crude_dagger`, `bow`, and `staff`.

## Inventory, Equipment, and Ammo UX
- Left-click in inventory now equips equippable items (including weapons/offhand).
- Inventory and bank now use flat item art (no per-item square icon background).
- Added custom in-game hover tooltips for Inventory, Bank, and Equipment slots.
- Added item combat-stat tooltip lines and updated tooltip terminology (`+ATK` -> `+ACC`).
- Raised tooltip z-layer above windows so tooltips always render in front.
- Equipment slot tooltips now include item stats and unequip hint text.
- Equipment tab includes a dedicated Quiver slot with live arrow icon/count display.
- Added quiver right-click actions to move arrows to inventory (`1`, `10`, `X`, `All`).
- Arrows moved into inventory now stack in one slot (RuneScape-style behavior).
- Arrow stacks in inventory can be equipped directly back into quiver.
- Corrected stack-aware behavior for arrow drop/deposit/sell flows.
- Save/load preserves arrows intentionally stored in inventory.

## Action Animation Pass
- Added smithing animation (hammer swing + impact sparks/glow).
- Added smelting animation (ore toss + heat/embers).
- Added active station feedback on furnace/anvil while crafting.
- Equipped hand gear hides while smith/smelt/woodcut/mine animations are playing.

## Skills/Naming
- `Woodcut` label updated to `Woodcutting`.
- Canonical skill-name mapping added to keep UI labels and XP/level-up messages consistent, including older runtime state.

## Technical Notes
- Fixed GitHub Pages module 404 loading issues.
- Added GitHub Pages base-path handling in `index.html` for project-site path safety.
- Standardized `game.js` module imports back to canonical `src/` paths.
- Added import path validation script and GitHub Actions validation on push/PR.
- Updated cache-bust asset query strings for forced fresh client loads after deploy.
- Added local dev server script (`npm run dev`) and Playwright smoke scaffold (`npm run smoke`).
- Added `?test=1` boot mode and `window.__classicRpg` debug API for scripted checks and ladder interaction testing.
