# Patch Notes Draft

Use this file as the live notes while building.

## Current (Unreleased)
- Version: `v0.4.3`
- Date: `February 14, 2026`

### Discord Copy (Paste This)
```md
**Classic RPG - v0.4.3 Update (Today Recap)**

**Content + UI (from today)**
- Full UI icon pass: replaced emoji iconography with handcrafted SVG icon art.
- Skills panel readability pass (larger icons), including Sorcery wizard-hat icon.
- Naming cleanup: `Woodcut` -> `Woodcutting`.
- Starter castle visual pass with expanded interior/exterior decor details.
- Added a dedicated vendor shop building and environment dressing.
- Moved the vendor NPC into the new shop location.
- Rat enemy visual refresh with a more detailed sprite pass (layered body/head, shading, whiskers, motion, and facing).
- Equipment tab now includes a dedicated Quiver slot with live arrow icon/count display.

**World + Encounters (from today)**
- Added goblins as a new enemy encounter.
- Rat spawn distribution reworked for more natural spacing (less uniform spread).
- Rats now form a stronger starter training cluster while still keeping a small number of natural strays.
- Rat training packs are now positioned south of the river.
- All rat spawn top-offs/outskirts are constrained south of the river, replacing prior one-off manual placement tweaks.

**Combat + Progression (from today)**
- Combat level now derived from core combat skills and shown in HUD + Skills panel.
- Melee training selector now routes melee XP to Accuracy / Power / Defense.
- XP routing by style clarified (Melee, Ranged, Sorcery) with Health XP integration.
- Enemy attack context menu entries now use level-difference coloring for clarity.
- Save migration compatibility added for legacy `combat` XP data.

**Inventory + Ammo (from today)**
- Added quiver right-click actions to move arrows to inventory (`1`, `10`, `X`, `All`).
- Arrows moved into inventory now stack in one slot (RuneScape-style behavior).
- Arrow stacks in inventory can now be equipped directly back into quiver.
- Fixed stack quantity handling for arrow drop/deposit/sell flows.
- Save/load now preserves arrows intentionally stored in inventory.

**Technical / Stability**
- Fixed GitHub Pages module 404 issues.
- Added GitHub Pages base-path handling in `index.html` for project-site path safety.
- Refactored module imports back to canonical `src/` layout in `game.js`.
- Added import path validation script to prevent broken relative imports.
- Added GitHub Actions validation on push/PR for import targets.
- Updated cache-bust versions to force fresh client asset loads after deploy.

If you still see old behavior after deploy, hard refresh once (Ctrl+F5).
```

### Full Session Changelog (Today)
- Released/assembled `v0.4.0` feature set:
- Combat level calculation and visibility improvements.
- Melee XP training selector and explicit style-based XP routing.
- UI/visual icon overhaul from emoji to custom SVGs.
- Castle visual/decor overhaul pass for stronger world readability.
- Added a dedicated vendor shop area and relocated the vendor NPC into it.
- Rat enemy visual upgrade with improved readability/animation.
- Added goblins as an additional enemy type for world combat encounters.
- Skills label/naming consistency updates and runtime mapping support.
- Save compatibility migration handling for older combat XP format.
- Rat spawn system pass:
- Added clustered starter training packs with natural spacing variance.
- Kept a small number of outskirts rats so world encounters remain organic.
- Constrained rat spawning to south-of-river regions for clearer early routing.
- Removed brittle one-off rat coordinate relocation in favor of procedural placement rules.
- Investigated live GitHub Pages loading failures at:
- `https://mrgibbit.github.io/Gibbits-rpg/`
- Diagnosed module resolution problem (`/src/*.js` requests returning 404 on deployed structure).
- Implemented and iterated deployment-safe loading fixes.
- Refactored back to clean canonical imports in `game.js`:
- `./src/utils.js`
- `./src/config.js`
- `./src/skills.js`
- `./src/navigation.js`
- `./src/state.js`
- Added `.github/scripts/validate-imports.ps1`:
- Scans `game.js` and `src/*.js` for relative imports.
- Fails when any referenced module file is missing.
- Added `.github/workflows/validate-imports.yml`:
- Runs import validation on `push` to `main` and on `pull_request`.
- Updated docs:
- `README.md` module layout safety section.
- `README.md` patch notes workflow section.
- Added `PATCH_NOTES.md` to maintain Discord-ready notes continuously.
- Added equipment-panel quiver slot with visible arrow stack count.
- Added quiver context actions to move arrows into inventory.
- Implemented RuneScape-style arrow stacking when arrows are in inventory.
- Added equip-from-inventory for arrow stacks (moves back to quiver).
- Corrected stack-aware behavior for arrow drop/deposit/sell actions.
- Preserved inventory-stored arrows through save/load.

### Internal Notes
- Keep this section updated as work happens.
- When finalizing a release, copy this into `RELEASE_NOTES_vX.Y.Z.md`.
