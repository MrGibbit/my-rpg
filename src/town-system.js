// ========== RIVERMOOR TOWN SYSTEM - Core Renown & Milestones ==========
// Exported as a module. Game.js injects callback functions for chat/etc.

// Rivermoor tutorial cap is 70 renown
const RENOWN_MILESTONES = {
  25: "Dock available",
  50: "Storage available",
  60: "Hearth available",
  70: "Flourishing"
};

// Private module state
const towns = {
  rivermoor: {
    id: "rivermoor",
    displayName: "Rivermoor",
    renown: 0,      // 0-100 scale
    milestones: {}  // { 10: true, 25: true, ... }
  }
};

// Injected callbacks from game.js
let chatLineRef = null;
let nowRef = null;
let checkProjectUnlocksRef = null;

/**
 * Initialize town system with game.js callback references
 */
export function initTownSystem(deps) {
  if (deps.chatLine) chatLineRef = deps.chatLine;
  if (deps.now) nowRef = deps.now;
  if (deps.checkProjectUnlocks) checkProjectUnlocksRef = deps.checkProjectUnlocks;
}

/**
 * Get current renown for a town
 */
export function getTownRenown(townId) {
  return towns[townId]?.renown ?? 0;
}

/**
 * Get the active town ID (hardcoded to rivermoor for now)
 */
export function getActiveTownId() {
  return "rivermoor";
}

/**
 * Grant renown to a town (Rivermoor capped at 70 for tutorial)
 */
export function grantTownRenown(townId, amount, message) {
  if (townId !== "rivermoor") return false;

  const town = towns.rivermoor;
  const oldRenown = town.renown;
  // Rivermoor tutorial cap: 70 renown max
  const newRenown = Math.min(70, oldRenown + (amount | 0));
  const actualGain = newRenown - oldRenown;

  if (actualGain <= 0) return false;

  town.renown = newRenown;

  if (chatLineRef) {
    chatLineRef(`<span class="good">Rivermoor: +${actualGain} Renown (${newRenown}/70)</span>`);
    if (message) chatLineRef(`<span class="muted">${message}</span>`);
  }

  checkTownMilestones(townId);

  return true;
}

/**
 * Check if any milestones were reached
 */
export function checkTownMilestones(townId) {
  if (townId !== "rivermoor") return;

  const town = towns.rivermoor;
  // Updated milestones for Rivermoor tutorial: 25, 50, 60, 70
  const milestoneThresholds = [25, 50, 60, 70];

  for (const threshold of milestoneThresholds) {
    if (town.renown >= threshold && !town.milestones[threshold]) {
      town.milestones[threshold] = true;
      const msg = RENOWN_MILESTONES[threshold] || `Milestone: ${threshold} renown`;
      triggerMilestoneMayor(townId, threshold, msg);
    }
  }

  // Check for project unlocks when renown changes
  if (checkProjectUnlocksRef) {
    checkProjectUnlocksRef(townId);
  }
}

/**
 * Trigger milestone event (chat message only; no NPC spawn yet)
 */
function triggerMilestoneMayor(townId, milestone, msg) {
  if (chatLineRef) {
    chatLineRef(`<span class="good">[MILESTONE] ${msg}</span>`);
  }
}

/**
 * Reset all town state
 */
export function resetTownState() {
  towns.rivermoor = {
    id: "rivermoor",
    displayName: "Rivermoor",
    renown: 0,
    milestones: {}
  };
}

/**
 * Snapshot for persistence
 */
export function getTownsSnapshot() {
  return JSON.parse(JSON.stringify(towns));
}

/**
 * Apply snapshot from save file
 */
export function applyTownsSnapshot(data) {
  if (!data || typeof data !== "object") {
    resetTownState();
    return;
  }

  towns.rivermoor = data.rivermoor || {
    id: "rivermoor",
    displayName: "Rivermoor",
    renown: 0,
    milestones: {}
  };
}

/**
 * Get internal towns object reference (for debug or internal game use)
 */
export function getTownsRef() {
  return towns;
}
