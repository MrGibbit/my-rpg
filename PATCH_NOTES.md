# Patch Notes Draft

Use this file as the live notes while building.

## Current (Unreleased)
- Version: `v0.4.4`
- Date: `February 15, 2026`

```md
**Classic RPG - v0.4.4 Update (Draft)**

**Combat + Gear Stats**
- Added item combat stats on equipment (`style`, `att`, `dmg`, `def`).
- Equipped weapon/offhand stats now affect live combat calculations.
- Added per-item stat values for current gear:
  - `sword`, `bow`, `staff`: +ACC/+DMG on their matching style.
  - `crude_sword`, `crude_dagger`: lower-tier melee +ACC/+DMG.
  - `shield`, `crude_shield`: defensive bonuses.
- Combat skill routing now follows:
  - Melee: Accuracy = hit chance, Power = damage.
  - Ranged: Ranged = hit chance + damage.
  - Sorcery: Sorcery = hit chance + damage.
- Shield defense now contributes to reducing enemy hit chance.
- Combat style now respects weapon-declared style first, with legacy class fallback if none is set.

**Equipment + Character Visuals**
- Player weapon in-hand now matches the actually equipped weapon item.
- Added in-hand offhand shield rendering when a shield is equipped.
- Added distinct world visuals for:
  - `shield` vs `crude_shield`
  - `sword`, `crude_sword`, `crude_dagger`, `bow`, `staff`
- No weapon/offhand visual is shown when the slot is empty.

**Action Animation Pass**
- Added smithing animation (hammer swing + impact sparks/glow).
- Added smelting animation (ore toss + heat/embers).
- Added active station feedback on furnace/anvil while crafting.
- Equipped hand gear hides while smith/smelt/woodcut/mine action tool animations are playing.

**Smithing**
- Added a full smithing loop: smelt `ore` into `crude_bar` at furnace, then forge gear at anvil.
- Smithing now uses hammer + anvil requirements and checks station proximity before opening/using the smithing window.
- Added starter `crude_bar` recipes:
  - `crude_dagger` (1 bar, Lv 1)
  - `crude_sword` (2 bars, Lv 1)
  - `crude_shield` (2 bars, Lv 2)
- Smelting and forging both grant Smithing XP and progress the skill normally.
- If inventory is full during smelt/forge output, crafted items/materials drop to ground instead of being lost.

**Inventory / Equipment UX**
- Left-click in inventory now equips weapons.
- Left-click in inventory now equips any equippable item (weapon/offhand/armor-ready).
- Inventory and bank now use flat item art (no per-item square icon background).
- Inventory/bank slots remain boxed-in; only icon art background was flattened.
- Added custom in-game hover tooltips for Inventory, Bank, and Equipment slots.
- Added combat-stat tooltip lines on item hover.
- Equipment panel icons now match inventory icon style.
- Tooltip label update: `+ATK` -> `+ACC`.
- Raised tooltip z-layer above windows so it always appears in front.
- Equipment slot tooltips include item stats and unequip hint text.

**World + Encounter Baseline (v0.4.3 carryover)**
- Added goblins as an additional enemy encounter type.
- Rat enemy visuals received a detailed sprite refresh pass.
- Rat spawn distribution was reworked for more natural spacing.
- Starter rat training cluster was strengthened while keeping a small number of natural strays.
- Rat training packs/top-offs were constrained south of the river for clearer early-game routing.

**Quiver + Ammo Baseline (v0.4.3 carryover)**
- Equipment tab includes a dedicated Quiver slot with live arrow icon/count display.
- Added quiver right-click actions to move arrows to inventory (`1`, `10`, `X`, `All`).
- Arrows moved into inventory now stack in one slot (RuneScape-style behavior).
- Arrow stacks in inventory can be equipped directly back into quiver.
- Stack quantity handling was corrected for arrow drop/deposit/sell flows.
- Save/load preserves arrows intentionally stored in inventory.

**World Art + Vendor Baseline (v0.4.3 carryover)**
- Added starter castle visual pass with expanded interior/exterior decor details.
- Added a dedicated vendor shop building and environment dressing.
- Moved the vendor NPC into the new shop location.

**Technical + Deployment Stability (v0.4.3 carryover)**
- Fixed GitHub Pages module 404 loading issues.
- Added GitHub Pages base-path handling in `index.html` for project-site path safety.
- Standardized `game.js` module imports back to canonical `src/` paths.
- Added import path validation script and GitHub Actions validation on push/PR.
- Updated cache-bust versions to force fresh client asset loads after deploy.

**Zone Framework (Dungeon Prep)**
- Added active-zone plumbing (`overworld` / `dungeon`) in state.
- Core world collections (`map`, `resources`, `mobs`, `interactables`, `groundLoot`, `manualDropLocks`) now resolve from the current zone.
- Added zone-aware navigation rebuild hooks so pathfinding can swap with zone changes.
- Save format bumped to `v3` with `activeZone` plus per-zone world snapshots.
- Added backward-compatible load handling for legacy saves without zone data.

**Gameplay Test Shell**
- Added `?test=1` boot mode to skip overlays for quick iteration.
- Added `window.__classicRpg` debug API for scripted checks (zone switch, teleport, save/load, tick).
- Expanded debug API with ladder/test helpers (`getLadders`, `interactTile`, `useLadder`) for automated interaction checks.
- Added local dev server script (`npm run dev`) and Playwright smoke test scaffold (`npm run smoke`).

**Dungeon Ladder Vertical Slice**
- Added an overworld `Ladder Down` and a dungeon `Ladder Up` return point.
- Added climb interactions (`Climb Down` / `Climb Up`) with zone transitions.
- Added a starter dungeon room mob pack for early combat testing.
- Added ladder visuals, examine text, and context-menu actions.
- Updated smoke coverage to verify ladder-based zone transitions.
- Expanded the dungeon from a single room into a multi-room layout with corridors and a lower hall.
- Added dungeon-specific tile rendering, torches, pillars, debris, and a pit-bridge section to give the area a distinct look.
- Overworld castle/shop decor now renders only in overworld (no decor bleed into dungeon zone).
- Moved the surface dungeon entrance ladder to tile `(17,4)` for easier access.
- Updated dungeon default mob spawns so rats/goblin appear in the chamber next to the ladder room.
- Added migration for legacy dungeon default mob layouts so older character saves update to current spawn positions.
- Added dungeon idle roaming for rats/goblins so they no longer stay pinned to exact spawn tiles after load.
```

## Posted
- `v0.4.3` has already been posted.

### Internal Notes
- Keep this section updated as work happens.
- When finalizing a release, copy this into `RELEASE_NOTES_vX.Y.Z.md`.
