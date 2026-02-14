# Classic RPG v0.4.0
Release drop: February 14, 2026

## Highlights
- Full UI icon pass: replaced emoji iconography with handcrafted in-game SVG art.
- Combat + progression updates are included in this drop.
- Skills panel readability pass (larger standalone skill icons and naming cleanup).

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

## Visual/UI Overhaul
- Replaced emoji-based item/skill/UI icons with a cohesive fantasy icon set.
- Updated top-right HUD action buttons to custom SVG art.
- Updated vendor/world marker visuals to icon art instead of emoji glyphs.
- Sorcery icon changed to a wizard hat.
- Skills menu icons are larger and no longer use square icon backgrounds.

## Skills/Naming
- `Woodcut` label updated to `Woodcutting`.
- Canonical skill-name mapping added to keep UI labels and XP/level-up messages consistent, including older runtime state.

## Technical Notes
- Cache-bust asset query strings updated to `0.4.0` in `index.html`.
- No save wipe required.
- Core save/load behavior remains compatible.
