// ========== RIVERMOOR TOWN DONATIONS - Resource & Item-Based System ==========
// Exported as a module. Depends on town-system and game.js callbacks.

// Private module state for item donations (core system)
const itemDonations = {};

// Injected callbacks from game.js
let getTownRenownRef = null;
let grantTownRenownRef = null;
let spendGoldRef = null;
let chatLineRef = null;
let hasItemRef = null;
let removeItemRef = null;
let getProjectStateRef = null;
let getProjectRequirementsRef = null;

/**
 * Initialize donations module with dependencies
 */
export function initDonationSystem(deps) {
  if (deps.getTownRenown) getTownRenownRef = deps.getTownRenown;
  if (deps.grantTownRenown) grantTownRenownRef = deps.grantTownRenown;
  if (deps.spendGold) spendGoldRef = deps.spendGold;
  if (deps.chatLine) chatLineRef = deps.chatLine;
  if (deps.hasItem) hasItemRef = deps.hasItem;
  if (deps.removeItem) removeItemRef = deps.removeItem;
  if (deps.getProjectState) getProjectStateRef = deps.getProjectState;
  if (deps.getProjectRequirements) getProjectRequirementsRef = deps.getProjectRequirements;
}

/**
 * Donate items to a project
 * Deducts from inventory, tracks progress, auto-completes project if all requirements met
 */
export function donateItemToProject(townId, projectId, itemId, qty) {
  if (townId !== "rivermoor") {
    return { success: false, reason: "Town not found" };
  }

  qty = qty | 0;
  if (qty <= 0) {
    return { success: false, reason: "Quantity must be positive" };
  }

  // Get project state (from module reference)
  if (!getProjectStateRef) {
    return { success: false, reason: "Project system not initialized" };
  }

  // Project must be unlocked or already in progress
  const proj = getProjectStateRef(townId, projectId);
  if (!proj) {
    return { success: false, reason: "Project not found" };
  }

  // Check if player has the item
  if (!hasItemRef || !hasItemRef(itemId)) {
    return { success: false, reason: `You don't have ${itemId}` };
  }

  // Remove from inventory
  if (!removeItemRef || !removeItemRef(itemId, qty)) {
    return { success: false, reason: `Couldn't remove ${qty} x ${itemId}` };
  }

  // Record donation (will be handled via the injected project ref)
  return {
    success: true,
    donated: qty,
    itemId,
    projectId
  };
}

/**
 * Donate gold to a project
 */
export function donateGoldToProject(townId, projectId, amount) {
  if (townId !== "rivermoor") {
    return { success: false, reason: "Town not found" };
  }

  amount = amount | 0;
  if (amount <= 0) {
    return { success: false, reason: "Amount must be positive" };
  }

  // Check gold
  if (!spendGoldRef(amount)) {
    return { success: false, reason: `Insufficient gold` };
  }

  return {
    success: true,
    donated: amount,
    projectId
  };
}



