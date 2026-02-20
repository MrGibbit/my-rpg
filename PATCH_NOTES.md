# Patch Notes Draft

Use this file as the live notes while building.

## Current (Unreleased)
- Version: `v0.5.1`
- Date: `February 19, 2026`
- Base comparison: `v0.5.0..HEAD`

```md
# Classic RPG - v0.5.1 (Draft)

Compared to `v0.5.0`, this release focuses on usability, bank notes, and vendor improvements.

## Highlights
- Added RuneScape-style bank notes (withdraw as notes toggle).
- Replaced browser prompts with an in-game number modal.
- Added smithing "Make All" to craft sequentially.
- Improved vendor selling UX (Sell X + notes sellable).
- Cooking now converts raw items directly into cooked items (no drops).
- Game simulation continues when the tab is hidden (only pauses on start menu).

## Bank and Inventory
- Added bank notes toggle: withdraw items as notes that stack in inventory.
- Noted items display as "(noted)" and cannot be used for crafting or equipping.
- Notes can be deposited back to the bank and sold to vendors.
- Bank stack names now pluralize (e.g., log/logs).

## Smithing
- Added "Make All" next to Forge, crafting one item at a time (like cooking).
- Prevented objective UI drag overrides from repositioning during drag.

## Vendor
- Added Sell X for the vendor sell tab.
- Fire Staff is sellable for 150g (vendor only; not buyable).

## UI and UX
- Added in-game number modal for Deposit X / Withdraw X / Drop X / Sell X / Move Arrows X.
- Objective card now appears consistently and remains draggable without snapping back.
- Startup chat is consolidated and less spammy.
- Hearth decor adjusted: added a second stool at the cauldron area.

## Performance
- Optimized dungeon torch rendering to reduce canvas state changes.

## Cooking
- Cauldron cooking continues like campfire cooking.
- Raw items now convert into cooked items in inventory (no ground drops).
- Raw and cooked fish/food no longer stack in inventory (each takes one slot).
- Fish and cooked food still stack normally when deposited in the bank.
```

## Posted
- Latest full GitHub release: `v0.4.4`.
- Pending release-notes files in repo: `v0.4.5`, `v0.4.6`, `v0.4.7`.

### Internal Notes
- Keep this section updated as work happens.
- Final release notes for this draft are in `RELEASE_NOTES_v0.4.7.md`.
