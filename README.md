# Classic Browser RPG Prototype

Small old-school browser RPG built with plain HTML, CSS, JavaScript, and an HTML5 canvas.

No engines. No frameworks. Fast iteration.

## Project Goal
Build a classic-style RPG loop in the browser:
- Move around a tile world
- Fight enemies
- Gather resources
- Train skills
- Craft useful items
- Expand content over time

## Current Features

### Core Gameplay
- Top-down tile map rendered on canvas
- Click-to-move navigation
- Combat with enemy level context
- Loot drops and pickup
- Zone transitions between overworld and dungeon via ladder interactions
- Dungeon starter combat loop with rats and goblins

### UI and Systems
- Inventory with right-click actions (equip, use, drop)
- Equipment slots (weapon/offhand)
- Quiver system for arrows (separate from inventory slots)
- Bank storage
- Vendor buy/sell interface
- Draggable/resizable UI windows
- Skills panel with XP, levels, and combat level display

### Skills and Progression
- Accuracy, Power, Defense, Ranged, Sorcery, Health
- Gathering/crafting skills including Woodcutting, Mining, Fishing, Firemaking, Cooking, Fletching, and Smithing
- Melee training selector (route melee XP to Accuracy/Power/Defense)
- XP gain messaging and level-up feedback

### Gathering and Crafting
- Woodcutting: trees -> logs -> XP
- Mining: rocks -> ore -> XP
- Firemaking: Flint & Steel + logs -> temporary campfire
- Cooking via campfire loop
- Smelting: furnace converts `ore` -> `crude_bar` with Smithing XP
- Smithing: anvil + hammer forging for `crude_dagger`, `crude_sword`, and `crude_shield`

### Recent Updates (v0.4.4)
- Added dungeon zone framework (`overworld` / `dungeon`) with save/load support.
- Added ladder-based zone travel and dungeon return path.
- Added smithing gameplay loop (smelt + forge) and smithing action animations.
- Added equipment combat stat wiring (`att`, `dmg`, `def`, style-aware combat routing).
- Added dungeon spawn migration/roaming fixes for rats and goblins on older saves.

### Visual Updates (v0.4.0)
- Emoji iconography replaced with handcrafted SVG icon art
- Skills icons are larger and easier to read
- Sorcery uses a wizard-hat icon
- Naming cleanup: `Woodcut` -> `Woodcutting`

### Stability Updates (v0.4.3)
- GitHub Pages loading/path issues resolved for project-site hosting.
- Module imports are standardized to canonical `src/` paths.
- Import-path validation is automated in CI on push/PR.

## What Is Next
- More enemies and combat variety
- Expanded item/drop tables
- More resource tiers and crafting progression
- Additional world areas and interactions
- Vendor economy tuning and item expansion

## Run Locally
You can open `index.html` directly, but a local server is recommended.

### Python
```bash
python -m http.server 8000
```

Then open:
- `http://localhost:8000`

### Node Dev Server
If you prefer npm scripts:

```bash
npm install
npm run dev
```

Then open:
- `http://127.0.0.1:8000`

## Gameplay Test Shell
For fast gameplay/debug testing, start with:

- `http://127.0.0.1:8000/?test=1`

In test mode:
- Start/load overlays are skipped.
- A debug API is exposed at `window.__classicRpg`.

Available debug helpers:
- `window.__classicRpg.getState()`
- `window.__classicRpg.getLadders()`
- `window.__classicRpg.newGame()`
- `window.__classicRpg.setZone("overworld" | "dungeon", { spawn: true })`
- `window.__classicRpg.interactTile(x, y)`
- `window.__classicRpg.useLadder("down" | "up")`
- `window.__classicRpg.teleport(x, y, { requireWalkable: true })`
- `window.__classicRpg.saveNow()`
- `window.__classicRpg.loadNow()`
- `window.__classicRpg.clearSave()`
- `window.__classicRpg.tickMs(16)`

## Smoke Test
Run automated smoke checks with Playwright:

```bash
npm run smoke
```

For a visible browser run:

```bash
npm run smoke:headed
```

## Release Notes
- Current live patch notes: `PATCH_NOTES.md`
- Latest full release notes: `RELEASE_NOTES_v0.4.4.md`
- Previous release notes: `RELEASE_NOTES_v0.4.0.md`

## Module Layout Safety
- JavaScript modules are canonical in `src/` and imported from `game.js` as `./src/*.js`.
- Before publishing, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .github/scripts/validate-imports.ps1
```

- GitHub Actions also runs this validation on every push and pull request.

## Patch Notes Workflow
- Update `PATCH_NOTES.md` as you build.
- Keep the `Discord Copy (Paste This)` block player-facing and concise.
- At release time, paste that block into Discord, then archive details in a new `RELEASE_NOTES_vX.Y.Z.md`.
