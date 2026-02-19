// ========== RIVERMOOR TOWN PROJECTS - State Machine & Timers ==========
// Exported as a module. Depends on town-system and game.js callbacks.

export const PROJECT_DEFS = {
  dock: {
    id: "dock",
    name: "Repair River Dock",
    town: "rivermoor",
    renownRequired: 25,
    goldCost: 0,
    buildTimeMs: 5000,
    benefit: "fishing_tier_unlock"
  },
  storage: {
    id: "storage",
    name: "Blacksmith Storage",
    town: "rivermoor",
    renownRequired: 50,
    goldCost: 0,
    buildTimeMs: 5000,
    benefit: "bank_unlock"
  },
  hearth: {
    id: "hearth",
    name: "Riverside Cauldron",
    town: "rivermoor",
    renownRequired: 60,
    goldCost: 0,
    buildTimeMs: 5000,
    benefit: "cooking_unlock"
  },
  flourishing: {
    id: "flourishing",
    name: "Flourishing Town",
    town: "rivermoor",
    renownRequired: 70,
    goldCost: 0,
    buildTimeMs: 0,
    benefit: "town_flourish",
    autoComplete: true
  }
};

// Private module state
const townProjects = {
  rivermoor: {
    dock: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 15000,
      itemsDonated: { log: 0, iron_bar: 0 },
      goldDonated: 0
    },
    storage: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 18000,
      itemsDonated: { log: 0, iron_bar: 0 },
      goldDonated: 0
    },
    hearth: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 17000,
      itemsDonated: { cooked_food: 0, crude_bar: 0 },
      goldDonated: 0
    },
    flourishing: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 0
    }
  }
};

// Injected callbacks from game.js or modules
let getTownRenownRef = null;
let spendGoldRef = null;
let chatLineRef = null;
let nowRef = null;
let applyProjectBenefitRef = null;
let ensureInteractableRef = null;
let SMITHING_BANK_TILE = null;
let getHearthCampTileRef = null;

/**
 * Initialize projects module with dependencies
 */
export function initProjectsSystem(deps) {
  if (deps.getTownRenown) getTownRenownRef = deps.getTownRenown;
  if (deps.spendGold) spendGoldRef = deps.spendGold;
  if (deps.chatLine) chatLineRef = deps.chatLine;
  if (deps.now) nowRef = deps.now;
  if (deps.applyProjectBenefit) applyProjectBenefitRef = deps.applyProjectBenefit;
  if (deps.ensureInteractable) ensureInteractableRef = deps.ensureInteractable;
  if (deps.SMITHING_BANK_TILE) SMITHING_BANK_TILE = deps.SMITHING_BANK_TILE;
  if (deps.getHearthCampTile) getHearthCampTileRef = deps.getHearthCampTile;
}

/**
 * Get project state
 */
export function getProjectState(townId, projectId) {
  const proj = townProjects[townId]?.[projectId];
  return proj?.state || "locked";
}

/**
 * Check and unlock projects that meet renown threshold
 */
export function checkProjectUnlocks(townId) {
  if (townId !== "rivermoor") return;

  const renown = getTownRenownRef ? getTownRenownRef(townId) : 0;
  const projects = townProjects.rivermoor;

  const unlocks = [
    { id: "dock", proj: projects.dock, renownRequired: 25, name: "Dock" },
    { id: "storage", proj: projects.storage, renownRequired: 50, name: "Blacksmith Storage" },
    { id: "hearth", proj: projects.hearth, renownRequired: 60, name: "Riverside Cauldron" },
    { id: "flourishing", proj: projects.flourishing, renownRequired: 70, name: "Flourishing Town" }
  ];

  for (const unlock of unlocks) {
    const def = PROJECT_DEFS[unlock.id];

    if (renown >= unlock.renownRequired && unlock.proj.state === "locked") {
      if (def?.autoComplete) {
        unlock.proj.state = "complete";
        unlock.proj.completedAt = nowRef ? nowRef() : 0;
        if (applyProjectBenefitRef) applyProjectBenefitRef(unlock.id);
        if (chatLineRef) chatLineRef(`<span class="good">${unlock.name} achieved!</span>`);
      } else {
        unlock.proj.state = "unlocked";
        if (chatLineRef) chatLineRef(`<span class="good">${unlock.name} project unlocked!</span>`);
      }
    }
  }
}

/**
 * Fund a project (validate renown, spend gold, start timer)
 */
export function fundTownProject(townId, projectId) {
  if (townId !== "rivermoor") {
    return { success: false, reason: "Town not found" };
  }

  const def = PROJECT_DEFS[projectId];
  const proj = townProjects.rivermoor[projectId];

  if (!def || !proj) {
    return { success: false, reason: "Project not found" };
  }

  // Auto-complete projects like Flourishing cannot be funded
  if (def.autoComplete) {
    return { success: false, reason: `${def.name} auto-completes at ${def.renownRequired} renown` };
  }

  if (proj.state !== "unlocked") {
    return { success: false, reason: `Project is ${proj.state === "locked" ? "locked" : "already in progress or complete"}` };
  }

  const renown = getTownRenownRef ? getTownRenownRef(townId) : 0;
  if (renown < def.renownRequired) {
    return { success: false, reason: `Requires ${def.renownRequired} renown` };
  }

  if (def.goldCost > 0 && !spendGoldRef(def.goldCost)) {
    return { success: false, reason: `Costs ${def.goldCost} gold` };
  }

  proj.state = "funded";
  proj.fundedAt = nowRef ? nowRef() : 0;
  const timeStr = def.buildTimeMs > 0 ? ` Building for ${Math.round(def.buildTimeMs / 1000)} seconds...` : "";
  if (chatLineRef) chatLineRef(`<span class="good">${def.name} project funded!${timeStr}</span>`);

  return { success: true, buildTimeMs: def.buildTimeMs };
}

/**
 * Tick project builds (called every frame)
 */
export function tickProjectBuilds(currentTimeMs) {
  const projects = townProjects.rivermoor;
  for (const projectId in projects) {
    const proj = projects[projectId];
    if (proj.state === "funded") {
      // Ensure buildTimeMs and fundedAt are properly set
      if (!proj.buildTimeMs || !Number.isFinite(proj.fundedAt)) {
        continue;
      }
      
      const elapsedMs = currentTimeMs - proj.fundedAt;
      if (elapsedMs >= proj.buildTimeMs) {
        completeProject("rivermoor", projectId);
      }
    }
  }
}

/**
 * Apply specific effects for completed project
 */
function applyProjectEffects(townId, projectId) {
  if (townId !== "rivermoor") return;

  if (projectId === "dock") {
    // Spawn dock fishing spot when project completes
    if (ensureInteractableRef) {
      ensureInteractableRef("fish_dock", 31, 23);
    }
    if (chatLineRef) {
      chatLineRef(`<span class="muted">The reinforced dock attracts larger fish downstream.</span>`);
    }
  }

  if (projectId === "hearth") {
    const tile = getHearthCampTileRef ? getHearthCampTileRef() : { x: 4, y: 16 };
    if (ensureInteractableRef) {
      ensureInteractableRef("cauldron", tile.x, tile.y);
    }
    if (chatLineRef) {
      chatLineRef(`<span class="muted">A new hearth camp now serves Rivermoor's travelers.</span>`);
    }
  }

  if (projectId === "storage") {
    // Spawn forge bank chest
    if (ensureInteractableRef && SMITHING_BANK_TILE) {
      ensureInteractableRef("bank", SMITHING_BANK_TILE.x, SMITHING_BANK_TILE.y, {
        bankTag: "smithing_upgrade"
      });
    }
    if (chatLineRef) {
      chatLineRef(`<span class="muted">A bank chest now sits beside Torren's forge.</span>`);
    }
  }
  // Other project effects can be added here in future
}

/**
 * Complete a project (internal)
 */
function completeProject(townId, projectId) {
  if (townId !== "rivermoor") return false;

  const proj = townProjects.rivermoor[projectId];
  if (!proj || proj.state !== "funded") return false;

  proj.state = "complete";
  proj.completedAt = nowRef ? nowRef() : 0;

  applyProjectEffects(townId, projectId);

  if (applyProjectBenefitRef) {
    applyProjectBenefitRef(projectId);
  }

  return true;
}

/**
 * Reset projects to locked state
 */
export function resetProjectState() {
  townProjects.rivermoor = {
    dock: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 5000,
      itemsDonated: { log: 0, iron_bar: 0 },
      goldDonated: 0
    },
    storage: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 5000,
      itemsDonated: { log: 0, iron_bar: 0 },
      goldDonated: 0
    },
    hearth: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 5000,
      itemsDonated: { cooked_food: 0, crude_bar: 0 },
      goldDonated: 0
    },
    flourishing: { 
      state: "locked", 
      fundedAt: 0, 
      completedAt: 0, 
      buildTimeMs: 0
    }
  };
}

/**
 * Snapshot for persistence
 */
export function getProjectsSnapshot() {
  return JSON.parse(JSON.stringify(townProjects));
}

/**
 * Apply snapshot from save file
 */
export function applyProjectsSnapshot(data) {
  if (!data || typeof data !== "object") {
    resetProjectState();
    return;
  }

  if (data.rivermoor && typeof data.rivermoor === "object") {
    townProjects.rivermoor = data.rivermoor;
  } else {
    resetProjectState();
  }

  // Ensure all projects have buildTimeMs set from PROJECT_DEFS
  const projects = townProjects.rivermoor;
  for (const projectId in projects) {
    const proj = projects[projectId];
    const def = PROJECT_DEFS[projectId];
    if (def && !proj.buildTimeMs) {
      proj.buildTimeMs = def.buildTimeMs || 5000;
    }
  }

  // Re-apply effects for any completed projects on load
  const projectsRivermoor = townProjects.rivermoor;
  if (projectsRivermoor?.storage?.state === "complete") {
    applyProjectEffects("rivermoor", "storage");
  }
  // Other projects can have their effects re-applied here as they're added
}

/**
 * Get internal projects object reference (for debug/rendering)
 */
export function getProjectsRef() {
  return townProjects;
}

/**
 * Migration: Convert legacy smithBankUnlocked upgrade to storage project
 * Call this after loading a save that might have the old upgrade
 */
export function applyLegacySmithBankMigration(wasUnlocked) {
  if (!wasUnlocked) return; // No migration needed

  const storage = townProjects.rivermoor?.storage;
  if (!storage) return;

  // Only migrate if project is not already complete
  if (storage.state === "complete") return;

  // Mark storage project as complete (migrate from old system)
  storage.state = "complete";
  storage.completedAt = nowRef ? nowRef() : 0;

  // Re-apply the effect (spawn the chest)
  applyProjectEffects("rivermoor", "storage");
}

/**
 * Record an item donation to a project
 * Returns whether the project auto-completed as a result
 */
export function recordItemDonation(townId, projectId, itemId, qty) {
  if (townId !== "rivermoor") return { success: false, projectComplete: false };

  const proj = townProjects.rivermoor[projectId];
  if (!proj) return { success: false, projectComplete: false };

  // Initialize itemsDonated if not present (for legacy saves)
  if (!proj.itemsDonated) proj.itemsDonated = {};

  // Record donation
  proj.itemsDonated[itemId] = (proj.itemsDonated[itemId] || 0) + qty;

  return {
    success: true,
    projectComplete: false
  };
}

/**
 * Record a gold donation to a project
 * Returns whether the project auto-completed as a result
 */
export function recordGoldDonation(townId, projectId, amount) {
  if (townId !== "rivermoor") return { success: false, projectComplete: false };

  const proj = townProjects.rivermoor[projectId];
  if (!proj) return { success: false, projectComplete: false };

  // Initialize goldDonated if not present (for legacy saves)
  if (!proj.goldDonated === undefined) proj.goldDonated = 0;

  // Record donation
  proj.goldDonated += amount;

  return {
    success: true,
    projectComplete: false
  };
}

/**
 * Check if all project requirements are met
 * Returns { itemsComplete, goldComplete, allComplete }
 */
export function getProjectDonationStatus(townId, projectId, requirements) {
  if (townId !== "rivermoor") return { itemsComplete: false, goldComplete: false, allComplete: false };

  const proj = townProjects.rivermoor[projectId];
  if (!proj) return { itemsComplete: false, goldComplete: false, allComplete: false };

  // Initialize defaults
  if (!proj.itemsDonated) proj.itemsDonated = {};
  if (proj.goldDonated === undefined) proj.goldDonated = 0;

  // Check item requirements
  let itemsComplete = true;
  if (requirements.items) {
    for (const itemId in requirements.items) {
      const required = requirements.items[itemId];
      const donated = proj.itemsDonated[itemId] || 0;
      if (donated < required) {
        itemsComplete = false;
        break;
      }
    }
  }

  // Check gold requirements
  const goldComplete = !requirements.gold || proj.goldDonated >= requirements.gold;

  return {
    itemsComplete,
    goldComplete,
    allComplete: itemsComplete && goldComplete
  };
}

