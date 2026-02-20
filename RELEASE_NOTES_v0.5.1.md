# Classic RPG v0.5.1
Release draft: February 19, 2026

Comparison baseline: `v0.5.0..HEAD`

## Highlights
- Added RuneScape-style bank notes (withdraw as notes toggle).
- Replaced browser prompts with an in-game number modal.
- Added smithing "Make All" to craft sequentially.
- Improved vendor selling UX (Sell X + notes sellable).
- Cooking now converts raw items directly into cooked items (no drops).
- Game simulation continues when the tab is hidden (only pauses on start menu).

## Bank and Inventory
- Added bank notes toggle: withdraw items as notes that stack in inventory.
- Noted items show "(noted)" and cannot be used for crafting or equipping.
- Notes can be deposited back to the bank and sold to vendors.
- Bank stack names now pluralize (e.g., log/logs).

## Smithing
- Added "Make All" next to Forge; crafts one item at a time like cooking.

## Vendor
- Added Sell X to the vendor sell tab.
- Fire Staff is now sellable for 150g (vendor only; not buyable).

## UI and UX
- Added in-game number modal for Deposit X / Withdraw X / Drop X / Sell X / Move Arrows X.
- Objective card now appears consistently and stays draggable without snapping back.
- Startup chat is consolidated and less spammy at character creation.
- Hearth decor now mirrors seating around the cauldron with a second stool.

## Performance
- Optimized dungeon torch rendering to reduce canvas state changes.

## Fixes
- Clearing stale "Use" tool state prevents false item-on-item warnings when equipping.
- Cooking no longer drops cooked items when inventory is full.

## Cooking
- Cauldron cooking runs continuously like campfire cooking.
- Raw items convert into cooked items in inventory (no ground drops).
- Raw and cooked fish/food no longer stack in inventory (each takes one slot).
- Fish and cooked food still stack normally when deposited in the bank.

## Known Limits (v0.5.1 Draft)
- Note items are inventory-only and cannot be used in crafting or equipment actions.
- Notes do not have unique icons yet; they reuse base item icons.
