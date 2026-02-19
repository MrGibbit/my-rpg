import { clamp, dist, now } from "./src/utils.js";
import {
  TILE, W, H, WORLD_W, WORLD_H, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, RIVER_Y
} from "./src/config.js";
import {
  levelFromXP, xpForLevel, xpToNext, calcCombatLevelFromLevels, getPlayerCombatLevel, MAX_SKILL_XP
} from "./src/skills.js";
import { createNavigation } from "./src/navigation.js";
import {
  camera, view, map, startCastle, southKeep, Skills, lastSkillLevel, lastSkillXPMsgAt,
  BASE_HP, HP_PER_LEVEL, wallet, MAX_INV, MAX_BANK, BANK_START_SLOTS, inv, bank, bankMeta, quiver, groundLoot,
  manualDropLocks, lootUi, equipment, meleeState, resources, mobs, interactables,
  worldState, availability, windowsOpen, useState, characterState, chatUI,
  ZONE_KEYS, getActiveZone, setActiveZone, getZoneState, getZoneDimensions,
  gatherParticles, combatFX, mouse, player
} from "./src/state.js";
import {
  COOK_RECIPES, CLASS_DEFS, MOB_DEFS, DEFAULT_VENDOR_STOCK, DEFAULT_VENDOR_SELL_ONLY_PRICES,
  DEFAULT_MOB_LEVELS, VENDOR_SELL_MULT, QUEST_DEFS, SMELTING_TIERS, MINING_RESOURCE_RULES, QUEST_RENOWN_REWARDS, WARDEN_RENOWN_CONFIG,
  PROJECT_REQUIREMENTS, isItemInCategory
} from "./src/game-data.js";
import {
  createDecorLookup, stampVendorShopLayout, VENDOR_TILE, DECOR_EXAMINE_TEXT, getDockDecorForState, getHearthDecorForState
} from "./src/world-layout.js";
import {
  initWorldSeed as initWorldSeedState, makeRng, randInt, keyXY, inRectMargin, nearTileType as nearTileTypeInMap
} from "./src/world-seed.js";
import { createPersistence } from "./src/persistence.js";
import { createEntityLookup } from "./src/entity-lookup.js";
import { createCombatRolls } from "./src/combat-rolls.js";
import { createInteractionHelpers } from "./src/interaction-helpers.js";
import { createCombatEffects } from "./src/combat-effects.js";
import { createMobAI } from "./src/mob-ai.js";
import { createFXRenderer } from "./src/fx-render.js";
import { createActionResolver } from "./src/action-resolver.js";
import { createMinimap } from "./src/minimap.js";
import { createXPOrbs } from "./src/xp-orbs.js";
import { createItemUse } from "./src/item-use.js";
import { createContextMenuUI } from "./src/context-menu-ui.js";
import { attachInventoryContextMenus } from "./src/inventory-context-menus.js";
import { attachInventoryInputHandlers } from "./src/inventory-input-handlers.js";
import { createDebugAPI } from "./src/debug-api.js";
import { createCharacterStorage } from "./src/character-storage.js";
import { createCharacterProfiles } from "./src/character-profiles.js";
import { createStartOverlayUI } from "./src/start-overlay-ui.js";
import { createCharacterUI } from "./src/character-ui.js";
import { createQuestSystem } from "./src/quest-system.js";
import { createZoneFlow } from "./src/zone-flow.js";
import { createPlayerGearRenderer } from "./src/player-gear-renderer.js";
import { applyEquipmentVisualDefaults } from "./src/equipment-visuals.js";
import {
  initTownSystem, getTownRenown, grantTownRenown, checkTownMilestones, resetTownState,
  getTownsSnapshot, applyTownsSnapshot, getTownsRef
} from "./src/town-system.js";
import {
  PROJECT_DEFS, initProjectsSystem, getProjectState, checkProjectUnlocks, fundTownProject,
  tickProjectBuilds, resetProjectState, getProjectsSnapshot, applyProjectsSnapshot as applyProjectsSnapshotModule, getProjectsRef,
  applyLegacySmithBankMigration
} from "./src/town-projects.js";
import {
  initDonationSystem,
} from "./src/town-donations.js";


// Keep this local so game.js doesn't hard-fail if a stale cached state module is loaded.
const vendorShop = { x0: 16, y0: 3, w: 8, h: 6 };

function reinitializeDecorLookup() {
  const dockComplete = getProjectState("rivermoor", "dock") === "complete";
  const dockDecor = getDockDecorForState(dockComplete);
  const hearthComplete = getProjectState("rivermoor", "hearth") === "complete";
  const hearthDecor = getHearthDecorForState(hearthComplete);
  return createDecorLookup(startCastle, vendorShop, dockDecor, hearthDecor);
}

// Initialize immediately with broken dock state (will update after projects load)
let getDecorAt = reinitializeDecorLookup();

// Ensure vendor shop exists even if an older cached state.js is still loaded.
stampVendorShopLayout({ map, width: W, height: H, startCastle, vendorShop });

(() => {


  // ---------- Chat ----------
  const QUERY_FLAG_TRUTHY = new Set(["1", "true", "yes"]);
  const CHAT_LIMIT = 20;
  const chatLogEl = document.getElementById("chatLog");

  function hasQueryFlag(params, key){
    return QUERY_FLAG_TRUTHY.has(String(params.get(key) || "").toLowerCase());
  }

  function chatLine(html) {
    const nearBottom = (chatLogEl.scrollTop + chatLogEl.clientHeight) >= (chatLogEl.scrollHeight - 24);

    const p = document.createElement("p");
    p.innerHTML = html;
    chatLogEl.appendChild(p);

    while (chatLogEl.childElementCount > CHAT_LIMIT) {
      chatLogEl.removeChild(chatLogEl.firstElementChild);
    }

    if (nearBottom) {
      chatLogEl.scrollTop = chatLogEl.scrollHeight;
    }
  }

  // ---------- Game constants ----------

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;
  const query = new URLSearchParams(window.location.search);
  const TEST_MODE = hasQueryFlag(query, "test");
  const DEBUG_API_ENABLED = TEST_MODE || hasQueryFlag(query, "debug");
  const SMITH_BANK_UNLOCK_COST = 10000;
  const SMITHING_FURNACE_TILE = { x: southKeep.x0 + 4, y: southKeep.y0 + 3 };
  const SMITHING_ANVIL_TILE = { x: SMITHING_FURNACE_TILE.x + 2, y: SMITHING_FURNACE_TILE.y };
  const SMITHING_BLACKSMITH_TILE = { x: SMITHING_ANVIL_TILE.x + 2, y: SMITHING_ANVIL_TILE.y };
  const HEARTH_CAMP_BOUNDS = { x0: 2, y0: 14, x1: 6, y1: 18 };
  const HEARTH_CAULDRON_TILE = { x: 4, y: 16 };
  const SMITHING_BANK_TILE = { x: SMITHING_ANVIL_TILE.x + 3, y: SMITHING_ANVIL_TILE.y + 1 };

  // ========== PROJECT NPC CONFIGURATION ==========
  // Central source-of-truth for all Project NPCs.
  // Note: Coordinates will be determined at placement time from game constants
  const TOWN_PROJECT_NPC = {
    blacksmith_torren: {
      name: "Blacksmith Torren",
      viewMode: "single",
      focusProjectId: "storage",
      variant: "torren"
    },
    dock_foreman: {
      name: "Foreman Garrick",
      viewMode: "single",
      focusProjectId: "dock",
      variant: "garrick"
    },
    hearth_keeper: {
      name: "Mara Emberward",
      viewMode: "single",
      focusProjectId: "hearth",
      variant: "mara"
    },
    mayor: {
      name: "Mayor Alden Fairholt",
      viewMode: "all",
      focusProjectId: null,
      variant: "mayor"
    }
  };

  // Zoom
  function setZoom(z) {
    view.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const step = 0.06;
    setZoom(view.zoom + (delta > 0 ? -step : step));
  }, { passive: false });

  // Camera (top-left) in world pixels
  function viewWorldW(){ return VIEW_W / view.zoom; }
  function viewWorldH(){ return VIEW_H / view.zoom; }

  // ---------- Map / pathfinding ----------
  let inBounds = () => false;
  let isWalkable = () => false;
  let isIndoors = () => false;
  let astar = () => null;

  function rebuildNavigation() {
    const { width, height } = getZoneDimensions(getActiveZone());
    const nav = createNavigation(map, width, height);
    inBounds = nav.inBounds;
    isWalkable = nav.isWalkable;
    isIndoors = nav.isIndoors;
    astar = nav.astar;
  }

  function navInBounds(x, y) { return inBounds(x, y); }
  function navIsWalkable(x, y) {
    if (!isWalkable(x, y)) return false;
    if (interactables.some((it) => it.type === "cauldron" && it.x === x && it.y === y)) return false;
    return true;
  }
  function navAstar(sx, sy, gx, gy) { return astar(sx, sy, gx, gy); }

  rebuildNavigation();

  function isHearthCampTileOpen(x, y) {
    if (!navInBounds(x, y)) return false;
    if (!navIsWalkable(x, y)) return false;
    if (interactables.some((it) => it.x === x && it.y === y)) return false;
    return true;
  }

  function getHearthCampCauldronTile() {
    if (isHearthCampTileOpen(HEARTH_CAULDRON_TILE.x, HEARTH_CAULDRON_TILE.y)) {
      return { ...HEARTH_CAULDRON_TILE };
    }

    for (let y = HEARTH_CAMP_BOUNDS.y0; y <= HEARTH_CAMP_BOUNDS.y1; y++) {
      for (let x = HEARTH_CAMP_BOUNDS.x0; x <= HEARTH_CAMP_BOUNDS.x1; x++) {
        if (isHearthCampTileOpen(x, y)) return { x, y };
      }
    }

    return { ...HEARTH_CAULDRON_TILE };
  }

  const OVERWORLD_LADDER_DOWN = { x: 17, y: 4 };
  const OVERWORLD_RETURN_TILE = { x: 17, y: 5 };
  const DUNGEON_LADDER_UP = { x: 10, y: 10 };
  const DUNGEON_SPAWN_TILE = { x: 10, y: 11 };
  const DUNGEON_DEFAULT_MOB_SPAWNS = [
    { type: "rat", x: 24, y: 9 },
    { type: "rat", x: 26, y: 13 },
    { type: "goblin", x: 31, y: 11 }
  ];
  const DUNGEON_SOUTH_SKELETON_SPAWNS = [
    { x: 27, y: 31 },
    { x: 30, y: 31 }
  ];
  const DUNGEON_SOUTH_IRON_ROCK_SPAWNS = [
    { x: 24, y: 26 },
    { x: 33, y: 26 },
    { x: 24, y: 33 },
    { x: 33, y: 33 }
  ];
  const DUNGEON_WING_GATE = { x: 36, y: 29 };
  const DUNGEON_WING_GATE_BOTTOM = { x: 36, y: 30 };
  const DUNGEON_WING_ROOM = { x0: 42, y0: 24, x1: 54, y1: 35 };
  const DUNGEON_WING_BRAZIERS = [
    { id: "west", x: 44, y: 26 },
    { id: "east", x: 53, y: 26 }
  ];
  const DUNGEON_WARDEN_SPAWN = { x: 48, y: 29 };
  const DUNGEON_LEGACY_MOB_LAYOUTS = [
    [
      { type: "rat", x: 14, y: 10 },
      { type: "rat", x: 16, y: 12 },
      { type: "goblin", x: 18, y: 11 }
    ],
    [
      { type: "rat", x: 24, y: 10 },
      { type: "rat", x: 31, y: 12 },
      { type: "goblin", x: 29, y: 30 }
    ]
  ];
  let zoneFlowApi = null;
  // Needed by quest-system initialization before zone-flow can be created.
  function syncDungeonQuestState() {
    if (!zoneFlowApi) return;
    return zoneFlowApi.syncDungeonQuestState();
  }
  // Needed by character UI initialization before zone-flow can be created.
  let startNewGameImpl = () => false;
  let resetCharacterImpl = () => false;
  function resetCharacter() {
    return resetCharacterImpl();
  }
  function startNewGame() {
    return startNewGameImpl();
  }
  const DUNGEON_TORCHES = [
    { x: 7, y: 8, side: -1 }, { x: 13, y: 8, side: 1 },
    { x: 24, y: 7, side: -1 }, { x: 33, y: 7, side: 1 },
    { x: 24, y: 15, side: -1 }, { x: 33, y: 15, side: 1 },
    { x: 23, y: 26, side: -1 }, { x: 34, y: 26, side: 1 },
    { x: 43, y: 25, side: -1 }, { x: 53, y: 25, side: 1 },
    { x: 43, y: 34, side: -1 }, { x: 53, y: 34, side: 1 },
  ];
  const DUNGEON_PILLARS = [
    { x: 25, y: 9 }, { x: 32, y: 9 }, { x: 25, y: 13 }, { x: 32, y: 13 },
    { x: 27, y: 28 }, { x: 30, y: 28 },
    { x: 45, y: 27 }, { x: 52, y: 27 }, { x: 45, y: 33 }, { x: 52, y: 33 }
  ];

  function iconTile(body, top, mid, edge = "#26180f"){
    return `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="${edge}"/>
      <rect x="2" y="2" width="12" height="12" rx="1" fill="${mid}"/>
      <rect x="2" y="2" width="12" height="4" fill="${top}" opacity=".95"/>
      <rect x="2" y="9" width="12" height="5" fill="rgba(0,0,0,.24)"/>
      <rect x="3" y="3" width="1" height="1" fill="rgba(255,255,255,.25)"/>
      <rect x="12" y="3" width="1" height="1" fill="rgba(255,255,255,.18)"/>
      ${body}
    </svg>`;
  }

  const GLYPHS = {
    unknown: `
      <rect x="6" y="4" width="4" height="1" fill="#f8fafc"/>
      <rect x="9" y="5" width="1" height="2" fill="#f8fafc"/>
      <rect x="8" y="7" width="1" height="1" fill="#f8fafc"/>
      <rect x="7" y="8" width="1" height="1" fill="#f8fafc"/>
      <rect x="7" y="10" width="2" height="2" fill="#f8fafc"/>
    `,
    sword: `
      <rect x="7" y="2" width="2" height="8" fill="#dbe6f3"/>
      <rect x="6" y="4" width="4" height="1" fill="#f8fafc"/>
      <rect x="6" y="9" width="4" height="1" fill="#8b5a2b"/>
      <rect x="7" y="10" width="2" height="3" fill="#b7793e"/>
      <rect x="7" y="12" width="2" height="1" fill="#5b3a1d"/>
    `,
    shield: `
      <path d="M8 2 L12 4 L11 10 L8 13 L5 10 L4 4 Z" fill="#94a3b8"/>
      <path d="M8 3.1 L11 4.5 L10.3 9.5 L8 11.8 L5.7 9.5 L5 4.5 Z" fill="#cbd5e1"/>
      <rect x="7.5" y="4" width="1" height="7" fill="#475569"/>
    `,
    crude_shield: `
      <rect x="3" y="2.5" width="10" height="11" fill="#4e453a"/>
      <rect x="4" y="3.5" width="8" height="9" fill="#8f7f6a"/>
      <rect x="5" y="4.4" width="1.4" height="7.2" fill="#231f18"/>
      <rect x="9.6" y="4.4" width="1.4" height="7.2" fill="#231f18"/>
      <rect x="7.1" y="4.0" width="1.8" height="8.2" fill="rgba(255,255,255,.12)"/>
    `,
    wardens_brand: `
      <path d="M8 2 L12 4 L11 10 L8 13 L5 10 L4 4 Z" fill="#334155"/>
      <path d="M8 3.1 L11 4.5 L10.3 9.5 L8 11.8 L5.7 9.5 L5 4.5 Z" fill="#64748b"/>
      <rect x="7.45" y="4" width="1.1" height="7" fill="#f59e0b"/>
      <rect x="6" y="6.8" width="4" height="1.1" fill="#fbbf24"/>
    `,
    bow: `
      <path d="M11.7 2.7 C9.8 4.3 9 6.1 9 8 C9 9.9 9.8 11.7 11.7 13.3" fill="none" stroke="#d6a96a" stroke-width="1.6" stroke-linecap="round"/>
      <line x1="10.1" y1="3.2" x2="10.1" y2="12.8" stroke="#f1f5f9" stroke-width="1"/>
      <rect x="4" y="7.5" width="5" height="1" fill="#94a3b8"/>
      <path d="M3 8 L5 7 L5 9 Z" fill="#f8fafc"/>
      <rect x="8.5" y="7" width="2" height="2" fill="#7c2d12"/>
    `,
    arrow: `
      <rect x="3" y="7" width="8" height="2" fill="#dbeafe"/>
      <path d="M2 8 L4 6.8 L4 9.2 Z" fill="#f8fafc"/>
      <path d="M12 8 L10.8 6.7 L10.8 9.3 Z" fill="#9a3412"/>
      <path d="M11.2 8 L9.8 6.8 L9.8 9.2 Z" fill="#ea580c"/>
    `,
    staff: `
      <rect x="7" y="3" width="2" height="10" fill="#9a6b3b"/>
      <rect x="6" y="2" width="4" height="2" fill="#c4b5fd"/>
      <rect x="7" y="1" width="2" height="1" fill="#f5f3ff"/>
      <rect x="6" y="5" width="1" height="1" fill="#fef3c7"/>
      <rect x="9" y="8" width="1" height="1" fill="#fde68a"/>
    `,
    fire_staff: `
      <rect x="7" y="3" width="2" height="10" fill="#5b1b0f"/>
      <rect x="6" y="2" width="4" height="2" fill="#d97706"/>
      <rect x="6" y="1" width="4" height="1" fill="#f97316"/>
      <rect x="7" y="0" width="2" height="1" fill="#fde68a"/>
      <rect x="6" y="5" width="1" height="1" fill="#f59e0b"/>
      <rect x="9" y="8" width="1" height="1" fill="#fb923c"/>
    `,
    axe: `
      <rect x="7" y="3" width="2" height="10" fill="#8b5a2b"/>
      <path d="M9 4 L13 5.5 L13 8 L9 8 Z" fill="#cbd5e1"/>
      <path d="M6.5 5 L9 4.5 L9 8.5 L6.5 9 Z" fill="#94a3b8"/>
      <rect x="7" y="11" width="2" height="1" fill="#5b3a1d"/>
    `,
    pick: `
      <rect x="7" y="3" width="2" height="10" fill="#8b5a2b"/>
      <path d="M4 5 C6 3.5 10 3.5 12 5" fill="none" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M5 6.5 C6.5 7.2 9.5 7.2 11 6.5" fill="none" stroke="#94a3b8" stroke-width="1"/>
    `,
    hammer: `
      <rect x="7" y="4" width="2" height="9" fill="#8b5a2b"/>
      <rect x="5" y="3" width="6" height="2" fill="#cbd5e1"/>
      <rect x="4" y="4" width="8" height="1" fill="#94a3b8"/>
      <rect x="7" y="11" width="2" height="1" fill="#5b3a1d"/>
    `,
    bank_chest: `
      <rect x="3" y="6" width="10" height="6.5" rx="1.1" fill="#8b5a2b"/>
      <rect x="3" y="4" width="10" height="3.2" rx="1" fill="#a16207"/>
      <rect x="3.6" y="4.8" width="8.8" height="1.1" fill="rgba(255,255,255,.16)"/>
      <rect x="7.3" y="4" width="1.4" height="8.5" fill="#4a2d14"/>
      <rect x="7.0" y="7.8" width="2.0" height="2.2" rx=".5" fill="#fbbf24"/>
      <rect x="7.4" y="8.2" width="1.2" height="1.2" rx=".3" fill="#d97706"/>
      <rect x="4.2" y="6.2" width="1.0" height="6" fill="rgba(0,0,0,.26)"/>
      <rect x="10.8" y="6.2" width="1.0" height="6" fill="rgba(0,0,0,.26)"/>
    `,
    knife: `
      <path d="M4 9 L10.5 4.3 L12 5.8 L5.4 10.4 Z" fill="#e2e8f0"/>
      <path d="M10.4 4.3 L12.8 3.4 L12 5.8 Z" fill="#f8fafc"/>
      <rect x="3.2" y="9.2" width="3" height="2" fill="#7c2d12"/>
      <rect x="3.8" y="9.8" width="1" height="1" fill="#fbbf24"/>
    `,
    coin: `
      <circle cx="8" cy="8" r="4.2" fill="#facc15"/>
      <circle cx="8" cy="8" r="3.2" fill="#fde047"/>
      <circle cx="8" cy="8" r="1.2" fill="#ca8a04"/>
      <rect x="6.8" y="4.2" width="2.4" height="1" fill="rgba(255,255,255,.35)"/>
    `,
    flint: `
      <path d="M4 10 L8 4 L11 5 L9 11 L5 12 Z" fill="#64748b"/>
      <path d="M8.8 6.7 L11.7 3.8 L12.4 4.5 L9.5 7.4 Z" fill="#f1f5f9"/>
      <rect x="11.6" y="2.8" width="1" height="1" fill="#fde68a"/>
      <rect x="12.5" y="3.6" width="1" height="1" fill="#fb923c"/>
      <rect x="10.9" y="3.5" width="1" height="1" fill="#fbbf24"/>
    `,
    log: `
      <rect x="3" y="6" width="10" height="4" rx="1" fill="#8b5a2b"/>
      <rect x="4" y="7" width="8" height="2" fill="#a16207"/>
      <circle cx="4" cy="8" r="1.1" fill="#d6a96a"/>
      <circle cx="12" cy="8" r="1.1" fill="#d6a96a"/>
      <circle cx="4" cy="8" r=".5" fill="#8b5a2b"/>
      <circle cx="12" cy="8" r=".5" fill="#8b5a2b"/>
    `,
    ore: `
      <path d="M8 3 L12 5 L11 10 L7 12 L4 9 L5 5 Z" fill="#94a3b8"/>
      <path d="M8 4.3 L10.8 5.8 L10.1 9.2 L7.2 10.8 L5.5 8.8 L6.1 5.9 Z" fill="#cbd5e1"/>
      <rect x="7" y="6" width="1.2" height="1.2" fill="#f8fafc"/>
      <rect x="8.8" y="8.3" width="1" height="1" fill="#f8fafc"/>
    `,
    ore_crude: `
      <path d="M8 2.8 L12.2 5.1 L11.2 10.3 L7.1 12.4 L3.7 9.1 L4.8 4.9 Z" fill="#7c8797"/>
      <path d="M8 4.1 L10.7 5.6 L10 9 L7.3 10.4 L5.3 8.5 L6 5.8 Z" fill="#4b5563"/>
      <rect x="6.2" y="6.1" width="1.2" height="1.2" fill="#a8b1be"/>
      <rect x="8.4" y="7.5" width="1.1" height="1.1" fill="#9aa4b3"/>
      <rect x="7.1" y="9" width="0.9" height="0.9" fill="#c2c8d1"/>
    `,
    ore_iron: `
      <path d="M8 2.5 L12.6 4.9 L11.8 10.7 L7.2 12.8 L3.4 9.3 L4.2 4.7 Z" fill="#9ca3af"/>
      <path d="M8 3.8 L11.2 5.4 L10.6 9.6 L7.4 11 L4.8 8.6 L5.5 5.4 Z" fill="#d1d5db"/>
      <rect x="5.9" y="6.3" width="4.3" height="0.7" fill="#6b7280"/>
      <rect x="5.4" y="8.2" width="4.9" height="0.7" fill="#6b7280"/>
      <rect x="7.2" y="5" width="1.1" height="1.1" fill="#f3f4f6"/>
      <rect x="8.8" y="9.1" width="1" height="1" fill="#f3f4f6"/>
    `,
    bar: `
      <rect x="3" y="5" width="10" height="6" rx="1" fill="#8f7657"/>
      <rect x="4" y="6" width="8" height="4" rx="1" fill="#bfa07a"/>
      <rect x="5" y="7" width="6" height="2" fill="#d9c3a5"/>
      <rect x="4" y="5" width="8" height="1" fill="rgba(255,255,255,.28)"/>
      <rect x="4" y="10" width="8" height="1" fill="rgba(0,0,0,.25)"/>
    `,
    bar_crude: `
      <rect x="3" y="5" width="10" height="6" fill="#725e47"/>
      <rect x="4" y="6" width="8" height="4" fill="#9a8367"/>
      <rect x="4" y="5" width="8" height="1" fill="rgba(255,255,255,.16)"/>
      <rect x="4" y="10" width="8" height="1" fill="rgba(0,0,0,.28)"/>
      <rect x="5" y="7" width="1" height="1" fill="#b49c81"/>
      <rect x="9" y="8" width="1" height="1" fill="#c8b398"/>
    `,
    bar_iron: `
      <rect x="3" y="5" width="10" height="6" fill="#4b5563"/>
      <rect x="4" y="6" width="8" height="4" fill="#9ca3af"/>
      <rect x="4" y="5" width="8" height="1" fill="rgba(255,255,255,.35)"/>
      <rect x="4" y="10" width="8" height="1" fill="rgba(0,0,0,.32)"/>
      <rect x="6" y="7" width="1" height="1" fill="#e5e7eb"/>
      <rect x="9" y="7" width="1" height="1" fill="#e5e7eb"/>
    `,
    bone: `
      <circle cx="4.8" cy="6.2" r="1.7" fill="#f1f5f9"/>
      <circle cx="11.2" cy="9.8" r="1.7" fill="#f1f5f9"/>
      <rect x="5.2" y="6.4" width="6" height="3.2" rx="1.2" fill="#e2e8f0"/>
      <circle cx="4.2" cy="7.8" r="1.2" fill="#e2e8f0"/>
      <circle cx="11.8" cy="8.2" r="1.2" fill="#e2e8f0"/>
    `,
    heart: `
      <path d="M8 12 L3.8 8.3 C2.5 7.1 2.6 5 4.2 4.1 C5.3 3.5 6.7 3.8 7.5 4.8 L8 5.4 L8.5 4.8 C9.3 3.8 10.7 3.5 11.8 4.1 C13.4 5 13.5 7.1 12.2 8.3 Z" fill="#ef4444"/>
      <path d="M8 10.8 L4.7 7.9 C3.8 7.1 3.8 5.8 4.8 5.2 C5.6 4.7 6.5 4.9 7 5.6 L8 6.8 L9 5.6 C9.5 4.9 10.4 4.7 11.2 5.2 C12.2 5.8 12.2 7.1 11.3 7.9 Z" fill="#f87171"/>
    `,
    target: `
      <circle cx="8" cy="8" r="4.2" fill="none" stroke="#f1f5f9" stroke-width="1.2"/>
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="#f8fafc" stroke-width="1.2"/>
      <circle cx="8" cy="8" r="1.1" fill="#f8fafc"/>
      <rect x="7.7" y="2.3" width=".6" height="2.1" fill="#f8fafc"/>
      <rect x="7.7" y="11.6" width=".6" height="2.1" fill="#f8fafc"/>
      <rect x="2.3" y="7.7" width="2.1" height=".6" fill="#f8fafc"/>
      <rect x="11.6" y="7.7" width="2.1" height=".6" fill="#f8fafc"/>
    `,
    gauntlet: `
      <rect x="4" y="8" width="8" height="4" rx="1" fill="#d6a96a"/>
      <rect x="5" y="6.5" width="2" height="2.2" fill="#f3cf9e"/>
      <rect x="7" y="6" width="2" height="2.4" fill="#f3cf9e"/>
      <rect x="9" y="6.3" width="2" height="2.2" fill="#f3cf9e"/>
      <rect x="4.2" y="9" width="1.5" height="2" fill="#8b5a2b"/>
      <rect x="10.8" y="9" width="1.2" height="2" fill="#8b5a2b"/>
    `,
    spark: `
      <path d="M8 2.5 L9.3 6.7 L13.5 8 L9.3 9.3 L8 13.5 L6.7 9.3 L2.5 8 L6.7 6.7 Z" fill="#e9d5ff"/>
      <circle cx="8" cy="8" r="1.2" fill="#f5f3ff"/>
    `,
    genie_lamp: `
      <rect x="3" y="8" width="8" height="3" rx="1.2" fill="#f59e0b"/>
      <rect x="4" y="7" width="6" height="2" rx="1" fill="#fbbf24"/>
      <rect x="2" y="9" width="2" height="1.4" rx=".7" fill="#facc15"/>
      <rect x="10.6" y="8.7" width="2.3" height="1.1" rx=".5" fill="#fcd34d"/>
      <rect x="11.8" y="8.3" width="1.5" height=".8" rx=".4" fill="#fde68a"/>
      <rect x="6.6" y="6.1" width="1.8" height="1.1" rx=".4" fill="#fef3c7"/>
      <rect x="7.1" y="5.2" width=".8" height=".9" fill="#fef08a"/>
      <path d="M8.2 4.6 C9.5 3.5 9.8 2.6 9.1 1.6 C10.3 1.9 11 2.8 10.8 3.8 C10.6 4.7 9.8 5.2 8.9 5.3 Z" fill="#ddd6fe"/>
    `,
    wizard_hat: `
      <path d="M8 2.8 L11.8 10.7 H4.2 Z" fill="#7c3aed"/>
      <path d="M8 4.4 L10.3 9.2 H5.7 Z" fill="#a78bfa"/>
      <rect x="3.2" y="10.5" width="9.6" height="1.7" rx=".8" fill="#5b21b6"/>
      <rect x="5.9" y="10.7" width="4.2" height=".8" fill="#facc15"/>
      <rect x="7.2" y="6.1" width=".9" height=".9" fill="#f8fafc"/>
      <rect x="9.2" y="8.1" width=".8" height=".8" fill="#f8fafc"/>
    `,
    feather: `
      <path d="M12 3.5 C8.5 3.5 5 6.2 4 10 L7.5 12 C10.8 10.7 12.8 7.6 12 3.5 Z" fill="#f3f4f6"/>
      <path d="M5 10.6 L11 4.8" stroke="#9ca3af" stroke-width="1" stroke-linecap="round"/>
      <path d="M5.8 9.2 L8 10.6 M7.2 7.8 L9.2 9.2 M8.7 6.5 L10.2 7.6" stroke="#cbd5e1" stroke-width=".7" stroke-linecap="round"/>
    `,
    tree: `
      <rect x="7" y="8.5" width="2" height="4.5" fill="#8b5a2b"/>
      <circle cx="8" cy="6" r="3.5" fill="#16a34a"/>
      <circle cx="6.3" cy="6.8" r="2.1" fill="#22c55e"/>
      <circle cx="9.7" cy="6.8" r="2.1" fill="#15803d"/>
    `,
    fish: `
      <ellipse cx="8.3" cy="8" rx="3.8" ry="2.4" fill="#93c5fd"/>
      <path d="M4.7 8 L2.8 6.6 L2.8 9.4 Z" fill="#bfdbfe"/>
      <circle cx="9.4" cy="7.5" r=".5" fill="#0f172a"/>
      <path d="M7.4 8.9 C8 9.3 8.8 9.3 9.4 8.9" stroke="#1d4ed8" stroke-width=".7" fill="none"/>
    `,
    fire: `
      <path d="M8 3.2 C9.3 4.5 9.8 5.8 9.7 7.2 C10.8 7.8 11.5 9 11.2 10.4 C10.9 11.8 9.7 12.8 8 12.8 C6.3 12.8 5.1 11.8 4.8 10.4 C4.5 9 5.2 7.8 6.3 7.2 C6.2 5.8 6.7 4.5 8 3.2 Z" fill="#f97316"/>
      <path d="M8 5.3 C8.8 6.1 9 6.9 8.9 7.8 C9.6 8.2 10 9 9.8 9.9 C9.6 10.9 8.9 11.5 8 11.5 C7.1 11.5 6.4 10.9 6.2 9.9 C6 9 6.4 8.2 7.1 7.8 C7 6.9 7.2 6.1 8 5.3 Z" fill="#fdba74"/>
    `,
    pot: `
      <rect x="4" y="5.8" width="8" height="5.8" rx="1" fill="#9ca3af"/>
      <rect x="5" y="6.8" width="6" height="3.8" fill="#cbd5e1"/>
      <rect x="6.2" y="4.2" width="3.6" height="1.2" rx=".5" fill="#e2e8f0"/>
      <rect x="3.4" y="7.2" width="1.2" height="2.2" fill="#94a3b8"/>
      <rect x="11.4" y="7.2" width="1.2" height="2.2" fill="#94a3b8"/>
      <rect x="6.1" y="3.3" width=".9" height="1" fill="#f8fafc"/>
      <rect x="8.9" y="3.3" width=".9" height="1" fill="#f8fafc"/>
    `
  };

  const icon = (glyph, top, mid, edge) => iconTile(GLYPHS[glyph] ?? GLYPHS.unknown, top, mid, edge);
  const flatIcon = (glyph) => `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">${GLYPHS[glyph] ?? GLYPHS.unknown}</svg>`;

  const UNKNOWN_ICON = icon("unknown", "#5b6d8a", "#2d3748", "#141b2d");
  const SKILL_FALLBACK_ICON = flatIcon("unknown");

  const SKILL_ICONS = {
    health: flatIcon("heart"),
    accuracy: flatIcon("target"),
    power: flatIcon("gauntlet"),
    defense: flatIcon("shield"),
    ranged: flatIcon("bow"),
    sorcery: flatIcon("wizard_hat"),
    fletching: flatIcon("feather"),
    woodcutting: flatIcon("tree"),
    mining: flatIcon("pick"),
    smithing: flatIcon("ore"),
    fishing: flatIcon("fish"),
    firemaking: flatIcon("fire"),
    cooking: flatIcon("pot")
  };
  const BLACKSMITH_BANK_CHEST_ICON = icon("bank_chest", "#b45309", "#8b5a2b", "#3f2817");
  const xpOrbs = createXPOrbs({
    ctx,
    now,
    clamp,
    xpToNext,
    skills: Skills,
    skillIcons: SKILL_ICONS,
    fallbackSkillIcon: SKILL_FALLBACK_ICON,
    getViewWidth: () => VIEW_W,
    getViewHeight: () => VIEW_H
  });

  const SKILL_NAMES = {
    health: "Health",
    accuracy: "Accuracy",
    power: "Power",
    defense: "Defense",
    ranged: "Ranged",
    sorcery: "Sorcery",
    fletching: "Fletching",
    woodcutting: "Woodcutting",
    mining: "Mining",
    smithing: "Smithing",
    fishing: "Fishing",
    firemaking: "Firemaking",
    cooking: "Cooking"
  };

  function getSkillName(skillKey){
    return SKILL_NAMES[skillKey] ?? Skills[skillKey]?.name ?? skillKey;
  }

  for (const [k, name] of Object.entries(SKILL_NAMES)){
    // Keep runtime resilient if a stale cached state module is missing newer skills.
    if (!Skills[k]) Skills[k] = { name, xp: 0 };
    else Skills[k].name = name;
  }
// used to tint "Attack X" in the right-click menu
function ctxLevelClass(playerLvl, enemyLvl){
  const d = (enemyLvl|0) - (playerLvl|0);
  if (d >= 5) return "lvlBad";
  if (d <= -5) return "lvlGood";
  return "lvlWarn";
}
function levelTextForCls(cls){
  if (cls === "lvlGood") return "rgba(94,234,212,.95)";
  if (cls === "lvlBad")  return "rgba(251,113,133,.95)";
  return "rgba(251,191,36,.95)";
}
function levelStrokeForCls(cls){
  if (cls === "lvlGood") return "rgba(94,234,212,.75)";
  if (cls === "lvlBad")  return "rgba(251,113,133,.75)";
  return "rgba(251,191,36,.75)";
}
  // ---------- Items ----------
  const GOLD_ITEM_ID = "gold"; // <-- if your gold item's id differs, change this string



  // ---------- Wallet (gold does not take inventory slots) ----------
  const getGold = () => (wallet.gold | 0);

  function addGold(qty){
    qty = Math.max(0, qty|0);
    if (!qty) return 0;
    wallet.gold = (wallet.gold|0) + qty;
    renderGold();
    return qty;
  }

  function spendGold(qty){
    qty = Math.max(0, qty|0);
    if (!qty) return true;
    const have = wallet.gold|0;
    if (have < qty) return false;
    wallet.gold = have - qty;
    renderGold();
    return true;
  }

  function fishIcon(main, belly, fin = "rgb(186,111,33)"){
    return `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
      <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
      <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
      <rect x="4" y="7" width="7" height="2" fill="${main}"/>
      <rect x="5" y="7" width="5" height="2" fill="${belly}"/>
      <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="3" y="7" width="1" height="1" fill="${main}"/>
      <rect x="3" y="8" width="1" height="1" fill="${belly}"/>
      <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
      <rect x="6" y="9" width="2" height="1" fill="${fin}"/>
    </svg>`;
  }

  function cookedFishIcon(main = "rgb(146,78,38)", belly = "rgb(180,102,48)"){
    return `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
      <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
      <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
      <rect x="4" y="7" width="7" height="2" fill="${main}"/>
      <rect x="5" y="7" width="5" height="2" fill="${belly}"/>
      <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
      <rect x="3" y="7" width="1" height="1" fill="${main}"/>
      <rect x="3" y="8" width="1" height="1" fill="${belly}"/>
      <rect x="6" y="7" width="1" height="2" fill="rgb(84,42,20)"/>
      <rect x="8" y="7" width="1" height="2" fill="rgb(84,42,20)"/>
      <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
      <rect x="6" y="4" width="1" height="1" fill="rgb(226,232,240)"/>
      <rect x="9" y="4" width="1" height="1" fill="rgb(226,232,240)"/>
    </svg>`;
  }

  const Items = {
    axe:  { id:"axe",  name:"Crude Axe",  stack:false, icon:icon("axe", "#8f6a3b", "#4a321d", "#24160d"), flatIcon:flatIcon("axe") },
    pick: { id:"pick", name:"Crude Pick", stack:false, icon:icon("pick", "#6e7f93", "#3a4558", "#1d2430"), flatIcon:flatIcon("pick") },
    hammer: { id:"hammer", name:"Hammer", stack:false, icon:icon("hammer", "#6e7f93", "#3a4558", "#1d2430"), flatIcon:flatIcon("hammer") },
    knife:{ id:"knife",name:"Knife",      stack:false, icon:icon("knife", "#7a7b7d", "#3b3c3f", "#1c1d1f"), flatIcon:flatIcon("knife") },
    gold: { id:"gold", name:"Coins", stack:true, currency:true, icon:icon("coin", "#aa7a18", "#5a3f0c", "#2d1f06"), flatIcon:flatIcon("coin") },
    flint_steel:{ id:"flint_steel", name:"Flint & Steel", stack:false, icon:icon("flint", "#4d6b74", "#283b40", "#141f22"), flatIcon:flatIcon("flint") },

    sword: { id:"sword", name:"Sword", stack:false, icon:icon("sword", "#748198", "#3b4455", "#1d222b"), flatIcon:flatIcon("sword"), equipSlot:"weapon", combat:{ style:"melee", att:3, dmg:3 } },
    shield:{ id:"shield",name:"Shield",stack:false, icon:icon("shield", "#3f7267", "#22423b", "#11221e"), flatIcon:flatIcon("shield"), equipSlot:"offhand", combat:{ style:"any", def:3 } },
    bow:   { id:"bow",   name:"Bow",   stack:false, icon:icon("bow", "#89673c", "#4b341f", "#251a0f"), flatIcon:flatIcon("bow"), equipSlot:"weapon", combat:{ style:"ranged", att:3, dmg:3 } },

    wooden_arrow:{ id:"wooden_arrow", name:"Wooden Arrow", stack:true, ammo:true, icon:icon("arrow", "#8a653a", "#4b341f", "#261a10"), flatIcon:flatIcon("arrow") },
    bronze_arrow:{ id:"bronze_arrow", name:"Bronze Arrow", stack:true, ammo:true, icon:icon("arrow", "#a76f2f", "#5f3a16", "#311d0a"), flatIcon:flatIcon("arrow") },

    staff: { id:"staff", name:"Wooden Staff", stack:false, icon:icon("staff", "#6b4ba3", "#3a2758", "#1f1430"), flatIcon:flatIcon("staff"), equipSlot:"weapon", combat:{ style:"magic", att:3, dmg:3 } },
    fire_staff: { id:"fire_staff", name:"Fire Staff", stack:false, icon:icon("fire_staff", "#f97316", "#7c2d12", "#2f1307"), flatIcon:flatIcon("fire_staff"), equipSlot:"weapon", req:{ sorcery:10 }, combat:{ style:"magic", att:5, dmg:5 } },

    log:  { id:"log",  name:"Log",  stack:true, icon:icon("log", "#876239", "#4a321d", "#24160d"), flatIcon:flatIcon("log") },
    ore:  { id:"ore",  name:"Crude Ore",  stack:true, icon:icon("ore_crude", "#6f7f90", "#3a4454", "#1e2430"), flatIcon:flatIcon("ore_crude") },
    iron_ore: { id:"iron_ore", name:"Iron Ore", stack:true, icon:icon("ore_iron", "#7a7f86", "#454b55", "#252a33"), flatIcon:flatIcon("ore_iron") },
    crude_bar: { id:"crude_bar", name:"Crude Bar", stack:true, icon:icon("bar_crude", "#8b7b64", "#4a4135", "#221d16"), flatIcon:flatIcon("bar_crude") },
    iron_bar: { id:"iron_bar", name:"Iron Bar", stack:true, icon:icon("bar_iron", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("bar_iron") },
    crude_dagger: { id:"crude_dagger", name:"Crude Dagger", stack:false, icon:icon("knife", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("knife"), equipSlot:"weapon", combat:{ style:"melee", att:2, dmg:2 } },
    crude_sword: { id:"crude_sword", name:"Crude Sword", stack:false, icon:icon("sword", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("sword"), equipSlot:"weapon", combat:{ style:"melee", att:2, dmg:2 } },
    crude_shield: { id:"crude_shield", name:"Crude Shield", stack:false, icon:icon("crude_shield", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("crude_shield"), equipSlot:"offhand", equipVisual:{ key:"crude_shield", layer:"offhand" }, combat:{ style:"any", def:2 } },
    crude_helm: { id:"crude_helm", name:"Crude Helm", stack:false, icon:icon("ore_crude", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("ore_crude"), equipSlot:"head", equipVisual:{ key:"helm_crude", layer:"head" }, combat:{ style:"any", def:1 } },
    crude_legs: { id:"crude_legs", name:"Crude Legs", stack:false, icon:icon("bar_crude", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("bar_crude"), equipSlot:"legs", equipVisual:{ key:"legs_crude", layer:"legs" }, combat:{ style:"any", def:1 } },
    crude_body: { id:"crude_body", name:"Crude Body", stack:false, icon:icon("crude_shield", "#8f7f6a", "#4e453a", "#231f18"), flatIcon:flatIcon("crude_shield"), equipSlot:"body", equipVisual:{ key:"body_crude", layer:"body" }, combat:{ style:"any", def:2 } },
    iron_dagger: { id:"iron_dagger", name:"Iron Dagger", stack:false, icon:icon("knife", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("knife"), equipSlot:"weapon", req:{ accuracy:5 }, combat:{ style:"melee", att:3, dmg:3 } },
    iron_sword: { id:"iron_sword", name:"Iron Sword", stack:false, icon:icon("sword", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("sword"), equipSlot:"weapon", req:{ accuracy:10 }, combat:{ style:"melee", att:3, dmg:4 } },
    iron_shield: { id:"iron_shield", name:"Iron Shield", stack:false, icon:icon("shield", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("shield"), equipSlot:"offhand", equipVisual:{ key:"iron_shield", layer:"offhand" }, combat:{ style:"any", def:3 } },
    iron_helm: { id:"iron_helm", name:"Iron Helm", stack:false, icon:icon("ore_iron", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("ore_iron"), equipSlot:"head", equipVisual:{ key:"helm_iron", layer:"head" }, combat:{ style:"any", def:2 } },
    iron_legs: { id:"iron_legs", name:"Iron Legs", stack:false, icon:icon("bar_iron", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("bar_iron"), equipSlot:"legs", equipVisual:{ key:"legs_iron", layer:"legs" }, combat:{ style:"any", def:2 } },
    iron_body: { id:"iron_body", name:"Iron Body", stack:false, icon:icon("shield", "#9ca3af", "#4b5563", "#1f2937"), flatIcon:flatIcon("shield"), equipSlot:"body", equipVisual:{ key:"body_iron", layer:"body" }, combat:{ style:"any", def:3 } },
    bone: { id:"bone", name:"Bone", stack:true, icon:icon("bone", "#7d868e", "#4c545c", "#24292e"), flatIcon:flatIcon("bone") },
    bone_meal: {
      id:"bone_meal",
      name:"Bone Meal",
      stack:true,
      hint:"Will enrich soil once Farming is added.",
      icon:icon("ore", "#d5d8de", "#8c939f", "#414753"),
      flatIcon:flatIcon("ore")
    },
    warden_key_fragment: {
      id:"warden_key_fragment",
      name:"Warden Key Fragment",
      stack:false,
      hint:"A jagged key fragment tied to the old dungeon gate.",
      icon:icon("bar", "#cdb37f", "#6f5e34", "#2f2614"),
      flatIcon:flatIcon("bar")
    },
    wardens_brand: {
      id:"wardens_brand",
      name:"Warden's Brand",
      stack:false,
      hint:"A ward-marked relic forged in the boss wing. Strengthens you against undead.",
      icon:icon("wardens_brand", "#64748b", "#334155", "#111827"),
      flatIcon:flatIcon("wardens_brand"),
      equipSlot:"offhand",
      combat:{ style:"any", att:1, dmg:1, def:6 }
    },
    xp_lamp: {
      id:"xp_lamp",
      name:"XP Lamp",
      stack:true,
      hint:"Redeem for 100 XP in any skill.",
      icon:icon("genie_lamp", "#ffd166", "#f59e0b", "#7c2d12"),
      flatIcon:flatIcon("genie_lamp")
    },
    rat_meat: {
      id:"rat_meat",
      name:"Raw Rat Meat",
      heal: 2,

      stack:true,
      icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
        <rect x="4" y="4" width="8" height="1" fill="rgb(54,24,29)"/>
        <rect x="3" y="5" width="1" height="6" fill="rgb(54,24,29)"/>
        <rect x="12" y="5" width="1" height="6" fill="rgb(54,24,29)"/>
        <rect x="4" y="11" width="8" height="1" fill="rgb(54,24,29)"/>

        <rect x="4" y="5" width="8" height="6" fill="rgb(176,56,72)"/>
        <rect x="5" y="6" width="6" height="4" fill="rgb(206,88,96)"/>

        <rect x="6" y="7" width="1" height="1" fill="rgb(245,214,219)"/>
        <rect x="7" y="8" width="2" height="1" fill="rgb(245,214,219)"/>
        <rect x="9" y="6" width="1" height="1" fill="rgb(245,214,219)"/>

        <rect x="5" y="10" width="2" height="1" fill="rgb(122,34,48)"/>
        <rect x="8" y="5" width="2" height="1" fill="rgb(122,34,48)"/>
      </svg>`
    },
    cooked_rat_meat: {
      id:"cooked_rat_meat",
      name:"Cooked Rat Meat",
      heal: 8,

      stack:true,
      icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
        <!-- outline -->
        <rect x="4" y="4" width="8" height="1" fill="rgb(40,22,16)"/>
        <rect x="3" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
        <rect x="12" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
        <rect x="4" y="11" width="8" height="1" fill="rgb(40,22,16)"/>

        <!-- cooked base -->
        <rect x="4" y="5" width="8" height="6" fill="rgb(140,72,34)"/>
        <rect x="5" y="6" width="6" height="4" fill="rgb(176,96,44)"/>

        <!-- grill marks -->
        <rect x="6" y="6" width="1" height="4" fill="rgb(84,42,20)"/>
        <rect x="8" y="6" width="1" height="4" fill="rgb(84,42,20)"/>
        <rect x="10" y="6" width="1" height="4" fill="rgb(84,42,20)"/>

        <!-- tiny steam pips -->
        <rect x="6" y="3" width="1" height="1" fill="rgb(226,232,240)"/>
        <rect x="9" y="3" width="1" height="1" fill="rgb(226,232,240)"/>
      </svg>`
    },
goldfish: {
  id:"goldfish",
  name:"Gold Fish",
  heal: 2,          // same as raw rat meat
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="7" width="7" height="2" fill="rgb(250,204,21)"/>
    <rect x="5" y="7" width="5" height="2" fill="rgb(253,230,138)"/>
    <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="1" fill="rgb(250,204,21)"/>
    <rect x="3" y="8" width="1" height="1" fill="rgb(253,230,138)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="6" y="9" width="2" height="1" fill="rgb(186,111,33)"/>
  </svg>`
},

goldfish_cracker: {
  id:"goldfish_cracker",
  name:"Gold Fish Cracker",
  heal: 8,          // same as cooked rat meat
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="4" width="8" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="11" width="8" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
    <rect x="12" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
    <rect x="4" y="5" width="8" height="6" fill="rgb(245,158,11)"/>
    <rect x="5" y="6" width="6" height="4" fill="rgb(251,191,36)"/>
    <rect x="6" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="7" y="9" width="1" height="1" fill="rgb(40,22,16)"/>
  </svg>`
},

clownfish: {
  id:"clownfish",
  name:"Clownfish",
  heal: 4,
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="7" width="7" height="2" fill="rgb(251,146,60)"/>
    <rect x="5" y="7" width="5" height="2" fill="rgb(56,189,248)"/>
    <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="1" fill="rgb(251,146,60)"/>
    <rect x="3" y="8" width="1" height="1" fill="rgb(56,189,248)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="6" y="9" width="2" height="1" fill="rgb(59,130,246)"/>
  </svg>`
},

cooked_clownfish: {
  id:"cooked_clownfish",
  name:"Cooked Clownfish",
  heal: 12,
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="7" width="7" height="2" fill="rgb(146,78,38)"/>
    <rect x="5" y="7" width="5" height="2" fill="rgb(180,102,48)"/>
    <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="1" fill="rgb(146,78,38)"/>
    <rect x="3" y="8" width="1" height="1" fill="rgb(180,102,48)"/>
    <rect x="6" y="7" width="1" height="2" fill="rgb(84,42,20)"/>
    <rect x="8" y="7" width="1" height="2" fill="rgb(84,42,20)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="6" y="4" width="1" height="1" fill="rgb(226,232,240)"/>
    <rect x="9" y="4" width="1" height="1" fill="rgb(226,232,240)"/>
  </svg>`
},

pufferfish: {
  id:"pufferfish",
  name:"Pufferfish",
  heal: 6,
  stack:true,
  icon: fishIcon("rgb(234,179,8)", "rgb(253,224,71)", "rgb(168,85,247)")
},

cooked_pufferfish: {
  id:"cooked_pufferfish",
  name:"Cooked Pufferfish",
  heal: 16,
  stack:true,
  icon: cookedFishIcon("rgb(158,94,46)", "rgb(201,124,62)")
},

catfish: {
  id:"catfish",
  name:"Catfish",
  heal: 8,
  stack:true,
  icon: fishIcon("rgb(100,116,139)", "rgb(148,163,184)", "rgb(30,64,175)")
},

cooked_catfish: {
  id:"cooked_catfish",
  name:"Cooked Catfish",
  heal: 20,
  stack:true,
  icon: cookedFishIcon("rgb(128,74,40)", "rgb(166,98,52)")
},

swordfish: {
  id:"swordfish",
  name:"Swordfish",
  heal: 10,
  stack:true,
  icon: fishIcon("rgb(14,116,144)", "rgb(125,211,252)", "rgb(56,189,248)")
},

cooked_swordfish: {
  id:"cooked_swordfish",
  name:"Cooked Swordfish",
  heal: 24,
  stack:true,
  icon: cookedFishIcon("rgb(170,88,48)", "rgb(212,120,62)")
},

anglerfish: {
  id:"anglerfish",
  name:"Anglerfish",
  heal: 12,
  stack:true,
  icon: fishIcon("rgb(82,82,91)", "rgb(161,161,170)", "rgb(234,88,12)")
},

cooked_anglerfish: {
  id:"cooked_anglerfish",
  name:"Cooked Anglerfish",
  heal: 30,
  stack:true,
  icon: cookedFishIcon("rgb(156,82,36)", "rgb(194,108,50)")
},

moonfish: {
  id:"moonfish",
  name:"Moonfish",
  heal: 14,
  stack:true,
  icon: fishIcon("rgb(99,102,241)", "rgb(196,181,253)", "rgb(168,85,247)")
},

cooked_moonfish: {
  id:"cooked_moonfish",
  name:"Cooked Moonfish",
  heal: 36,
  stack:true,
  icon: cookedFishIcon("rgb(148,78,44)", "rgb(188,110,60)")
},

chaos_koi: {
  id:"chaos_koi",
  name:"Chaos Koi",
  heal: 16,
  stack:true,
  icon: fishIcon("rgb(220,38,38)", "rgb(251,146,60)", "rgb(250,204,21)")
},

cooked_chaos_koi: {
  id:"cooked_chaos_koi",
  name:"Cooked Chaos Koi",
  heal: 44,
  stack:true,
  icon: cookedFishIcon("rgb(176,72,34)", "rgb(222,106,46)")
},

cooked_food: {
  id:"cooked_food",
  name:"Cooked Food",
  heal: 8,
  stack:true,
  icon: cookedFishIcon("rgb(146,78,38)", "rgb(180,102,48)")
},



  };
  applyEquipmentVisualDefaults(Items);

  const playerGearRenderer = createPlayerGearRenderer({ ctx, equipment, Items });

  // ---------- Quiver (arrows do not take inventory slots) ----------
  function addToQuiver(id, qty){
    const item = Items[id];
    if (!item || !item.ammo || qty<=0) return 0;
    qty = Math.max(1, qty|0);
    if (id === "bronze_arrow") id = "wooden_arrow";
    quiver[id] = (quiver[id] | 0) + qty;
    renderQuiver();
    return qty;
  }
  function consumeFromQuiver(id, qty){
    if (id === "bronze_arrow") id = "wooden_arrow";
    qty = Math.max(1, qty|0);
    const have = quiver[id] | 0;
    if (have < qty) return false;
    quiver[id] = have - qty;
    renderQuiver();
    return true;
  }
  function getQuiverCount(){
    return (quiver.wooden_arrow | 0);
  }
  function moveAmmoFromQuiverToInventory(id, qty=null){
    if (id === "bronze_arrow") id = "wooden_arrow";
    const item = Items[id];
    if (!item || !item.ammo) return 0;

    const have = quiver[id] | 0;
    if (have <= 0) return 0;

    const want = (qty==null) ? have : Math.min(Math.max(1, qty|0), have);
    const added = addToInventory(id, want, { forceInventory: true });
    if (added <= 0) return 0;

    // Force ammo into inventory so players can bank/swap arrow types manually.
    quiver[id] = Math.max(0, have - added);

    renderQuiver();
    return added;
  }




  function clearSlots(arr){ for (let i=0;i<arr.length;i++) arr[i]=null; }
  function countSlots(arr){ return arr.reduce((a,s)=>a+(s?1:0),0); }
  function emptyInvSlots(){
    let n=0;
    for (const s of inv) if (!s) n++;
    return n;
  }

  // ---------- Ground loot piles ----------
  // key "x,y" -> Map(itemId -> qty)
const GROUND_LOOT_DESPAWN_MS = 60_000; // 60 seconds


  function lootKey(x,y){ return `${x},${y}`; }
  // Manual drops: prevent the auto-loot system from instantly picking the item back up.
  // Keyed by tile ("x,y"). The lock clears once you walk out of auto-loot range of that tile.
  function lockManualDropAt(x,y){
    manualDropLocks.set(lootKey(x,y), true);
  }

  function addGroundLoot(x,y,id,qty=1){
  const item = Items[id];
  if (!item) return;

  qty = Math.max(1, qty|0);
  const k = lootKey(x,y);
  const t = now();

  if (!groundLoot.has(k)){
    const pile = new Map();
    pile.createdAt = t;
    pile.expiresAt = t + GROUND_LOOT_DESPAWN_MS;
    groundLoot.set(k, pile);
  }

  const pile = groundLoot.get(k);

  // refresh despawn timer whenever something is added to this tile
  if (!Number.isFinite(pile.createdAt)) pile.createdAt = t;
  pile.expiresAt = t + GROUND_LOOT_DESPAWN_MS;
  pile.set(id, (pile.get(id)|0) + qty);
}

  function getLootPileAt(x,y){
    const pile = groundLoot.get(lootKey(x,y));
    if (!pile || pile.size === 0) return null;
    return pile;
  }
  function cleanupLootPileAt(x,y){
    const k=lootKey(x,y);
    const pile=groundLoot.get(k);
    if (!pile) return;
    for (const [id,qty] of pile.entries()){
      if ((qty|0) <= 0) pile.delete(id);
    }
    if (pile.size === 0) groundLoot.delete(k);
  }
function pruneExpiredGroundLoot(){
  const t = now();
  for (const [k, pile] of groundLoot.entries()){
    if (!pile) { groundLoot.delete(k); continue; }
    if (Number.isFinite(pile.expiresAt) && t >= pile.expiresAt){
      groundLoot.delete(k);
    }
  }
}
  // ---------- Inventory behavior ----------
  // Inventory: one-per-slot by default. Ammo routes to quiver unless forced into inventory.
  function addToInventory(id, qty=1, opts={}){
    const item = Items[id];
    if (!item) return 0;

    qty = Math.max(1, qty|0);
    const forceInventory = !!opts.forceInventory;
    // gold never takes inventory slots
    if (id === GOLD_ITEM_ID){
      addGold(qty);
      return qty;
    }

    // ammo: route to quiver (no inventory slots)
    if (item.ammo && !forceInventory){
      return addToQuiver(id, qty);
    }

    // RuneScape-style ammo stack in inventory when explicitly moved from quiver.
    if (item.stack && forceInventory){
      const si = inv.findIndex(s => s && s.id === id);
      if (si >= 0){
        inv[si].qty = Math.max(1, inv[si].qty|0) + qty;
        renderInv();
        return qty;
      }
      const empty = inv.findIndex(s => !s);
      if (empty < 0) return 0;
      inv[empty] = { id, qty };
      renderInv();
      return qty;
    }


    // everything else: one-per-slot (no stacking in inventory)
    let added = 0;
    for (let i=0; i<qty; i++){
      const empty = inv.findIndex(s => !s);
      if (empty < 0) break;
      inv[empty] = { id, qty:1 };
      added++;
    }
    if (added > 0) renderInv();
    return added;
  }

  function hasItem(id){ return inv.some(s=>s && s.id===id); }

  function removeItemsFromInventory(id, qty=1){
  const item = Items[id];
  if (!item) return false;

  qty = Math.max(1, Math.floor(qty || 1));

  // Always remove from inventory first (including ammo moved from quiver).
  // If ammo is still needed after that, fall back to quiver.
  let remaining = qty;
  if (item.stack){
    for (let i=0; i<inv.length && remaining>0; i++){
      const s = inv[i];
      if (!s || s.id !== id) continue;

      const have = Math.max(1, s.qty|0);
      const take = Math.min(remaining, have);
      const left = have - take;

      inv[i] = left > 0 ? { id, qty: left } : null;
      remaining -= take;
    }
  } else {
    // non-stack items: remove one-per-slot
    for (let i=0; i<inv.length && remaining>0; i++){
      if (inv[i] && inv[i].id === id){
        inv[i] = null;
        remaining--;
      }
    }
  }

  if (remaining !== qty) renderInv();

  if (remaining <= 0) return true;
  if (item.ammo) return consumeFromQuiver(id, remaining);
  return false;
}

function consumeFoodFromInv(invIndex){
  const s = inv[invIndex];
  if (!s) return false;

  const item = Items[s.id];
  const heal = (item && Number.isFinite(item.heal)) ? (item.heal|0) : 0;
  if (heal <= 0) return false;

  if (player.hp >= player.maxHp){
    chatLine(`<span class="muted">You're already at full health.</span>`);
    return true;
  }

  // consume 1 (respect stacks)
  if (item.stack && (s.qty|0) > 1){
    inv[invIndex] = { id: s.id, qty: (s.qty|0) - 1 };
  } else {
    inv[invIndex] = null;
  }
  renderInv();

  const before = player.hp;
  player.hp = clamp(player.hp + heal, 0, player.maxHp);
  renderHPHUD();

  const gained = player.hp - before;
  chatLine(`<span class="good">You eat the ${item?.name ?? s.id} and heal <b>${gained}</b> HP.</span>`);
  return true;
}

  /**
   * Count total quantity of an item in inventory
   * Respects stack property (stacked items can have qty > 1 per slot)
   */
  function getInventoryCount(itemId) {
    let count = 0;

    // Category matching: "cooked_food" counts all cooked_* items
    if (itemId === "cooked_food") {
      for (const slot of inv) {
        if (!slot || !String(slot.id).startsWith("cooked_")) continue;
        const item = Items[slot.id];
        if (item?.stack) {
          count += Math.max(1, slot.qty | 0);
        } else {
          count += 1;
        }
      }
      return count;
    }

    // Direct item match
    const item = Items[itemId];
    if (!item) return 0;

    for (const slot of inv) {
      if (!slot || slot.id !== itemId) continue;
      if (item.stack) {
        count += Math.max(1, slot.qty | 0);
      } else {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Donate items to a project and update UI
   * Returns { success, reason?, remaining? }
   */
  function handleProjectItemDonation(projectId, itemId, qty) {
    const proj = getProjectsRef()?.rivermoor?.[projectId];
    if (!proj) return { success: false, reason: "Project not found" };

    const req = PROJECT_REQUIREMENTS[projectId];
    if (!req || !req.items) {
      return { success: false, reason: "Project not found" };
    }

    // Check if this category is required (e.g., "cooked_food")
    if (!req.items[itemId]) {
      return { success: false, reason: "Item not required for this project" };
    }

    qty = Math.max(1, qty | 0);
    const invCount = getInventoryCount(itemId);
    if (invCount < qty) {
      return { success: false, reason: `You only have ${invCount}x ${itemId}` };
    }

    const donated = (proj.itemsDonated[itemId] | 0);
    const required = req.items[itemId] | 0;
    const canDonate = Math.min(qty, Math.max(0, required - donated));

    if (canDonate <= 0) {
      return { success: false, reason: `You've already donated ${required}x ${itemId}` };
    }

    // Special handling for categories (e.g., "cooked_food")
    if (itemId === "cooked_food") {
      // Remove cooked_* items until we've removed canDonate amount
      let remaining = canDonate;
      for (let i = 0; i < inv.length && remaining > 0; i++) {
        const slot = inv[i];
        if (!slot || !String(slot.id).startsWith("cooked_")) continue;

        const item = Items[slot.id];
        const slotQty = item?.stack ? Math.max(1, slot.qty | 0) : 1;
        const toRemove = Math.min(remaining, slotQty);

        if (item?.stack) {
          slot.qty = Math.max(0, (slot.qty | 0) - toRemove);
          if (slot.qty <= 0) delete inv[i]; // Remove empty slot
        } else {
          delete inv[i]; // Remove single item
        }

        remaining -= toRemove;
      }
      renderInv();
    } else {
      // Remove specific item from inventory
      if (!removeItemsFromInventory(itemId, canDonate)) {
        return { success: false, reason: `Couldn't remove ${canDonate}x ${itemId} from inventory` };
      }
    }

    // Update donation count
    proj.itemsDonated[itemId] = (proj.itemsDonated[itemId] | 0) + canDonate;

    // Check if project should auto-complete
    checkProjectDonationComplete(projectId);

    return { success: true, donated: canDonate };
  }

  /**
   * Donate gold to a project
   * Returns { success, reason?, remaining? }
   */
  function handleProjectGoldDonation(projectId, amount) {
    const proj = getProjectsRef()?.rivermoor?.[projectId];
    if (!proj) return { success: false, reason: "Project not found" };

    const req = PROJECT_REQUIREMENTS[projectId];
    if (!req) return { success: false, reason: "Project not found" };

    amount = Math.max(1, amount | 0);
    const goldRequired = (req.gold | 0) || 0;
    const goldDonated = (proj.goldDonated | 0);
    const canDonate = Math.min(amount, Math.max(0, goldRequired - goldDonated));

    if (canDonate <= 0) {
      return { success: false, reason: `You've already donated all gold for this project` };
    }

    if (wallet.gold < canDonate) {
      return { success: false, reason: `You only have ${wallet.gold} gold` };
    }

    // Spend gold
    wallet.gold -= canDonate;
    proj.goldDonated = (proj.goldDonated | 0) + canDonate;

    // Check if project should auto-complete
    checkProjectDonationComplete(projectId);

    return { success: true, donated: canDonate };
  }

  /**
   * Check if all requirements are met and auto-complete project
   * Grants +10 renown once
   */
  function checkProjectDonationComplete(projectId) {
    const proj = getProjectsRef()?.rivermoor?.[projectId];
    if (!proj || proj.state === "funded" || proj.state === "complete") return; // Already building or completed

    const req = PROJECT_REQUIREMENTS[projectId];
    if (!req) return;

    // Check items
    for (const [itemId, required] of Object.entries(req.items || {})) {
      const donated = (proj.itemsDonated[itemId] | 0);
      if (donated < required) return; // Not enough of this item
    }

    // Check gold
    const goldRequired = (req.gold | 0) || 0;
    const goldDonated = (proj.goldDonated | 0);
    if (goldDonated < goldRequired) return; // Not enough gold

    // All requirements met - start building (don't complete immediately)
    proj.state = "funded";
    proj.fundedAt = now();
    proj.buildTimeMs = PROJECT_DEFS[projectId]?.buildTimeMs || 5000;

    chatLine(`<span class="good">Building started! ${PROJECT_DEFS[projectId]?.name || projectId} will be ready soon.</span>`);
    renderTownProjectsUI();
  }

  /**
   * Apply project completion effects (spawn interactables, etc.)
   * Mirrors the logic from town-projects.js
   */
  function applyProjectEffects(projectId) {
    if (projectId === "dock") {
      ensureInteractable("fish_dock", 31, 23);
      chatLine(`<span class="muted">The reinforced dock attracts larger fish downstream.</span>`);
    } else if (projectId === "hearth") {
      const hearthTile = getHearthCampCauldronTile();
      ensureInteractable("cauldron", hearthTile.x, hearthTile.y);
      chatLine(`<span class="muted">A new hearth camp now serves Rivermoor's travelers.</span>`);
    } else if (projectId === "storage") {
      ensureInteractable("bank", SMITHING_BANK_TILE.x, SMITHING_BANK_TILE.y, {
        bankTag: "smithing_upgrade"
      });
      chatLine(`<span class="muted">A bank chest now sits beside Torren's forge.</span>`);
    }
  }


  // ---------- Bank stacking behavior ----------
  function addToBank(arr, id, qty=1){
    if (id === GOLD_ITEM_ID){
      addGold(qty);
      return true;
    }

    const item=Items[id]; if (!item) return false;
    if (id === "bronze_arrow") id = "wooden_arrow";
    qty = Math.max(1, qty|0);
    normalizeBankStacks();

    // Bank always stacks same item ids, regardless of inventory stack rules.
    const si = arr.findIndex(s => s && s.id===id);
    if (si>=0){ arr[si].qty = Math.max(1, arr[si].qty|0) + qty; return true; }
    const cap = getBankCapacity();
    for (let i = 0; i < cap; i++){
      if (!arr[i]){
        arr[i] = { id, qty };
        return true;
      }
    }
    return false;
  }

  // ---------- Equipment ----------
  function canEquip(id){
    const it = Items[id];
    if (!it) return null;
    return it.equipSlot || null;
  }

  function getEquipRequirements(id){
    const req = Items[id]?.req;
    if (!req || typeof req !== "object") return [];
    const out = [];
    for (const [skillKey, needRaw] of Object.entries(req)){
      const need = Math.max(1, needRaw | 0);
      const skillName = getSkillName(skillKey);
      out.push({ skillKey, skillName, need });
    }
    return out;
  }

  function getEquipRequirementLine(id){
    const reqs = getEquipRequirements(id);
    if (!reqs.length) return "";
    return `Req: ${reqs.map(r => `${r.skillName} ${r.need}`).join(" · ")}`;
  }

  function checkEquipRequirements(id){
    const reqs = getEquipRequirements(id);
    const missing = reqs.filter(r => levelFromXP(Skills[r.skillKey]?.xp ?? 0) < r.need);
    return { ok: missing.length === 0, missing };
  }

  function equipAmmoFromInv(invIndex, qty=null){
    const s = inv[invIndex];
    if (!s) return;
    const item = Items[s.id];
    if (!item?.ammo){
      chatLine(`<span class="muted">You can't equip that as ammo.</span>`);
      return;
    }

    const have = Math.max(1, s.qty|0);
    const move = (qty==null) ? have : Math.min(Math.max(1, qty|0), have);
    if (move <= 0) return;

    const left = have - move;
    inv[invIndex] = left > 0 ? { id: s.id, qty: left } : null;
    addToQuiver(s.id, move);
    renderInv();
    chatLine(`<span class="good">You equip ${move}x ${item.name} to your quiver.</span>`);
  }

  function equipFromInv(invIndex){
    const s = inv[invIndex];
    if (!s) return;
    const id = s.id;
    if (Items[id]?.ammo){
      equipAmmoFromInv(invIndex);
      return;
    }

    const slot = canEquip(id);
    if (!slot){
      chatLine(`<span class="muted">You can't equip that.</span>`);
      return;
    }

    const reqCheck = checkEquipRequirements(id);
    if (!reqCheck.ok){
      const r = reqCheck.missing[0];
      chatLine(`<span class="warn">You need ${r.skillName} level ${r.need} to equip the ${Items[id]?.name ?? id}.</span>`);
      return;
    }

    const existing = equipment[slot];
    if (existing){
      if (emptyInvSlots() <= 0){
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      equipment[slot] = null;
      addToInventory(existing, 1);
      chatLine(`<span class="muted">You unequip the ${Items[existing]?.name ?? existing}.</span>`);
    }

    inv[invIndex] = null;
    equipment[slot] = id;
    chatLine(`<span class="good">You equip the ${Items[id]?.name ?? id}.</span>`);
    renderInventoryAndEquipment();
  }

  function unequipSlot(slot){
    const id = equipment[slot];
    if (!id) return;
    if (emptyInvSlots() <= 0){
      chatLine(`<span class="warn">Inventory full.</span>`);
      return;
    }
    equipment[slot] = null;
    addToInventory(id, 1);
    chatLine(`<span class="muted">You unequip the ${Items[id]?.name ?? id}.</span>`);
    renderInventoryAndEquipment();
  }

  // ---------- Melee Training selector ----------
  const MELEE_TRAIN_KEY = "classic_melee_training_v1";
  const MELEE_TRAIN_SKILLS = ["accuracy", "power", "defense"];

  function normalizeMeleeTrainingSelection(rawSelection){
    const raw = Array.isArray(rawSelection) ? rawSelection : [rawSelection];
    const picked = new Set();
    for (const key of raw){
      if (key === "accuracy" || key === "power" || key === "defense") picked.add(key);
    }
    const out = [];
    for (const key of MELEE_TRAIN_SKILLS){
      if (picked.has(key)) out.push(key);
    }
    if (!out.length) out.push("accuracy");
    return out;
  }

  function getMeleeTrainingSelection(){
    const selected = normalizeMeleeTrainingSelection(meleeState.selected);
    meleeState.selected = selected;
    return selected;
  }

  function loadMeleeTraining(){
    const parsed = readStoredJSON(MELEE_TRAIN_KEY, null);
    meleeState.selected = normalizeMeleeTrainingSelection(parsed);
    meleeState.splitCursor = 0;
  }
  function saveMeleeTraining(){
    const selected = getMeleeTrainingSelection();
    writeStoredJSON(MELEE_TRAIN_KEY, selected);
  }

  // ---------- Quests ----------
  const worldUpgrades = { smithBankUnlocked: false };

  function resetWorldUpgrades(){
    worldUpgrades.smithBankUnlocked = false;
  }

  function getWorldUpgradeSnapshot(){
    return {
      smithBankUnlocked: !!worldUpgrades.smithBankUnlocked
    };
  }

  function applyWorldUpgradeSnapshot(data){
    worldUpgrades.smithBankUnlocked = !!(data && typeof data === "object" && data.smithBankUnlocked);
  }

  function isSmithBankUnlocked(){
    return !!worldUpgrades.smithBankUnlocked;
  }

  // ========== RENOWN GRANTS SYSTEM (Quest-based & Warden-based) ==========
  const WARDEN_RENOWN_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  const renownGrants = {
    quests: {},     // { quest_id: true } - idempotent flags
    wardens: {}     // { warden_key: { lastGrantedAt: <epoch_ms> } } - timestamp-based cooldown
  };
  let questRenownSnapshotMissing = false;

  function resetRenownGrants() {
    renownGrants.quests = {};
    renownGrants.wardens = {};
  }

  function getRenownGrantsSnapshot() {
    return {
      quests: { ...renownGrants.quests },
      wardens: { ...renownGrants.wardens }
    };
  }

  function applyRenownGrantsSnapshot(data) {
    if (!data || typeof data !== "object") {
      resetRenownGrants();
      return;
    }
    // Restore quest grants
    renownGrants.quests = (data.quests && typeof data.quests === "object") 
      ? { ...data.quests } 
      : {};
    // Restore warden timestamps
    renownGrants.wardens = (data.wardens && typeof data.wardens === "object") 
      ? { ...data.wardens } 
      : {};
  }

  /**
   * Grant renown for completing a quest (idempotent)
   */
  function grantQuestRenown(questId) {
    const questId_str = String(questId || "");
    if (!questId_str) return false;

    // Check if already granted
    if (renownGrants.quests[questId_str]) {
      return false; // Already granted, do nothing
    }

    // Look up reward config
    const rewardCfg = QUEST_RENOWN_REWARDS[questId_str];
    if (!rewardCfg) return false; // Unknown quest

    // Mark as granted
    renownGrants.quests[questId_str] = true;

    // Grant renown
    const message = `Quest "${questId_str.replace(/_/g, " ")}" completed.`;
    const success = grantTownRenown(rewardCfg.townId, rewardCfg.amount, message);

    return success;
  }

  /**
   * Grant renown for defeating a warden (repeatable with cooldown)
   */
  function grantWardenDefeatRenown(wardenKey = "skeleton_warden") {
    const key_str = String(wardenKey || "skeleton_warden");
    const cfg = WARDEN_RENOWN_CONFIG[key_str];
    if (!cfg) return false; // Unknown warden

    const now_ms = now();
    const warden_state = renownGrants.wardens[key_str] || {};
    const lastGrantedAt = warden_state.lastGrantedAt || 0;
    const msSinceLastGrant = now_ms - lastGrantedAt;

    // If firstKillOnly is set, check if already granted
    if (cfg.firstKillOnly && renownGrants.wardens[key_str]?.granted) {
      const remainingMs = cfg.cooldownMs - msSinceLastGrant;
      const remainingSec = Math.ceil(remainingMs / 1000);
      if (remainingMs > 0) {
        chatLine(`<span class="muted">Rivermoor renown can be earned from the ${key_str.replace(/_/g, " ")} again in ~${remainingSec}s.</span>`);
      }
      return false;
    }

    // Check cooldown (if not first kill only)
    if (!cfg.firstKillOnly && msSinceLastGrant < cfg.cooldownMs) {
      // Still in cooldown, don't grant
      const remainingMs = cfg.cooldownMs - msSinceLastGrant;
      const remainingSec = Math.ceil(remainingMs / 1000);
      chatLine(`<span class="muted">Rivermoor renown can be earned from the ${key_str.replace(/_/g, " ")} again in ~${remainingSec}s.</span>`);
      return false;
    }

    // Update timestamp and mark as granted
    renownGrants.wardens[key_str] = {
      lastGrantedAt: now_ms,
      granted: cfg.firstKillOnly
    };

    // Grant renown
    const message = `${key_str.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())} defeated.`;
    const success = grantTownRenown(cfg.townId, cfg.amount, message);

    return success;
  }

  // Town system moved to modules: src/town-system.js, src/town-projects.js, src/town-donations.js
  // Wrapper functions for persistence (module functions renamed for backward compatibility)
  function getTownRenownSnapshot() {
    return getTownsSnapshot();
  }
  function applyTownRenownSnapshot(data) {
    return applyTownsSnapshot(data);
  }
  function getProjectSnapshot() {
    return getProjectsSnapshot();
  }
  function applyProjectSnapshot(data) {
    applyProjectsSnapshotModule(data);
    // Migration: Convert legacy smithBankUnlocked to storage project
    if (isSmithBankUnlocked()) {
      applyLegacySmithBankMigration(true);
    }
    // Reinitialize decor lookup now that projects are updated
    getDecorAt = reinitializeDecorLookup();
  }

  // Renown grant tracking (quest-based and warden-based)
  function getQuestRenownSnapshot() {
    return getRenownGrantsSnapshot();
  }
  function applyQuestRenownSnapshot(data) {
    const questBag = (data && typeof data === "object" && data.quests && typeof data.quests === "object")
      ? data.quests
      : null;
    questRenownSnapshotMissing = !questBag || Object.keys(questBag).length === 0;
    applyRenownGrantsSnapshot(data);
  }
  function getWardenDefeatSnapshot() {
    // Warden data is now integrated into renownGrants
    return null;
  }
  function applyWardenDefeatSnapshot(data) {
    // Warden data is now integrated into renownGrants
  }

  const {
    questList: QUESTS,
    getQuestDefById,
    resetQuestProgress,
    getQuestProgress,
    isQuestCompleted,
    isQuestStarted,
    isQuestUnlocked,
    getQuestObjectiveTarget,
    getQuestObjectiveProgress,
    isQuestObjectiveComplete,
    hasQuestObjectiveToken,
    isQuestReadyToComplete,
    completeQuest: _completeQuest_original,
    trackQuestEvent: _trackQuestEvent_original,
    getQuestSnapshot,
    applyQuestSnapshot: _applyQuestSnapshot_original,
    handleQuartermasterTalk,
    npcHasPendingQuestMarker
  } = createQuestSystem({
    questDefs: QUEST_DEFS,
    now,
    chatLine,
    renderQuests,
    syncDungeonQuestState,
    hasItem,
    addToInventory,
    addGroundLoot,
    player,
    addGold,
    onQuestCompleted: (questId) => {
      grantQuestRenown(questId);
      if (String(questId) === "first_watch") {
        chatLine("<span class=\"muted\">The people of Rivermoor seem to trust you more. Perhaps the Mayor could use your help rebuilding the town.</span>");
      }
    }
  });

  function grantRetroactiveQuestRenown() {
    const rewardKeys = Object.keys(QUEST_RENOWN_REWARDS || {});
    if (!rewardKeys.length) return;
    for (const questId of rewardKeys) {
      if (isQuestCompleted(questId)) {
        grantQuestRenown(questId);
      }
    }
  }

  const applyQuestSnapshot = (data) => {
    _applyQuestSnapshot_original(data);
    if (questRenownSnapshotMissing) {
      questRenownSnapshotMissing = false;
      grantRetroactiveQuestRenown();
    }
  };

  // Create wrapped versions for PASS 2 & PASS 3
  const completeQuest = (questId) => {
    const result = _completeQuest_original(questId);
    if (result) {
      grantQuestRenown(questId);
      if (String(questId) === "first_watch") {
        chatLine("<span class=\"muted\">The people of Rivermoor seem to trust you more. Perhaps the Mayor could use your help rebuilding the town.</span>");
      }
    }
    return result;
  };

  const trackQuestEvent = (ev) => {
    const result = _trackQuestEvent_original(ev);
    if (ev?.type === "kill_mob" && ev?.mobType === "skeleton_warden") {
      grantWardenDefeatRenown();
    }
    return result;
  };

  function unlockSmithingBankUpgrade(){
    if (isSmithBankUnlocked()) return false;
    worldUpgrades.smithBankUnlocked = true;
    ensureInteractable("bank", SMITHING_BANK_TILE.x, SMITHING_BANK_TILE.y, {
      bankTag: "smithing_upgrade"
    });
    return true;
  }

  function buySmithingBankUpgrade(){
    if (isSmithBankUnlocked()){
      chatLine(`<span class="muted">Blacksmith Torren:</span> That chest is already installed.`);
      return false;
    }
    if (!spendGold(SMITH_BANK_UNLOCK_COST)){
      chatLine(`<span class="warn">You need ${SMITH_BANK_UNLOCK_COST} gold.</span>`);
      return false;
    }

    unlockSmithingBankUpgrade();
    chatLine(`<span class="good">You pay ${SMITH_BANK_UNLOCK_COST} gold. Torren installs a bank chest beside the forge.</span>`);
    renderBlacksmithUI();
    return true;
  }

  // ========== PROJECT NPC INTERACTION ==========
  function openTownProjectsFromNpc(npcId) {
    const config = TOWN_PROJECT_NPC[npcId];
    if (!config) {
      chatLine(`<span class="muted">They have nothing special to say.</span>`);
      return;
    }

    // Emit chat message based on NPC
    if (npcId === "blacksmith_torren") {
      chatLine(`<span class="muted">Blacksmith Torren:</span> Let's see what we can build for Rivermoor. Here are the projects.`);
    } else if (npcId === "dock_foreman") {
      chatLine(`<span class="muted">Foreman Garrick Tidewell:</span> The dock is crucial for Rivermoor. Let me show you our progress.`);
    } else if (npcId === "hearth_keeper") {
      chatLine(`<span class="muted">Mara Emberward:</span> The hearth represents the heart of our community. See what we're building here.`);
    } else if (npcId === "mayor") {
      chatLine(`<span class="muted">Mayor Alden Fairholt:</span> Let me show you all the improvements we're working on for Rivermoor.`);
    }

    // Ensure projects are unlocked based on current renown before rendering
    checkProjectUnlocks("rivermoor");

    openWindow("townProjects");
    renderTownProjectsUI({
      viewMode: config.viewMode,
      focusProjectId: config.focusProjectId,
      openedByNpcId: npcId
    });
  }

  function talkBlacksmithTorren(){
    openTownProjectsFromNpc("blacksmith_torren");
  }

  function handleQuestNpcTalk(npcId){
    const id = String(npcId || "");
    if (id === "quartermaster"){
      handleQuartermasterTalk();
      return;
    }
    if (id === "blacksmith_torren"){
      talkBlacksmithTorren();
      return;
    }
    chatLine(`<span class="muted">They nod, but have nothing for you.</span>`);
  }

  function handleProjectNpcTalk(npcId) {
    const id = String(npcId || "");
    openTownProjectsFromNpc(id);
  }

  // ---------- HP / HUD ----------
  const hudNameEl = document.getElementById("hudName");
  const hudClassEl = document.getElementById("hudClass");
  const hudHPTextEl = document.getElementById("hudHPText");
  const hudHPBarEl = document.getElementById("hudHPBar");
  const hudQuiverTextEl = document.getElementById("hudQuiverText");
  const hudGoldTextEl = document.getElementById("hudGoldText");
const hudCombatTextEl = document.getElementById("hudCombatText");

  const coordPlayerEl = document.getElementById("coordPlayer");
  const coordMouseEl  = document.getElementById("coordMouse");



  function recalcMaxHPFromHealth(){
    const healthLvl = levelFromXP(Skills.health.xp);
    const newMax = BASE_HP + (healthLvl - 1) * HP_PER_LEVEL;
    if (player.maxHp !== newMax){
      player.maxHp = newMax;
      player.hp = clamp(player.hp, 0, player.maxHp);
    }
    renderHPHUD();
  }

  function renderHPHUD(){
    hudNameEl.textContent = player.name;
    hudClassEl.textContent = player.class;
    hudHPTextEl.textContent = `HP ${player.hp} / ${player.maxHp}`;
    hudHPBarEl.style.width = `${(player.maxHp>0 ? (player.hp/player.maxHp) : 0) * 100}%`;
    if (hudGoldTextEl) hudGoldTextEl.textContent = `Gold: ${getGold()}`;
    hudQuiverTextEl.textContent = `Quiver: ${getQuiverCount()}`;
if (hudCombatTextEl) hudCombatTextEl.textContent = `Combat: ${getPlayerCombatLevel(Skills)}`;

  }
  function updateCoordsHUD(){
    if (!coordPlayerEl && !coordMouseEl) return;

    if (coordPlayerEl){
      const p = `${player.x}, ${player.y}`;
      if (coordPlayerEl.textContent !== p) coordPlayerEl.textContent = p;
    }

    if (!mouse.seen){
      if (coordMouseEl && coordMouseEl.textContent !== "â€”") coordMouseEl.textContent = "â€”";
      return;
    }

    const worldX = (mouse.x/VIEW_W)*viewWorldW() + camera.x;
    const worldY = (mouse.y/VIEW_H)*viewWorldH() + camera.y;
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);

    const m = inBounds(tx,ty) ? `${tx}, ${ty}` : "â€”";
    if (coordMouseEl && coordMouseEl.textContent !== m) coordMouseEl.textContent = m;
  }

  function renderGold(){
    const g = getGold();
    if (hudGoldTextEl) hudGoldTextEl.textContent = `Gold: ${g}`;
    const invGoldPill = document.getElementById("invGoldPill");
    if (invGoldPill) invGoldPill.textContent = `Gold: ${g}`;
  }

  function renderQuiver(){
    document.getElementById("invQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
    document.getElementById("eqQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
    renderQuiverSlot();
    renderGold();
    renderHPHUD();

  }

  function addXP(skillKey, amount){
    const s = Skills[skillKey];
    if (!s || !Number.isFinite(amount) || amount <= 0) return;
    if ((s.xp | 0) >= MAX_SKILL_XP) return;
    const gain = Math.floor(amount);
    if (gain <= 0) return;
    const skillName = getSkillName(skillKey);
    const beforeXP = s.xp | 0;
    const before = levelFromXP(beforeXP);
    s.xp = Math.min(MAX_SKILL_XP, beforeXP + gain);
    const appliedGain = (s.xp | 0) - beforeXP;
    if (appliedGain <= 0) return;
    xpOrbs.onGain(skillKey, appliedGain);
    // show XP gain (throttled per skill so it doesn't spam)
    const t = now();
    if ((t - (lastSkillXPMsgAt[skillKey] ?? 0)) > 900){
      chatLine(`<span class="muted">+${appliedGain} ${skillName} XP</span>`);
      lastSkillXPMsgAt[skillKey] = t;
    }

    const after = levelFromXP(s.xp);

    if ((lastSkillLevel[skillKey] ?? before) < after){
      chatLine(`<span class="good">${skillName} leveled up to ${after}!</span>`);
    }
    lastSkillLevel[skillKey] = after;

    // Health affects max HP
    if (skillKey === "health"){
      recalcMaxHPFromHealth();
    }

    renderSkills();
  }

  // ---------- Entities ----------
  function initWorldSeed(){
    initWorldSeedState(localStorage, worldState);
  }

  function nearTileType(x, y, tileVal, radius){
    return nearTileTypeInMap(map, inBounds, x, y, tileVal, radius);
  }


  function placeResource(type,x,y){ resources.push({type,x,y,alive:true,respawnAt:0}); }
  function placeMob(type,x,y){
  const def = MOB_DEFS[type] ?? { name: type, hp: 12, levels: {} };
  const lvls = { ...DEFAULT_MOB_LEVELS, ...(def.levels || {}) };
  const combatLevel = calcCombatLevelFromLevels(lvls);
  const maxHp = Math.max(1, def.hp|0 || 12);

 mobs.push({
  type,
  name: def.name || type,
  x, y,
  homeX: x, homeY: y,

  hp: maxHp,
  maxHp,
  alive: true,
  respawnAt: 0,

  // combat AI state
  target: null,            // "player" | null
  provokedUntil: 0,        // passive mobs engage only after being hit
  aggroUntil: 0,
  attackCooldownUntil: 0,
  moveCooldownUntil: 0,

  levels: lvls,
  combatLevel
});

}

  function placeInteractable(type,x,y,extra={}){ interactables.push({type,x,y,...extra}); }
  function ensureInteractable(type, x, y, extra = {}){
    const found = interactables.find((it) => it.type === type && it.x === x && it.y === y);
    if (found){
      Object.assign(found, extra);
      return found;
    }
    placeInteractable(type, x, y, extra);
    return interactables[interactables.length - 1] ?? null;
  }

 function seedResources(){
  resources.length = 0;

  // Deterministic per world seed (persistent world)
  const rng = makeRng(worldState.seed ^ 0xA53C9E27);
  const used = new Set();

  // Tiles to keep clear (because interactables are placed after resources)
  const reserved = new Set([
    keyXY(startCastle.x0 + 4, startCastle.y0 + 3),     // bank
    keyXY(VENDOR_TILE.x, VENDOR_TILE.y),               // vendor in shop
    keyXY(startCastle.x0 + 5, startCastle.y0 + 4),     // quartermaster npc
    keyXY(startCastle.x0 + 6, startCastle.y0 + 4),     // player spawn-ish
    keyXY(OVERWORLD_LADDER_DOWN.x, OVERWORLD_LADDER_DOWN.y), // dungeon ladder
  ]);

  function tileOkForResource(x,y){
    if (!inBounds(x,y)) return false;

    // Resources only on grass
    if (map[y][x] !== 0) return false;

    // Keep paths readable (no hugging paths)
    if (nearTileType(x,y, 5, 1)) return false;

    // Keep castles/keeps clean
    if (inRectMargin(x,y, startCastle, 2)) return false;
    if (inRectMargin(x,y, vendorShop, 2)) return false;
    if (inRectMargin(x,y, southKeep,  2)) return false;

    // Avoid reserved tiles and stacking
    if (reserved.has(keyXY(x,y))) return false;
    if (used.has(keyXY(x,y))) return false;

    return true;
  }

  function placeRes(type,x,y){
    used.add(keyXY(x,y));
    placeResource(type, x, y);
  }

  function tooCloseToSameType(type, x,y, minDistTiles){
    for (const r of resources){
      if (!r.alive || r.type !== type) continue;
      if (Math.hypot(r.x - x, r.y - y) < minDistTiles) return true;
    }
    return false;
  }

  // Zones to nudge trees into "real" looking regions (not symmetric, not centered)
  const TREE_ZONES = [
    { x1: 16, y1: 5,  x2: 57, y2: 18, w: 1.00 }, // north / northeast
    { x1: 3,  y1: 25, x2: 25, y2: 38, w: 1.00 }, // south west
    { x1: 30, y1: 24, x2: 58, y2: 38, w: 0.85 }, // south east
    { x1: 0,  y1: 12, x2: 14, y2: 38, w: 0.55 }, // west band
    { x1: 18, y1: 18, x2: 40, y2: 26, w: 0.60 }, // mid band
  ];

  const ROCK_ZONES = [
    { x1: 12, y1: 3,  x2: 26, y2: 16, w: 1.00 }, // near north cliff
    { x1: 4,  y1: 24, x2: 18, y2: 38, w: 1.00 }, // near south cliff
    { x1: 22, y1: 26, x2: 40, y2: 36, w: 0.85 }, // near mid cliff
    { x1: 42, y1: 24, x2: 58, y2: 38, w: 0.70 }, // south/east
  ];

  function pickZone(zones){
    const total = zones.reduce((a,z)=>a+z.w,0);
    let r = rng() * total;
    for (const z of zones){
      r -= z.w;
      if (r <= 0) return z;
    }
    return zones[zones.length-1];
  }
  function sampleInZone(z){
    return { x: randInt(rng, z.x1, z.x2), y: randInt(rng, z.y1, z.y2) };
  }

  // ---------- Trees: groves + scatter ----------
  const TREE_TOTAL = 30;
  const GROVE_COUNT = 4;
  const groveCenters = [];
  const groveCenterMinDist = 10;

  function findGroveCenter(){
    for (let a=0; a<2500; a++){
      const z = pickZone(TREE_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForResource(p.x,p.y)) continue;
      // keep grove centers apart
      let ok = true;
      for (const c of groveCenters){
        if (Math.hypot(c.x - p.x, c.y - p.y) < groveCenterMinDist){ ok = false; break; }
      }
      if (!ok) continue;
      return p;
    }
    return null;
  }

  for (let i=0; i<GROVE_COUNT; i++){
    const c = findGroveCenter();
    if (c) groveCenters.push(c);
  }

  function fillGrove(cx,cy, want){
    let placed = 0;
    for (let a=0; a<want*45 && placed<want; a++){
      const ang = rng() * Math.PI * 2;
      // center-weighted radius for natural falloff
      const rr = (1.0 + rng()*4.0) * (rng()**0.55);
      const x = Math.round(cx + Math.cos(ang) * rr);
      const y = Math.round(cy + Math.sin(ang) * rr);

      if (!tileOkForResource(x,y)) continue;
      // allow some adjacency, but avoid â€œsolid blobsâ€
      if (tooCloseToSameType("tree", x,y, 1.35)) continue;

      placeRes("tree", x,y);
      placed++;
    }
    return placed;
  }

  for (const c of groveCenters){
    const groveSize = randInt(rng, 6, 9);
    fillGrove(c.x, c.y, groveSize);
  }

  // scatter singles to reach TREE_TOTAL
  for (let a=0; a<12000 && resources.filter(r=>r.type==="tree").length < TREE_TOTAL; a++){
    const z = pickZone(TREE_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForResource(p.x,p.y)) continue;
    if (tooCloseToSameType("tree", p.x,p.y, 1.05)) continue;
    placeRes("tree", p.x,p.y);
  }

  // ---------- Rocks: prefer near cliffs, clustered ----------
  const ROCK_TOTAL = 12;
  const ROCK_CLUSTER_COUNT = 3;

  function tileOkForRock(x,y){
    if (!tileOkForResource(x,y)) return false;
    return true;
  }

  function findRockCenter(preferCliff){
    for (let a=0; a<2500; a++){
      const z = pickZone(ROCK_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForRock(p.x,p.y)) continue;

      if (preferCliff && !nearTileType(p.x,p.y, 2, 1)) continue; // near cliff
      return p;
    }
    return null;
  }

  let rocksPlaced = 0;

  function fillRockCluster(cx,cy, want){
    let placed = 0;
    for (let a=0; a<want*35 && placed<want; a++){
      const x = cx + randInt(rng, -2, 2);
      const y = cy + randInt(rng, -2, 2);
      if (!tileOkForRock(x,y)) continue;
      if (tooCloseToSameType("rock", x,y, 1.15)) continue;
      placeRes("rock", x,y);
      placed++;
    }
    return placed;
  }

  for (let i=0; i<ROCK_CLUSTER_COUNT && rocksPlaced < ROCK_TOTAL; i++){
    const c = findRockCenter(true) || findRockCenter(false);
    if (!c) break;
    const sz = randInt(rng, 3, 5);
    rocksPlaced += fillRockCluster(c.x, c.y, Math.min(sz, ROCK_TOTAL - rocksPlaced));
  }

  // top-off any remaining rocks in rock zones
  for (let a=0; a<8000 && rocksPlaced < ROCK_TOTAL; a++){
    const z = pickZone(ROCK_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForRock(p.x,p.y)) continue;
    if (tooCloseToSameType("rock", p.x,p.y, 1.05)) continue;
    placeRes("rock", p.x,p.y);
    rocksPlaced++;
  }

  // ---------- Iron rocks: additional higher-tier source near rock faces ----------
  const IRON_ROCK_TOTAL = 8;
  let ironPlaced = 0;
  for (let a=0; a<12000 && ironPlaced < IRON_ROCK_TOTAL; a++){
    const z = pickZone(ROCK_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForRock(p.x,p.y)) continue;
    if (!nearTileType(p.x,p.y, 2, 1)) continue;
    if (tooCloseToSameType("iron_rock", p.x,p.y, 1.10)) continue;
    placeRes("iron_rock", p.x,p.y);
    ironPlaced++;
  }
}

  function seedMobs(){
  mobs.length = 0;

  const rng = makeRng(worldState.seed ^ 0x51C3A2B9);
  const used = new Set();

  // Build a reachable set so rats never spawn in sealed-off areas
  const reachable = new Set();
  (function buildReachable(){
    const q = [{x: player.x, y: player.y}];
    reachable.add(keyXY(player.x, player.y));
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length){
      const cur = q.shift();
      for (const [dx,dy] of dirs){
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!isWalkable(nx,ny)) continue;
        const k = keyXY(nx,ny);
        if (reachable.has(k)) continue;
        reachable.add(k);
        q.push({x:nx,y:ny});
      }
    }
  })();

  // Keep clear of starter safety area + paths
  function tileOkForRat(x,y){
    if (!inBounds(x,y)) return false;

    // Rats on grass only (not inside castles/paths)
    if (map[y][x] !== 0) return false;

    // Must be reachable from the player start region
    if (!reachable.has(keyXY(x,y))) return false;

    // Donâ€™t sit on resources
    if (resources.some(r => r.alive && r.x===x && r.y===y)) return false;

    // Avoid interactable tiles (known)
    if (
      (x===startCastle.x0+4 && y===startCastle.y0+3) ||
      (x===VENDOR_TILE.x && y===VENDOR_TILE.y) ||
      (x===9 && y===13) ||
      (x===OVERWORLD_LADDER_DOWN.x && y===OVERWORLD_LADDER_DOWN.y)
    ) return false;

    // Avoid castles/keeps + a buffer so early game feels safe
    if (inRectMargin(x,y, startCastle, 6)) return false;
    if (inRectMargin(x,y, vendorShop, 4)) return false;
    if (inRectMargin(x,y, southKeep,  6)) return false;

    // Avoid the main path tile itself (looks goofy)
    if (map[y][x] === 5) return false;
    if (nearTileType(x,y, 5, 0)) return false;

    // Avoid stacking rats
    if (used.has(keyXY(x,y))) return false;

    return true;
  }

  function treeDensity(x,y, radius){
    let c = 0;
    for (const r of resources){
      if (!r.alive || r.type !== "tree") continue;
      if (Math.hypot(r.x - x, r.y - y) <= radius) c++;
    }
    return c;
  }

  function tooCloseToExistingRat(x,y, minDist){
    for (const m of mobs){
      if (!m.alive) continue;
      if (Math.hypot(m.x - x, m.y - y) < minDist) return true;
    }
    return false;
  }

  function spawnRat(x,y){
    used.add(keyXY(x,y));
    placeMob("rat", x, y);
  }
  function spawnGoblin(x,y){
    used.add(keyXY(x,y));
    placeMob("goblin", x, y);
  }

  function findNestTile(kind, zoneFn=null){
    for (let a=0; a<5000; a++){
      const x = randInt(rng, 0, W-1);
      const y = randInt(rng, 0, H-1);
      if (!tileOkForRat(x,y)) continue;
      if (zoneFn && !zoneFn(x,y)) continue;

      if (kind === "river"){
        // next to water tiles (riverbanks), not on bridges/path
        if (!nearTileType(x,y, 1, 1)) continue;
        if (nearTileType(x,y, 5, 1)) continue; // keep off bridges
      } else if (kind === "woods"){
        if (treeDensity(x,y, 4.0) < 4) continue;
      }

      return {x,y};
    }
    return null;
  }

  function spawnAround(cx,cy, count, opts={}){
    const spread = Number.isFinite(opts.spread) ? Math.max(1, opts.spread|0) : 3;
    const minDistBase = Number.isFinite(opts.minDist) ? Math.max(0.8, opts.minDist) : 2.1;
    const zoneFn = (typeof opts.zoneFn === "function") ? opts.zoneFn : null;
    const spawnFn = (typeof opts.spawnFn === "function") ? opts.spawnFn : spawnRat;

    let placed = 0;
    for (let a=0; a<count*90 && placed<count; a++){
      const x = cx + randInt(rng, -spread, spread);
      const y = cy + randInt(rng, -spread, spread);
      if (!tileOkForRat(x,y)) continue;
      if (zoneFn && !zoneFn(x,y)) continue;

      // Slight random spacing variance keeps packs from looking too grid-like.
      const desiredDist = minDistBase + rng()*0.65;
      if (tooCloseToExistingRat(x,y, desiredDist)) continue;

      spawnFn(x,y);
      placed++;
    }
    return placed;
  }

  function findClusterSeed(cx, cy, radius, zoneFn=null){
    for (let a=0; a<2600; a++){
      const x = cx + randInt(rng, -radius, radius);
      const y = cy + randInt(rng, -radius, radius);
      if (zoneFn && !zoneFn(x,y)) continue;
      if (!tileOkForRat(x,y)) continue;
      return {x,y};
    }
    return null;
  }

  // Keep most rats near a starter-adjacent training ground while preserving
  // a couple of natural strays around the world.
  const TRAINING_TARGET = 5;
  const TOTAL_TARGET = 7;
  const southOfRiver = (x,y) => y >= (RIVER_Y + 2);
  const trainingCenterX = clamp((startCastle.gateX ?? (startCastle.x0 + Math.floor(startCastle.w / 2))) + 1, 0, W-1);
  const trainingCenterY = clamp(RIVER_Y + 4, 0, H-1);
  const inTrainingZone = (x,y) => (
    southOfRiver(x,y) &&
    Math.abs(x - trainingCenterX) <= 9 &&
    Math.abs(y - trainingCenterY) <= 6
  );

  const trainingSeed = findClusterSeed(trainingCenterX, trainingCenterY, 8, inTrainingZone) || findNestTile("river", southOfRiver);
  if (trainingSeed){
    const subSeed = findClusterSeed(trainingSeed.x + randInt(rng, -3, 3), trainingSeed.y + randInt(rng, -3, 3), 4, inTrainingZone) || trainingSeed;
    spawnAround(trainingSeed.x, trainingSeed.y, 3, { spread: 3, minDist: 1.7, zoneFn: inTrainingZone });
    spawnAround(subSeed.x, subSeed.y, 2, { spread: 3, minDist: 1.9, zoneFn: inTrainingZone });
  }

  // Top off inside the training zone if obstacles blocked initial packs.
  for (let a=0; a<2400 && mobs.length < TRAINING_TARGET; a++){
    const c = findClusterSeed(trainingCenterX, trainingCenterY, 9, inTrainingZone);
    if (!c) break;
    spawnAround(c.x, c.y, 1, { spread: 2, minDist: 1.8, zoneFn: inTrainingZone });
  }

  // Add a small number of world strays so the world doesn't feel staged.
  const outskirts = [
    { kind: "river", count: 1 },
    { kind: "woods", count: 1 },
  ];
  for (const n of outskirts){
    if (mobs.length >= TOTAL_TARGET) break;
    const c = findNestTile(n.kind, southOfRiver);
    if (!c) continue;
    spawnAround(c.x, c.y, n.count, { spread: 4, minDist: 2.4, zoneFn: southOfRiver });
  }

  // Global top-off as a safety net.
  for (let a=0; a<9000 && mobs.length < TOTAL_TARGET; a++){
    const x = randInt(rng, 0, W-1);
    const y = randInt(rng, RIVER_Y + 2, H-1);
    if (!tileOkForRat(x,y)) continue;
    if (!southOfRiver(x,y)) continue;
    if (tooCloseToExistingRat(x,y, 2.4 + rng()*0.6)) continue;
    spawnRat(x,y);
  }

  // Mid-tier mobs: a goblin pack north of the river near (37,13).
  const GOBLIN_TARGET = 4;
  const goblinAnchor = { x: 37, y: 13 };
  const inGoblinZone = (x,y) => (
    y <= (RIVER_Y - 5) &&
    Math.abs(x - goblinAnchor.x) <= 7 &&
    Math.abs(y - goblinAnchor.y) <= 5
  );
  const goblinCount = () => mobs.reduce((n,m) => n + ((m.alive && m.type === "goblin") ? 1 : 0), 0);

  const goblinSeed =
    findClusterSeed(goblinAnchor.x, goblinAnchor.y, 4, inGoblinZone) ||
    findClusterSeed(goblinAnchor.x, goblinAnchor.y, 8, inGoblinZone);
  if (goblinSeed){
    spawnAround(goblinSeed.x, goblinSeed.y, GOBLIN_TARGET, {
      spread: 4,
      minDist: 2.2,
      zoneFn: inGoblinZone,
      spawnFn: spawnGoblin
    });
  }

  for (let a=0; a<3200 && goblinCount() < GOBLIN_TARGET; a++){
    const x = goblinAnchor.x + randInt(rng, -7, 7);
    const y = goblinAnchor.y + randInt(rng, -5, 5);
    if (!inGoblinZone(x,y)) continue;
    if (!tileOkForRat(x,y)) continue;
    if (tooCloseToExistingRat(x,y, 2.2 + rng()*0.6)) continue;
    spawnGoblin(x,y);
  }

}

  function buildBaseInteractables(){
    // Returns the guaranteed base world interactables that should always be present.
    // This is the source of truth for what should be seeded on new games.
    const base = [];

    // Bank at start castle
    base.push({ type: "bank", x: startCastle.x0 + 4, y: startCastle.y0 + 3 });

    // Quartermaster quest NPC
    base.push({ type: "quest_npc", x: startCastle.x0 + 5, y: startCastle.y0 + 4, npcId: "quartermaster", name: "Quartermaster Bryn" });

    // Vendor
    base.push({ type: "vendor", x: VENDOR_TILE.x, y: VENDOR_TILE.y });

    // Ladder down
    base.push({ type: "ladder_down", x: OVERWORLD_LADDER_DOWN.x, y: OVERWORLD_LADDER_DOWN.y });

    // Fishing spots on the river
    base.push({ type: "fish", x: 6, y: RIVER_Y });
    base.push({ type: "fish", x: 10, y: RIVER_Y + 1 });

    // Smithing furnace and anvil
    base.push({ type: "furnace", x: SMITHING_FURNACE_TILE.x, y: SMITHING_FURNACE_TILE.y });
    base.push({ type: "anvil", x: SMITHING_ANVIL_TILE.x, y: SMITHING_ANVIL_TILE.y });

    // Blacksmith Torren - Project NPC (always present)
    base.push({ 
      type: "project_npc", 
      x: SMITHING_BLACKSMITH_TILE.x, 
      y: SMITHING_BLACKSMITH_TILE.y, 
      npcId: "blacksmith_torren", 
      name: TOWN_PROJECT_NPC.blacksmith_torren.name 
    });

    // Project NPCs (always present)
    base.push({ 
      type: "project_npc", 
      x: 30, 
      y: 19, 
      npcId: "dock_foreman", 
      name: TOWN_PROJECT_NPC.dock_foreman.name 
    });

    base.push({ 
      type: "project_npc", 
      x: 7, 
      y: 16, 
      npcId: "hearth_keeper", 
      name: TOWN_PROJECT_NPC.hearth_keeper.name 
    });

    base.push({ 
      type: "project_npc", 
      x: 8, 
      y: 3, 
      npcId: "mayor", 
      name: TOWN_PROJECT_NPC.mayor.name 
    });

    return base;
  }

  function seedInteractables(){
    interactables.length=0;
    
    // Start with guaranteed base interactables
    const base = buildBaseInteractables();
    for (const it of base) {
      interactables.push(it);
    }

    // Add conditional interactables that depend on state
    
    // Dock fishing spot (spawns after dock project completes)
    const dockState = getProjectState("rivermoor", "dock");
    if (dockState === "complete") {
      interactables.push({ type: "fish_dock", x: 31, y: 23 });
    }

    const hearthState = getProjectState("rivermoor", "hearth");
    if (hearthState === "complete") {
      const cauldronTile = getHearthCampCauldronTile();
      interactables.push({ type: "cauldron", x: cauldronTile.x, y: cauldronTile.y });
    }

    // Smithing bank (unlocks with smithing_upgrade project or storage project complete)
    if (isSmithBankUnlocked() || getProjectState("rivermoor", "storage") === "complete"){
      interactables.push({ type: "bank", x: SMITHING_BANK_TILE.x, y: SMITHING_BANK_TILE.y, bankTag: "smithing_upgrade" });
    }
  }

  // ---------- Character / class ----------
  const SAVE_KEY="classic_inspired_rpg_save_v10_quiver_loot_health_windows";
  const CHAR_KEY = "classic_char_v3";
  const CHAR_LIST_KEY = "classic_char_list_v1";
  const ACTIVE_CHAR_ID_KEY = "classic_active_char_id_v1";
  const CHAT_UI_KEY = "classic_chat_ui_v1";
  const WINDOWS_UI_KEY = "classic_windows_ui_v2_multi_open";
  const BGM_KEY = "classic_bgm_v1";

  function parseMaybeJSON(raw){
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      // Keep legacy plain-string values readable when JSON parsing fails.
      return raw;
    }
  }

  function readStoredValue(key){
    return localStorage.getItem(key);
  }

  function writeStoredValue(key, value){
    localStorage.setItem(key, value);
  }

  function removeStoredValue(key){
    localStorage.removeItem(key);
  }

  function readStoredJSON(key, fallback = null){
    const parsed = parseMaybeJSON(readStoredValue(key));
    return parsed == null ? fallback : parsed;
  }

  function writeStoredJSON(key, value){
    try {
      writeStoredValue(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const hudChatEl = document.getElementById("hudChat");
  const hudChatTabEl = document.getElementById("hudChatTab");
  const hudChatHeaderEl = document.getElementById("hudChatHeader");
  const hudChatMinEl = document.getElementById("hudChatMin");
  const hudChatResizeEl = document.getElementById("hudChatResize");
  const chatInputEl = document.getElementById("chatInput");
  const chatSendEl = document.getElementById("chatSend");

  function saveChatUI(){
    writeStoredJSON(CHAT_UI_KEY, {
      left: chatUI.left|0,
      top: Number.isFinite(chatUI.top) ? (chatUI.top|0) : null,
      width: chatUI.width|0,
      height: chatUI.height|0,
      collapsed: !!chatUI.collapsed
    });
  }

  function loadChatUI(){
    const d = readStoredJSON(CHAT_UI_KEY, null);
    if (!d) return;
    chatUI.left = Number.isFinite(d?.left) ? (d.left|0) : chatUI.left;
    chatUI.top = Number.isFinite(d?.top) ? (d.top|0) : null;
    chatUI.width = Number.isFinite(d?.width) ? (d.width|0) : chatUI.width;
    chatUI.height = Number.isFinite(d?.height) ? (d.height|0) : chatUI.height;
    chatUI.collapsed = !!d?.collapsed;
  }

  function applyChatUI(){
    if (!hudChatEl) return;
    chatUI.left = clamp(chatUI.left|0, 6, Math.max(6, window.innerWidth - 110));
    chatUI.width = clamp(chatUI.width|0, 300, Math.max(300, window.innerWidth - 20));
    chatUI.height = clamp(chatUI.height|0, 190, Math.max(190, window.innerHeight - 20));

    hudChatEl.classList.toggle("collapsed", !!chatUI.collapsed);
    hudChatEl.style.left = `${chatUI.left}px`;
    if (Number.isFinite(chatUI.top)){
      chatUI.top = clamp(chatUI.top|0, 6, Math.max(6, window.innerHeight - 60));
      hudChatEl.style.top = `${chatUI.top}px`;
      hudChatEl.style.bottom = "auto";
    } else {
      hudChatEl.style.top = "auto";
      hudChatEl.style.bottom = "12px";
    }
    hudChatEl.style.width = `${chatUI.width}px`;
    hudChatEl.style.height = `${chatUI.height}px`;
  }

  function saveWindowsUI(){
    writeStoredJSON(WINDOWS_UI_KEY, {
      open: { ...windowsOpen },
      layout: getWindowLayoutSnapshot()
    });
  }

  function loadWindowsUI(){
    const d = readStoredJSON(WINDOWS_UI_KEY, null);
    if (!d?.open) return;
    for (const k of Object.keys(windowsOpen)){
      windowsOpen[k] = !!d.open[k];
    }
    applyWindowLayout(d.layout);
  }

  function renderMeleeTrainingUI(){
    const seg = document.getElementById("meleeTrainingSeg");
    if (!seg) return;
    const selected = getMeleeTrainingSelection();
    for (const btn of seg.querySelectorAll("button[data-melee]")){
      const key = btn.dataset.melee;
      btn.classList.toggle("active", !!key && selected.includes(key));
      if (btn.dataset.bound === "1") continue;
      btn.dataset.bound = "1";
      btn.addEventListener("click", ()=>{
        if (!key) return;
        const current = getMeleeTrainingSelection();
        const active = current.includes(key);
        if (active && current.length === 1) return;
        meleeState.selected = active
          ? current.filter((skillKey) => skillKey !== key)
          : [...current, key];
        saveMeleeTraining();
        renderMeleeTrainingUI();
      });
    }
  }

  (function initChatUIControls(){
    if (!hudChatEl) return;

    let drag = null;
    let resize = null;

    if (hudChatHeaderEl){
      hudChatHeaderEl.addEventListener("mousedown", (e)=>{
        if (e.button !== 0 || chatUI.collapsed) return;
        const rect = hudChatEl.getBoundingClientRect();
        drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        chatUI.top = rect.top|0;
      });
    }

    if (hudChatResizeEl){
      hudChatResizeEl.addEventListener("mousedown", (e)=>{
        if (e.button !== 0 || chatUI.collapsed) return;
        e.preventDefault();
        resize = {
          sx: e.clientX,
          sy: e.clientY,
          sw: chatUI.width|0,
          sh: chatUI.height|0
        };
      });
    }

    if (hudChatMinEl){
      hudChatMinEl.addEventListener("click", ()=>{
        chatUI.collapsed = true;
        applyChatUI();
        saveChatUI();
      });
    }

    if (hudChatTabEl){
      hudChatTabEl.addEventListener("click", ()=>{
        chatUI.collapsed = false;
        applyChatUI();
        saveChatUI();
      });
    }

    const sendChatText = ()=>{
      if (!chatInputEl) return;
      const msg = String(chatInputEl.value || "").trim();
      if (!msg) return;
      chatLine(`<span class="muted">You:</span> ${msg}`);
      chatInputEl.value = "";
    };

    if (chatSendEl) chatSendEl.addEventListener("click", sendChatText);
    if (chatInputEl){
      chatInputEl.addEventListener("keydown", (e)=>{
        if (e.key !== "Enter") return;
        e.preventDefault();
        sendChatText();
      });
    }

    window.addEventListener("mousemove", (e)=>{
      if (drag){
        chatUI.left = (e.clientX - drag.dx)|0;
        chatUI.top = (e.clientY - drag.dy)|0;
        applyChatUI();
      }
      if (resize){
        chatUI.width = (resize.sw + (e.clientX - resize.sx))|0;
        chatUI.height = (resize.sh + (e.clientY - resize.sy))|0;
        applyChatUI();
      }
    });

    window.addEventListener("mouseup", ()=>{
      if (drag || resize) saveChatUI();
      drag = null;
      resize = null;
    });

    window.addEventListener("resize", ()=>{
      applyChatUI();
      saveChatUI();
    });
  })();

  function tileCenter(x,y){ return {cx:x*TILE+TILE/2, cy:y*TILE+TILE/2}; }
  function syncPlayerPix(){ const {cx,cy}=tileCenter(player.x,player.y); player.px=cx; player.py=cy; }
  syncPlayerPix();

  function updateCamera(){
    const vw = viewWorldW();
    const vh = viewWorldH();
    const maxX = Math.max(0, WORLD_W - vw);
    const maxY = Math.max(0, WORLD_H - vh);
    camera.x = clamp(player.px - vw/2, 0, maxX);
    camera.y = clamp(player.py - vh/2, 0, maxY);
  }

  function setPathTo(tx,ty){
    const p=astar(player.x,player.y,tx,ty);
    if (!p) return false;
    player.path=p;
    return true;
  }

  function stopAction(msg){
    player.action={type:"idle",endsAt:0,total:0,label:"Idle",onComplete:null};
    player.target=null;
    if (msg) chatLine(`<span class="muted">${msg}</span>`);
  }

  function startTimedAction(type, ms, label, onComplete){
    player.action={ type, endsAt: now()+ms, total: ms, label, onComplete };
  }

  function inRangeOfTile(tx,ty,rangeTiles=1.1){
    const a=tileCenter(player.x,player.y);
    const b=tileCenter(tx,ty);
    return dist(a.cx,a.cy,b.cx,b.cy) <= rangeTiles*TILE;
  }

  function actionProgress(){
    const a=player.action;
    if (a.type==="idle" || !a.total) return 0;
    const rem=a.endsAt-now();
    return clamp(1 - rem/a.total, 0, 1);
  }

  function tilesBetweenTiles(ax, ay, bx, by){
    const a = tileCenter(ax, ay);
    const b = tileCenter(bx, by);
    return dist(a.cx, a.cy, b.cx, b.cy) / TILE;
  }
  function tilesFromPlayerToTile(tx, ty){
    const b = tileCenter(tx, ty);
    return dist(player.px, player.py, b.cx, b.cy) / TILE;
  }

  function hasLineOfSightTiles(ax, ay, bx, by){
    let x0 = ax | 0;
    let y0 = ay | 0;
    const x1 = bx | 0;
    const y1 = by | 0;

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (!(x0 === x1 && y0 === y1)){
      const e2 = err * 2;
      if (e2 > -dy){ err -= dy; x0 += sx; }
      if (e2 < dx){ err += dx; y0 += sy; }

      // Ignore destination tile (the target can occupy it); only blockers between tiles matter.
      if (x0 === x1 && y0 === y1) return true;
      if (!isWalkable(x0, y0)) return false;
    }
    return true;
  }

  function getCombatStyle(){
    const w = equipment.weapon ? Items[equipment.weapon] : null;
    const explicit = w?.combat?.style;
    if (explicit === "ranged" || explicit === "magic" || explicit === "melee") return explicit;

    // Keep legacy class fallback when no explicit combat style is set.
    if (equipment.weapon === "bow" || (player.class === "Ranger" && (hasItem("bow") || equipment.weapon === "bow"))) return "ranged";
    if (equipment.weapon === "staff" || (player.class === "Mage" && (hasItem("staff") || equipment.weapon === "staff"))) return "magic";
    return "melee";
  }

  function findBestTileWithinRange(tx, ty, rangeTiles, options = {}){
    const requireLineOfSight = !!options.requireLineOfSight;
    const r = Math.ceil(rangeTiles);
    const candidates = [];

    for (let dy=-r; dy<=r; dy++){
      for (let dx=-r; dx<=r; dx++){
        const cx = tx + dx, cy = ty + dy;
        if (!isWalkable(cx, cy)) continue;
        if (tilesBetweenTiles(cx, cy, tx, ty) > rangeTiles) continue;
        if (requireLineOfSight && !hasLineOfSightTiles(cx, cy, tx, ty)) continue;
        const h = Math.abs(cx - player.x) + Math.abs(cy - player.y);
        candidates.push({x:cx, y:cy, h});
      }
    }

    candidates.sort((a,b)=>a.h-b.h);

    for (const c of candidates.slice(0, 24)){
      const p = astar(player.x, player.y, c.x, c.y);
      if (p) return {x:c.x, y:c.y, path:p};
    }
    return null;
  }

  // ---------- UI: windows + toolbar ----------
  const winInventory = document.getElementById("winInventory");
  const winEquipment = document.getElementById("winEquipment");
  const winSkills    = document.getElementById("winSkills");
  const winQuests    = document.getElementById("winQuests");
  const winXpLamp    = document.getElementById("winXpLamp");
  const winBank      = document.getElementById("winBank");
  const winVendor    = document.getElementById("winVendor");
  const winSmithing  = document.getElementById("winSmithing");
  const winBlacksmith = document.getElementById("winBlacksmith");
  const winTownProjects = document.getElementById("winTownProjects");

  const winSettings  = document.getElementById("winSettings");

  const iconInv  = document.getElementById("iconInv");
  const iconEqp  = document.getElementById("iconEqp");
  const iconSki  = document.getElementById("iconSki");
  const iconQst  = document.getElementById("iconQst");
  const iconBank = document.getElementById("iconBank");
  const iconVendor = document.getElementById("iconVendor");

  const iconSet  = document.getElementById("iconSet");

  const managedWindows = [
    ["inventory", winInventory],
    ["equipment", winEquipment],
    ["skills", winSkills],
    ["quests", winQuests],
    ["xpLamp", winXpLamp],
    ["bank", winBank],
    ["vendor", winVendor],
    ["smithing", winSmithing],
    ["blacksmith", winBlacksmith],
    ["townProjects", winTownProjects],
    ["settings", winSettings]
  ].filter(([, el]) => !!el);

  let windowDrag = null;
  let windowResize = null;
  let windowZ = 70;

  function windowNumPx(value, fallback){
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getWindowBounds(el){
    const cs = getComputedStyle(el);
    const cssMinW = windowNumPx(cs.minWidth, 220);
    const cssMinH = windowNumPx(cs.minHeight, 180);
    const maxW = Math.max(220, window.innerWidth - 16);
    const maxH = Math.max(180, window.innerHeight - 16);
    return {
      minW: Math.min(Math.max(220, cssMinW), maxW),
      minH: Math.min(Math.max(180, cssMinH), maxH),
      maxW,
      maxH
    };
  }

  function clampWindowRect(el){
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const { minW, minH, maxW, maxH } = getWindowBounds(el);

    let width = windowNumPx(el.style.width, rect.width || 360);
    let height = windowNumPx(el.style.height, rect.height || 320);
    width = clamp(width, minW, maxW);
    height = clamp(height, minH, maxH);

    let left = windowNumPx(el.style.left, rect.left || 0);
    let top = windowNumPx(el.style.top, rect.top || 0);

    left = clamp(left, 0, Math.max(0, window.innerWidth - width));
    top = clamp(top, 0, Math.max(0, window.innerHeight - 42));

    el.style.width = `${width|0}px`;
    el.style.height = `${height|0}px`;
    el.style.left = `${left|0}px`;
    el.style.top = `${top|0}px`;
  }

  function clampAllWindows(){
    for (const [, el] of managedWindows){
      clampWindowRect(el);
    }
  }

  function getWindowLayoutSnapshot(){
    const out = {};
    for (const [name, el] of managedWindows){
      const rect = el.getBoundingClientRect();
      out[name] = {
        left: windowNumPx(el.style.left, rect.left || 0) | 0,
        top: windowNumPx(el.style.top, rect.top || 0) | 0,
        width: windowNumPx(el.style.width, rect.width || 360) | 0,
        height: windowNumPx(el.style.height, rect.height || 320) | 0,
        z: windowNumPx(el.style.zIndex, 70) | 0
      };
    }
    return out;
  }

  function applyWindowLayout(layout){
    if (!layout || typeof layout !== "object") return;

    for (const [name, el] of managedWindows){
      const w = layout[name];
      if (!w || typeof w !== "object") continue;

      if (Number.isFinite(w.left)) el.style.left = `${w.left|0}px`;
      if (Number.isFinite(w.top)) el.style.top = `${w.top|0}px`;
      if (Number.isFinite(w.width)) el.style.width = `${w.width|0}px`;
      if (Number.isFinite(w.height)) el.style.height = `${w.height|0}px`;
      if (Number.isFinite(w.z)) el.style.zIndex = String(w.z|0);
    }

    clampAllWindows();

    let maxZ = 70;
    for (const [, el] of managedWindows){
      maxZ = Math.max(maxZ, windowNumPx(el.style.zIndex, 70) | 0);
    }
    windowZ = maxZ;
  }

  function bringWindowToFront(el){
    if (!el) return;
    windowZ = Math.max(windowZ + 1, 71);
    el.style.zIndex = String(windowZ);
  }

  (function initWindowControls(){
    const closeBtns = document.querySelectorAll(".winClose[data-close]");
    for (const btn of closeBtns){
      if (btn.dataset.boundClose === "1") continue;
      btn.dataset.boundClose = "1";
      btn.addEventListener("click", ()=>{
        const name = btn.dataset.close;
        if (!name) return;
        closeWindow(name);
      });
    }

    for (const [, el] of managedWindows){
      const z = windowNumPx(el.style.zIndex, 70) | 0;
      windowZ = Math.max(windowZ, z);

      el.addEventListener("mousedown", ()=>{
        bringWindowToFront(el);
      });

      const header = el.querySelector(".winHeader");
      if (header && header.dataset.boundDrag !== "1"){
        header.dataset.boundDrag = "1";
        header.addEventListener("mousedown", (e)=>{
          if (e.button !== 0) return;
          if (e.target.closest("button,input,textarea,select,a")) return;
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          bringWindowToFront(el);
          windowDrag = {
            el,
            dx: e.clientX - rect.left,
            dy: e.clientY - rect.top
          };
        });
      }

      let resizeHandle = el.querySelector(".winResize");
      if (!resizeHandle){
        resizeHandle = document.createElement("div");
        resizeHandle.className = "winResize";
        resizeHandle.title = "Resize window";
        el.appendChild(resizeHandle);
      }
      if (resizeHandle.dataset.boundResize !== "1"){
        resizeHandle.dataset.boundResize = "1";
        resizeHandle.addEventListener("mousedown", (e)=>{
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = el.getBoundingClientRect();
          bringWindowToFront(el);
          windowResize = {
            el,
            sx: e.clientX,
            sy: e.clientY,
            sw: rect.width,
            sh: rect.height
          };
        });
      }
    }

    window.addEventListener("mousemove", (e)=>{
      if (windowDrag){
        const el = windowDrag.el;
        const rect = el.getBoundingClientRect();
        let left = e.clientX - windowDrag.dx;
        let top = e.clientY - windowDrag.dy;
        left = clamp(left, 0, Math.max(0, window.innerWidth - rect.width));
        top = clamp(top, 0, Math.max(0, window.innerHeight - 42));
        el.style.left = `${left|0}px`;
        el.style.top = `${top|0}px`;
      }

      if (windowResize){
        const el = windowResize.el;
        const left = windowNumPx(el.style.left, el.getBoundingClientRect().left || 0);
        const top = windowNumPx(el.style.top, el.getBoundingClientRect().top || 0);
        const { minW, minH } = getWindowBounds(el);
        const maxW = Math.max(minW, window.innerWidth - left - 8);
        const maxH = Math.max(minH, window.innerHeight - top - 8);
        const width = clamp(windowResize.sw + (e.clientX - windowResize.sx), minW, maxW);
        const height = clamp(windowResize.sh + (e.clientY - windowResize.sy), minH, maxH);
        el.style.width = `${width|0}px`;
        el.style.height = `${height|0}px`;
      }
    });

    window.addEventListener("mouseup", ()=>{
      if (windowDrag || windowResize) saveWindowsUI();
      windowDrag = null;
      windowResize = null;
    });

    window.addEventListener("resize", ()=>{
      clampAllWindows();
      saveWindowsUI();
    });

    clampAllWindows();
  })();

  // ---------- Rendering UI: inventory/skills/equipment/bank ----------
  const invGrid = document.getElementById("invGrid");
  const invCountEl = document.getElementById("invCount");
  const invUseStateEl = document.getElementById("invUseState");

  const skillsGrid = document.getElementById("skillsGrid");
  const skillsCombatPillEl = document.getElementById("skillsCombatPill");
  const questsSummaryPillEl = document.getElementById("questsSummaryPill");
  const questsActiveListEl = document.getElementById("questsActiveList");
  const questsNewListEl = document.getElementById("questsNewList");
  const questsLockedListEl = document.getElementById("questsLockedList");
  const questsCompletedListEl = document.getElementById("questsCompletedList");
  const xpLampCountPillEl = document.getElementById("xpLampCountPill");
  const xpLampSkillListEl = document.getElementById("xpLampSkillList");
  const projectsRenownPillEl = document.getElementById("projectsRenownPill");
  const projectsGridEl = document.getElementById("projectsGrid");

  const eqWeaponSlot = document.getElementById("eqWeapon");
  const eqOffhandSlot = document.getElementById("eqOffhand");
  const eqHeadSlot = document.getElementById("eqHead");
  const eqBodySlot = document.getElementById("eqBody");
  const eqLegsSlot = document.getElementById("eqLegs");
  const eqHandsSlot = document.getElementById("eqHands");
  const eqFeetSlot = document.getElementById("eqFeet");
  const eqQuiverSlot = document.getElementById("eqQuiver");
  const eqWeaponIcon = document.getElementById("eqWeaponIcon");
  const eqWeaponName = document.getElementById("eqWeaponName");
  const eqOffhandIcon = document.getElementById("eqOffhandIcon");
  const eqOffhandName = document.getElementById("eqOffhandName");
  const eqHeadIcon = document.getElementById("eqHeadIcon");
  const eqHeadName = document.getElementById("eqHeadName");
  const eqBodyIcon = document.getElementById("eqBodyIcon");
  const eqBodyName = document.getElementById("eqBodyName");
  const eqLegsIcon = document.getElementById("eqLegsIcon");
  const eqLegsName = document.getElementById("eqLegsName");
  const eqHandsIcon = document.getElementById("eqHandsIcon");
  const eqHandsName = document.getElementById("eqHandsName");
  const eqFeetIcon = document.getElementById("eqFeetIcon");
  const eqFeetName = document.getElementById("eqFeetName");
  const eqQuiverIcon = document.getElementById("eqQuiverIcon");
  const eqQuiverName = document.getElementById("eqQuiverName");
  const eqQuiverQty = document.getElementById("eqQuiverQty");

  const bankGrid = document.getElementById("bankGrid");
  const bankCountEl = document.getElementById("bankCount");
  const bankExpandBtn = document.getElementById("bankExpandBtn");
  const bankExpandMetaEl = document.getElementById("bankExpandMeta");
  const smithingListEl = document.getElementById("smithingList");
  const smithingLevelPillEl = document.getElementById("smithingLevelPill");
  const blacksmithGoldPillEl = document.getElementById("blacksmithGoldPill");
  const blacksmithListEl = document.getElementById("blacksmithList");

  const SMITHING_RECIPES_BY_BAR = {
    crude_bar: [
      { out: "crude_dagger", bars: 1, level: 1, xp: 24 },
      { out: "crude_helm", bars: 1, level: 2, xp: 28 },
      { out: "crude_sword", bars: 2, level: 3, xp: 42 },
      { out: "crude_shield", bars: 2, level: 4, xp: 44 },
      { out: "crude_legs", bars: 2, level: 6, xp: 48 },
      { out: "crude_body", bars: 3, level: 10, xp: 62 }
    ],
    iron_bar: [
      { out: "iron_dagger", bars: 1, level: 10, xp: 40 },
      { out: "iron_helm", bars: 1, level: 11, xp: 44 },
      { out: "iron_sword", bars: 2, level: 12, xp: 62 },
      { out: "iron_shield", bars: 2, level: 14, xp: 64 },
      { out: "iron_legs", bars: 2, level: 16, xp: 70 },
      { out: "iron_body", bars: 3, level: 18, xp: 88 }
    ]
  };
  const XP_LAMP_GAIN = 100;
  const BANK_EXPAND_STEP = 7;
  const BANK_EXPAND_COSTS = [250, 600, 1200, 2200, 3600, 5400];

  function clampBankCapacity(capacity){
    return clamp(capacity | 0, BANK_START_SLOTS, MAX_BANK);
  }

  function getBankCapacity(){
    return clampBankCapacity(bankMeta.capacity);
  }

  function setBankCapacity(capacity, opts = {}){
    const next = clampBankCapacity(capacity);
    bankMeta.capacity = next;
    if (!opts.silent) renderBank();
    return next;
  }

  function getBankNextCapacity(capacity = getBankCapacity()){
    const current = clampBankCapacity(capacity);
    return Math.min(MAX_BANK, current + BANK_EXPAND_STEP);
  }

  function getBankExpandCost(capacity = getBankCapacity()){
    if (capacity >= MAX_BANK) return 0;
    const tier = Math.floor((clampBankCapacity(capacity) - BANK_START_SLOTS) / BANK_EXPAND_STEP);
    return BANK_EXPAND_COSTS[tier] ?? BANK_EXPAND_COSTS[BANK_EXPAND_COSTS.length - 1] ?? 0;
  }

  function ensureBankCapacityFitsContents(){
    const used = countSlots(bank);
    if (used > getBankCapacity()){
      setBankCapacity(used, { silent: true });
    }
  }

  function getItemCombatStatText(id){
    const item = Items[id];
    const c = item?.combat;
    const parts = [];
    if (c?.style && c.style !== "any"){
      const style = String(c.style);
      parts.push(`Style: ${style[0].toUpperCase()}${style.slice(1)}`);
    }
    if ((c?.att|0) !== 0) parts.push(`+${c.att|0} ACC`);
    if ((c?.dmg|0) !== 0) parts.push(`+${c.dmg|0} DMG`);
    if ((c?.def|0) !== 0) parts.push(`+${c.def|0} DEF`);
    const reqLine = getEquipRequirementLine(id);
    if (reqLine) parts.push(reqLine);
    if (item?.hint) parts.push(item.hint);
    return parts.join(" · ");
  }

  function renderInv(){
    invGrid.innerHTML = "";
    invCountEl.textContent = `${countSlots(inv)}/${MAX_INV}`;
    for (let i=0; i<MAX_INV; i++){
      const s = inv[i];
      const slot = document.createElement("div");
      slot.className = "slot" + (s ? "" : " empty");
      slot.dataset.index = String(i);

      if (!s){
        slot.innerHTML = `<div class="icon">.</div><div class="name">Empty</div>`;
        slot.removeAttribute("title");
        delete slot.dataset.tooltip;
      } else {
        const item = Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.flatIcon ?? item?.icon ?? UNKNOWN_ICON}</div>
          <div class="name">${item?.name ?? s.id}</div>
          ${qty > 1 ? `<div class="qty">${qty}</div>` : ``}
        `;
        const stats = getItemCombatStatText(s.id);
        const tip = `${item?.name ?? s.id}${qty>1 ? ` x${qty}` : ""}${stats ? `\n${stats}` : ""}`;
        slot.removeAttribute("title");
        slot.dataset.tooltip = tip;
      }
      invGrid.appendChild(slot);
    }
    renderSmithingUI();
    renderXpLampUI();
  }

  function renderSkills(){
    skillsGrid.innerHTML = "";
    if (skillsCombatPillEl) skillsCombatPillEl.textContent = `Combat: ${getPlayerCombatLevel(Skills)}`;

    const order = ["health","accuracy","power","defense","ranged","sorcery","fletching","woodcutting","mining","smithing","fishing","firemaking","cooking"];
    for (const k of order){
      const s = Skills[k] ?? { name: getSkillName(k), xp: 0 };
      const skillName = getSkillName(k);
      const { lvl, next, pct } = xpToNext(s.xp);
      const toNext = Math.max(0, next - s.xp);
      const icon = SKILL_ICONS[k] ?? SKILL_FALLBACK_ICON;

      const div = document.createElement("div");
      div.className = "stat";
      div.title = `${skillName}\nXP: ${s.xp}\nXP to next: ${toNext}`;
      div.innerHTML = `
        <div class="k"><span class="ico">${icon}</span> ${skillName}</div>
        <div class="v">Lv ${lvl}</div>
        <div class="small">${s.xp} XP</div>
        <div class="bar"><div style="width:${clamp(pct,0,1)*100}%"></div></div>
        <div class="small">${toNext} XP to next</div>
      `;
      skillsGrid.appendChild(div);
    }
  }

  function renderQuestCards(container, rows, status){
    if (!container) return;
    container.innerHTML = "";
    if (!rows.length){
      const empty = document.createElement("div");
      empty.className = "questEmpty";
      empty.textContent = (status === "completed")
        ? "No completed quests yet."
        : (status === "locked" ? "No locked quests." : (status === "active" ? "No active quests." : "No new quests right now."));
      container.appendChild(empty);
      return;
    }

    for (const row of rows){
      const def = row.def;
      const questId = String(def?.id || "");
      if (!questId) continue;

      const card = document.createElement("div");
      card.className = "questCard";

      const name = document.createElement("div");
      name.className = "questName";
      name.textContent = def.name || questId;
      card.appendChild(name);

      const summary = document.createElement("div");
      summary.className = "questSummary";
      summary.textContent = def.summary || "";
      card.appendChild(summary);

      const reqs = Array.isArray(def.requirements) ? def.requirements : [];
      if (reqs.length){
        for (const req of reqs){
          const line = document.createElement("div");
          const ok = (req?.type === "quest_complete") ? isQuestCompleted(req.questId) : true;
          line.className = `questRow${ok ? " done" : ""}`;
          line.textContent = `${ok ? "[Done]" : "[Need]"} ${req?.label || req?.questId || "Requirement"}`;
          card.appendChild(line);
        }
      }

      for (const obj of (def.objectives || [])){
        const objectiveId = String(obj?.id || "");
        if (!objectiveId) continue;
        const target = getQuestObjectiveTarget(obj);
        const current = getQuestObjectiveProgress(questId, objectiveId);
        const done = current >= target;
        const line = document.createElement("div");
        line.className = `questRow${done ? " done" : ""}`;
        line.textContent = `${done ? "[Done]" : "[ ]"} ${obj.label} (${current}/${target})`;
        card.appendChild(line);
      }

      const rewards = Array.isArray(def.rewards) ? def.rewards : [];
      const renownReward = QUEST_RENOWN_REWARDS?.[questId]?.amount | 0;
      const rewardParts = rewards.slice();
      if (renownReward > 0) rewardParts.push(`Renown +${renownReward}`);
      if (rewardParts.length){
        const rewardLine = document.createElement("div");
        rewardLine.className = "questSummary";
        rewardLine.textContent = `Rewards: ${rewardParts.join(" | ")}`;
        card.appendChild(rewardLine);
      }

      container.appendChild(card);
    }
  }

  function renderQuests(){
    if (!questsActiveListEl || !questsNewListEl || !questsLockedListEl || !questsCompletedListEl) return;

    const groups = { active: [], new: [], locked: [], completed: [] };
    for (const def of QUESTS){
      if (!def?.id) continue;
      if (isQuestCompleted(def.id)) {
        groups.completed.push({ def });
      } else if (isQuestStarted(def.id)) {
        groups.active.push({ def });
      } else if (isQuestUnlocked(def)) {
        groups.new.push({ def });
      } else {
        groups.locked.push({ def });
      }
    }

    renderQuestCards(questsActiveListEl, groups.active, "active");
    renderQuestCards(questsNewListEl, groups.new, "new");
    renderQuestCards(questsLockedListEl, groups.locked, "locked");
    renderQuestCards(questsCompletedListEl, groups.completed, "completed");
    if (questsSummaryPillEl){
      questsSummaryPillEl.textContent = `Active: ${groups.active.length} | New: ${groups.new.length} | Completed: ${groups.completed.length}`;
    }
  }

  function redeemXpLampToSkill(skillKey){
    if (!Skills[skillKey]){
      chatLine(`<span class="warn">That skill cannot be trained.</span>`);
      return;
    }
    if (!removeItemsFromInventory("xp_lamp", 1)){
      chatLine(`<span class="warn">You need an ${Items.xp_lamp?.name ?? "XP Lamp"}.</span>`);
      closeWindow("xpLamp");
      return;
    }

    const skillName = getSkillName(skillKey);
    addXP(skillKey, XP_LAMP_GAIN);
    chatLine(`<span class="good">You channel the XP Lamp into ${skillName}. (+${XP_LAMP_GAIN} XP)</span>`);

    if (countInvQtyById("xp_lamp") <= 0){
      closeWindow("xpLamp");
      return;
    }
    renderXpLampUI();
  }

  function renderXpLampUI(){
    if (!xpLampSkillListEl) return;

    const lampCount = countInvQtyById("xp_lamp");
    if (xpLampCountPillEl) xpLampCountPillEl.textContent = `Lamps: ${lampCount}`;

    if (lampCount <= 0){
      xpLampSkillListEl.innerHTML = `<div class="hint">You do not have any XP Lamps.</div>`;
      return;
    }

    xpLampSkillListEl.innerHTML = "";
    const order = ["health","accuracy","power","defense","ranged","sorcery","fletching","woodcutting","mining","smithing","fishing","firemaking","cooking"];
    for (const k of order){
      const skill = Skills[k];
      if (!skill) continue;

      const level = levelFromXP(skill.xp | 0);
      const name = getSkillName(k);
      const row = document.createElement("div");
      row.className = "shopRow";
      row.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${SKILL_ICONS[k] ?? SKILL_FALLBACK_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">${name}</div>
            <div class="shopSub">Current: Lv ${level} · Redeem: +${XP_LAMP_GAIN} XP</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;

      const actions = row.querySelector(".shopActions");
      const btn = document.createElement("button");
      btn.className = "shopBtn";
      btn.textContent = "Redeem";
      btn.onclick = () => redeemXpLampToSkill(k);
      actions.appendChild(btn);
      xpLampSkillListEl.appendChild(row);
    }
  }

  function openXpLampWindow(){
    if (countInvQtyById("xp_lamp") <= 0){
      chatLine(`<span class="warn">You need an ${Items.xp_lamp?.name ?? "XP Lamp"}.</span>`);
      return;
    }
    openWindow("xpLamp");
    chatLine(`<span class="muted">You rub the XP Lamp. Choose a skill to empower.</span>`);
  }

  function applyProjectBenefit(projectId) {
    const projectNames = {
      dock: "Dock",
      storage: "Blacksmith Storage",
      hearth: "Riverside Cauldron",
      flourishing: "Flourishing Town"
    };
    const name = projectNames[projectId] || projectId;
    chatLine(`<span class="good">[PROJECT] ${name} complete!</span>`);
    
    // Grant renown for completing the project (donation-based completion)
    // Flourishing auto-completes at 70 renown, so don't grant additional renown there
    if (projectId !== "flourishing") {
      grantTownRenown("rivermoor", 10);
      chatLine(`<span class="good">+10 Renown for project completion!</span>`);
    }
    
    if (projectId === "dock" || projectId === "hearth") {
      getDecorAt = reinitializeDecorLookup();
    }
  }

  // ========== DONATION HELPERS ==========
  function pluralizeItemName(itemName, quantity) {
    // If quantity is 1, return singular form
    if (quantity === 1) return itemName;
    
    // Mass nouns and collective items that don't need pluralization
    if (itemName.endsWith("Food")) return itemName;
    
    // Add 's' to most nouns for plural
    // Special cases: items ending in 'y' typically become 'ies'
    if (itemName.endsWith("y")) {
      return itemName.slice(0, -1) + "ies";
    }
    return itemName + "s";
  }

  // State for town projects UI rendering
  let currentTownProjectsUIState = { viewMode: "all", focusProjectId: null, openedByNpcId: null };
  let lastTownProjectsRenderHash = null;

  function renderTownProjectsUI(opts) {
    if (!projectsGridEl) return;

    // Default options - use stored state if not provided
    opts = opts || currentTownProjectsUIState;
    const viewMode = opts.viewMode || "all";
    const focusProjectId = opts.focusProjectId || null;
    const openedByNpcId = opts.openedByNpcId || null;

    // Store the current state for game loop re-renders
    currentTownProjectsUIState = { viewMode, focusProjectId, openedByNpcId };

    const renown = getTownRenown("rivermoor");
    const projectsRef = getProjectsRef();
    const townProjects = projectsRef.rivermoor;
    
    // Create a hash of the current state to avoid unnecessary re-renders
    // Include project states and fundedAt to ensure progress bar updates every frame during countdown
    const currentHash = JSON.stringify({
      viewMode,
      focusProjectId,
      openedByNpcId,
      renown,
      dockItems: townProjects.dock?.itemsDonated,
      dockGold: townProjects.dock?.goldDonated,
      dockState: townProjects.dock?.state,
      dockFundedAt: townProjects.dock?.fundedAt,
      storageItems: townProjects.storage?.itemsDonated,
      storageGold: townProjects.storage?.goldDonated,
      storageState: townProjects.storage?.state,
      storageFundedAt: townProjects.storage?.fundedAt,
      hearthItems: townProjects.hearth?.itemsDonated,
      hearthGold: townProjects.hearth?.goldDonated,
      hearthState: townProjects.hearth?.state,
      hearthFundedAt: townProjects.hearth?.fundedAt,
      flourishingItems: townProjects.flourishing?.itemsDonated,
      flourishingGold: townProjects.flourishing?.goldDonated,
      flourishingState: townProjects.flourishing?.state,
      flourishingFundedAt: townProjects.flourishing?.fundedAt,
      invLog: getInventoryCount('log'),
      invIronBar: getInventoryCount('iron_bar'),
      invCookedFood: getInventoryCount('cooked_food'),
      invCrudeBar: getInventoryCount('crude_bar'),
      playerGold: wallet.gold
    });
    
    // Check if any project is funding (building) - if so, always re-render for smooth progress bar
    const anyBuilding = Object.values(townProjects).some(p => p?.state === "funded");
    
    // If nothing changed and nothing is building, skip re-render
    if (lastTownProjectsRenderHash === currentHash && !anyBuilding) {
      return;
    }
    lastTownProjectsRenderHash = currentHash;

    if (projectsRenownPillEl) {
      projectsRenownPillEl.textContent = `Renown: ${renown}/70`;
    }

    projectsGridEl.innerHTML = "";

    // Order: dock -> storage -> hearth -> flourishing
    const projectOrder = ["dock", "storage", "hearth", "flourishing"];

    // Filter projects based on view mode
    let projectsToRender = projectOrder;
    if (viewMode === "single" && focusProjectId) {
      projectsToRender = projectOrder.filter(id => id === focusProjectId);
    }

    // If single view, also add a "View all projects" button at the top
    if (viewMode === "single" && focusProjectId) {
      const viewAllBtn = document.createElement("button");
      viewAllBtn.textContent = "← View all projects";
      viewAllBtn.style.marginBottom = "12px";
      viewAllBtn.style.padding = "6px 12px";
      viewAllBtn.style.backgroundColor = "#333";
      viewAllBtn.style.color = "#aaa";
      viewAllBtn.style.border = "1px solid #555";
      viewAllBtn.style.borderRadius = "3px";
      viewAllBtn.style.cursor = "pointer";
      viewAllBtn.style.fontSize = "0.9em";

      viewAllBtn.onclick = () => {
        renderTownProjectsUI({ viewMode: "all" });
      };

      projectsGridEl.appendChild(viewAllBtn);
    }

    for (const projectId of projectsToRender) {
      const def = PROJECT_DEFS[projectId];
      const proj = townProjects[projectId];
      if (!def || !proj) continue;

      const row = document.createElement("div");
      row.className = "projectRow";
      row.style.marginBottom = "12px";
      row.style.padding = "8px 12px";
      row.style.border = "1px solid #555";
      row.style.borderRadius = "4px";
      row.style.backgroundColor = "#222";

      // If this is the focused project in single view, add a highlight style
      if (viewMode === "single" && focusProjectId === projectId) {
        row.style.borderColor = "#4a9eff";
        row.style.boxShadow = "0 0 8px rgba(74, 158, 255, 0.4)";
      }

      // Determine state display
      let stateDisplay = proj.state.charAt(0).toUpperCase() + proj.state.slice(1);
      let stateColor = "#999";
      if (proj.state === "locked") {
        stateColor = "#666";
      } else if (proj.state === "unlocked" || proj.state === "available") {
        stateColor = "#4a9eff";
      } else if (proj.state === "funded" || proj.state === "constructing") {
        stateColor = "#ffaa33";
      } else if (proj.state === "complete") {
        stateColor = "#4eff4a";
      }

      // Header: name + state
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.marginBottom = "6px";

      const nameEl = document.createElement("div");
      nameEl.style.fontWeight = "bold";
      nameEl.style.color = "#ddd";
      nameEl.textContent = def.name;

      const stateEl = document.createElement("span");
      stateEl.style.color = stateColor;
      stateEl.style.fontSize = "0.85em";
      stateEl.style.fontWeight = "bold";
      stateEl.textContent = stateDisplay;

      header.appendChild(nameEl);
      header.appendChild(stateEl);
      row.appendChild(header);

      // Requirements: renown + gold
      const reqLine = document.createElement("div");
      reqLine.style.fontSize = "0.8em";
      reqLine.style.color = "#999";
      reqLine.style.marginBottom = "6px";

      const canUnlock = renown >= def.renownRequired;
      const renownStr = `Renown: ${renown}/${def.renownRequired}`;
      const goldStr = def.goldCost > 0 ? ` · Gold: ${def.goldCost}` : "";

      reqLine.innerHTML = `<span style="color: ${canUnlock ? "#4eff4a" : "#ff6666"}">${renownStr}</span>${goldStr}`;
      row.appendChild(reqLine);

      // Special text for flourishing milestone
      if (projectId === "flourishing") {
        const helperMsg = document.createElement("div");
        helperMsg.style.fontSize = "0.75em";
        helperMsg.style.color = "#aaa";
        helperMsg.style.marginTop = "4px";
        helperMsg.style.fontStyle = "italic";

        if (proj.state === "locked") {
          helperMsg.textContent = `Unlocks at ${def.renownRequired} renown.`;
        } else if (proj.state === "complete") {
          helperMsg.textContent = "Rivermoor is flourishing.";
        }

        if (helperMsg.textContent) {
          row.appendChild(helperMsg);
        }
      }

      // If constructing, show countdown
      if (proj.state === "funded") {
        const elapsed = now() - proj.fundedAt;
        const remaining = Math.max(0, proj.buildTimeMs - elapsed);
        const remainingSec = (remaining / 1000).toFixed(1);
        const progressPct = Math.min(100, (elapsed / proj.buildTimeMs) * 100);

        const progressBar = document.createElement("div");
        progressBar.style.width = "100%";
        progressBar.style.height = "8px";
        progressBar.style.backgroundColor = "#333";
        progressBar.style.borderRadius = "2px";
        progressBar.style.overflow = "hidden";
        progressBar.style.marginBottom = "6px";

        const fill = document.createElement("div");
        fill.style.width = progressPct + "%";
        fill.style.height = "100%";
        fill.style.backgroundColor = "#ffaa33";
        fill.style.transition = "width 0.1s linear";
        progressBar.appendChild(fill);
        row.appendChild(progressBar);

        const countdownEl = document.createElement("div");
        countdownEl.style.fontSize = "0.8em";
        countdownEl.style.color = "#ffaa33";
        countdownEl.textContent = `Building: ${remainingSec}s remaining`;
        row.appendChild(countdownEl);
      }

      // DONATION FLOW: Show when project is unlocked (not yet built or completed)
      if (proj.state === "unlocked" || proj.state === "available") {
        const req = PROJECT_REQUIREMENTS[projectId] || {};
        
        // Show item requirements
        if (req.items && Object.keys(req.items).length > 0) {
          const itemsHeader = document.createElement("div");
          itemsHeader.style.fontSize = "0.85em";
          itemsHeader.style.fontWeight = "bold";
          itemsHeader.style.color = "#aaa";
          itemsHeader.style.marginTop = "8px";
          itemsHeader.style.marginBottom = "4px";
          itemsHeader.textContent = "Items:";
          row.appendChild(itemsHeader);

          for (const [itemId, required] of Object.entries(req.items)) {
            const donated = proj.itemsDonated[itemId] | 0;
            const remaining = Math.max(0, required - donated);
            const invCount = getInventoryCount(itemId);
            const item = Items[itemId];
            const itemName = item?.name ?? itemId;
            const completed = remaining === 0;

            // Item progress line
            const itemProgressDiv = document.createElement("div");
            itemProgressDiv.style.fontSize = "0.75em";
            itemProgressDiv.style.color = completed ? "#4eff4a" : "#ccc";
            itemProgressDiv.style.marginBottom = "4px";
            itemProgressDiv.style.display = "flex";
            itemProgressDiv.style.justifyContent = "space-between";
            itemProgressDiv.style.alignItems = "center";

            const itemTextSpan = document.createElement("span");
            const displayName = pluralizeItemName(itemName, required);
            itemTextSpan.textContent = `${displayName}: ${donated}/${required}`;

            const itemButtonsDiv = document.createElement("div");
            itemButtonsDiv.style.display = "flex";
            itemButtonsDiv.style.gap = "4px";

            // Quick-donate buttons: 1, 5, Max
            const buttonOptions = [
              { label: "1", qty: 1 },
              { label: "5", qty: 5 },
              { label: "Max", qty: () => Math.min(invCount, remaining) }
            ];

            for (const opt of buttonOptions) {
              const btn = document.createElement("button");
              btn.style.padding = "2px 4px";
              btn.style.fontSize = "0.7em";
              btn.style.backgroundColor = "#333";
              btn.style.color = "#aaa";
              btn.style.border = "1px solid #555";
              btn.style.borderRadius = "2px";
              btn.style.cursor = "pointer";

              const qtyValue = typeof opt.qty === "function" ? opt.qty() : opt.qty;
              const canDonate = remaining > 0 && invCount > 0;

              if (canDonate) {
                btn.style.backgroundColor = "#2a4a2a";
                btn.style.color = "#6aff6a";
                btn.style.cursor = "pointer";
              } else {
                btn.style.opacity = "0.5";
                btn.style.cursor = "not-allowed";
              }

              btn.textContent = opt.label;

              if (canDonate) {
                btn.onclick = () => {
                  try {
                    const qtyToDonate = typeof opt.qty === "function" ? opt.qty() : opt.qty;
                    const result = handleProjectItemDonation(projectId, itemId, qtyToDonate);
                    
                    if (result.success) {
                      renderTownProjectsUI();
                      chatLine(`<span class="good">Donated ${result.donated}x ${itemName}.</span>`);
                    } else {
                      chatLine(`<span class="warn">${result.reason}</span>`);
                    }
                  } catch (err) {
                    console.error(`[ERROR] Donation failed:`, err);
                    chatLine(`<span class="error">Error during donation: ${err.message}</span>`);
                  }
                };
              }

              itemButtonsDiv.appendChild(btn);
            }

            itemProgressDiv.appendChild(itemTextSpan);
            itemProgressDiv.appendChild(itemButtonsDiv);
            row.appendChild(itemProgressDiv);
          }
        }

        // Show gold requirement
        if (req.gold && req.gold > 0) {
          const goldHeader = document.createElement("div");
          goldHeader.style.fontSize = "0.85em";
          goldHeader.style.fontWeight = "bold";
          goldHeader.style.color = "#aaa";
          goldHeader.style.marginTop = "8px";
          goldHeader.style.marginBottom = "4px";
          goldHeader.textContent = "Gold:";
          row.appendChild(goldHeader);

          const goldDonated = proj.goldDonated | 0;
          const goldRemaining = Math.max(0, (req.gold | 0) - goldDonated);
          const completed = goldRemaining === 0;

          const goldProgressDiv = document.createElement("div");
          goldProgressDiv.style.fontSize = "0.75em";
          goldProgressDiv.style.color = completed ? "#4eff4a" : "#ccc";
          goldProgressDiv.style.marginBottom = "4px";
          goldProgressDiv.style.display = "flex";
          goldProgressDiv.style.justifyContent = "space-between";
          goldProgressDiv.style.alignItems = "center";

          const goldTextSpan = document.createElement("span");
          goldTextSpan.textContent = `Gold: ${goldDonated}/${req.gold}`;

          const goldButtonsDiv = document.createElement("div");
          goldButtonsDiv.style.display = "flex";
          goldButtonsDiv.style.gap = "4px";

          const goldOptions = [
            { label: "100", qty: 100 },
            { label: "500", qty: 500 },
            { label: "Max", qty: () => Math.min(wallet.gold, goldRemaining) }
          ];

          for (const opt of goldOptions) {
            const btn = document.createElement("button");
            btn.style.padding = "2px 4px";
            btn.style.fontSize = "0.7em";
            btn.style.backgroundColor = "#333";
            btn.style.color = "#aaa";
            btn.style.border = "1px solid #555";
            btn.style.borderRadius = "2px";
            btn.style.cursor = "pointer";

            const qtyValue = typeof opt.qty === "function" ? opt.qty() : opt.qty;
            const canDonate = goldRemaining > 0 && wallet.gold > 0;

            if (canDonate) {
              btn.style.backgroundColor = "#2a4a2a";
              btn.style.color = "#6aff6a";
              btn.style.cursor = "pointer";
            } else {
              btn.style.opacity = "0.5";
              btn.style.cursor = "not-allowed";
            }

            btn.textContent = opt.label;

            if (canDonate) {
              btn.onclick = () => {
                const qty = typeof opt.qty === "function" ? opt.qty() : opt.qty;
                const result = handleProjectGoldDonation(projectId, qty);
                if (result.success) {
                  renderTownProjectsUI();
                  chatLine(`<span class="good">Donated ${result.donated} gold.</span>`);
                } else {
                  chatLine(`<span class="warn">${result.reason}</span>`);
                }
              };
            }

            goldButtonsDiv.appendChild(btn);
          }

          goldProgressDiv.appendChild(goldTextSpan);
          goldProgressDiv.appendChild(goldButtonsDiv);
          row.appendChild(goldProgressDiv);
        }
      }

      // Fund button (OLD SYSTEM - for backwards compatibility, only show for projects without donations)
      if (proj.state === "unlocked" && !PROJECT_REQUIREMENTS[projectId]) {
        if (def.autoComplete) {
          const achieveMsg = document.createElement("div");
          achieveMsg.style.marginTop = "8px";
          achieveMsg.style.fontSize = "0.8em";
          achieveMsg.style.color = "#4eff4a";
          achieveMsg.style.fontStyle = "italic";
          achieveMsg.textContent = `Achieved at ${def.renownRequired} renown`;
          row.appendChild(achieveMsg);
        } else {
          const needsGold = def.goldCost > 0 ? wallet.gold < def.goldCost : false;
          const btn = document.createElement("button");
          btn.textContent = `Fund (${def.goldCost} gold)`;
          btn.style.marginTop = "8px";
          btn.style.width = "100%";
          btn.style.padding = "6px";
          btn.style.backgroundColor = needsGold ? "#444" : "#2a6a2a";
          btn.style.color = needsGold ? "#999" : "#6aff6a";
          btn.style.border = "1px solid " + (needsGold ? "#555" : "#4a9a4a");
          btn.style.borderRadius = "3px";
          btn.style.cursor = needsGold ? "not-allowed" : "pointer";

          if (!needsGold) {
            btn.onmousedown = (event) => {
              if (event.button !== 0) return;
              const result = fundTownProject("rivermoor", projectId);
              if (result.success) {
                renderTownProjectsUI();
              } else {
                chatLine(`<span class="warn">[Fund failed] ${result.reason}</span>`);
              }
            };
          }

          row.appendChild(btn);
        }
      }

      projectsGridEl.appendChild(row);
    }
  }

  function renderQuiverSlot(){
    if (!eqQuiverIcon || !eqQuiverName || !eqQuiverQty) return;

    const arrows = getQuiverCount();
    if (arrows > 0){
      eqQuiverIcon.innerHTML = Items.wooden_arrow?.flatIcon ?? Items.wooden_arrow?.icon ?? UNKNOWN_ICON;
      eqQuiverName.textContent = `${Items.wooden_arrow?.name ?? "Wooden Arrow"} x${arrows}`;
      eqQuiverQty.textContent = String(arrows);
      eqQuiverQty.classList.remove("isHidden");
      if (eqQuiverSlot){
        const tip = `${Items.wooden_arrow?.name ?? "Wooden Arrow"} x${arrows}`;
        eqQuiverSlot.removeAttribute("title");
        eqQuiverSlot.dataset.tooltip = tip;
      }
    } else {
      eqQuiverIcon.textContent = "-";
      eqQuiverName.textContent = "Empty";
      eqQuiverQty.textContent = "0";
      eqQuiverQty.classList.add("isHidden");
      if (eqQuiverSlot){
        eqQuiverSlot.removeAttribute("title");
        delete eqQuiverSlot.dataset.tooltip;
      }
    }
  }

  function renderEquipment(){
    const slots = [
      { key: "weapon", slotEl: eqWeaponSlot, iconEl: eqWeaponIcon, nameEl: eqWeaponName },
      { key: "offhand", slotEl: eqOffhandSlot, iconEl: eqOffhandIcon, nameEl: eqOffhandName },
      { key: "head", slotEl: eqHeadSlot, iconEl: eqHeadIcon, nameEl: eqHeadName },
      { key: "body", slotEl: eqBodySlot, iconEl: eqBodyIcon, nameEl: eqBodyName },
      { key: "legs", slotEl: eqLegsSlot, iconEl: eqLegsIcon, nameEl: eqLegsName },
      { key: "hands", slotEl: eqHandsSlot, iconEl: eqHandsIcon, nameEl: eqHandsName },
      { key: "feet", slotEl: eqFeetSlot, iconEl: eqFeetIcon, nameEl: eqFeetName }
    ];

    for (const row of slots){
      if (!row.iconEl || !row.nameEl) continue;
      const id = equipment[row.key];
      if (id){
        const name = Items[id]?.name ?? id;
        row.iconEl.innerHTML = Items[id]?.flatIcon ?? Items[id]?.icon ?? UNKNOWN_ICON;
        row.nameEl.textContent = name;
        if (row.slotEl){
          const stats = getItemCombatStatText(id);
          const tip = `${name}${stats ? `\n${stats}` : ""}\nClick to unequip`;
          row.slotEl.removeAttribute("title");
          row.slotEl.dataset.tooltip = tip;
        }
      } else {
        row.iconEl.textContent = "-";
        row.nameEl.textContent = "Empty";
        if (row.slotEl){
          row.slotEl.removeAttribute("title");
          delete row.slotEl.dataset.tooltip;
        }
      }
    }

    renderQuiverSlot();
    renderQuiver();
  }

  function normalizeBankStacks(){
    const totals = new Map();
    const order = [];

    for (const s of bank){
      if (!s) continue;
      let id = s.id;
      if (id === "bronze_arrow") id = "wooden_arrow";
      if (!Items[id]) continue;

      const qty = Math.max(1, s.qty|0);
      if (!totals.has(id)){
        totals.set(id, 0);
        order.push(id);
      }
      totals.set(id, (totals.get(id)|0) + qty);
    }

    clearSlots(bank);
    for (let i=0; i<order.length && i<MAX_BANK; i++){
      const id = order[i];
      bank[i] = { id, qty: totals.get(id)|0 };
    }
  }

  function renderBank(){
    normalizeBankStacks();
    ensureBankCapacityFitsContents();
    bankGrid.innerHTML = "";
    const capacity = getBankCapacity();
    bankCountEl.textContent = `${countSlots(bank)}/${capacity}`;
    for (let i=0; i<capacity; i++){
      const s = bank[i];
      const slot = document.createElement("div");
      slot.className = "slot" + (s ? "" : " empty");
      slot.dataset.index = String(i);
      if (!s){
        slot.innerHTML = `<div class="icon">.</div><div class="name">Empty</div>`;
        slot.removeAttribute("title");
        delete slot.dataset.tooltip;
      } else {
        const item = Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.flatIcon ?? item?.icon ?? UNKNOWN_ICON}</div>
          <div class="name">${item?.name ?? s.id}</div>
          ${qty>1 ? `<div class="qty">${qty}</div>` : ``}
        `;
        const stats = getItemCombatStatText(s.id);
        const tip = `${item?.name ?? s.id}${qty>1 ? ` x${qty}` : ""}${stats ? `\n${stats}` : ""}`;
        slot.removeAttribute("title");
        slot.dataset.tooltip = tip;
      }
      bankGrid.appendChild(slot);
    }

    if (bankExpandBtn){
      const maxed = capacity >= MAX_BANK;
      const nextCap = getBankNextCapacity(capacity);
      const add = Math.max(0, nextCap - capacity);
      const cost = getBankExpandCost(capacity);
      bankExpandBtn.disabled = maxed;
      bankExpandBtn.textContent = maxed
        ? "Bank Maxed"
        : `Expand +${add} Slots (${cost}g)`;
    }
    if (bankExpandMetaEl){
      const maxed = capacity >= MAX_BANK;
      const cost = getBankExpandCost(capacity);
      bankExpandMetaEl.textContent = maxed
        ? "All bank slots unlocked"
        : `Next expansion: ${cost} gold`;
    }
  }

  function renderInventoryAndEquipment(){
    renderInv();
    renderEquipment();
  }

  function renderInventoryAndQuiver(){
    renderInv();
    renderQuiver();
  }

  function renderInventoryAndBank(){
    renderInv();
    renderBank();
  }

  function renderPanelsAfterLoad(){
    renderSkills();
    renderQuests();
    renderInventoryAndBank();
    renderEquipment();
    renderQuiver();
    renderHPHUD();
  }

  function renderPanelsOnBootstrap(){
    renderEquipment();
    renderInv();
    renderSkills();
    renderQuests();
    renderBank();
    renderQuiver();
    renderHPHUD();
  }

  function forgeSmithingRecipe(barId, rec){
    const barItem = Items[barId];
    const outId = rec?.out;
    const outItem = Items[outId];
    if (!barItem || !outItem) return;

    const needBars = Math.max(1, rec.bars | 0);
    const reqLevel = Math.max(1, rec.level | 0);
    const xp = Math.max(1, rec.xp | 0);
    const smithingLevel = levelFromXP(Skills.smithing?.xp ?? 0);
    const hasHammer = hasItem("hammer");

    if (!availability.smithing){
      chatLine(`<span class="muted">You need to be next to an anvil to smith.</span>`);
      closeWindow("smithing");
      return;
    }
    if (!hasHammer){
      chatLine(`<span class="warn">You need a ${Items.hammer?.name ?? "hammer"} to use the anvil.</span>`);
      return;
    }
    if (player.action.type !== "idle"){
      chatLine(`<span class="muted">You're busy right now.</span>`);
      return;
    }
    if (smithingLevel < reqLevel){
      chatLine(`<span class="warn">You need Smithing level ${reqLevel}.</span>`);
      return;
    }
    if (countInvQtyById(barId) < needBars){
      chatLine(`<span class="warn">You need ${needBars}x ${barItem.name}.</span>`);
      return;
    }

    chatLine(`<span class="muted">You begin forging a ${outItem.name.toLowerCase()}...</span>`);
    startTimedAction("smith", 1500, "Smithing...", () => {
      if (!availability.smithing){
        chatLine(`<span class="warn">You moved away from the anvil.</span>`);
        return;
      }
      if (!removeItemsFromInventory(barId, needBars)){
        chatLine(`<span class="warn">You need ${needBars}x ${barItem.name}.</span>`);
        return;
      }

      const got = addToInventory(outId, 1);
      addXP("smithing", xp);
      if (got === 1){
        chatLine(`<span class="good">You forge a ${outItem.name}.</span> (+${xp} XP)`);
      } else {
        addGroundLoot(player.x, player.y, outId, 1);
        chatLine(`<span class="warn">Inventory full: ${outItem.name}</span> (+${xp} XP)`);
      }
      renderSmithingUI();
    });
  }

  function renderSmithingUI(){
    if (!smithingListEl) return;

    const smithingXp = Skills.smithing?.xp ?? 0;
    const smithingLevel = levelFromXP(smithingXp);
    if (smithingLevelPillEl) smithingLevelPillEl.textContent = `Smithing Lv ${smithingLevel}`;

    smithingListEl.innerHTML = "";
    const hasHammer = hasItem("hammer");

    let shownAny = false;

    for (const [barId, rows] of Object.entries(SMITHING_RECIPES_BY_BAR)){
      const haveBars = countInvQtyById(barId);
      if (haveBars <= 0) continue;

      shownAny = true;
      const barItem = Items[barId];
      const barName = barItem?.name ?? barId;

      const header = document.createElement("div");
      header.className = "shopRow";
      header.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${barItem?.icon ?? UNKNOWN_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">${barName}</div>
            <div class="shopSub">In inventory: ${haveBars}</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;
      smithingListEl.appendChild(header);

      for (const rec of rows){
        const outId = rec?.out;
        const outItem = Items[outId];
        if (!outItem) continue;

        const needBars = Math.max(1, rec.bars | 0);
        const reqLevel = Math.max(1, rec.level | 0);
        const xp = Math.max(1, rec.xp | 0);
        const canAfford = haveBars >= needBars;
        const canLevel = smithingLevel >= reqLevel;
        const canForge = canAfford && canLevel && hasHammer;

        const line = document.createElement("div");
        line.className = "shopRow";
        const lockText = canLevel ? "Recipe ready" : `Locked until Lv ${reqLevel}`;

        line.innerHTML = `
          <div class="shopLeft">
            <div class="shopIcon">${barItem?.icon ?? UNKNOWN_ICON}</div>
            <div class="shopMeta">
              <div class="shopName">${outItem.name}</div>
              <div class="shopSub">Cost: ${needBars}x ${barName} · ${lockText} · +${xp} XP</div>
            </div>
          </div>
          <div class="shopActions"></div>
        `;

        const actions = line.querySelector(".shopActions");
        const btn = document.createElement("button");
        btn.className = "shopBtn";
        btn.textContent = !hasHammer
          ? "Need Hammer"
          : (canLevel ? (canAfford ? "Forge" : "Need Bars") : `Lv ${reqLevel}`);
        btn.disabled = !canForge;
        btn.onclick = () => forgeSmithingRecipe(barId, rec);
        actions.appendChild(btn);

        smithingListEl.appendChild(line);
      }
    }

    if (!shownAny){
      smithingListEl.innerHTML = `<div class="hint">No smithing recipes available yet. Bring bars in your inventory to see matching recipes.</div>`;
    }
  }

  function renderBlacksmithUI(){
    if (!blacksmithListEl) return;

    if (blacksmithGoldPillEl) blacksmithGoldPillEl.textContent = `Gold: ${getGold()}`;
    blacksmithListEl.innerHTML = "";

    // Check if storage project is complete OR legacy upgrade was unlocked (migration)
    const storageState = getProjectState("rivermoor", "storage");
    const isStorageComplete = (storageState === "complete") || isSmithBankUnlocked();

    const line = document.createElement("div");
    line.className = "shopRow";

    if (isStorageComplete) {
      // Chest is installed - show "Installed" status
      line.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${BLACKSMITH_BANK_CHEST_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">Forge Bank Chest</div>
            <div class="shopSub">Installed in the smithing hall.</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;
      const actions = line.querySelector(".shopActions");
      const btn = document.createElement("button");
      btn.className = "shopBtn";
      btn.textContent = "Installed";
      btn.disabled = true;
      actions.appendChild(btn);
    } else {
      // Chest not installed - show town projects info
      const storageProject = PROJECT_DEFS.storage;
      const renownText = storageProject ? `${storageProject.renownRequired} Renown` : "Unknown";
      const goldText = storageProject ? `${storageProject.goldCost}g` : "Unknown";

      line.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${BLACKSMITH_BANK_CHEST_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">Forge Bank Chest</div>
            <div class="shopSub">Unlocked via Town Projects (${renownText}, ${goldText})</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;
      const actions = line.querySelector(".shopActions");
      const btn = document.createElement("button");
      btn.className = "shopBtn";
      btn.textContent = "Open Town Projects";
      btn.onclick = () => {
        if (!availability.blacksmith){
          chatLine(`<span class="muted">You need to be next to Blacksmith Torren.</span>`);
          closeWindow("blacksmith");
          return;
        }
        // Open Town Projects first, then close Blacksmith to ensure it stays visible
        openWindow("townProjects");
        closeWindow("blacksmith");
      };
      actions.appendChild(btn);
    }

    blacksmithListEl.appendChild(line);

    if (!isStorageComplete){
      const note = document.createElement("div");
      note.className = "hint";
      note.textContent = "More upgrades will be added in future patches.";
      blacksmithListEl.appendChild(note);
    }
  }

  // ---------- Vendor UI ----------
  const vendorGoldPill = document.getElementById("vendorGoldPill");
  const vendorListEl = document.getElementById("vendorList");
  const vendorTabBuyBtn = document.getElementById("vendorTabBuyBtn");
  const vendorTabSellBtn = document.getElementById("vendorTabSellBtn");

  function vendorBuyPrice(id){
    const row = DEFAULT_VENDOR_STOCK.find(x => x.id === id);
    return row ? (row.price|0) : null;
  }
  function vendorSellPrice(id){
    const p = vendorBuyPrice(id) ?? (DEFAULT_VENDOR_SELL_ONLY_PRICES[id] ?? null);
    if (p == null) return null;
    return Math.max(1, Math.floor(p * VENDOR_SELL_MULT));
  }

  function renderVendorAndInventoryViews(){
    renderVendorUI();
    renderInventoryAndQuiver();
  }

  function setVendorTab(tab){
    availability.vendorTab = tab;
    renderVendorUI();
  }

  function renderVendorUI(){
    if (!vendorListEl) return;

    if (vendorGoldPill) vendorGoldPill.textContent = `Gold: ${getGold()}`;

    // tab button styles
    if (vendorTabBuyBtn) vendorTabBuyBtn.classList.toggle("active", availability.vendorTab === "buy");
    if (vendorTabSellBtn) vendorTabSellBtn.classList.toggle("active", availability.vendorTab === "sell");

    vendorListEl.innerHTML = "";

    if (availability.vendorTab === "buy"){
      for (const row of DEFAULT_VENDOR_STOCK){
        const it = Items[row.id];
        if (!it) continue;

        const line = document.createElement("div");
        line.className = "shopRow";
        line.innerHTML = `
          <div class="shopLeft">
            <div class="shopIcon">${it.icon ?? UNKNOWN_ICON}</div>
            <div class="shopMeta">
              <div class="shopName">${it.name ?? row.id}</div>
              <div class="shopSub">Price: ${row.price} gold</div>
            </div>
          </div>
          <div class="shopActions"></div>
        `;

        const actions = line.querySelector(".shopActions");
        const bulks = Array.isArray(row.bulk) && row.bulk.length ? row.bulk : [1];

        for (const qty of bulks){
          const btn = document.createElement("button");
          btn.className = "shopBtn";
          btn.textContent = `Buy x${qty}`;
          btn.onclick = () => {
            const cost = (row.price|0) * (qty|0);
            if (!spendGold(cost)){
              chatLine(`<span class="warn">Not enough gold.</span>`);
              return;
            }

            // ammo routes to quiver; others go to inventory
            const added = addToInventory(row.id, qty);
            if (added <= 0){
              // refund if nothing could be added
              addGold(cost);
              chatLine(`<span class="warn">Inventory full.</span>`);
              return;
            }

            chatLine(`<span class="good">Bought ${qty}x ${it.name}.</span>`);
            renderVendorAndInventoryViews();
          };
          actions.appendChild(btn);
        }

        vendorListEl.appendChild(line);
      }
      return;
    }

    // SELL tab: show unique sellable items currently in inventory.
    const seen = new Map(); // id -> count
    for (const s of inv){
      if (!s) continue;
      const id = s.id;
      const item = Items[id];
      if (!item) continue;
      const qty = item.stack ? Math.max(1, s.qty|0) : 1;
      seen.set(id, (seen.get(id)|0) + qty);
    }

    for (const [id, count] of seen.entries()){
      const it = Items[id];
      const price = vendorSellPrice(id);
      if (price == null) continue; // vendor doesn't buy it

      const line = document.createElement("div");
      line.className = "shopRow";
      line.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${it.icon ?? UNKNOWN_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">${it.name ?? id} ${count>1 ? `x${count}` : ""}</div>
            <div class="shopSub">Sell: ${price} gold</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;

      const actions = line.querySelector(".shopActions");

      const btn1 = document.createElement("button");
      btn1.className = "shopBtn";
      btn1.textContent = "Sell x1";
      btn1.onclick = () => {
        if (!removeItemsFromInventory(id, 1)){
          chatLine(`<span class="warn">You don't have that.</span>`);
          return;
        }
        addGold(price);
        chatLine(`<span class="good">Sold 1x ${it.name}.</span>`);
        renderVendorAndInventoryViews();
      };
      actions.appendChild(btn1);

      if (count > 1){
        const btnAll = document.createElement("button");
        btnAll.className = "shopBtn";
        btnAll.textContent = "Sell all";
        btnAll.onclick = () => {
          let sold = 0;
          for (let i=0; i<count; i++){
            if (!removeItemsFromInventory(id, 1)) break;
            sold++;
          }
          if (sold){
            addGold(price * sold);
            chatLine(`<span class="good">Sold ${sold}x ${it.name}.</span>`);
          }
          renderVendorAndInventoryViews();
        };
        actions.appendChild(btnAll);
      }

      vendorListEl.appendChild(line);
    }

    if (!vendorListEl.childElementCount){
      vendorListEl.innerHTML = `<div class="hint">You have nothing the vendor will buy.</div>`;
    }
  }

  if (vendorTabBuyBtn) vendorTabBuyBtn.addEventListener("click", ()=>{ setVendorTab("buy"); });
  if (vendorTabSellBtn) vendorTabSellBtn.addEventListener("click", ()=>{ setVendorTab("sell"); });

  // Open state: inventory + equipment can be open simultaneously.

  function applyWindowVis(){
    winInventory.classList.toggle("hidden", !windowsOpen.inventory);
    winEquipment.classList.toggle("hidden", !windowsOpen.equipment);
    winSkills.classList.toggle("hidden", !windowsOpen.skills);
    if (winQuests) winQuests.classList.toggle("hidden", !windowsOpen.quests);
    if (winXpLamp) winXpLamp.classList.toggle("hidden", !windowsOpen.xpLamp);
    winBank.classList.toggle("hidden", !windowsOpen.bank);
    winVendor.classList.toggle("hidden", !windowsOpen.vendor);
    if (winSmithing) winSmithing.classList.toggle("hidden", !windowsOpen.smithing);
    if (winBlacksmith) winBlacksmith.classList.toggle("hidden", !windowsOpen.blacksmith);
    if (winTownProjects) winTownProjects.classList.toggle("hidden", !windowsOpen.townProjects);

    winSettings.classList.toggle("hidden", !windowsOpen.settings);

    iconInv.classList.toggle("active", windowsOpen.inventory);
    iconEqp.classList.toggle("active", windowsOpen.equipment);
    iconSki.classList.toggle("active", windowsOpen.skills);
    if (iconQst) iconQst.classList.toggle("active", windowsOpen.quests);
    iconSet.classList.toggle("active", windowsOpen.settings);
    iconBank.classList.toggle("active", windowsOpen.bank);
    if (iconVendor) iconVendor.classList.toggle("active", windowsOpen.vendor);
    if (winVendor) winVendor.classList.toggle("hidden", !windowsOpen.vendor);
  }

  function closeExclusive(exceptName){
    // Skills / Quests / XP Lamp / Bank / Vendor / Smithing / Blacksmith / Town Projects / Settings are exclusive between themselves.
    for (const k of ["skills","quests","xpLamp","bank","vendor","smithing","blacksmith","townProjects","settings"]){
      if (k !== exceptName) windowsOpen[k] = false;
    }
  }

  function openWindow(name){
    if (name === "inventory" || name === "equipment"){
      windowsOpen[name] = true;
    } else {
      closeExclusive(name);
      windowsOpen[name] = true;
    }

    // Some windows should auto-open inventory.
    if (name === "bank" || name === "smithing" || name === "xpLamp"){
      windowsOpen.inventory = true;
    }

    applyWindowVis();
    if (name === "quests") renderQuests();
    if (name === "smithing") renderSmithingUI();
    if (name === "blacksmith") renderBlacksmithUI();
    if (name === "xpLamp") renderXpLampUI();
    if (name === "townProjects") renderTownProjectsUI();
    saveWindowsUI();
  }

  function closeWindow(name){
    windowsOpen[name] = false;
    applyWindowVis();
    saveWindowsUI();
  }

  function toggleWindow(name){
    if (name === "bank" && !availability.bank) return;
    if (name === "vendor" && !availability.vendor) {
      chatLine(`<span class="muted">You need to be next to a vendor to trade.</span>`);
      return;
    }
    if (name === "smithing" && !availability.smithing) {
      chatLine(`<span class="muted">You need to be next to an anvil to smith.</span>`);
      return;
    }
    if (name === "blacksmith" && !availability.blacksmith){
      chatLine(`<span class="muted">You need to be next to Blacksmith Torren.</span>`);
      return;
    }
    const isOpen = !!windowsOpen[name];
    if (isOpen){
      closeWindow(name);
      return;
    }
    openWindow(name);
  }

  iconInv.addEventListener("click", () => toggleWindow("inventory"));
  iconEqp.addEventListener("click", () => toggleWindow("equipment"));
  iconSki.addEventListener("click", () => toggleWindow("skills"));
  if (iconQst) iconQst.addEventListener("click", () => toggleWindow("quests"));
  iconSet.addEventListener("click", () => toggleWindow("settings"));
  iconBank.addEventListener("click", () => toggleWindow("bank"));
  iconVendor.addEventListener("click", () => toggleWindow("vendor"));
  function updateBankIcon(){
    if (availability.bank){
      iconBank.classList.remove("disabled");
      iconBank.style.display = "";
    } else {
      iconBank.classList.add("disabled");
      iconBank.style.display = "none";
      windowsOpen.bank = false;
      applyWindowVis();
    }
  }

  function updateVendorIcon(){
    if (!iconVendor) return;
    if (availability.vendor){
      iconVendor.classList.remove("disabled");
      iconVendor.style.display = "";
    } else {
      iconVendor.classList.add("disabled");
      iconVendor.style.display = "none";
      windowsOpen.vendor = false;
      applyWindowVis();
    }
  }

  // ---------- Bank interactions ----------
  function requireBankAccess(message){
    if (availability.bank) return true;
    chatLine(`<span class="warn">${message}</span>`);
    return false;
  }

  function showBankFullWarning(){
    chatLine(`<span class="warn">Bank is full.</span>`);
  }

  function depositFromInv(invIndex, qty=null, exactSlotOnly=false){
    const s=inv[invIndex]; if (!s) return;
    const id = s.id;
    const item = Items[id];
    if (!item) return;

    if (!requireBankAccess("You must be at a bank chest to bank items.")) return;

    if (item.stack){
      const have = Math.max(1, s.qty|0);
      const want = qty==null ? 1 : Math.min(Math.max(1, qty|0), have);
      const ok = addToBank(bank, id, want);
      if (!ok){
        showBankFullWarning();
        return;
      }
      const left = have - want;
      inv[invIndex] = left > 0 ? { id, qty: left } : null;
      renderInventoryAndBank();
      return;
    }

    if (exactSlotOnly){
      const ok = addToBank(bank, id, 1);
      if (!ok){
        showBankFullWarning();
        return;
      }
      inv[invIndex] = null;
      renderInventoryAndBank();
      return;
    }

    const want = qty==null ? 1 : Math.max(1, qty|0);
    let firstIdx = invIndex;
    let moved = 0;
    for (let i=0;i<want;i++){
      let idx = -1;
      if (firstIdx >= 0 && inv[firstIdx] && inv[firstIdx].id === id){
        idx = firstIdx;
        firstIdx = -1;
      } else {
        idx = inv.findIndex(x => x && x.id===id);
      }
      if (idx<0) break;
      const ok = addToBank(bank, id, 1);
      if (!ok){ showBankFullWarning(); break; }
      inv[idx]=null;
      moved++;
    }
    if (moved>0){ renderInventoryAndBank(); }
  }

  function countInvQtyById(id){
    const item = Items[id];
    if (!item) return 0;
    let total = 0;
    for (const s of inv){
      if (!s || s.id !== id) continue;
      total += item.stack ? Math.max(1, s.qty|0) : 1;
    }
    return total;
  }

  function depositByIdFromInv(invIndex, qty=null){
    const src = inv[invIndex];
    if (!src) return;
    const id = src.id;
    const item = Items[id];
    if (!item) return;

    if (!requireBankAccess("You must be at a bank chest to bank items.")) return;

    const have = countInvQtyById(id);
    if (have <= 0) return;
    let remaining = qty==null ? have : Math.min(Math.max(1, qty|0), have);
    let moved = 0;

    if (item.stack){
      for (let i=0; i<inv.length && remaining>0; i++){
        const s = inv[i];
        if (!s || s.id !== id) continue;

        const stackQty = Math.max(1, s.qty|0);
        const take = Math.min(remaining, stackQty);
        const ok = addToBank(bank, id, take);
        if (!ok){
          showBankFullWarning();
          break;
        }

        const left = stackQty - take;
        inv[i] = left > 0 ? { id, qty: left } : null;
        moved += take;
        remaining -= take;
      }
    } else {
      const tryMoveOne = (idx)=>{
        if (remaining <= 0) return;
        const s = inv[idx];
        if (!s || s.id !== id) return;
        const ok = addToBank(bank, id, 1);
        if (!ok){
          remaining = 0;
          showBankFullWarning();
          return;
        }
        inv[idx] = null;
        moved++;
        remaining--;
      };

      // Keep clicked slot behavior intuitive.
      tryMoveOne(invIndex);
      for (let i=0; i<inv.length && remaining>0; i++){
        if (i === invIndex) continue;
        tryMoveOne(i);
      }
    }

    if (moved>0){
      renderInventoryAndBank();
    }
  }

  function withdrawFromBank(bankIndex, qty=null){
    if (!requireBankAccess("You must be at a bank chest to withdraw.")) return;

    const s=bank[bankIndex]; if (!s) return;
    const item=Items[s.id];
    if (!item) return;

    if (item.ammo){
      const have = Math.max(1, s.qty|0);
      const want = qty==null ? have : Math.min(Math.max(1, qty|0), have);
      addToQuiver(s.id, want);
      s.qty -= want;
      if (s.qty<=0) bank[bankIndex]=null;
      renderBank();
      chatLine(`<span class="muted">You add ${want}x ${Items.wooden_arrow.name} to your quiver.</span>`);
      return;
    }

    const have = Math.max(1, s.qty|0);
    const want = qty==null ? have : Math.min(Math.max(1, qty|0), have);
    const added = addToInventory(s.id, want);
    if (added <= 0){ chatLine(`<span class="warn">Inventory full.</span>`); return; }
    s.qty = have - added;
    if (s.qty<=0) bank[bankIndex]=null;
    renderBank();
  }

  function buyBankExpansion(){
    if (!requireBankAccess("You must be at a bank chest.")) return;

    const current = getBankCapacity();
    if (current >= MAX_BANK){
      chatLine(`<span class="muted">Your bank is already at max capacity.</span>`);
      return;
    }

    const cost = getBankExpandCost(current);
    if ((wallet.gold | 0) < cost){
      chatLine(`<span class="warn">You need ${cost} gold to expand your bank.</span>`);
      return;
    }
    if (!spendGold(cost)) return;

    const next = setBankCapacity(getBankNextCapacity(current), { silent: true });
    renderBank();
    chatLine(`<span class="good">Bank expanded to ${next} slots for ${cost} gold.</span>`);
  }

  document.getElementById("bankDepositAll").addEventListener("click", () => {
    if (!requireBankAccess("You must be at a bank chest.")) return;
    for (let i=0;i<MAX_INV;i++){
      const s=inv[i]; if (!s) continue;
      const item = Items[s.id];
      if (!item) continue;
      const qty = Math.max(1, s.qty|0);
      const ok = addToBank(bank, s.id, qty);
      if (!ok) break;
      inv[i]=null;
    }
    renderInventoryAndBank();
  });

  document.getElementById("bankWithdrawAll").addEventListener("click", () => {
    if (!requireBankAccess("You must be at a bank chest.")) return;
    for (let i=0;i<getBankCapacity();i++){
      const s=bank[i]; if (!s) continue;
      const item=Items[s.id];
      if (!item) continue;

      if (item.ammo){
        addToQuiver(s.id, Math.max(1, s.qty|0));
        bank[i]=null;
        continue;
      }

      const have = Math.max(1, s.qty|0);
      const added = addToInventory(s.id, have);
      if (added <= 0) break;
      s.qty = have - added;
      if (s.qty<=0) bank[i]=null;
    }
    renderInventoryAndBank();
  });

  if (bankExpandBtn){
    bankExpandBtn.addEventListener("click", () => {
      buyBankExpansion();
    });
  }

  // ---------- Entity lookup ----------
  const getEntityAt = createEntityLookup({
    interactables,
    getDecorAt,
    mobs,
    resources
  });

  // ---------- Inventory use state + item actions ----------
  const {
    setUseState,
    tryItemOnItem,
    isStickyUseTool,
    handleUseOnSelf
  } = createItemUse({
    useState,
    invUseStateEl,
    Items,
    chatLine,
    levelFromXP,
    Skills,
    inv,
    addToQuiver,
    addXP,
    renderInv,
    removeItemsFromInventory,
    addToInventory,
    addGroundLoot,
    player,
    isIndoors,
    getEntityAt,
    syncPlayerPix,
    startTimedAction,
    now,
    interactables,
    isWalkable: navIsWalkable,
    setPathTo,
    onRubXpLamp: openXpLampWindow
  });

  // ---------- Context menu ----------
  const { openCtxMenu, closeCtxMenu } = createContextMenuUI({
    clamp,
    invGrid,
    bankGrid,
    eqWeaponSlot,
    eqOffhandSlot,
    eqHeadSlot,
    eqBodySlot,
    eqLegsSlot,
    eqHandsSlot,
    eqFeetSlot,
    eqQuiverSlot,
    inv,
    bank
  });

  // ---------- Right-click menus ----------
  attachInventoryContextMenus({
    invGrid,
    bankGrid,
    eqWeaponSlot,
    eqOffhandSlot,
    eqHeadSlot,
    eqBodySlot,
    eqLegsSlot,
    eqHandsSlot,
    eqFeetSlot,
    eqQuiverSlot,
    inv,
    bank,
    equipment,
    Items,
    player,
    windowsOpen,
    openCtxMenu,
    countInvQtyById,
    depositByIdFromInv,
    consumeFoodFromInv,
    canEquip,
    equipAmmoFromInv,
    equipFromInv,
    setUseState,
    chatLine,
    lockManualDropAt,
    addGroundLoot,
    renderInv,
    withdrawFromBank,
    unequipSlot,
    getQuiverCount,
    moveAmmoFromQuiverToInventory,
    onRubXpLamp: openXpLampWindow
  });

  attachInventoryInputHandlers({
    invGrid,
    bankGrid,
    eqWeaponSlot,
    eqOffhandSlot,
    eqHeadSlot,
    eqBodySlot,
    eqLegsSlot,
    eqHandsSlot,
    eqFeetSlot,
    inv,
    bank,
    windowsOpen,
    depositFromInv,
    consumeFoodFromInv,
    useState,
    handleUseOnSelf,
    setUseState,
    tryItemOnItem,
    isStickyUseTool,
    canEquip,
    equipFromInv,
    withdrawFromBank,
    equipment,
    emptyInvSlots,
    chatLine,
    unequipSlot
  });

  // ---------- Character creation ----------
  const charOverlay=document.getElementById("charOverlay");
  const charName=document.getElementById("charName");
  const charColorPill=document.getElementById("charColorPill");
  const charStart=document.getElementById("charStart");
  const classPick=document.getElementById("classPick");
  const startOverlay = document.getElementById("startOverlay");
  const startSaveStatus = document.getElementById("startSaveStatus");
  const startSaveMeta = document.getElementById("startSaveMeta");
  const startCharStatus = document.getElementById("startCharStatus");
  const startCharMeta = document.getElementById("startCharMeta");
  const startContinueBtn = document.getElementById("startContinueBtn");
  const startNewCharacterBtn = document.getElementById("startNewCharacterBtn");
  const loadCharOverlay = document.getElementById("loadCharOverlay");
  const loadCharList = document.getElementById("loadCharList");
  const loadCharEmpty = document.getElementById("loadCharEmpty");
  const loadCharCancel = document.getElementById("loadCharCancel");
  const deleteCharBtn = document.getElementById("deleteCharBtn");
  const newCharBtn = document.getElementById("newCharBtn");
  const deleteCharOverlay = document.getElementById("deleteCharOverlay");
  const deleteCharCancel = document.getElementById("deleteCharCancel");
  const deleteCharConfirm = document.getElementById("deleteCharConfirm");
  const townboardingOverlay = document.getElementById("townboardingOverlay");
  const townboardingBtn = document.getElementById("townboardingBtn");

  const {
    loadCharacterList,
    saveCharacterList,
    getSaveKeyForCharId,
    readSaveDataByCharId,
    getCharacterById,
    getActiveCharacterId,
    setActiveCharacterId,
    ensureCharacterMigration,
    loadCharacterPrefs,
    saveCharacterPrefs,
    getCurrentSaveKey
  } = createCharacterStorage({
    player,
    classDefs: CLASS_DEFS,
    saveKey: SAVE_KEY,
    charKey: CHAR_KEY,
    charListKey: CHAR_LIST_KEY,
    activeCharIdKey: ACTIVE_CHAR_ID_KEY
  });

  const {
    getStoredCharacterProfile,
    getStoredSaveProfile,
    formatSavedAtLabel
  } = createCharacterProfiles({
    getActiveCharacterId,
    getCharacterById,
    readSaveDataByCharId,
    classDefs: CLASS_DEFS,
    calcCombatLevelFromLevels,
    levelFromXP
  });

  const {
    closeStartOverlay,
    refreshStartOverlay,
    openStartOverlay
  } = createStartOverlayUI({
    startOverlay,
    startCharStatus,
    startCharMeta,
    startSaveStatus,
    startSaveMeta,
    startContinueBtn,
    getStoredCharacterProfile,
    getStoredSaveProfile,
    getActiveCharacterId,
    formatSavedAtLabel
  });

  const {
    closeLoadCharOverlay,
    openCharCreate,
    applyCharacterProfileToPlayer,
    deleteCharacterById,
    openLoadCharacterOverlay
  } = createCharacterUI({
    classDefs: CLASS_DEFS,
    characterState,
    player,
    charOverlay,
    charName,
    charColorPill,
    charStart,
    classPick,
    startNewCharacterBtn,
    loadCharOverlay,
    loadCharList,
    loadCharEmpty,
    loadCharCancel,
    deleteCharBtn,
    newCharBtn,
    deleteCharOverlay,
    deleteCharCancel,
    deleteCharConfirm,
    loadCharacterPrefs,
    loadCharacterList,
    saveCharacterList,
    getSaveKeyForCharId,
    getActiveCharacterId,
    setActiveCharacterId,
    getStoredCharacterProfile,
    getStoredSaveProfile,
    formatSavedAtLabel,
    saveCharacterPrefs,
    refreshStartOverlay,
    closeStartOverlay,
    openStartOverlay,
    startNewGame,
    resetCharacter,
    showTownboardingModal: checkAndShowTownboardingModal,
    chatLine
  });

  // ---------- Starting inventory + equipment ----------
  function applyStartingInventory(){
    clearSlots(inv);
    equipment.weapon = null;
    equipment.offhand = null;
    equipment.head = null;
    equipment.body = null;
    equipment.legs = null;
    equipment.hands = null;
    equipment.feet = null;

    // reset quiver
    // keep a dedicated coins stack in inventory
    addToInventory("gold", 0);
    quiver.wooden_arrow = 0;
    wallet.gold = 0;


    addToInventory("axe", 1);
    addToInventory("pick", 1);
    addToInventory("hammer", 1);
    addToInventory("knife", 1);
    addToInventory("flint_steel", 1);


    if (player.class === "Warrior"){
      addToInventory("crude_sword", 1);
      addToInventory("crude_shield", 1);
      const swordIdx = inv.findIndex(s=>s && s.id==="crude_sword");
      const shieldIdx = inv.findIndex(s=>s && s.id==="crude_shield");
      if (swordIdx>=0) equipFromInv(swordIdx);
      if (shieldIdx>=0) equipFromInv(shieldIdx);
    } else if (player.class === "Ranger"){
      addToInventory("bow", 1);
      addToQuiver("wooden_arrow", 50);
      const bowIdx = inv.findIndex(s=>s && s.id==="bow");
      if (bowIdx>=0) equipFromInv(bowIdx);
    } else {
      addToInventory("staff", 1);
      const staffIdx = inv.findIndex(s=>s && s.id==="staff");
      if (staffIdx>=0) equipFromInv(staffIdx);
    }

    renderQuiver();
  }

  zoneFlowApi = createZoneFlow({
    map,
    W,
    H,
    ZONE_KEYS,
    getActiveZone,
    setActiveZone,
    getZoneState,
    rebuildNavigation,
    updateCamera,
    inBounds: navInBounds,
    isWalkable: navIsWalkable,
    now,
    player,
    startCastle,
    syncPlayerPix,
    tileCenter,
    resources,
    mobs,
    interactables,
    inv,
    bank,
    quiver,
    wallet,
    equipment,
    windowsOpen,
    isQuestStarted,
    isQuestCompleted,
    isQuestObjectiveComplete,
    hasQuestObjectiveToken,
    getQuestProgress,
    getQuestDefById,
    getQuestObjectiveTarget,
    isQuestReadyToComplete,
    completeQuest,
    trackQuestEvent,
    hasItem,
    removeItemsFromInventory,
    placeMob,
    placeResource,
    ensureInteractable,
    DUNGEON_LEGACY_MOB_LAYOUTS,
    DUNGEON_DEFAULT_MOB_SPAWNS,
    DUNGEON_SOUTH_SKELETON_SPAWNS,
    DUNGEON_SOUTH_IRON_ROCK_SPAWNS,
    DUNGEON_LADDER_UP,
    DUNGEON_WING_GATE,
    DUNGEON_WING_GATE_BOTTOM,
    DUNGEON_WING_ROOM,
    DUNGEON_WING_BRAZIERS,
    DUNGEON_WARDEN_SPAWN,
    DUNGEON_SPAWN_TILE,
    OVERWORLD_RETURN_TILE,
    MOB_DEFS,
    ZOOM_DEFAULT,
    BASE_HP,
    BANK_START_SLOTS,
    clearSlots,
    setBankCapacity,
    resetWorldUpgrades,
    resetQuestProgress,
    resetRenownGrants,
    closeCtxMenu,
    setUseState,
    applyWindowVis,
    setZoom,
    recalcMaxHPFromHealth,
    applyStartingInventory,
    initWorldSeed,
    seedResources,
    seedMobs,
    seedInteractables,
    getActiveCharacterId,
    deleteCharacterById,
    refreshStartOverlay,
    Skills,
    renderSkills,
    renderQuests,
    renderInv,
    renderBank,
    renderEquipment,
    renderQuiver,
    renderHPHUD,
    chatLine
  });
  const {
    seedDungeonZone,
    handleMobDefeated,
    handleUseSealedGate,
    handleUseDungeonBrazier,
    updateDungeonQuestTriggers,
    useLadder,
    setCurrentZone,
    defaultSpawnForZone,
    teleportPlayerTo,
    resetCharacter: resetCharacterFromZoneFlow,
    startNewGame: startNewGameFromZoneFlow
  } = zoneFlowApi;
  resetCharacterImpl = resetCharacterFromZoneFlow;
  startNewGameImpl = startNewGameFromZoneFlow;


  let ensureWalkIntoRangeAndActImpl = () => {};
  function ensureWalkIntoRangeAndAct(){
    return ensureWalkIntoRangeAndActImpl();
  }

  // ---------- Interaction helpers ----------
  const { examineEntity, beginInteraction, clickToInteract } = createInteractionHelpers({
    chatLine,
    mobs,
    DECOR_EXAMINE_TEXT,
    closeCtxMenu,
    player,
    ensureWalkIntoRangeAndAct,
    setPathTo,
    getEntityAt
  });


  // ---------- Combat + actions ----------
  const { spawnGatherParticles, spawnCombatFX } = createCombatEffects({
    player,
    gatherParticles,
    combatFX,
    tileCenter,
    now
  });

  // ---------- Combat math / rolls ----------
  const { rollPlayerAttack, rollMobAttack } = createCombatRolls({
    levelFromXP,
    Skills,
    clamp,
    MOB_DEFS,
    Items,
    equipment
  });

  const {
    mobTileWalkable,
    mobStepToward,
    findBestMeleeEngagePath,
    pushMobOffPlayerTile,
    resolveMeleeTileOverlap,
    handlePlayerDeath,
    updateMobsAI
  } = createMobAI({
    isWalkable: navIsWalkable,
    resources,
    interactables,
    player,
    mobs,
    tileCenter,
    astar: navAstar,
    stopAction,
    startCastle,
    wallet,
    getGold,
    renderGold,
    addGroundLoot,
    GOLD_ITEM_ID,
    chatLine,
    now,
    syncPlayerPix,
    inRectMargin,
    MOB_DEFS,
    dist,
    tilesBetweenTiles,
    rollMobAttack,
    clamp,
    getActiveZone,
    setOverworldZone: () => setCurrentZone(ZONE_KEYS.OVERWORLD, {
      keepAction: true,
      keepPath: true,
      keepTarget: true,
      syncCamera: false
    })
  });

  const { updateFX, drawFX } = createFXRenderer({
    now,
    gatherParticles,
    combatFX,
    equipment,
    clamp,
    ctx
  });

  ensureWalkIntoRangeAndActImpl = createActionResolver({
    player,
    interactables,
    stopAction,
    inRangeOfTile,
    isWalkable: navIsWalkable,
    setPathTo,
    chatLine,
    availability,
    updateBankIcon,
    openWindow,
    renderVendorUI,
    renderSmithingUI,
    clamp,
    useState,
    COOK_RECIPES,
    SMELTING_TIERS,
    MINING_RESOURCE_RULES,
    hasItem,
    Items,
    startTimedAction,
    removeItemsFromInventory,
    setUseState,
    addToInventory,
    addXP,
    addGroundLoot,
    levelFromXP,
    Skills,
    emptyInvSlots,
    resources,
    now,
    getCombatStyle,
    resolveMeleeTileOverlap,
    tilesFromPlayerToTile,
    hasLineOfSightTiles,
    findBestTileWithinRange,
    findBestMeleeEngagePath,
    mobs,
    consumeFromQuiver,
    rollPlayerAttack,
    spawnCombatFX,
    meleeState,
    equipment,
    addGold,
    onUseLadder: useLadder,
    onQuestEvent: trackQuestEvent,
    onTalkQuestNpc: handleQuestNpcTalk,
    onTalkProjectNpc: handleProjectNpcTalk,
    onUseSealedGate: handleUseSealedGate,
    onUseDungeonBrazier: handleUseDungeonBrazier,
    onMobDefeated: handleMobDefeated
  }).ensureWalkIntoRangeAndAct;


  function inRangeOfCurrentTarget(){
    const t=player.target;
    if (!t) return false;
    if (t.kind==="res"){
      const r=resources[t.index];
      if (!r || !r.alive) return false;
      return inRangeOfTile(r.x,r.y,1.1);
    }
    if (t.kind==="mob"){
      const m=mobs[t.index];
      if (!m || !m.alive) return false;
      const style = getCombatStyle();
      const maxRange = (style === "melee") ? 1.15 : 5.0;
      return tilesFromPlayerToTile(m.x, m.y) <= maxRange;
    }
    if (t.kind==="bank"){
      const b=interactables[t.index];
      if (!b) return false;
      return inRangeOfTile(b.x,b.y,1.1);
    }
    if (t.kind==="quest_npc"){
      const n=interactables[t.index];
      if (!n) return false;
      return inRangeOfTile(n.x,n.y,1.1);
    }
    if (t.kind==="project_npc"){
      const n=interactables[t.index];
      if (!n) return false;
      return inRangeOfTile(n.x,n.y,1.1);
    }
    if (t.kind==="sealed_gate" || t.kind==="brazier"){
      const it=interactables[t.index];
      if (!it) return false;
      return inRangeOfTile(it.x,it.y,1.1);
    }
    if (t.kind==="ladder_down" || t.kind==="ladder_up"){
      const l = interactables[t.index];
      if (!l) return false;
      return inRangeOfTile(l.x, l.y, 1.1);
    }
    return false;
  }

  // ---------- Auto-loot nearby ground piles ----------
  function attemptAutoLoot(){
    // try to loot any pile within 1.25 tiles
    const range = 1.25;
    const px = player.x, py = player.y;

// To avoid iterating entire map, iterate piles and early cull
    for (const [k, pile] of groundLoot.entries()){

// skip/remove expired piles (extra safety)
const tNow = now();
if (Number.isFinite(pile.expiresAt) && tNow >= pile.expiresAt){
  groundLoot.delete(k);
  continue;
}

      if (!pile || pile.size===0) continue;
      const [sx,sy] = k.split(",").map(n=>parseInt(n,10));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      const d = tilesFromPlayerToTile(sx, sy);

// If this tile was created via a manual "Drop" action, don't auto-loot it until
// the player walks out of range (prevents instant re-pickup).
if (manualDropLocks.has(k)){
  if (d > range) manualDropLocks.delete(k);
  else continue;
}


      if (d > range) continue;


      // in range: try to pick up each item
      for (const [id, qty0] of Array.from(pile.entries())){
        let qty = qty0|0;
        if (qty<=0){ pile.delete(id); continue; }

       const item = Items[id];
if (!item){ pile.delete(id); continue; }

// gold goes to wallet (does not take inventory slots)
if (id === GOLD_ITEM_ID){
  addGold(qty);
  pile.delete(id);
  continue;
}

if (item.ammo){
  // quiver always accepts
  addToQuiver(id, qty);
  pile.delete(id);
  continue;
}


        // addToInventory adds one-per-slot for non-ammo; returns how many added
        const added = addToInventory(id, qty);
        if (added > 0){
          qty -= added;
          if (qty <= 0) pile.delete(id);
          else pile.set(id, qty);
        }

        if (qty > 0){
          // still leftover => inventory full
          const tNow = now();
          if ((tNow - lootUi.lastInvFullMsgAt) > 700 || lootUi.lastInvFullMsgItem !== id){
            chatLine(`<span class="warn">Inventory full: ${item.name}</span>`);
            lootUi.lastInvFullMsgAt = tNow;
            lootUi.lastInvFullMsgItem = id;
          }
          // stop trying further items this tick if full
          break;
        }
      }
      cleanupLootPileAt(sx, sy);
    }
  }

  // ---------- Rendering helpers ----------
  function visibleTileBounds(){
    const vw=viewWorldW(), vh=viewWorldH();
    const startX = clamp(Math.floor(camera.x / TILE) - 1, 0, W-1);
    const startY = clamp(Math.floor(camera.y / TILE) - 1, 0, H-1);
    const endX   = clamp(Math.ceil((camera.x + vw) / TILE) + 1, 0, W);
    const endY   = clamp(Math.ceil((camera.y + vh) / TILE) + 1, 0, H);
    return { startX, startY, endX, endY };
  }

  function drawMap(){
    const tAnim = Math.floor(performance.now()/350);
    const {startX,startY,endX,endY}=visibleTileBounds();
    const inDungeonZone = (getActiveZone() === ZONE_KEYS.DUNGEON);

    for (let y=startY; y<endY; y++){
      for (let x=startX; x<endX; x++){
        const t=map[y][x];
        const px=x*TILE, py=y*TILE;
        const n=(x*17+y*31+((x+y)*7))%10;

        if (t===0){
          if (inDungeonZone){
            const base = ((x+y)%2===0) ? "#1a1f24" : "#171b20";
            ctx.fillStyle = base;
            ctx.fillRect(px,py,TILE,TILE);
            if ((n % 3) === 0){
              ctx.fillStyle = "rgba(255,255,255,.03)";
              ctx.fillRect(px+8,py+9,1.5,1.5);
              ctx.fillRect(px+21,py+20,1.5,1.5);
            }
          } else {
            const base=((x+y)%2===0) ? "#12301e" : "#102b1b";
            ctx.fillStyle=base;
            ctx.fillRect(px,py,TILE,TILE);
            if (n===0 || n===7){
              ctx.fillStyle="rgba(255,255,255,.04)";
              ctx.fillRect(px+6,py+10,2,2);
              ctx.fillRect(px+18,py+20,2,2);
            }
          }
        } else if (t===1){
          if (inDungeonZone){
            const pulse = 0.55 + 0.45 * Math.sin((tAnim + x + y) * 0.7);
            ctx.fillStyle="#04070d";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle=`rgba(56,189,248,${0.08 + 0.05 * pulse})`;
            ctx.fillRect(px+2,py+6,TILE-4,2);
            ctx.fillRect(px+4,py+18,TILE-8,2);
          } else {
            ctx.fillStyle="#0d2a3d";
            ctx.fillRect(px,py,TILE,TILE);
            const wave=(x+tAnim+y)%4;
            if (wave===0){
              ctx.fillStyle="rgba(255,255,255,.06)";
              ctx.fillRect(px,py+8,TILE,2);
            } else if (wave===2){
              ctx.fillStyle="rgba(255,255,255,.04)";
              ctx.fillRect(px,py+18,TILE,2);
            }
          }
        } else if (t===6){
          // Lava (dungeon wing hazard moat): dark crust edge + bright molten core.
          const shift = (tAnim + x * 2 + y * 3) % 6;
          const upLava = (y > 0) && ((map[y - 1][x] | 0) === 6);
          const dnLava = (y < H - 1) && ((map[y + 1][x] | 0) === 6);
          const lfLava = (x > 0) && ((map[y][x - 1] | 0) === 6);
          const rtLava = (x < W - 1) && ((map[y][x + 1] | 0) === 6);

          const rim = 3;
          const inL = lfLava ? 0 : rim;
          const inR = rtLava ? 0 : rim;
          const inT = upLava ? 0 : rim;
          const inB = dnLava ? 0 : rim;
          const ix0 = px + inL;
          const iy0 = py + inT;
          const iw = TILE - inL - inR;
          const ih = TILE - inT - inB;

          // Overlap connected lava by 1px to hide transform/subpixel seams between tiles.
          const bleedL = lfLava ? 1 : 0;
          const bleedR = rtLava ? 1 : 0;
          const bleedT = upLava ? 1 : 0;
          const bleedB = dnLava ? 1 : 0;
          const mlx0 = ix0 - bleedL;
          const mly0 = iy0 - bleedT;
          const mlw = iw + bleedL + bleedR;
          const mlh = ih + bleedT + bleedB;

          // Base dark cavity.
          ctx.fillStyle = "#1f140f";
          ctx.fillRect(px, py, TILE, TILE);

          // Draw crust only on exposed outer edges so connected lava reads as one pool.
          ctx.fillStyle = "#2f1c15";
          if (!upLava) ctx.fillRect(px, py, TILE, rim);
          if (!dnLava) ctx.fillRect(px, py + TILE - rim, TILE, rim);
          if (!lfLava) ctx.fillRect(px, py, rim, TILE);
          if (!rtLava) ctx.fillRect(px + TILE - rim, py, rim, TILE);

          // Molten body.
          ctx.fillStyle = "#ff1e00";
          ctx.fillRect(mlx0, mly0, mlw, mlh);

          // Animated lava streaks (diagonal-ish segmented bands).
          for (let row = 0; row < 6; row++){
            const y0 = mly0 + 2 + row * 4 + ((row + shift) % 2);
            const xStart = mlx0 + ((row * 3 + shift * 2) % 8);
            for (let x0 = xStart; x0 < mlx0 + mlw - 4; x0 += 8){
              ctx.fillStyle = (row % 2 === 0) ? "#ff6a00" : "#ff4200";
              ctx.fillRect(x0, y0, 5, 2);
              ctx.fillStyle = "#ffb000";
              ctx.fillRect(x0 + 1, y0, 2, 1);
            }
          }

          // Hot cores.
          ctx.fillStyle = "rgba(255,217,102,.6)";
          if (mlw >= 10 && mlh >= 10) {
            ctx.fillRect(mlx0 + 6 + (shift % 3), mly0 + 6, 3, 2);
            ctx.fillRect(mlx0 + Math.max(8, mlw - 12), mly0 + Math.max(8, mlh - 10) + (shift % 2), 3, 2);
          }
        } else if (t===2){
          if (inDungeonZone){
            ctx.fillStyle="#252b33";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle="rgba(0,0,0,.25)";
            ctx.fillRect(px+5,py+8,9,8);
            ctx.fillRect(px+16,py+14,8,7);
            ctx.fillStyle="rgba(203,213,225,.08)";
            ctx.fillRect(px+7,py+10,3,2);
            ctx.fillRect(px+18,py+15,3,2);
          } else {
            ctx.fillStyle="#2a2f3a";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle="rgba(255,255,255,.06)";
            if (n%3===0) ctx.fillRect(px+6,py+7,3,2);
            if (n%4===0) ctx.fillRect(px+18,py+19,4,2);
          }
        } else if (t===3){
          if (inDungeonZone){
            const base=((x+y)%2===0) ? "#2e353d" : "#2a3138";
            ctx.fillStyle=base;
            ctx.fillRect(px,py,TILE,TILE);
            ctx.strokeStyle="rgba(148,163,184,.14)";
            ctx.beginPath();
            ctx.moveTo(px+1,py+16); ctx.lineTo(px+31,py+16);
            ctx.moveTo(px+16,py+1); ctx.lineTo(px+16,py+31);
            ctx.stroke();
            if (n===2 || n===6){
              ctx.strokeStyle="rgba(0,0,0,.32)";
              ctx.beginPath();
              ctx.moveTo(px+7,py+22);
              ctx.lineTo(px+14,py+13);
              ctx.lineTo(px+22,py+17);
              ctx.stroke();
            }
          } else {
            const base=((x+y)%2===0) ? "#4b5563" : "#46505d";
            ctx.fillStyle=base;
            ctx.fillRect(px,py,TILE,TILE);
            if (n===2){
              ctx.strokeStyle="rgba(0,0,0,.25)";
              ctx.beginPath();
              ctx.moveTo(px+6,py+20);
              ctx.lineTo(px+14,py+12);
              ctx.lineTo(px+22,py+16);
              ctx.stroke();
            }
          }
        } else if (t===4){
          if (inDungeonZone){
            ctx.fillStyle="#1f252d";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.strokeStyle="rgba(0,0,0,.45)";
            ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);
            ctx.fillStyle="rgba(148,163,184,.07)";
            ctx.fillRect(px+2,py+4,TILE-4,3);
            ctx.fillStyle="rgba(0,0,0,.22)";
            ctx.fillRect(px+2,py+24,TILE-4,5);
            ctx.strokeStyle="rgba(148,163,184,.10)";
            ctx.beginPath();
            ctx.moveTo(px+8,py+8); ctx.lineTo(px+8,py+24);
            ctx.moveTo(px+24,py+8); ctx.lineTo(px+24,py+24);
            ctx.stroke();
          } else {
            ctx.fillStyle="#374151";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.strokeStyle="rgba(0,0,0,.30)";
            ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);

            ctx.strokeStyle="rgba(255,255,255,.07)";
            ctx.beginPath();
            ctx.moveTo(px+2,py+10); ctx.lineTo(px+TILE-2,py+10);
            ctx.moveTo(px+2,py+22); ctx.lineTo(px+TILE-2,py+22);
            ctx.stroke();

            if (y%2===0){
              ctx.beginPath();
              ctx.moveTo(px+16,py+2); ctx.lineTo(px+16,py+10);
              ctx.moveTo(px+8,py+10); ctx.lineTo(px+8,py+22);
              ctx.moveTo(px+24,py+10); ctx.lineTo(px+24,py+22);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.moveTo(px+8,py+2); ctx.lineTo(px+8,py+10);
              ctx.moveTo(px+24,py+2); ctx.lineTo(px+24,py+10);
              ctx.moveTo(px+16,py+10); ctx.lineTo(px+16,py+22);
              ctx.stroke();
            }
          }
        } else if (t===5){
          if (inDungeonZone){
            ctx.fillStyle="#4a3624";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle="rgba(240,220,120,.16)";
            for (let i=0;i<4;i++) ctx.fillRect(px+3,py+4+i*7,TILE-6,2);
            ctx.fillStyle="rgba(0,0,0,.28)";
            ctx.fillRect(px+2,py+2,2,TILE-4);
            ctx.fillRect(px+TILE-4,py+2,2,TILE-4);
          } else {
            const isBridge=(y===RIVER_Y || y===RIVER_Y+1);
            if (isBridge){
              ctx.fillStyle="#3b2f22";
              ctx.fillRect(px,py,TILE,TILE);
              ctx.fillStyle="rgba(240,220,120,.18)";
              for (let i=0;i<4;i++) ctx.fillRect(px+2,py+4+i*7,TILE-4,2);
              ctx.fillStyle="rgba(0,0,0,.25)";
              ctx.fillRect(px+2,py+2,2,TILE-4);
              ctx.fillRect(px+TILE-4,py+2,2,TILE-4);
            } else {
              const upT = (y>0) ? map[y-1][x] : -1;
              const dnT = (y<H-1) ? map[y+1][x] : -1;
              const lfT = (x>0) ? map[y][x-1] : -1;
              const rtT = (x<W-1) ? map[y][x+1] : -1;
              const up = upT===5, dn = dnT===5, lf = lfT===5, rt = rtT===5;
              const vertical = up || dn;
              const horizontal = lf || rt;

              const base = ((x+y)%2===0) ? "#4b3928" : "#463523";
              ctx.fillStyle=base;
              ctx.fillRect(px,py,TILE,TILE);

              if ((n%2)===0){
                ctx.fillStyle="rgba(0,0,0,.07)";
                ctx.fillRect(px+6,py+7,2,2);
                ctx.fillRect(px+22,py+18,2,2);
              }
              if ((n%3)===1){
                ctx.fillStyle="rgba(240,216,160,.09)";
                ctx.fillRect(px+13,py+10,2,1);
                ctx.fillRect(px+18,py+22,1,1);
              }

              if (!up){
                ctx.fillStyle = (upT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
                ctx.fillRect(px,py,TILE,2);
              }
              if (!dn){
                ctx.fillStyle = (dnT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
                ctx.fillRect(px,py+TILE-2,TILE,2);
              }
              if (!lf){
                ctx.fillStyle = (lfT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
                ctx.fillRect(px,py,2,TILE);
              }
              if (!rt){
                ctx.fillStyle = (rtT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
                ctx.fillRect(px+TILE-2,py,2,TILE);
              }

              ctx.fillStyle="rgba(23,15,10,.18)";
              if (vertical && !horizontal){
                ctx.fillRect(px+11,py+4,2,TILE-8);
                ctx.fillRect(px+19,py+4,2,TILE-8);
              } else if (horizontal && !vertical){
                ctx.fillRect(px+4,py+11,TILE-8,2);
                ctx.fillRect(px+4,py+19,TILE-8,2);
              } else {
                ctx.fillRect(px+11,py+11,2,2);
                ctx.fillRect(px+19,py+19,2,2);
              }
            }
          }
        }

        if (t !== 6){
          ctx.strokeStyle="rgba(255,255,255,.03)";
          ctx.strokeRect(px,py,TILE,TILE);
        }
      }
    }
  }

  function drawResources(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const r of resources){
      if (!r.alive) continue;
      if (r.x<startX-1 || r.x>endX+1 || r.y<startY-1 || r.y>endY+1) continue;

      if (r.type==="tree"){
        ctx.fillStyle="#1f6f3e";
        ctx.beginPath();
        ctx.arc(r.x*TILE+TILE/2, r.y*TILE+TILE/2, 12, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle="#6b3f2a";
        ctx.fillRect(r.x*TILE+TILE/2-3, r.y*TILE+TILE/2+6, 6, 10);
      } else if (r.type==="iron_rock") {
        ctx.fillStyle="#6d7887";
        ctx.beginPath();
        ctx.moveTo(r.x*TILE+10, r.y*TILE+22);
        ctx.lineTo(r.x*TILE+16, r.y*TILE+10);
        ctx.lineTo(r.x*TILE+24, r.y*TILE+16);
        ctx.lineTo(r.x*TILE+22, r.y*TILE+26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle="rgba(156,163,175,.45)";
        ctx.fillRect(r.x*TILE+12, r.y*TILE+15, 3, 3);
        ctx.fillRect(r.x*TILE+17, r.y*TILE+13, 3, 3);
      } else if (r.type==="rock") {
        ctx.fillStyle="#7a8191";
        ctx.beginPath();
        ctx.moveTo(r.x*TILE+10, r.y*TILE+22);
        ctx.lineTo(r.x*TILE+16, r.y*TILE+10);
        ctx.lineTo(r.x*TILE+24, r.y*TILE+16);
        ctx.lineTo(r.x*TILE+22, r.y*TILE+26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle="rgba(226,232,240,.45)";
        ctx.fillRect(r.x*TILE+15, r.y*TILE+14, 3, 3);
      }
    }
  }

  function drawRat(m){
    const baseCx = (Number.isFinite(m.px) ? m.px : (m.x*TILE+TILE/2));
    const baseCy = (Number.isFinite(m.py) ? m.py : (m.y*TILE+TILE/2));
    const px = baseCx - TILE/2;
    const py = baseCy - TILE/2;

    // Keep a stable left/right facing based on smooth motion.
    const prevCx = Number.isFinite(m._prevDrawCx) ? m._prevDrawCx : baseCx;
    const dx = baseCx - prevCx;
    if (Math.abs(dx) > 0.06) m._faceX = (dx >= 0) ? 1 : -1;
    if (!Number.isFinite(m._faceX)) m._faceX = 1;
    m._prevDrawCx = baseCx;
    const face = m._faceX;

    const t = now();
    const bob = Math.sin(t*0.013 + m.x*0.91 + m.y*0.53) * 0.7;
    const tailWag = Math.sin(t*0.02 + m.x*0.73 + m.y*0.42) * 2.4;
    const cx = baseCx;
    const cy = baseCy + bob;
    const headX = cx + face*9.6;

    ctx.save();

    // Ground shadow
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath();
    ctx.ellipse(cx - face*1.2, cy + 11.5, 11, 4.8, 0, 0, Math.PI*2);
    ctx.fill();

    // Tail (behind body)
    ctx.strokeStyle = "#f7a8b8";
    ctx.lineCap = "round";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(cx - face*9.5, cy + 4.5);
    ctx.quadraticCurveTo(cx - face*(17 + tailWag), cy + 9.5, cx - face*(23 + tailWag*0.45), cy + 15.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - face*10.5, cy + 3.9);
    ctx.quadraticCurveTo(cx - face*(16.2 + tailWag), cy + 8.2, cx - face*(21.4 + tailWag*0.45), cy + 13.8);
    ctx.stroke();

    // Body
    ctx.fillStyle = "#8e97a3";
    ctx.beginPath();
    ctx.ellipse(cx - face*0.9, cy + 3.2, 12.3, 8.1, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.beginPath();
    ctx.ellipse(cx - face*3.4, cy + 0.8, 5.4, 2.5, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx - face*0.9, cy + 3.2, 12.3, 8.1, 0, 0, Math.PI*2);
    ctx.stroke();

    // Legs
    ctx.fillStyle = "#66707d";
    ctx.fillRect(cx - face*6.5, cy + 8.3, 3.2, 2.1);
    ctx.fillRect(cx + face*1.4, cy + 8.4, 3.1, 2.0);

    // Head
    ctx.fillStyle = "#9aa3ae";
    ctx.beginPath();
    ctx.ellipse(headX, cy - 1.3, 6.5, 5.6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(headX, cy - 1.3, 6.5, 5.6, 0, 0, Math.PI*2);
    ctx.stroke();

    // Ears
    ctx.fillStyle = "#8f98a4";
    ctx.beginPath();
    ctx.arc(headX - face*2.1, cy - 6.4, 2.8, 0, Math.PI*2);
    ctx.arc(headX + face*1.8, cy - 6.1, 2.5, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#f2a0b3";
    ctx.beginPath();
    ctx.arc(headX - face*2.1, cy - 6.4, 1.5, 0, Math.PI*2);
    ctx.arc(headX + face*1.8, cy - 6.1, 1.3, 0, Math.PI*2);
    ctx.fill();

    // Snout + nose
    ctx.fillStyle = "#cfd5dc";
    ctx.beginPath();
    ctx.ellipse(headX + face*3.8, cy + 0.2, 2.9, 2.1, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.arc(headX + face*6.1, cy - 0.3, 1.2, 0, Math.PI*2);
    ctx.fill();

    // Eye + whiskers
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.beginPath();
    ctx.arc(headX + face*1.8, cy - 2.1, 1.1, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 231, 235, .75)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(headX + face*4.6, cy + 0.1);
    ctx.lineTo(headX + face*8.3, cy - 1.3);
    ctx.moveTo(headX + face*4.3, cy + 1.0);
    ctx.lineTo(headX + face*8.1, cy + 1.2);
    ctx.moveTo(headX + face*4.1, cy + 1.8);
    ctx.lineTo(headX + face*7.7, cy + 3.0);
    ctx.stroke();

    // HP bar
    ctx.fillStyle = "rgba(0,0,0,.56)";
    ctx.fillRect(px+6, py+3, TILE-12, 5);
    ctx.fillStyle = "#fb7185";
    const w = clamp((m.hp/m.maxHp)*(TILE-12), 0, TILE-12);
    ctx.fillRect(px+6, py+3, w, 5);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(px+6, py+3, w, 1);

    ctx.restore();
  }

  function drawGoblin(m){
    const baseCx = (Number.isFinite(m.px) ? m.px : (m.x*TILE+TILE/2));
    const baseCy = (Number.isFinite(m.py) ? m.py : (m.y*TILE+TILE/2));
    const px = baseCx - TILE/2;
    const py = baseCy - TILE/2;

    const prevCx = Number.isFinite(m._prevDrawCx) ? m._prevDrawCx : baseCx;
    const dx = baseCx - prevCx;
    if (Math.abs(dx) > 0.06) m._faceX = (dx >= 0) ? 1 : -1;
    if (!Number.isFinite(m._faceX)) m._faceX = 1;
    m._prevDrawCx = baseCx;
    const face = m._faceX;

    const t = now();
    const bob = Math.sin(t*0.01 + m.x*0.77 + m.y*0.59) * 0.8;
    const armSwing = Math.sin(t*0.016 + m.x*0.58 + m.y*0.61) * 1.5;
    const cx = baseCx;
    const cy = baseCy + bob;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 11.5, 9.8, 4.6, 0, 0, Math.PI*2);
    ctx.fill();

    // Legs
    ctx.fillStyle = "#2c3f2a";
    ctx.fillRect(cx - 6, cy + 8.5, 4.2, 2.6);
    ctx.fillRect(cx + 1.8, cy + 8.5, 4.2, 2.6);

    // Torso
    ctx.fillStyle = "#4a7f37";
    ctx.beginPath();
    ctx.ellipse(cx - face*0.9, cy + 3.6, 8.8, 7.4, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath();
    ctx.ellipse(cx - face*2.7, cy + 1.4, 3.6, 2.2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx - face*0.9, cy + 3.6, 8.8, 7.4, 0, 0, Math.PI*2);
    ctx.stroke();

    // Head
    const headX = cx + face*4.7;
    ctx.fillStyle = "#6aa84f";
    ctx.beginPath();
    ctx.ellipse(headX, cy - 2.2, 5.8, 5.3, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(headX, cy - 2.2, 5.8, 5.3, 0, 0, Math.PI*2);
    ctx.stroke();

    // Ear
    ctx.fillStyle = "#5f9247";
    ctx.beginPath();
    ctx.moveTo(headX + face*3.8, cy - 3.2);
    ctx.lineTo(headX + face*6.9, cy - 5.0);
    ctx.lineTo(headX + face*4.4, cy - 0.8);
    ctx.closePath();
    ctx.fill();

    // Eye + tooth
    ctx.fillStyle = "rgba(0,0,0,.82)";
    ctx.beginPath();
    ctx.arc(headX + face*1.4, cy - 3.0, 0.95, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(headX + face*3.8, cy + 0.9, 1.1, 1.8);

    // Dagger hand
    ctx.fillStyle = "#4d7f3f";
    ctx.beginPath();
    ctx.ellipse(cx + face*(8.8 + armSwing*0.15), cy + 4.0, 2.0, 1.6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + face*(10.0 + armSwing*0.2), cy + 3.8);
    ctx.lineTo(cx + face*(14.1 + armSwing*0.2), cy + 2.8);
    ctx.stroke();

    // HP bar
    ctx.fillStyle = "rgba(0,0,0,.56)";
    ctx.fillRect(px+6, py+3, TILE-12, 5);
    ctx.fillStyle = "#fb7185";
    const w = clamp((m.hp/m.maxHp)*(TILE-12), 0, TILE-12);
    ctx.fillRect(px+6, py+3, w, 5);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(px+6, py+3, w, 1);

    ctx.restore();
  }

  function drawSkeleton(m){
    const baseCx = (Number.isFinite(m.px) ? m.px : (m.x*TILE+TILE/2));
    const baseCy = (Number.isFinite(m.py) ? m.py : (m.y*TILE+TILE/2));
    const px = baseCx - TILE/2;
    const py = baseCy - TILE/2;

    const prevCx = Number.isFinite(m._prevDrawCx) ? m._prevDrawCx : baseCx;
    const dx = baseCx - prevCx;
    if (Math.abs(dx) > 0.06) m._faceX = (dx >= 0) ? 1 : -1;
    if (!Number.isFinite(m._faceX)) m._faceX = 1;
    m._prevDrawCx = baseCx;
    const face = m._faceX;
    const isWarden = (m.type === "skeleton_warden");

    const t = now();
    const emberPulse = isWarden ? (0.45 + 0.55 * Math.sin(t * 0.018 + m.x * 0.73 + m.y * 0.41)) : 0;
    const bob = Math.sin(t*0.009 + m.x*0.73 + m.y*0.57) * 0.55;
    const armSwing = Math.sin(t*0.013 + m.x*0.62 + m.y*0.49) * 1.5;
    const cx = baseCx;
    const cy = baseCy + bob;

    const boneLeg = isWarden ? "#59626d" : "#d6dde6";
    const boneLegHi = isWarden ? "#717b88" : "#f3f6fa";
    const boneLegLow = isWarden ? "#454f5c" : "#c4ccd7";
    const boneRib = isWarden ? "#64707d" : "#e5ebf3";
    const boneArm = isWarden ? "#5f6976" : "#d8e0ea";
    const boneArmLow = isWarden ? "#4b5562" : "#c6cfda";
    const boneSkull = isWarden ? "#727d8b" : "#ecf1f7";
    const boneJaw = isWarden ? "#606b78" : "#d5dde8";
    const boneTooth = isWarden ? "#a4aebb" : "#f8fafc";
    const hpBar = isWarden ? "#f97316" : "#fb7185";

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12.8, 10.5, 3.8, 0, 0, Math.PI*2);
    ctx.fill();

    // Dark silhouette behind bones to reduce cartoon feel.
    ctx.fillStyle = isWarden ? "rgba(7,8,11,.50)" : "rgba(15,23,42,.30)";
    ctx.beginPath();
    ctx.moveTo(cx - 7.0, cy + 10.8);
    ctx.lineTo(cx - 6.2, cy + 0.2);
    ctx.lineTo(cx - 2.8, cy - 6.6);
    ctx.lineTo(cx + 3.0, cy - 6.1);
    ctx.lineTo(cx + 6.2, cy + 0.1);
    ctx.lineTo(cx + 7.0, cy + 10.8);
    ctx.closePath();
    ctx.fill();

    if (isWarden){
      // Smoky aura to make the warden read as charred/corrupted.
      ctx.fillStyle = `rgba(8,8,10,${0.20 + 0.12 * emberPulse})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1.2, 9.5, 12.2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + face * 1.0, cy - 6.4, 6.1, 7.3, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // Legs (taller stance)
    ctx.fillStyle = boneLeg;
    ctx.fillRect(cx - 5.2, cy + 7.2, 2.5, 5.2);
    ctx.fillRect(cx + 2.7, cy + 7.2, 2.5, 5.2);
    ctx.fillStyle = boneLegHi;
    ctx.fillRect(cx - 5.2, cy + 9.0, 2.5, 1.1);
    ctx.fillRect(cx + 2.7, cy + 9.0, 2.5, 1.1);
    ctx.fillStyle = boneLegLow;
    ctx.fillRect(cx - 5.7, cy + 12.0, 3.5, 1.3);
    ctx.fillRect(cx + 2.2, cy + 12.0, 3.5, 1.3);

    // Spine + ribs
    ctx.fillStyle = boneRib;
    ctx.fillRect(cx - 0.9, cy - 3.1, 1.8, 11.6);
    ctx.fillRect(cx - 5.9, cy - 0.9, 11.8, 1.2);
    ctx.fillRect(cx - 5.1, cy + 1.5, 10.2, 1.1);
    ctx.fillRect(cx - 4.0, cy + 3.8, 8.0, 1.1);
    ctx.fillRect(cx - 2.9, cy + 6.1, 5.8, 1.0);
    ctx.strokeStyle = "rgba(0,0,0,.42)";
    ctx.lineWidth = 1.0;
    ctx.strokeRect(cx - 5.9, cy - 0.9, 11.8, 8.0);

    // Arms (longer forearms to make it lankier)
    const leftFore = armSwing * 0.22;
    const rightFore = armSwing * 0.16;
    ctx.fillStyle = boneArm;
    ctx.fillRect(cx - 8.0, cy + 0.6, 1.9, 4.8);
    ctx.fillRect(cx + 6.1, cy + 0.6, 1.9, 4.8);
    ctx.fillRect(cx - 8.4, cy + 4.7 + leftFore, 2.0, 4.2);
    ctx.fillRect(cx + 6.4, cy + 4.7 - rightFore, 2.0, 4.2);
    ctx.fillStyle = boneArmLow;
    ctx.fillRect(cx - 8.8, cy + 8.4 + leftFore, 2.4, 1.2);
    ctx.fillRect(cx + 6.3, cy + 8.4 - rightFore, 2.4, 1.2);

    // Skull
    const headX = cx + face*2.0;
    ctx.fillStyle = boneSkull;
    ctx.beginPath();
    ctx.ellipse(headX, cy - 5.2, 4.9, 5.8, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.44)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(headX, cy - 5.2, 4.9, 5.8, 0, 0, Math.PI*2);
    ctx.stroke();

    // Eye sockets + nose cavity + jaw (angrier expression)
    ctx.strokeStyle = "rgba(0,0,0,.62)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(headX - face*3.0, cy - 7.2);
    ctx.lineTo(headX - face*0.6, cy - 6.1);
    ctx.moveTo(headX + face*0.3, cy - 6.1);
    ctx.lineTo(headX + face*2.8, cy - 7.3);
    ctx.stroke();

    ctx.fillStyle = "rgba(6,9,14,.92)";
    ctx.beginPath();
    ctx.moveTo(headX - face*2.6, cy - 6.3);
    ctx.lineTo(headX - face*0.8, cy - 5.9);
    ctx.lineTo(headX - face*1.2, cy - 4.8);
    ctx.lineTo(headX - face*2.8, cy - 5.2);
    ctx.closePath();
    ctx.moveTo(headX + face*0.6, cy - 5.9);
    ctx.lineTo(headX + face*2.3, cy - 6.3);
    ctx.lineTo(headX + face*2.7, cy - 5.2);
    ctx.lineTo(headX + face*1.1, cy - 4.8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(headX + face*0.15, cy - 4.3);
    ctx.lineTo(headX - face*1.0, cy - 2.0);
    ctx.lineTo(headX + face*1.1, cy - 2.0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = boneJaw;
    ctx.fillRect(headX - 2.5, cy - 1.9, 5.0, 2.0);
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.beginPath();
    ctx.moveTo(headX - 1.8, cy - 5.7);
    ctx.lineTo(headX - 0.1, cy - 3.9);
    ctx.moveTo(headX - 2.1, cy - 0.7);
    ctx.lineTo(headX + 2.0, cy - 1.1);
    ctx.stroke();
    ctx.fillStyle = boneTooth;
    ctx.fillRect(headX - 2.0, cy - 1.4, 0.65, 0.85);
    ctx.fillRect(headX - 0.75, cy - 1.3, 0.65, 0.85);
    ctx.fillRect(headX + 0.45, cy - 1.4, 0.65, 0.85);

    if (isWarden){
      // Ember eyes + scorched cracks for a unique charred silhouette.
      ctx.fillStyle = `rgba(249,115,22,${0.52 + 0.32 * emberPulse})`;
      ctx.beginPath();
      ctx.ellipse(headX - face*1.9, cy - 5.5, 0.95, 0.75, 0, 0, Math.PI*2);
      ctx.ellipse(headX + face*1.8, cy - 5.5, 0.95, 0.75, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = `rgba(251,146,60,${0.26 + 0.22 * emberPulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headX - 2.8, cy - 6.7);
      ctx.lineTo(headX - 1.2, cy - 5.4);
      ctx.moveTo(headX + 2.6, cy - 6.8);
      ctx.lineTo(headX + 1.1, cy - 5.6);
      ctx.moveTo(cx - 3.8, cy + 1.0);
      ctx.lineTo(cx - 1.2, cy + 2.4);
      ctx.moveTo(cx + 3.8, cy + 1.0);
      ctx.lineTo(cx + 1.2, cy + 2.4);
      ctx.stroke();
    }

    // HP bar
    ctx.fillStyle = "rgba(0,0,0,.56)";
    ctx.fillRect(px+6, py+3, TILE-12, 5);
    ctx.fillStyle = hpBar;
    const w = clamp((m.hp/m.maxHp)*(TILE-12), 0, TILE-12);
    ctx.fillRect(px+6, py+3, w, 5);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(px+6, py+3, w, 1);

    ctx.restore();
  }

  function drawMobs(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const m of mobs){
      if (!m.alive) continue;
      if (m.x<startX-1 || m.x>endX+1 || m.y<startY-1 || m.y>endY+1) continue;
      if (m.type==="rat") drawRat(m);
      else if (m.type==="goblin") drawGoblin(m);
      else if (m.type==="skeleton" || m.type==="skeleton_warden") drawSkeleton(m);
      else drawRat(m);
    }
  }

  function drawBankChest(x,y){
    const px=x*TILE, py=y*TILE;
    ctx.fillStyle="#8b5a2b";
    ctx.fillRect(px+6, py+12, 20, 14);
    ctx.fillStyle="#a16207";
    ctx.fillRect(px+6, py+8, 20, 8);
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.fillRect(px+10, py+8, 3, 18);
    ctx.fillRect(px+19, py+8, 3, 18);
    ctx.fillStyle="#fbbf24";
    ctx.fillRect(px+15, py+16, 2, 6);
  }

  function drawVendorNpc(x, y){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.006 + x * 0.9 + y * 0.7) * 0.35;
    const sway = Math.sin(t * 0.004 + x * 1.1 + y * 0.8) * 0.7;
    ctx.save();

    // Ground shadow so the NPC sits in the world like the player sprite.
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 9.5, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boots and legs.
    ctx.fillStyle = "#111827";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);

    // Torso/robe.
    ctx.fillStyle = "rgba(30,41,59,.9)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.8, 7.4, 8.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.8, 7.4, 8.8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Head.
    const headY = cy - 6;
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Hood/hair tint to match the player's top-half accent treatment.
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(cx, headY - 1, 7.3, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Eyes and a small smile.
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.beginPath();
    ctx.arc(cx - 2.2 + sway * 0.15, headY - 1.1, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2.2 + sway * 0.15, headY - 1.1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, headY + 1.4, 1.6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // Merchant accents: belt and side satchel.
    ctx.strokeStyle = "rgba(251,191,36,.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 7);
    ctx.lineTo(cx + 5, cy + 7);
    ctx.stroke();

    ctx.fillStyle = "#7c2d12";
    ctx.beginPath();
    ctx.ellipse(cx + 7.8, cy + 5.2, 2.7, 3.5, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(cx + 8.4, cy + 5.1, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBlacksmithNpc(x, y){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.005 + x * 0.6 + y * 0.9) * 0.28;
    const sway = Math.sin(t * 0.004 + x * 1.2 + y * 0.5) * 0.65;
    const armLift = Math.sin(t * 0.007 + x * 0.3 + y * 0.4) * 0.35;
    ctx.save();

    // Ground shadow.
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 10.2, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boots and trousers.
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(cx - 7, cy + 4, 5, 6);
    ctx.fillRect(cx + 2, cy + 4, 5, 6);

    // Torso + heavy leather apron.
    ctx.fillStyle = "rgba(39,39,42,.96)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4.8, 7.8, 8.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,53,15,.95)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.9, 5.9, 8.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.9, 5.9, 8.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(251,191,36,.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.5);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    // Raised hammer (original shape), mirrored to left shoulder and placed
    // behind the head layer to avoid face overlap.
    const hammerX = cx - 11.4 + sway * 0.16;
    const hammerY = cy + 7.6 - armLift;
    const hammerRot = (1.02 - armLift * 0.12) - (Math.PI / 2);
    ctx.save();
    ctx.translate(hammerX, hammerY);
    ctx.rotate(hammerRot);
    ctx.fillStyle = "#7c5a34";
    ctx.fillRect(-1.0, -9.5, 2.0, 12.5);
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(-4.2, -12.4, 8.4, 3.7);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-4.2, -12.4, 8.4, 3.7);
    ctx.restore();

    // Head.
    const headY = cy - 6;
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Hair cap + beard.
    ctx.fillStyle = "rgba(148,163,184,.9)";
    ctx.beginPath();
    ctx.arc(cx, headY - 1.2, 7.2, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(100,116,139,.95)";
    ctx.beginPath();
    ctx.ellipse(cx, headY + 4.8, 3.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes.
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.beginPath();
    ctx.arc(cx - 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Left arm + hand holding the hammer so it doesn't read as floating.
    const shoulderLX = cx - 4.1;
    const shoulderLY = cy + 2.5;
    const elbowLX = cx - 7.2 + sway * 0.08;
    const elbowLY = cy + 4.7 - armLift * 0.25;
    const handLX = hammerX - 0.4;
    const handLY = hammerY + 2.6;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handLX, handLY, 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Right arm resting near apron for balance (more defined silhouette).
    const shoulderRX = cx + 3.7;
    const shoulderRY = cy + 2.9;
    const elbowRX = cx + 6.7 + sway * 0.05;
    const elbowRY = cy + 4.9;
    const handRX = cx + 5.7;
    const handRY = cy + 7.2;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handRX, handRY, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Forge ember on apron.
    const emberPulse = 0.55 + 0.45 * Math.sin(t * 0.014 + x * 0.7 + y * 0.2);
    ctx.fillStyle = `rgba(251,146,60,${0.34 + 0.28 * emberPulse})`;
    ctx.beginPath();
    ctx.arc(cx + 1.6, cy + 8.6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMaraHearthkeeper(x, y){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.005 + x * 0.6 + y * 0.9) * 0.28;
    const sway = Math.sin(t * 0.004 + x * 1.2 + y * 0.5) * 0.65;
    ctx.save();

    // Ground shadow.
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 10.2, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boots and trousers (dark).
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(cx - 7, cy + 4, 5, 6);
    ctx.fillRect(cx + 2, cy + 4, 5, 6);

    // Torso (desaturated red dress, narrower waist for feminine silhouette).
    ctx.fillStyle = "rgba(110,25,15,.90)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 5.6, 8.0, 0, 0, Math.PI * 2);
    ctx.fill();
    // Darker side shading on torso for body definition.
    ctx.fillStyle = "rgba(75,15,8,.55)";
    ctx.fillRect(cx - 6.4, cy + 1, 1.8, 6.5);
    ctx.fillRect(cx + 4.6, cy + 1, 1.8, 6.5);
    // Subtle skirt flare at very bottom for hourglass silhouette.
    ctx.fillStyle = "rgba(110,25,15,.90)";
    ctx.fillRect(cx - 6.9, cy + 10.2, 13.8, 1.2);
    // Apron (cream/white cook's apron - tapered, asymmetrical).
    ctx.fillStyle = "rgba(245,235,220,.88)";
    // Narrower at top (waist), wider at bottom (flare)
    ctx.fillRect(cx - 4.2, cy + 1.5, 8.4, 5.0);
    ctx.fillRect(cx - 5.0, cy + 6.5, 10.0, 5.0);
    // Apron outline - trapezoid shape shows flare.
    ctx.strokeStyle = "rgba(180,150,120,.65)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 4.2, cy + 1.5);
    ctx.lineTo(cx + 4.2, cy + 1.5);
    ctx.lineTo(cx + 5.0, cy + 6.5);
    ctx.lineTo(cx + 5.0, cy + 11.5);
    ctx.lineTo(cx - 5.0, cy + 11.5);
    ctx.lineTo(cx - 5.0, cy + 6.5);
    ctx.closePath();
    ctx.stroke();
    // Subtle right-side shadow (asymmetrical, not centered).
    ctx.strokeStyle = "rgba(200,170,140,.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + 4.2, cy + 2.0);
    ctx.lineTo(cx + 4.8, cy + 11);
    ctx.stroke();

    // Head.
    const headY = cy - 6;
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Chef's hat - puffed white top.
    ctx.fillStyle = "rgba(250,248,245,.94)";
    ctx.beginPath();
    ctx.ellipse(cx, headY - 8.5, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hat band/base (dark).
    ctx.fillStyle = "rgba(60,50,40,.80)";
    ctx.fillRect(cx - 5.8, headY - 5.2, 11.6, 1.2);
    // Hat outline for definition.
    ctx.strokeStyle = "rgba(200,190,180,.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx, headY - 8.5, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Eyes.
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.beginPath();
    ctx.arc(cx - 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Left arm (holding ladle) - slope inward from shoulder.
    const shoulderLX = cx - 4.4;
    const shoulderLY = cy + 2.5;
    
    // Left shoulder puff - smaller width for slope effect.
    ctx.fillStyle = "rgba(110,25,15,.90)";
    ctx.beginPath();
    ctx.arc(shoulderLX - 0.8, shoulderLY, 1.0, 0, Math.PI * 2);
    ctx.fill();
    
    const elbowLX = cx - 6.8 + sway * 0.08;
    const elbowLY = cy + 4.2;
    const handLX = cx - 8.2;
    const handLY = cy + 3.5;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    // Hand.
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handLX, handLY, 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Ladle (spoon shape with better silhouette).
    ctx.save();
    ctx.translate(handLX, handLY);
    // Ladle bowl (silver).
    ctx.fillStyle = "#a0a0a0";
    ctx.beginPath();
    ctx.arc(1.5, -1.2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Dark bowl outline for contrast.
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(1.5, -1.2, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    // Ladle handle (golden).
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(-0.5, -0.2, 1.2, 1.6);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-0.5, -0.2, 1.2, 1.6);
    ctx.restore();

    // Right arm (resting) - wider shoulders.
    const shoulderRX = cx + 4.1;
    const shoulderRY = cy + 2.9;
    
    // Right shoulder puff - smaller width for slope effect, arm tilts down 1px.
    ctx.fillStyle = "rgba(110,25,15,.90)";
    ctx.beginPath();
    ctx.arc(shoulderRX + 0.8, shoulderRY, 1.0, 0, Math.PI * 2);
    ctx.fill();
    
    const elbowRX = cx + 6.7 + sway * 0.05;
    const elbowRY = cy + 5.0;
    const handRX = cx + 5.7;
    const handRY = cy + 7.2;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handRX, handRY, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Hearth glow ember.
    const emberPulse = 0.55 + 0.45 * Math.sin(t * 0.014 + x * 0.7 + y * 0.2);
    ctx.fillStyle = `rgba(239,68,68,${0.34 + 0.28 * emberPulse})`;
    ctx.beginPath();
    ctx.arc(cx + 1.6, cy + 8.6, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGarrickForeman(x, y){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.005 + x * 0.6 + y * 0.9) * 0.28;
    const sway = Math.sin(t * 0.004 + x * 1.2 + y * 0.5) * 0.65;
    ctx.save();

    // Ground shadow.
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 10.2, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boots and trousers (weathered).
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);
    ctx.fillStyle = "#164e63";
    ctx.fillRect(cx - 7, cy + 4, 5, 6);
    ctx.fillRect(cx + 2, cy + 4, 5, 6);

    // Torso (blue/teal accent).
    ctx.fillStyle = "rgba(30,58,58,.96)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4.8, 7.8, 8.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tool belt (leather strap with tools).
    ctx.fillStyle = "rgba(70,35,8,.92)";
    ctx.fillRect(cx - 6, cy + 7, 12, 2.2);
    // Darker belt stripe for definition.
    ctx.strokeStyle = "rgba(40,20,5,.85)";
    ctx.lineWidth = 2.0;
    ctx.strokeRect(cx - 6, cy + 7, 12, 2.2);
    // Belt buckle highlight (tan/gold center).
    ctx.fillStyle = "rgba(220,190,150,.75)";
    ctx.fillRect(cx - 1.0, cy + 6.8, 2.0, 2.5);

    // Tool details on belt (small rectangles for tools).
    ctx.fillStyle = "#888888";
    ctx.fillRect(cx - 4, cy + 6.8, 1.5, 2.8);
    ctx.fillRect(cx - 1, cy + 6.8, 1.5, 2.8);
    ctx.fillRect(cx + 2, cy + 6.8, 1.5, 2.8);
    // Tool shadows.
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx - 4, cy + 6.8, 1.5, 2.8);
    ctx.strokeRect(cx - 1, cy + 6.8, 1.5, 2.8);
    ctx.strokeRect(cx + 2, cy + 6.8, 1.5, 2.8);

    // Rope coil at right hip (fisherman detail - asymmetrical).
    ctx.fillStyle = "rgba(210,180,140,.75)";
    // Rope coil - subtle circular cluster (offset for asymmetry).
    ctx.beginPath();
    ctx.arc(cx + 6.2, cy + 7.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + 5.0, cy + 6.8, 2.2, 2.0);
    // Rope outline for definition.
    ctx.strokeStyle = "rgba(100,80,50,.7)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(cx + 6.2, cy + 7.5, 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(cx + 5.0, cy + 6.8, 2.2, 2.0);

    // Head (lighter skin tone for better contrast).
    const headY = cy - 6;
    ctx.fillStyle = "#f5d5b0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Beard (medium-dark brown, narrow shape hanging under chin - breaks mouth illusion).
    ctx.fillStyle = "rgba(76,46,28,.88)";
    ctx.beginPath();
    ctx.ellipse(cx + 0.2, headY + 4.6, 3.6, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Beard outline with darker shade for definition.
    ctx.strokeStyle = "rgba(38,23,14,.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx + 0.2, headY + 4.6, 3.6, 1.9, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Knit cap/hood (desaturated steel blue, weathered look - top only, no band under face).
    ctx.fillStyle = "rgba(70,130,180,.88)";
    ctx.beginPath();
    ctx.arc(cx, headY - 2.5, 5.5, Math.PI, Math.PI * 2);
    ctx.fill();
    // Darker cap outline for better frame.
    ctx.strokeStyle = "rgba(30,60,100,.85)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, headY - 2.5, 5.5, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Cap top highlight for silhouette clarity (subtle).
    ctx.strokeStyle = "rgba(180,200,220,.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, headY - 2.5, 5.5, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    // Eyes (larger, very dark for readability).
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(cx - 2.2 + sway * 0.15, headY - 0.5, 1.3, 0, Math.PI * 2);
    ctx.arc(cx + 2.2 + sway * 0.15, headY - 0.5, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Darker shadow under beard to add depth and weathering.
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(cx, headY + 6.0, 3.6, 1.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left arm (holding hook/pole).
    const shoulderLX = cx - 4.1;
    const shoulderLY = cy + 2.5;
    const elbowLX = cx - 7.2 + sway * 0.08;
    const elbowLY = cy + 4.7;
    const handLX = cx - 8.5;
    const handLY = cy + 2.5;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    // Hand.
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handLX, handLY, 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Hook/pole (curved hook shape with better silhouette).
    ctx.save();
    ctx.translate(handLX, handLY);
    // Hook pole (gray metal).
    ctx.strokeStyle = "#777777";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 2);
    ctx.stroke();
    // Hook curve.
    ctx.strokeStyle = "#777777";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(-1.2, 2, 1.2, 0, Math.PI * 0.5);
    ctx.stroke();
    // Hook shadow/outline.
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 2);
    ctx.arc(-1.2, 2, 1.2, 0, Math.PI * 0.5);
    ctx.stroke();
    ctx.restore();

    // Right arm (resting).
    const shoulderRX = cx + 3.7;
    const shoulderRY = cy + 2.9;
    const elbowRX = cx + 6.7 + sway * 0.05;
    const elbowRY = cy + 4.9;
    const handRX = cx + 5.7;
    const handRY = cy + 7.2;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handRX, handRY, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMayorAlden(x, y){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.005 + x * 0.6 + y * 0.9) * 0.28;
    const sway = Math.sin(t * 0.004 + x * 1.2 + y * 0.5) * 0.65;
    ctx.save();

    // Ground shadow.
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 10.2, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // Boots and trousers (formal).
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(cx - 7, cy + 4, 5, 6);
    ctx.fillRect(cx + 2, cy + 4, 5, 6);

    // Torso (formal coat - purple/gray).
    ctx.fillStyle = "rgba(55,65,81,.96)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4.8, 7.8, 8.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sash/cape (gold trim accent).
    ctx.fillStyle = "rgba(217,119,6,.88)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.9, 6.2, 8.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.9, 6.2, 8.0, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Gold sash diagonal stripe for hierarchy.
    ctx.strokeStyle = "rgba(251,191,36,.75)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 2);
    ctx.lineTo(cx + 5, cy + 10);
    ctx.stroke();

    // Gold trim vertical line.
    ctx.strokeStyle = "rgba(251,191,36,.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.5);
    ctx.lineTo(cx, cy + 12);
    ctx.stroke();

    // Head.
    const headY = cy - 6;
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Hair (gray/white, older appearance).
    ctx.fillStyle = "rgba(209,213,219,.92)";
    ctx.beginPath();
    ctx.arc(cx, headY - 1.2, 7.2, Math.PI, Math.PI * 2);
    ctx.fill();

    // Simple formal hat (top hat silhouette).
    ctx.fillStyle = "rgba(30,30,30,.95)";
    ctx.fillRect(cx - 3.2, headY - 10, 6.4, 4.2);
    ctx.fillRect(cx - 4.8, headY - 6.5, 9.6, 1.2);
    // Brighter hat trim for hierarchy.
    ctx.strokeStyle = "rgba(251,191,36,.85)";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - 3.2, headY - 10, 6.4, 4.2);
    ctx.strokeRect(cx - 4.8, headY - 6.5, 9.6, 1.2);

    // Eyes.
    ctx.fillStyle = "rgba(0,0,0,.62)";
    ctx.beginPath();
    ctx.arc(cx - 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2.0 + sway * 0.15, headY - 1.2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Left arm (resting).
    const shoulderLX = cx - 4.1;
    const shoulderLY = cy + 2.5;
    const elbowLX = cx - 6.8 + sway * 0.08;
    const elbowLY = cy + 4.2;
    const handLX = cx - 7.2;
    const handLY = cy + 7.0;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(shoulderLX, shoulderLY);
    ctx.lineTo(elbowLX, elbowLY);
    ctx.lineTo(handLX, handLY);
    ctx.stroke();

    // Hand.
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handLX, handLY, 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Right arm (resting).
    const shoulderRX = cx + 3.7;
    const shoulderRY = cy + 2.9;
    const elbowRX = cx + 6.7 + sway * 0.05;
    const elbowRY = cy + 4.9;
    const handRX = cx + 5.7;
    const handRY = cy + 7.2;

    ctx.strokeStyle = "#3f2b1f";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.strokeStyle = "#8b5e34";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(shoulderRX, shoulderRY);
    ctx.lineTo(elbowRX, elbowRY);
    ctx.lineTo(handRX, handRY);
    ctx.stroke();

    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(handRX, handRY, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawQuestNpc(x, y, showMarker = true){
    const t = now();
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2 + Math.sin(t * 0.006 + x * 0.8 + y * 0.6) * 0.3;
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 9.5, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.fillRect(cx - 8, cy + 10, 6, 3);
    ctx.fillRect(cx + 2, cy + 10, 6, 3);

    ctx.fillStyle = "rgba(30,58,58,.92)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.8, 7.5, 8.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5.8, 7.5, 8.9, 0, 0, Math.PI * 2);
    ctx.stroke();

    const headY = cy - 6;
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, headY, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.beginPath();
    ctx.arc(cx - 2.1, headY - 1.1, 1, 0, Math.PI * 2);
    ctx.arc(cx + 2.1, headY - 1.1, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(251,191,36,.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 7);
    ctx.lineTo(cx + 5, cy + 7);
    ctx.stroke();

    if (showMarker){
      // Hovering "!" marker to signal quest giver.
      const markY = cy - 18 + Math.sin(t * 0.01 + x + y) * 1.4;
      ctx.fillStyle = "rgba(251,191,36,.95)";
      ctx.fillRect(cx - 1.3, markY - 6, 2.6, 6.5);
      ctx.fillRect(cx - 1.7, markY + 1.5, 3.4, 3.4);
      ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 1.3, markY - 6, 2.6, 6.5);
      ctx.strokeRect(cx - 1.7, markY + 1.5, 3.4, 3.4);
    }

    ctx.restore();
  }

  function drawSealedGate(x, y, open = false, segment = "single"){
    const px = x * TILE;
    const py = y * TILE;
    const part = String(segment || "").toLowerCase();
    const isTop = part === "top";
    const isBottom = part === "bottom";
    const isSingle = !isTop && !isBottom;
    // Keep the gate flush to wall tiles north/south while preserving a small inner bevel.
    const outerTopPad = 0;
    const outerBottomPad = 0;
    const topPad = (isTop || isSingle) ? 1 : 0;
    const bottomPad = (isBottom || isSingle) ? 1 : 0;
    const gateY = py + topPad;
    const gateH = Math.max(8, TILE - topPad - bottomPad);
    const seamX = px + Math.floor(TILE / 2);

    // Width tuning: keep the gate narrower than a full tile so wall is visible left/right.
    const frameW = 18;
    const frameX = px + Math.floor((TILE - frameW) / 2);
    const doorW = 10;
    const doorX = seamX - Math.floor(doorW / 2);
    const leftLeafX = doorX;
    const leftLeafW = Math.max(3, Math.floor((doorW - 1) / 2));
    const rightLeafX = seamX + 1;
    const rightLeafW = Math.max(3, doorW - leftLeafW - 1);
    ctx.save();

    // Paint dungeon floor under the whole gate so it reads as a floor-mounted fixture.
    const floorBase = ((x + y) % 2 === 0) ? "#2e353d" : "#2a3138";
    ctx.fillStyle = floorBase;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = "rgba(148,163,184,.12)";
    ctx.beginPath();
    ctx.moveTo(px + 1, py + 16);
    ctx.lineTo(px + TILE - 1, py + 16);
    ctx.moveTo(px + 16, py + 1);
    ctx.lineTo(px + 16, py + TILE - 1);
    ctx.stroke();

    // Steel surround, connected across top/bottom segments.
    ctx.fillStyle = "#3d4856";
    ctx.fillRect(frameX, py + outerTopPad, frameW, TILE - outerTopPad - outerBottomPad);
    ctx.fillStyle = "#566375";
    ctx.fillRect(frameX + 1, py + topPad, frameW - 2, TILE - topPad - bottomPad + 1);
    ctx.fillStyle = "#738196";
    ctx.fillRect(frameX + 1, gateY, 2, gateH);
    ctx.fillRect(frameX + frameW - 3, gateY, 2, gateH);
    ctx.fillStyle = "#2f3947";
    ctx.fillRect(frameX + 2, gateY, 1, gateH);
    ctx.fillRect(frameX + frameW - 3, gateY, 1, gateH);

    if (isTop || isSingle){
      ctx.fillStyle = "#69788d";
      ctx.fillRect(doorX - 1, Math.max(py + 1, gateY - 1), doorW + 2, 2);
      ctx.fillStyle = "rgba(226,232,240,.20)";
      ctx.fillRect(doorX - 1, Math.max(py + 1, gateY - 1), doorW + 2, 1);
    }
    if (isBottom || isSingle){
      ctx.fillStyle = "#3b4555";
      ctx.fillRect(doorX - 1, gateY + gateH - 1, doorW + 2, 2);
      ctx.fillStyle = "rgba(0,0,0,.24)";
      ctx.fillRect(doorX - 1, gateY + gateH, doorW + 2, 1);
    }

    if (!open){
      // Closed double leaves.
      ctx.fillStyle = "#687789";
      ctx.fillRect(leftLeafX, gateY, leftLeafW, gateH);
      ctx.fillRect(rightLeafX, gateY, rightLeafW, gateH);
      ctx.fillStyle = "#8f9daf";
      ctx.fillRect(leftLeafX, gateY, leftLeafW, 1);
      ctx.fillRect(rightLeafX, gateY, rightLeafW, 1);
      if (!isTop){
        ctx.fillStyle = "#4a5667";
        ctx.fillRect(leftLeafX, gateY + gateH - 1, leftLeafW, 1);
        ctx.fillRect(rightLeafX, gateY + gateH - 1, rightLeafW, 1);
      }

      // Steel panel seams.
      ctx.fillStyle = "rgba(15,23,42,.35)";
      ctx.fillRect(leftLeafX + 2, gateY + 1, 1, gateH - 2);
      ctx.fillRect(rightLeafX + rightLeafW - 3, gateY + 1, 1, gateH - 2);
      ctx.fillStyle = "rgba(226,232,240,.12)";
      ctx.fillRect(leftLeafX + leftLeafW - 2, gateY + 1, 1, gateH - 2);
      ctx.fillRect(rightLeafX + 1, gateY + 1, 1, gateH - 2);

      // Center join post so both doors feel connected.
      ctx.fillStyle = "#a8b4c2";
      ctx.fillRect(seamX - 1, gateY, 2, gateH);
      ctx.fillStyle = "rgba(30,41,59,.55)";
      ctx.fillRect(seamX - 1, gateY, 1, gateH);

      // Lock plate on lower segment.
      if (isBottom || isSingle){
        const lockY = gateY + Math.floor(gateH / 2) - 2;
        ctx.fillStyle = "#b2bfcc";
        ctx.fillRect(seamX - 2, lockY, 4, 4);
        ctx.fillStyle = "#7c8a99";
        ctx.fillRect(seamX - 1, lockY - 1, 2, 1);
      }

      // Rivets.
      ctx.fillStyle = "#9eacbb";
      if (!isBottom){
        ctx.fillRect(frameX + 1, gateY + 2, 2, 2);
        ctx.fillRect(frameX + frameW - 3, gateY + 2, 2, 2);
      }
      if (!isTop){
        ctx.fillRect(frameX + 1, gateY + gateH - 4, 2, 2);
        ctx.fillRect(frameX + frameW - 3, gateY + gateH - 4, 2, 2);
      }
    } else {
      // Open center passage with leaves pulled to the sides.
      const openingHalf = 3;
      const openingX = seamX - openingHalf;
      const openingW = openingHalf * 2;
      ctx.fillStyle = "#10161e";
      ctx.fillRect(openingX, gateY, openingW, gateH);
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(openingX + 1, gateY + 1, openingW - 2, gateH - 2);

      const sideLeafW = 3;
      ctx.fillStyle = "#647384";
      ctx.fillRect(leftLeafX, gateY, sideLeafW, gateH);
      ctx.fillRect(rightLeafX + rightLeafW - sideLeafW, gateY, sideLeafW, gateH);
      ctx.fillStyle = "#8795a7";
      ctx.fillRect(leftLeafX, gateY, sideLeafW, 1);
      ctx.fillRect(rightLeafX + rightLeafW - sideLeafW, gateY, sideLeafW, 1);
      if (!isTop){
        ctx.fillStyle = "#4b5768";
        ctx.fillRect(leftLeafX, gateY + gateH - 1, sideLeafW, 1);
        ctx.fillRect(rightLeafX + rightLeafW - sideLeafW, gateY + gateH - 1, sideLeafW, 1);
      }

      // Cool steel edge glow in the open seam.
      ctx.fillStyle = "rgba(148,163,184,.24)";
      ctx.fillRect(openingX + 1, gateY + 1, 1, gateH - 2);
      ctx.fillRect(openingX + openingW - 2, gateY + 1, 1, gateH - 2);
      if (!isBottom){
        ctx.fillStyle = "rgba(203,213,225,.18)";
        ctx.fillRect(openingX + 1, gateY + 1, openingW - 2, 1);
      }
      if (!isTop){
        ctx.fillStyle = "rgba(148,163,184,.18)";
        ctx.fillRect(openingX + 1, gateY + gateH - 2, openingW - 2, 1);
      }
    }
    ctx.restore();
  }

  function drawDungeonBrazier(x, y, lit = false){
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const t = now();
    ctx.save();

    ctx.fillStyle = "#374151";
    ctx.fillRect(cx - 5, cy + 3, 10, 3);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(cx - 6, cy + 6, 12, 2);

    if (lit){
      const flick = 0.8 + 0.2 * Math.sin(t * 0.02 + x * 0.9 + y * 0.6);
      ctx.fillStyle = `rgba(251,191,36,${0.75 * flick})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 1.5, 4.6, 5.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(249,115,22,${0.85 * flick})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 3.2, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(107,114,128,.9)";
      ctx.beginPath();
      ctx.ellipse(cx, cy - 1, 3.6, 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

 function drawFurnace(x,y){
  const px=x*TILE, py=y*TILE;
  const t = now();
  const flick = 0.75 + 0.25*Math.sin(t*0.012 + x*3.1 + y*2.7);

  // stone body
  ctx.fillStyle="#1f2937";
  ctx.fillRect(px+5, py+10, 22, 18);
  ctx.fillStyle="rgba(255,255,255,.06)";
  ctx.fillRect(px+6, py+11, 20, 2);

  // top cap
  ctx.fillStyle="#111827";
  ctx.fillRect(px+7, py+7, 18, 4);

  // chimney
  ctx.fillStyle="#0b1220";
  ctx.fillRect(px+11, py+4, 10, 4);

  // opening
  ctx.fillStyle="#0b0f14";
  ctx.fillRect(px+11, py+18, 10, 8);

 // glow (animated)
  ctx.fillStyle=`rgba(249,115,22,${0.65*flick})`;
  ctx.fillRect(px+12, py+19, 8, 6);
  ctx.fillStyle=`rgba(251,191,36,${0.55*flick})`;
  ctx.fillRect(px+13, py+20, 6, 4);

  // little sparks
  ctx.fillStyle=`rgba(253,230,138,${0.35*flick})`;
  ctx.fillRect(px+15, py+15, 1, 1);
  ctx.fillRect(px+18, py+14, 1, 1);

  const activeSmelt = (
    player.action.type === "smelt" &&
    player.target?.kind === "furnace" &&
    interactables[player.target.index]?.x === x &&
    interactables[player.target.index]?.y === y
  );
  if (activeSmelt){
    const pulse = 0.6 + 0.4*Math.sin(t*0.04);
    ctx.fillStyle = `rgba(249,115,22,${0.22 + 0.24*pulse})`;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 22, 11 + 3*pulse, 6 + 2*pulse, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = `rgba(253,186,116,${0.45 + 0.35*pulse})`;
    for (let i=0; i<5; i++){
      const sx = px + 14 + i*2 + Math.sin(t*0.02 + i*0.8)*1.1;
      const sy = py + 16 - i*1.5 - Math.cos(t*0.024 + i*0.5)*1.8;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
  }
}

function drawAnvil(x,y){
  const px=x*TILE, py=y*TILE;

  // stump/base
  ctx.fillStyle="#7c4a24";
  ctx.fillRect(px+12, py+18, 8, 10);
  ctx.fillStyle="rgba(0,0,0,.18)";
  ctx.fillRect(px+12, py+18, 2, 10);

  // anvil body
  ctx.fillStyle="#9ca3af";
  ctx.fillRect(px+9, py+14, 14, 4);
  ctx.fillRect(px+11, py+11, 10, 4);

  // horn
  ctx.fillRect(px+22, py+13, 4, 3);
  ctx.fillStyle="#6b7280";
  ctx.fillRect(px+23, py+12, 3, 2);

  // highlight
  ctx.fillStyle="rgba(255,255,255,.10)";
  ctx.fillRect(px+11, py+12, 9, 1);

  // shadow
  ctx.fillStyle="rgba(0,0,0,.22)";
  ctx.fillRect(px+10, py+18, 12, 1);

  const activeSmith = player.action.type === "smith" && inRangeOfTile(x, y, 1.6);
  if (activeSmith){
    const t = now();
    const pulse = 0.5 + 0.5*Math.sin(t*0.03);
    const hx = px + 16;
    const hy = py + 15;

    ctx.fillStyle = `rgba(251,191,36,${0.16 + 0.2*pulse})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 3, 10 + 2*pulse, 4 + pulse, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = `rgba(253,230,138,${0.42 + 0.4*pulse})`;
    for (let i=0; i<4; i++){
      const sx = hx - 4 + i*3 + Math.sin(t*0.018 + i)*1.3;
      const sy = hy - 1 - i*1.8 - Math.cos(t*0.02 + i*0.9)*1.5;
      ctx.fillRect(sx, sy, 1.8, 1.8);
    }
  }
}

function drawCauldron(x, y){
  const px = x * TILE;
  const py = y * TILE;
  const t = now();
  const simmer = 0.75 + 0.25 * Math.sin(t * 0.02 + x + y);

  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 23, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f3b46";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 17, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 14, 9, 3, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(34,197,94,${0.25 + 0.2 * simmer})`;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 14, 7, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(px + 9, py + 22, 3, 4);
  ctx.fillRect(px + 20, py + 22, 3, 4);
}

function drawLadder(x, y, mode = "down"){
  const px = x * TILE;
  const py = y * TILE;

  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 26, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#7c4a24";
  ctx.fillRect(px + 11, py + 7, 3, 18);
  ctx.fillRect(px + 18, py + 7, 3, 18);
  ctx.fillStyle = "#a16207";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + 12, py + 9 + i * 4, 8, 2);
  }

  const pulse = 0.5 + 0.5 * Math.sin(now() * 0.01 + x * 0.5 + y * 0.7);
  const glow = 0.18 + 0.16 * pulse;
  if (mode === "down") {
    ctx.fillStyle = `rgba(56,189,248,${glow})`;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 24);
    ctx.lineTo(px + 11, py + 18);
    ctx.lineTo(px + 21, py + 18);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = `rgba(134,239,172,${glow})`;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 12);
    ctx.lineTo(px + 11, py + 18);
    ctx.lineTo(px + 21, py + 18);
    ctx.closePath();
    ctx.fill();
  }
}

function drawVendorShopDecor(){
  const {startX,startY,endX,endY} = visibleTileBounds();
  const x0 = vendorShop.x0 | 0;
  const y0 = vendorShop.y0 | 0;
  const w = vendorShop.w | 0;
  const h = vendorShop.h | 0;
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  if (x1 < startX - 2 || x0 > endX + 2 || y1 < startY - 2 || y0 > endY + 2) return;

  const gateX = x0 + Math.floor(w / 2);
  const t = now();
  ctx.save();

  function tileTopLeft(tx, ty){
    return { px: tx * TILE, py: ty * TILE };
  }
  function drawBush(tx, ty, tone=0){
    const { px, py } = tileTopLeft(tx, ty);
    const sway = Math.sin(t * 0.005 + tx * 0.8 + ty * 1.2) * 0.7;
    const g1 = tone ? "#2f8f4b" : "#2b7f43";
    const g2 = tone ? "#37a358" : "#329652";

    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 25, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(px + 11 + sway * 0.25, py + 16, 6.2, 0, Math.PI * 2);
    ctx.arc(px + 20 + sway * 0.35, py + 15.5, 7.2, 0, Math.PI * 2);
    ctx.arc(px + 16 + sway * 0.15, py + 12, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(px + 14 + sway * 0.2, py + 13, 3.3, 0, Math.PI * 2);
    ctx.arc(px + 19 + sway * 0.2, py + 12.5, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawFlowerPatch(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#2c6e3f";
    ctx.fillRect(px + 10, py + 18, 2, 7);
    ctx.fillRect(px + 15, py + 16, 2, 8);
    ctx.fillRect(px + 20, py + 18, 2, 7);

    ctx.fillStyle = "#f472b6";
    ctx.fillRect(px + 9, py + 16, 3, 3);
    ctx.fillRect(px + 19, py + 16, 3, 3);
    ctx.fillStyle = "#fde047";
    ctx.fillRect(px + 14, py + 14, 3, 3);
    ctx.fillStyle = "#93c5fd";
    ctx.fillRect(px + 12, py + 19, 2, 2);
    ctx.fillRect(px + 18, py + 20, 2, 2);
  }
  function drawCrate(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(px + 8, py + 13, 16, 13);
    ctx.fillStyle = "#a16207";
    ctx.fillRect(px + 8, py + 11, 16, 3);
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    ctx.strokeRect(px + 8.5, py + 13.5, 15, 12);
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.moveTo(px + 10, py + 15);
    ctx.lineTo(px + 22, py + 24);
    ctx.moveTo(px + 22, py + 15);
    ctx.lineTo(px + 10, py + 24);
    ctx.stroke();
  }
  function drawBarrel(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 11, py + 12, 10, 14);
    ctx.fillStyle = "#92572c";
    ctx.fillRect(px + 11, py + 12, 10, 2);
    ctx.fillRect(px + 11, py + 24, 10, 2);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(px + 11, py + 16, 10, 1.5);
    ctx.fillRect(px + 11, py + 20, 10, 1.5);
  }
  function drawSignpost(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 15, py + 8, 3, 19);
    ctx.fillStyle = "#a16207";
    ctx.fillRect(px + 6, py + 10, 20, 8);
    ctx.strokeStyle = "rgba(0,0,0,.34)";
    ctx.strokeRect(px + 6.5, py + 10.5, 19, 7);
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(px + 9, py + 13, 14, 1.8);
  }
  function drawLantern(tx, ty, side=1){
    const { px, py } = tileTopLeft(tx, ty);
    const lx = px + (side > 0 ? 24 : 8);
    const ly = py + 8;
    const a = 0.22 + 0.1 * Math.sin(t * 0.01 + tx * 2.3 + ty * 1.9);

    ctx.fillStyle = `rgba(251,191,36,${a})`;
    ctx.beginPath();
    ctx.arc(lx, ly + 7, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx - 2, ly - 4);
    ctx.lineTo(lx + 2, ly - 4);
    ctx.moveTo(lx, ly - 4);
    ctx.lineTo(lx, ly + 2);
    ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(lx - 2, ly + 2, 4, 4);
  }
  function drawWallTorch(tx, ty, side=1){
    const { px, py } = tileTopLeft(tx, ty);
    const wx = px + (side > 0 ? 23 : 9);
    const wy = py + 10;
    const flick = 0.65 + 0.35 * Math.sin(t * 0.014 + tx * 1.9 + ty * 1.3);

    ctx.fillStyle = `rgba(251,191,36,${0.16 * flick})`;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(wx - 2, wy - 3);
    ctx.lineTo(wx + 2, wy - 3);
    ctx.moveTo(wx, wy - 3);
    ctx.lineTo(wx, wy + 1.8);
    ctx.stroke();

    ctx.fillStyle = `rgba(249,115,22,${0.85 * flick})`;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2, 1.9, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(251,191,36,${0.95 * flick})`;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2.4, 1.2, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawRunnerRug(tx, yA, yB){
    const minY = Math.min(yA, yB);
    const maxY = Math.max(yA, yB);
    const px = tx * TILE;
    const py = minY * TILE;
    const rugTop = py + 3;
    const rugHeight = (maxY - minY + 1) * TILE - 6;
    ctx.fillStyle = "#4a2a1f";
    ctx.fillRect(px + 10, rugTop, 12, rugHeight);
    ctx.fillStyle = "#7c3f2a";
    ctx.fillRect(px + 11, rugTop + 1, 10, rugHeight - 2);
    ctx.fillStyle = "rgba(214,169,106,.55)";
    ctx.fillRect(px + 11, rugTop + 4, 10, 1.6);
    ctx.fillRect(px + 11, rugTop + rugHeight - 6, 10, 1.6);
  }
  function drawShelfStock(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(px + 7, py + 8, 18, 2.5);
    ctx.fillRect(px + 7, py + 13, 18, 2.5);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(px + 8, py + 15.5, 16, 1);

    const bottleColors = ["#93c5fd", "#fca5a5", "#86efac", "#fde68a"];
    for (let i = 0; i < 4; i++){
      ctx.fillStyle = bottleColors[i];
      ctx.fillRect(px + 9 + i * 4, py + 9, 2.2, 3.2);
      ctx.fillRect(px + 9 + i * 4, py + 14, 2.2, 3.2);
    }
  }
  function drawCounterDisplay(tx, ty, tone=0){
    const { px, py } = tileTopLeft(tx, ty);
    const top = tone ? "#9a6b38" : "#8b5a2b";
    const base = tone ? "#7c4a24" : "#6f411f";
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(px + 7, py + 24, 18, 2);
    ctx.fillStyle = base;
    ctx.fillRect(px + 8, py + 14, 16, 10);
    ctx.fillStyle = top;
    ctx.fillRect(px + 7, py + 11, 18, 4);
    ctx.strokeStyle = "rgba(0,0,0,.26)";
    ctx.strokeRect(px + 8.5, py + 14.5, 15, 9);
  }
  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;

  // Interior dressing: keep center lane open from door to vendor.
  drawRunnerRug(gateX, iy0 + 1, iy1);
  drawWallTorch(ix1, iy0, 1);
  drawShelfStock(ix1 - 1, iy0);
  drawCounterDisplay(ix1, iy0 + 2, 1);
  drawBarrel(ix1, iy1);

  // Exterior greenery and flowering bits.
  drawBush(x0 - 1, y1 - 1, 1);
  drawBush(x1 + 1, y0 + 1, 1);
  drawFlowerPatch(x1 + 2, y0 + 2);

  // Merchant props.
  drawCrate(x1 + 1, y1);
  drawBarrel(x0 - 1, y1);
  drawSignpost(gateX + 1, y1 + 2);
  drawLantern(gateX + 1, y1, 1);

  ctx.restore();
}

function drawStarterCastleDecor(){
  const {startX,startY,endX,endY} = visibleTileBounds();
  const x0 = startCastle.x0 | 0;
  const y0 = startCastle.y0 | 0;
  const w = startCastle.w | 0;
  const h = startCastle.h | 0;
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  if (x1 < startX - 2 || x0 > endX + 2 || y1 < startY - 2 || y0 > endY + 2) return;

  const gateX = (startCastle.gateX ?? (x0 + Math.floor(w / 2))) | 0;
  const t = now();
  ctx.save();

  function tileTopLeft(tx, ty){
    return { px: tx * TILE, py: ty * TILE };
  }
  function drawWallTorch(tx, ty, side=1){
    const { px, py } = tileTopLeft(tx, ty);
    const wx = px + (side > 0 ? 23 : 9);
    const wy = py + 10;
    const flick = 0.65 + 0.35 * Math.sin(t * 0.014 + tx * 2.1 + ty * 1.2);

    ctx.fillStyle = `rgba(251,191,36,${0.14 * flick})`;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(wx - 2, wy - 3);
    ctx.lineTo(wx + 2, wy - 3);
    ctx.moveTo(wx, wy - 3);
    ctx.lineTo(wx, wy + 1.8);
    ctx.stroke();

    ctx.fillStyle = `rgba(249,115,22,${0.85 * flick})`;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2, 1.8, 2.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(251,191,36,${0.95 * flick})`;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2.3, 1.1, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawRunnerRug(tx, yA, yB){
    const minY = Math.min(yA, yB);
    const maxY = Math.max(yA, yB);
    const px = tx * TILE;
    const py = minY * TILE;
    const rugTop = py + 2;
    const rugHeight = (maxY - minY + 1) * TILE - 4;
    ctx.fillStyle = "#4a2a1f";
    ctx.fillRect(px + 9, rugTop, 14, rugHeight);
    ctx.fillStyle = "#7c3f2a";
    ctx.fillRect(px + 10, rugTop + 1, 12, rugHeight - 2);
    ctx.fillStyle = "rgba(214,169,106,.58)";
    ctx.fillRect(px + 10, rugTop + 4, 12, 1.7);
    ctx.fillRect(px + 10, rugTop + rugHeight - 6, 12, 1.7);
  }
  function drawWeaponRack(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#5b3a1d";
    ctx.fillRect(px + 7, py + 10, 18, 3);
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(px + 11, py + 13, 2, 9);
    ctx.fillRect(px + 18, py + 13, 2, 9);
    ctx.fillStyle = "#d1d5db";
    ctx.fillRect(px + 10, py + 11, 4, 2);
    ctx.fillRect(px + 17, py + 11, 4, 2);
  }
  function drawSmallTable(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(px + 7, py + 23, 18, 2);
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(px + 8, py + 14, 16, 9);
    ctx.fillStyle = "#a16207";
    ctx.fillRect(px + 7, py + 12, 18, 3);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(px + 11, py + 13, 2, 2);
    ctx.fillRect(px + 16, py + 13, 2, 2);
    ctx.fillRect(px + 20, py + 13, 2, 2);
  }
  function drawBookshelf(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#5b3a1d";
    ctx.fillRect(px + 7, py + 8, 18, 15);
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 8, py + 9, 16, 2);
    ctx.fillRect(px + 8, py + 14, 16, 2);
    ctx.fillRect(px + 8, py + 19, 16, 2);

    const colors = ["#60a5fa", "#fca5a5", "#86efac", "#fde68a", "#c4b5fd"];
    for (let i = 0; i < 5; i++){
      ctx.fillStyle = colors[i];
      ctx.fillRect(px + 9 + i * 3, py + 10, 2, 3.5);
      ctx.fillRect(px + 9 + i * 3, py + 15, 2, 3.5);
      ctx.fillRect(px + 9 + i * 3, py + 20, 2, 2.5);
    }
  }
  function drawArmorStand(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(px + 11, py + 24, 10, 2);
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 15, py + 14, 2, 10);
    ctx.fillStyle = "#9ca3af";
    ctx.beginPath();
    ctx.arc(px + 16, py + 11, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px + 11, py + 15, 10, 7);
    ctx.fillStyle = "#d1d5db";
    ctx.fillRect(px + 13, py + 16, 6, 1.5);
  }
  function drawCandleStand(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    const flick = 0.7 + 0.3 * Math.sin(t * 0.017 + tx * 1.1 + ty * 1.6);
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 15, py + 14, 2, 10);
    ctx.fillRect(px + 12, py + 23, 8, 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(px + 14.5, py + 12, 3, 2);
    ctx.fillStyle = `rgba(251,191,36,${0.28 * flick})`;
    ctx.beginPath();
    ctx.arc(px + 16, py + 12, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(249,115,22,${0.8 * flick})`;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 10.3, 1.7, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawCrest(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(px + 10, py + 8, 12, 12);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 10.7, py + 8.7, 10.6, 10.6);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(px + 16, py + 10.5);
    ctx.lineTo(px + 19, py + 13.3);
    ctx.lineTo(px + 17.7, py + 17.5);
    ctx.lineTo(px + 14.3, py + 17.5);
    ctx.lineTo(px + 13, py + 13.3);
    ctx.closePath();
    ctx.fill();
  }
  function drawStoneBench(tx, ty){
    const { px, py } = tileTopLeft(tx, ty);
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(px + 7, py + 18, 18, 6);
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(px + 7, py + 16, 18, 3);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(px + 8, py + 23, 16, 1.5);
  }

  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;

  // Interior accents.
  drawRunnerRug(gateX, iy0 + 1, iy1);
  drawWallTorch(ix0 + 2, iy0, -1);
  drawWallTorch(ix1 - 2, iy0, 1);
  drawWeaponRack(ix0, iy0 + 2);
  drawBookshelf(ix1 - 1, iy0 + 1);
  drawSmallTable(gateX, iy0 + 1);

  // Entrance accents outside the gate.
  drawStoneBench(gateX - 2, y1 + 1);
  drawWallTorch(gateX - 1, y1, -1);
  drawWallTorch(gateX + 1, y1, 1);

  ctx.restore();
}

function drawDockDecor(){
  const {startX,startY,endX,endY} = visibleTileBounds();
  const dockX = 31;
  const dockShoreY = 21;    // RIVER_Y - 1, the shore tile
  const dockWaterY = 22;    // RIVER_Y, first water tile

  // Skip if dock not in visible area (check entire pier bounds)
  if (dockX < startX - 1 || dockX > endX + 1 || dockShoreY < startY - 1 || dockWaterY > endY + 1) return;

  const dockComplete = getProjectState("rivermoor", "dock") === "complete";
  ctx.save();

  // Color scheme - pixel art browns
  const plankColorBright = dockComplete ? "#A0826D" : "#7A6B5A";   // main plank color
  const plankColorDark = dockComplete ? "#7A6347" : "#5A4B3A";     // shadow/dark lines
  const postColorBright = dockComplete ? "#8B6F47" : "#6B5F3F";    // post color
  const postColorDark = dockComplete ? "#6A5835" : "#4A4A2A";      // post shadow

  function drawPixelPlank(tx, ty, isBroken = false) {
    // Draw individual wooden planks stacked horizontally with pixel art style
    const px = tx * TILE;
    const py = ty * TILE;
    const plankGap = 2;
    const plankHeight = 6;

    // Draw 4-5 horizontal planks
    for (let i = 0; i < 5; i++) {
      const plankY = py + 4 + i * (plankHeight + plankGap);

      // Skip drawing some planks if broken (simulates missing boards)
      if (isBroken && (i === 1 || i === 3)) continue;

      // Main plank
      ctx.fillStyle = plankColorBright;
      ctx.fillRect(px + 2, plankY, TILE - 4, plankHeight);

      // Dark edge (wood grain/shadow)
      ctx.fillStyle = plankColorDark;
      ctx.fillRect(px + 2, plankY + plankHeight - 1, TILE - 4, 1);

      // Broken state: add crack lines
      if (isBroken && i === 0) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 4, plankY + 1);
        ctx.lineTo(px + TILE - 4, plankY + 4);
        ctx.stroke();
      }
      if (isBroken && i === 2) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 8, plankY + 1);
        ctx.lineTo(px + TILE - 6, plankY + 5);
        ctx.stroke();
      }
    }
  }

  function drawPixelPost(tx, ty) {
    // Draw a vertical support post with stacked segments
    const px = tx * TILE + TILE * 0.25;
    const py = ty * TILE + 2;
    const postWidth = TILE * 0.5;
    const segmentHeight = 8;
    const segmentGap = 1;

    // Draw 3-4 stacked segments
    for (let i = 0; i < 4; i++) {
      const segY = py + i * (segmentHeight + segmentGap);

      // Main segment
      ctx.fillStyle = postColorBright;
      ctx.fillRect(px, segY, postWidth, segmentHeight);

      // Side shadow
      ctx.fillStyle = postColorDark;
      ctx.fillRect(px, segY, 2, segmentHeight);
      ctx.fillRect(px + postWidth - 2, segY, 2, segmentHeight);

      // Bottom edge shadow
      ctx.fillRect(px, segY + segmentHeight - 1, postWidth, 1);
    }
  }

  // SHORE PLANK (always visible, connects to land)
  drawPixelPlank(dockX, dockShoreY, !dockComplete);

  // REPAIRED DOCK: Full pier extending into water
  if (dockComplete) {
    // Water plank (extends pier into river)
    drawPixelPlank(dockX, dockWaterY, false);

    // Flanking posts in the water (support the pier)
    drawPixelPost(dockX - 1, dockWaterY);
    drawPixelPost(dockX + 1, dockWaterY);
  }

  ctx.restore();
}

function drawHearthDecor(){
  if (getProjectState("rivermoor", "hearth") !== "complete") return;
  const {startX,startY,endX,endY} = visibleTileBounds();
  const x0 = HEARTH_CAMP_BOUNDS.x0;
  const y0 = HEARTH_CAMP_BOUNDS.y0;
  const x1 = HEARTH_CAMP_BOUNDS.x1;
  const y1 = HEARTH_CAMP_BOUNDS.y1;
  if (x1 < startX - 1 || x0 > endX + 1 || y1 < startY - 1 || y0 > endY + 1) return;

  function inView(tx, ty){
    return !(tx < startX - 1 || tx > endX + 1 || ty < startY - 1 || ty > endY + 1);
  }

  function drawLog(tx, ty){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(px + 6, py + 18, 20, 6);
    ctx.fillStyle = "#8b6a3f";
    ctx.fillRect(px + 6, py + 16, 20, 3);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(px + 7, py + 22, 18, 2);
  }

  function drawStool(tx, ty){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "#7c4a24";
    ctx.fillRect(px + 10, py + 16, 12, 8);
    ctx.fillStyle = "#5b3619";
    ctx.fillRect(px + 11, py + 23, 2, 5);
    ctx.fillRect(px + 19, py + 23, 2, 5);
  }

  function drawWoodPile(tx, ty){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "#8b6a3f";
    ctx.fillRect(px + 6, py + 15, 20, 10);
    ctx.fillStyle = "#6b4f2a";
    ctx.fillRect(px + 8, py + 17, 16, 2);
    ctx.fillRect(px + 8, py + 21, 16, 2);
  }

  drawLog(3, 16);
  drawLog(5, 16);
  drawStool(4, 17);
  drawWoodPile(6, 15);
}

function drawDungeonDecor(){
  if (getActiveZone() !== ZONE_KEYS.DUNGEON) return;

  const {startX,startY,endX,endY} = visibleTileBounds();
  const t = now();

  function inView(x, y) {
    return !(x < startX - 1 || x > endX + 1 || y < startY - 1 || y > endY + 1);
  }

  function drawWallTorch(tx, ty, side = 1){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    const wx = px + (side > 0 ? 24 : 8);
    const wy = py + 10;
    const flick = 0.65 + 0.35 * Math.sin(t * 0.014 + tx * 1.8 + ty * 1.3);

    ctx.fillStyle = `rgba(251,191,36,${0.12 * flick})`;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(wx - 2, wy - 3);
    ctx.lineTo(wx + 2, wy - 3);
    ctx.moveTo(wx, wy - 3);
    ctx.lineTo(wx, wy + 2);
    ctx.stroke();

    ctx.fillStyle = `rgba(249,115,22,${0.82 * flick})`;
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2, 1.8, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPillar(tx, ty){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(px + 8, py + 25, 16, 3);
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(px + 10, py + 9, 12, 16);
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(px + 9, py + 7, 14, 3);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(px + 11, py + 10, 2, 12);
  }

  function drawDebris(tx, ty){
    if (!inView(tx, ty)) return;
    const px = tx * TILE;
    const py = ty * TILE;
    ctx.fillStyle = "rgba(15,23,42,.28)";
    ctx.fillRect(px + 6, py + 20, 7, 4);
    ctx.fillRect(px + 16, py + 17, 6, 5);
    ctx.fillStyle = "rgba(148,163,184,.14)";
    ctx.fillRect(px + 8, py + 19, 2, 2);
    ctx.fillRect(px + 18, py + 16, 2, 2);
  }

  for (const torch of DUNGEON_TORCHES) drawWallTorch(torch.x, torch.y, torch.side);
  for (const pillar of DUNGEON_PILLARS) drawPillar(pillar.x, pillar.y);
  drawDebris(20, 28);
  drawDebris(34, 30);
  drawDebris(27, 4);
}

 function drawInteractables(){
    if (getActiveZone() === ZONE_KEYS.OVERWORLD) {
      drawStarterCastleDecor();
      drawVendorShopDecor();
      drawDockDecor();
      drawHearthDecor();
    }
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const it of interactables){
      if (it.x<startX-1 || it.x>endX+1 || it.y<startY-1 || it.y>endY+1) continue;
      if (it.type==="bank") drawBankChest(it.x,it.y);
if (it.type==="furnace") drawFurnace(it.x,it.y);
if (it.type==="anvil")   drawAnvil(it.x,it.y);
if (it.type==="ladder_down") drawLadder(it.x, it.y, "down");
if (it.type==="ladder_up") drawLadder(it.x, it.y, "up");


      if (it.type==="fire"){
  const cx = it.x * TILE + TILE/2;
  const cy = it.y * TILE + TILE/2;

  const t = now();
  const born = (it.createdAt ?? (it.createdAt = t));
  const expires = (it.expiresAt ?? (it.expiresAt = born + 60000));
  const age = t - born;

  // fade out during the last ~4 seconds
  const fade = clamp((expires - t) / 4000, 0, 1);

  ctx.save();
  ctx.translate(cx, cy);

  // soft ground glow (animated)
  const flick = 0.90 + 0.10*Math.sin(age*0.018) + 0.06*Math.sin(age*0.041);
  const glowR = 10 + 5*flick;

  const g = ctx.createRadialGradient(0, 7, 1, 0, 7, glowR*2.3);
  g.addColorStop(0, `rgba(251,191,36,${0.55*fade})`);
  g.addColorStop(0.35, `rgba(249,115,22,${0.30*fade})`);
  g.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 7, glowR*2.3, 0, Math.PI*2);
  ctx.fill();

  // ember base
  ctx.fillStyle = `rgba(17,24,39,${0.45*fade})`;
  ctx.beginPath();
  ctx.ellipse(0, 9, 11, 4, 0, 0, Math.PI*2);
  ctx.fill();

  // flame body (stacked blobs, flicker + sway)
  const sway = Math.sin(age*0.010) * 1.6;

  // outer flame
  ctx.fillStyle = `rgba(249,115,22,${0.85*fade})`;
  ctx.beginPath();
  ctx.ellipse(sway*0.7, 2, 7, 9, 0, 0, Math.PI*2);
  ctx.ellipse(sway*0.9, -4, 5.5, 7.5, 0, 0, Math.PI*2);
  ctx.ellipse(sway*1.2, -10, 4.0, 6.0, 0, 0, Math.PI*2);
  ctx.fill();

  // inner flame
  ctx.fillStyle = `rgba(251,191,36,${0.90*fade})`;
  ctx.beginPath();
  ctx.ellipse(sway*0.6, 1, 4.8, 6.8, 0, 0, Math.PI*2);
  ctx.ellipse(sway*0.8, -6, 3.6, 5.2, 0, 0, Math.PI*2);
  ctx.fill();

  // a couple tiny sparks
  for (let i=0; i<3; i++){
    const phase = age*0.006 + i*2.2;
    const px = Math.sin(phase) * 7;
    const py = -8 - ((age*0.03 + i*9) % 14);
    const a = fade * (0.35 + 0.25*Math.sin(phase*1.7));
    ctx.fillStyle = `rgba(253,230,138,${clamp(a,0,1)})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.2, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

if (it.type === "fish" || it.type === "fish_dock"){
  const cx = it.x * TILE + TILE/2;
  const cy = it.y * TILE + TILE/2;
  const t = now();
  const phase = (t/260) + (it.x*0.7 + it.y*1.1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.85;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(147,197,253,0.85)";
  for (let r=0; r<2; r++){
    const rr = 6 + r*4 + (Math.sin(phase + r)*1.5);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(248,250,252,0.9)";
  ctx.beginPath();
  ctx.arc(2, -2, 1.2, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

if (it.type === "cauldron") drawCauldron(it.x, it.y);


if (it.type==="vendor") drawVendorNpc(it.x, it.y);
if (it.type==="quest_npc"){
  drawQuestNpc(it.x, it.y, npcHasPendingQuestMarker(it.npcId));
}
if (it.type==="project_npc"){
  const npcId = String(it.npcId || "");
  if (npcId === "blacksmith_torren") drawBlacksmithNpc(it.x, it.y);
  else if (npcId === "hearth_keeper") drawMaraHearthkeeper(it.x, it.y);
  else if (npcId === "dock_foreman") drawGarrickForeman(it.x, it.y);
  else if (npcId === "mayor") drawMayorAlden(it.x, it.y);
  else drawQuestNpc(it.x, it.y, false);
}
if (it.type==="sealed_gate") drawSealedGate(it.x, it.y, !!it.open, it.segment || "single");
if (it.type==="brazier") drawDungeonBrazier(it.x, it.y, !!it.lit);

    }
  }

  function drawLootMarkers(){
    // subtle marker on tiles that have loot
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const [k,pile] of groundLoot.entries()){
const tNow = now();
if (Number.isFinite(pile.expiresAt) && tNow >= pile.expiresAt){
  groundLoot.delete(k);
  continue;
}

      if (!pile || pile.size===0) continue;
      const [x,y]=k.split(",").map(n=>parseInt(n,10));
      if (!inBounds(x,y)) continue;
      if (x<startX-1 || x>endX+1 || y<startY-1 || y>endY+1) continue;

      ctx.fillStyle="rgba(94,234,212,.20)";
      ctx.beginPath();
      ctx.arc(x*TILE+TILE/2, y*TILE+TILE/2, 6, 0, Math.PI*2);
      ctx.fill();
    }
  }
function drawSmithingAnimation(cx, cy, fx, fy, pct){
  const side = (fx !== 0) ? fx : 1;
  const hx = cx + side * 9;
  const hy = cy + 8;

  // Two hammer impacts per smithing cycle.
  const strikeA = Math.max(0, 1 - Math.abs(pct - 0.32) / 0.12);
  const strikeB = Math.max(0, 1 - Math.abs(pct - 0.74) / 0.12);
  const strike = Math.max(strikeA, strikeB);
  const swing = Math.sin(pct * Math.PI * 4) * 0.95;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((-0.45 + swing) * side);

  // Hammer handle and head.
  ctx.fillStyle = "#7c4a24";
  ctx.fillRect(-1, -11, 2, 12);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(-4, -14, 8, 4);
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(-3, -13, 6, 1);
  ctx.restore();

  if (strike <= 0.02) return;

  const ix = cx + side * 12;
  const iy = cy + 11;
  const pulse = 0.45 + 0.55 * strike;

  ctx.fillStyle = `rgba(249,115,22,${0.22 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(ix, iy, 8 + 3 * strike, 4 + 1.5 * strike, 0, 0, Math.PI * 2);
  ctx.fill();

  const t = now() * 0.02;
  for (let i = 0; i < 6; i++){
    const ang = (i / 6) * Math.PI * 2 + t;
    const rad = 3 + (i % 3) * 1.4 + strike * 2.8;
    const sx = ix + Math.cos(ang) * rad;
    const sy = iy + Math.sin(ang) * (1.8 + strike * 0.9) - 1.5;
    ctx.fillStyle = `rgba(251,191,36,${0.45 + 0.45 * strike})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
}

function drawSmeltingAnimation(cx, cy, fx, fy, pct){
  const side = (fx !== 0) ? fx : 1;
  const handX = cx + side * 8;
  const handY = cy + 2;

  let targetX = handX + side * 14;
  let targetY = handY - 4;
  if (player.target?.kind === "furnace"){
    const f = interactables[player.target.index];
    if (f){
      targetX = f.x * TILE + TILE / 2;
      targetY = f.y * TILE + TILE / 2 + 2;
    }
  }

  const tossT = clamp(pct / 0.58, 0, 1);
  const oreX = handX + (targetX - handX) * tossT;
  const oreY = handY + (targetY - handY) * tossT - Math.sin(tossT * Math.PI) * 8;

  const glow = 0.6 + 0.4 * Math.sin(now() * 0.02);
  ctx.fillStyle = `rgba(249,115,22,${0.14 + 0.12 * glow})`;
  ctx.beginPath();
  ctx.ellipse(handX + side, handY + 4, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (pct < 0.8){
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(oreX - 2, oreY - 2, 4, 4);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(oreX - 1, oreY - 2, 2, 1);
  }

  const emberT = now() * 0.015;
  for (let i = 0; i < 5; i++){
    const ox = handX + side * (2 + i * 1.4) + Math.sin(emberT + i * 0.9) * 1.2;
    const oy = handY - (i * 1.6) - (Math.cos(emberT + i * 0.7) + 1.2) * 1.8;
    ctx.fillStyle = `rgba(253,186,116,${0.22 + i * 0.08})`;
    ctx.fillRect(ox, oy, 1.6, 1.6);
  }
}

  function drawPlayer(){
  const t = now();
  const moving = !!(player.path && player.path.length);
  const bob = moving ? Math.sin(t*0.015)*1.2 : Math.sin(t*0.008)*0.35;
  const step = moving ? Math.sin(t*0.030) : 0;

  const cx = player.px;
  const cy = player.py + bob;

  const fx = player.facing.x || 0;
  const fy = player.facing.y || 1;
  const appearance = playerGearRenderer.getAppearance();
  const bodyArmor = appearance.body;
  const legsArmor = appearance.legs;
  const headArmor = appearance.head;
  const feetArmor = appearance.feet;
  const lowerArmor = feetArmor || legsArmor;
  const torsoFill = bodyArmor ? bodyArmor.palette.mid : "rgba(17,24,39,.88)";
  const torsoStroke = bodyArmor ? bodyArmor.palette.dark : "rgba(0,0,0,.45)";
  const beltColor = bodyArmor
    ? (bodyArmor.material === "iron" ? "rgba(226,232,240,.9)" : "rgba(201,165,112,.85)")
    : "rgba(251,191,36,.85)";

  // shadow
  ctx.fillStyle="rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy+14, 10 + Math.abs(step)*1.5, 5, 0, 0, Math.PI*2);

function drawCauldron(x, y){
  const px = x * TILE;
  const py = y * TILE;
  const t = now();
  const simmer = 0.75 + 0.25 * Math.sin(t * 0.02 + x + y);

  // Base shadow
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 23, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pot body
  ctx.fillStyle = "#2f3b46";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 17, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 14, 9, 3, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Simmering surface
  ctx.fillStyle = `rgba(34,197,94,${0.25 + 0.2 * simmer})`;
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 14, 7, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(px + 9, py + 22, 3, 4);
  ctx.fillRect(px + 20, py + 22, 3, 4);
}
  ctx.fill();



  // boots (2-frame walk illusion)
  const footY = cy+12;
  const lift = moving ? (step>0 ? 1.5 : -1.5) : 0;
  ctx.fillStyle = lowerArmor ? lowerArmor.palette.dark : "#111827";
  ctx.fillRect(cx-8, footY + lift, 6, 3);
  ctx.fillRect(cx+2, footY - lift, 6, 3);
  if (lowerArmor){
    ctx.fillStyle = lowerArmor.palette.mid;
    ctx.fillRect(cx-7.3, footY + lift + 0.2, 4.6, 1.3);
    ctx.fillRect(cx+2.7, footY - lift + 0.2, 4.6, 1.3);
  }

  if (legsArmor){
    ctx.fillStyle = legsArmor.palette.mid;
    ctx.fillRect(cx-6.1, cy+8.1, 3.8, 3.2);
    ctx.fillRect(cx+2.3, cy+8.1, 3.8, 3.2);
    ctx.fillStyle = legsArmor.palette.light;
    ctx.fillRect(cx-5.2, cy+8.8, 0.8, 1.8);
    ctx.fillRect(cx+4.6, cy+8.8, 0.8, 1.8);
  }

  // torso
  ctx.fillStyle=torsoFill;
  ctx.beginPath();
  ctx.ellipse(cx, cy+6, 7.5, 9, 0, 0, Math.PI*2);
  ctx.fill();

  if (bodyArmor){
    ctx.fillStyle = bodyArmor.palette.dark;
    ctx.fillRect(cx-5.5, cy+4.4, 11.0, 1.1);
    ctx.fillRect(cx-0.9, cy+5.0, 1.8, 6.2);
    ctx.fillStyle = bodyArmor.palette.light;
    ctx.fillRect(cx-3.2, cy+5.4, 0.9, 4.3);
    ctx.fillRect(cx+2.3, cy+5.4, 0.9, 4.3);
  }

  // torso outline
  ctx.strokeStyle=torsoStroke;
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.ellipse(cx, cy+6, 7.5, 9, 0, 0, Math.PI*2);
  ctx.stroke();

  // head
  const headY = cy-6;
  ctx.fillStyle="#f2c9a0";
  ctx.beginPath();
  ctx.arc(cx, headY, 7, 0, Math.PI*2);
  ctx.fill();

  // head outline
  ctx.strokeStyle="rgba(0,0,0,.45)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.arc(cx, headY, 7, 0, Math.PI*2);
  ctx.stroke();

  if (headArmor){
    const p = headArmor.palette;
    ctx.fillStyle = p.mid;
    ctx.beginPath();
    ctx.arc(cx, headY - 2.0, 6.8, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.dark;
    ctx.fillRect(cx - 5.3, headY - 1.9, 10.6, 1.2);
    ctx.fillRect(cx - 0.7, headY - 1.9, 1.4, 1.6);
    ctx.fillStyle = p.light;
    ctx.fillRect(cx - 3.3, headY - 2.9, 6.6, 0.75);
  } else {
    // hood/hair tint (uses class color, but only on the top half)
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(cx, headY-1, 7.3, Math.PI, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // eyes: look in facing direction so it feels alive
  const lookX = clamp(fx, -1, 1) * 1.2;
  const lookY = clamp(fy, -1, 1) * 0.6;
  ctx.fillStyle="rgba(0,0,0,.65)";
  ctx.beginPath();
  ctx.arc(cx-2 + lookX, headY-1 + lookY, 1.1, 0, Math.PI*2);
  ctx.arc(cx+2 + lookX, headY-1 + lookY, 1.1, 0, Math.PI*2);
  ctx.fill();

  // belt accent
  ctx.strokeStyle=beltColor;
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(cx-5, cy+7);
  ctx.lineTo(cx+5, cy+7);
  ctx.stroke();

  // Equipped gear (hide while drawing dedicated action tools/animations).
  const a = player.action;
  const doingTool = (a.type==="woodcut" || a.type==="mine" || a.type==="smith" || a.type==="smelt");
  if (!doingTool){
    playerGearRenderer.drawEquippedGear(cx, cy + 4, fx);
  }

  // path preview (keep your existing behavior)
  if (player.path && player.path.length){
    ctx.fillStyle="rgba(94,234,212,.25)";
    for (const n of player.path) ctx.fillRect(n.x*TILE+10, n.y*TILE+10, 12, 12);
  }

  // keep your existing chop/mine swing drawing
  if (a.type==="woodcut" || a.type==="mine"){
    const pct = actionProgress();
    const swing = Math.sin(pct * Math.PI) * 1.0;
    const dx = player.facing.x || 0;
    const dy = player.facing.y || 1;

    const ox = player.px + dx*10;
    const oy = player.py + dy*10;

    ctx.save();
    ctx.translate(ox, oy);
    const baseAng = Math.atan2(dy, dx);
    const ang = baseAng + (-0.9 + swing*1.8);
    ctx.rotate(ang);

    ctx.fillStyle="rgba(0,0,0,.35)";
    ctx.fillRect(-2, -10, 4, 18);

    if (a.type==="woodcut"){
      ctx.fillStyle="#cbd5e1";
      ctx.fillRect(-8, -14, 14, 6);
    } else {
      ctx.fillStyle="#cbd5e1";
      ctx.fillRect(-6, -14, 12, 6);
      ctx.fillRect(-2, -18, 4, 10);
    }
    ctx.restore();
  }

  if (a.type === "smith"){
    drawSmithingAnimation(cx, cy, fx, fy, actionProgress());
  } else if (a.type === "smelt"){
    drawSmeltingAnimation(cx, cy, fx, fy, actionProgress());
  }
}


  function drawHover(worldX, worldY, screenX, screenY){
    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
    if (!inBounds(tx,ty)) return;

    const ent=getEntityAt(tx,ty);

    let stroke="rgba(94,234,212,.6)";
    if (ent?.kind==="mob"){
      const cls = ctxLevelClass(getPlayerCombatLevel(Skills), ent.level ?? 1);
      stroke = levelStrokeForCls(cls);
    }

    ctx.strokeStyle=stroke;
    ctx.lineWidth=2;
    ctx.strokeRect(tx*TILE+1, ty*TILE+1, TILE-2, TILE-2);

    let label="";
    if (ent) label=ent.label;
    else{
      const t=map[ty][tx];
      if (t===0) label="Walk here";
      if (t===1) label="Water";
      if (t===6) label="Lava";
      const inDungeonZone = (getActiveZone() === ZONE_KEYS.DUNGEON);
      if (t===2) label=(inDungeonZone ? "Rubble" : "Rock Face");
      if (t===3) label="Stone floor";
      if (t===4) label=(inDungeonZone ? "Dungeon wall" : "Castle wall");
      if (t===5) label=(inDungeonZone ? "Bridge" : "Path");
    }

    const pile = getLootPileAt(tx,ty);
    const lootLines = [];
    if (pile){
      for (const [id,qty] of pile.entries()){
        const it = Items[id];
        if (!it) continue;
        lootLines.push(`${it.name} x${qty|0}`);
      }
    }

    if (!label && lootLines.length===0) return;

    const px=screenX+14, py=screenY+18;

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.font="12px system-ui,-apple-system,Segoe UI,Roboto,Arial";

    const lines = [];
    const LOOT_LINE_PREFIX = "- ";
    if (label) lines.push(label);
    if (lootLines.length){
      lines.push("Loot:");
      for (const l of lootLines) lines.push(LOOT_LINE_PREFIX + l);
    }

    const maxW = Math.max(...lines.map(s => ctx.measureText(s).width));
    const w=maxW+14;
    const h=lines.length*16 + 10;

    ctx.fillStyle="rgba(0,0,0,.65)";
    ctx.fillRect(px, py-h+2, w, h);
    ctx.strokeStyle="rgba(255,255,255,.18)";
    ctx.strokeRect(px, py-h+2, w, h);

    let y = py - h + 18;
    for (let i=0;i<lines.length;i++){
            const text = lines[i];
      if (text==="Loot:"){
        ctx.fillStyle="rgba(251,191,36,.95)";
        ctx.fillText(text, px+7, y);
      } else if (text.startsWith(LOOT_LINE_PREFIX)){
        ctx.fillStyle="rgba(230,238,247,.92)";
        ctx.fillText(text, px+7, y);
      } else {
        // Tint the FIRST line (mob name) based on combat level
        if (i===0 && ent?.kind==="mob"){
          const cls = ctxLevelClass(getPlayerCombatLevel(Skills), ent.level ?? 1);
          ctx.fillStyle = levelTextForCls(cls);
        } else {
          ctx.fillStyle="rgba(230,238,247,.95)";
        }
        ctx.fillText(text, px+7, y);
      }


      y += 16;
    }

    ctx.restore();
  }

  // ---------- Minimap ----------
  const minimap = document.getElementById("minimap");
  const { drawMinimap } = createMinimap({
    minimap,
    clamp,
    W,
    H,
    map,
    interactables,
    player,
    camera,
    WORLD_W,
    WORLD_H,
    viewWorldW,
    viewWorldH,
    isWalkable: navIsWalkable,
    inBounds: navInBounds,
    setPathTo,
    getActiveZone
  });

  // ---------- Input / world-space mouse ----------
  canvas.addEventListener("mousemove",(e)=>{
    mouse.seen = true;

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    mouse.x = sx*VIEW_W;
    mouse.y = sy*VIEW_H;
  });

  canvas.addEventListener("mousedown",(e)=>{
    if (e.button!==0) return;
    closeCtxMenu();

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    const worldX = sx*viewWorldW() + camera.x;
    const worldY = sy*viewWorldH() + camera.y;

    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
        if (!inBounds(tx,ty)) return;

    if (e.shiftKey){
      chatLine(`<span class="muted">Tile: (${tx}, ${ty})</span>`);
      return;
    }

    clickToInteract(tx,ty);

  });

  canvas.addEventListener("contextmenu",(e)=>{
    e.preventDefault();
    closeCtxMenu();

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    const worldX = sx*viewWorldW() + camera.x;
    const worldY = sy*viewWorldH() + camera.y;

    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
    if (!inBounds(tx,ty)) return;

    const ent=getEntityAt(tx,ty);
    const opts=[];

    const walkHere=()=>{
      stopAction();
      const ok=setPathTo(tx,ty);
      if (!ok) chatLine(`<span class="muted">You can't walk there.</span>`);
    };

    if (ent?.kind==="mob"){
  const m = mobs[ent.index];
  const name = m?.name ?? "Rat";
  const lvl  = m?.combatLevel ?? 1;
  const cls  = ctxLevelClass(getPlayerCombatLevel(Skills), lvl);

  opts.push({label:`Attack ${name} (Lvl ${lvl})`, className: cls, onClick:()=>beginInteraction(ent)});
  opts.push({label:`Examine ${name}`, onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

    } else if (ent?.kind==="res" && ent.label==="Tree"){
      opts.push({label:"Chop Tree", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Tree", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="res" && ent.label==="Iron Rock"){
      opts.push({label:"Mine Iron Rock", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Iron Rock", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="res" && ent.label==="Rock"){
      opts.push({label:"Mine Rock", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Rock", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="bank"){
      opts.push({label:"Bank", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Bank Chest", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="fire"){
      opts.push({label:"Cook", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Campfire", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="cauldron"){
      opts.push({label:"Cook", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Cauldron", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
} else if (ent?.kind==="fish"){
  opts.push({label:"Fish", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Fishing Spot", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});


} else if (ent?.kind==="vendor"){
  opts.push({label:"Trade", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Vendor", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="quest_npc"){
  opts.push({label:`Talk-to ${ent.label ?? "Quartermaster"}`, onClick:()=>beginInteraction(ent)});
  opts.push({label:`Examine ${ent.label ?? "Quartermaster"}`, onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="project_npc"){
  opts.push({label:`Talk-to ${ent.label ?? "NPC"}`, onClick:()=>beginInteraction(ent)});
  opts.push({label:`Examine ${ent.label ?? "NPC"}`, onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="sealed_gate"){
  opts.push({label:(ent.open ? "Pass Gate" : "Open Sealed Gate"), onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Gate", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="brazier"){
  opts.push({label:(ent.lit ? "Inspect Brazier" : "Light Brazier"), onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Brazier", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="furnace"){
  opts.push({label:"Use Furnace", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Furnace", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="anvil"){
  opts.push({label:"Open Smithing", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Anvil", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="ladder_down"){
  opts.push({label:"Climb Down", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Ladder", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="ladder_up"){
  opts.push({label:"Climb Up", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Ladder", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="decor"){
  opts.push({label:`Examine ${ent.label ?? "Decoration"}`, onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else {

      if (isWalkable(tx,ty)) opts.push({label:"Walk here", onClick:walkHere});
    }
    openCtxMenu(e.clientX,e.clientY,opts);
  });

  // ---------- Saving / Loading (with migration) ----------
  const { serialize, deserialize } = createPersistence({
    now,
    player,
    Skills,
    inv,
    bank,
    view,
    equipment,
    quiver,
    wallet,
    groundLoot,
    resources,
    mobs,
    interactables,
    GROUND_LOOT_DESPAWN_MS,
    seedResources,
    seedMobs,
    seedInteractables,
    MOB_DEFS,
    DEFAULT_MOB_LEVELS,
    calcCombatLevelFromLevels,
    clamp,
    tileCenter,
    makeRng,
    worldState,
    randInt,
    placeMob,
    inBounds: navInBounds,
    isWalkable: navIsWalkable,
    map,
    RIVER_Y,
    getActiveZone,
    setActiveZone: (zoneKey) => setActiveZone(zoneKey),
    getZoneState,
    CLASS_DEFS,
    syncPlayerPix,
    recalcMaxHPFromHealth,
    clearSlots,
    Items,
    GOLD_ITEM_ID,
    addGold,
    addToInventory,
    MAX_SKILL_XP,
    MAX_BANK,
    BANK_START_SLOTS,
    getBankCapacity,
    setBankCapacity,
    setZoom,
    manualDropLocks,
    getQuestSnapshot,
    applyQuestSnapshot,
    getWorldUpgradeSnapshot,
    applyWorldUpgradeSnapshot,
    getTownRenownSnapshot,
    applyTownRenownSnapshot,
    getQuestRenownSnapshot,
    applyQuestRenownSnapshot,
    getWardenDefeatSnapshot,
    applyWardenDefeatSnapshot,
    getProjectSnapshot,
    applyProjectSnapshot,
    onZoneChanged: () => {
      rebuildNavigation();
      updateCamera();
    },
    renderAfterLoad: () => {
      seedDungeonZone({ forcePopulateMobs: false, migrateLegacyPositions: true });
      renderPanelsAfterLoad();
      updateCamera();
    }
  });

  function loadCharacterSaveById(charId){
    const saveRow = readSaveDataByCharId(charId);
    if (!saveRow?.raw) return false;
    const parsed = parseMaybeJSON(saveRow.raw);
    const hasDungeonZoneSave = !!(parsed && typeof parsed === "object" && parsed?.zones?.dungeon);

    setActiveCharacterId(charId);
    const profile = getStoredCharacterProfile(charId);
    applyCharacterProfileToPlayer(profile);

    closeLoadCharOverlay();
    closeStartOverlay();
    charOverlay.style.display = "none";
    deserialize(saveRow.raw);
    seedDungeonZone({ forcePopulateMobs: !hasDungeonZoneSave, migrateLegacyPositions: true });
    refreshStartOverlay();
    chatLine(`<span class="good">Loaded ${profile?.name ?? "character"}'s save.</span>`);
    return true;
  }

  if (startContinueBtn){
    startContinueBtn.onclick = () => {
      const activeId = getActiveCharacterId();
      if (!activeId || !loadCharacterSaveById(activeId)){
        refreshStartOverlay();
        return chatLine(`<span class="warn">No save found.</span>`);
      }
    };
  }

  document.getElementById("saveBtn").onclick=()=>{
    saveCharacterPrefs({ createNew: false });
    writeStoredValue(getCurrentSaveKey(), serialize());
    refreshStartOverlay();
    const profile = getStoredCharacterProfile();
    chatLine(`<span class="good">Saved ${profile?.name ?? "character"}.</span>`);
  };

  /**
   * Show townboarding modal if not yet seen
   */
  function checkAndShowTownboardingModal() {
    if (townboardingOverlay && !player._hasSeenTownOnboarding) {
      townboardingOverlay.style.display = "flex";
      player._hasSeenTownOnboarding = true;
    }
  }

  /**
   * Close townboarding modal
   */
  function closeTownboardingModal() {
    if (townboardingOverlay) {
      townboardingOverlay.style.display = "none";
    }
  }

  // Townboarding modal button handler
  if (townboardingBtn) {
    townboardingBtn.onclick = () => {
      closeTownboardingModal();
    };
  }

  document.getElementById("loadBtn").onclick=()=>{
    openLoadCharacterOverlay((charId) => {
      if (!loadCharacterSaveById(charId)){
        chatLine(`<span class="warn">No save found for that character.</span>`);
      }
    });
  };
  document.getElementById("resetBtn").onclick=()=>{
    removeStoredValue(getCurrentSaveKey());
    refreshStartOverlay();
    const profile = getStoredCharacterProfile();
    chatLine(`<span class="warn">Cleared save for ${profile?.name ?? "active character"}.</span>`);
    openStartOverlay();
  };

  const { mountDebugApi } = createDebugAPI({
    debugApiEnabled: DEBUG_API_ENABLED,
    testMode: TEST_MODE,
    getActiveZone,
    inv,
    wallet,
    player,
    mobs,
    resources,
    interactables,
    groundLoot,
    windowsOpen,
    overworldLadderDown: OVERWORLD_LADDER_DOWN,
    dungeonLadderUp: DUNGEON_LADDER_UP,
    startNewGame,
    setCurrentZone,
    defaultSpawnForZone,
    teleportPlayerTo,
    updateCamera,
    inBounds,
    getEntityAt,
    beginInteraction,
    useLadder,
    saveCharacterPrefs,
    getCurrentSaveKey,
    serialize,
    deserialize,
    getQuestSnapshot,
    emitQuestEvent: trackQuestEvent,
    clamp,
    update,
    render
  });

  // ---------- Background Music ----------
  const bgm = document.getElementById("bgm");
  const musicToggle = document.getElementById("musicToggle");
  const musicVol = document.getElementById("musicVol");
  const musicVolLabel = document.getElementById("musicVolLabel");

  const bgmState = (() => {
    const d = { on:false, vol:0.25 };
    const s = readStoredJSON(BGM_KEY, null);
    if (!s || typeof s !== "object") return d;
    if (typeof s.on === "boolean") d.on = s.on;
    if (typeof s.vol === "number") d.vol = clamp(s.vol, 0, 1);
    return d;
  })();

  function saveBgmState(){
    writeStoredJSON(BGM_KEY, bgmState);
  }

  function updateBgmUI(){
    if (musicToggle) musicToggle.checked = !!bgmState.on;
    if (musicVol) musicVol.value = String(Math.round(bgmState.vol * 100));
    if (musicVolLabel) musicVolLabel.textContent = `${Math.round(bgmState.vol * 100)}%`;
  }

  function tryPlayBgm(){
    if (!bgm || !bgmState.on) return;
    bgm.volume = clamp(bgmState.vol, 0, 1);
    const p = bgm.play();
    if (p && typeof p.catch === "function") p.catch(()=>{});
  }

  function applyBgm(){
    if (!bgm) return;
    bgm.volume = clamp(bgmState.vol, 0, 1);
    if (bgmState.on) tryPlayBgm();
    else bgm.pause();
  }

  function findInteractableIndexInRange(type, rangeTiles = 1.1, predicate = null){
    for (let i = 0; i < interactables.length; i++){
      const it = interactables[i];
      if (it.type !== type) continue;
      if (predicate && !predicate(it)) continue;
      if (inRangeOfTile(it.x, it.y, rangeTiles)) return i;
    }
    return -1;
  }

  function updateStationAvailability(){
    availability.bank = findInteractableIndexInRange("bank") >= 0;
    updateBankIcon();

    const vendorIndex = findInteractableIndexInRange("vendor");
    availability.vendor = vendorIndex >= 0;
    availability.vendorInRangeIndex = vendorIndex;
    updateVendorIcon();
    if (windowsOpen.vendor && !availability.vendor){
      closeWindow("vendor");
    }

    availability.smithing = findInteractableIndexInRange("anvil") >= 0;
    if (windowsOpen.smithing && !availability.smithing){
      closeWindow("smithing");
    }

    availability.blacksmith = findInteractableIndexInRange(
      "quest_npc",
      1.1,
      (it) => String(it.npcId || "") === "blacksmith_torren"
    ) >= 0;
    if (windowsOpen.blacksmith && !availability.blacksmith){
      closeWindow("blacksmith");
    }
  }

  function expireCampfiresAndPruneLoot(t){
    for (let i = interactables.length - 1; i >= 0; i--){
      const it = interactables[i];
      if (it.type !== "fire" || !it.expiresAt || t < it.expiresAt) continue;
      interactables.splice(i, 1);
      // Keep loot pruning behavior aligned with existing fire-expiry flow.
      pruneExpiredGroundLoot();
    }
  }

  updateBgmUI();
  applyBgm();

  if (musicToggle){
    musicToggle.addEventListener("change", () => {
      bgmState.on = musicToggle.checked;
      saveBgmState();
      applyBgm(); // the click counts as a user gesture (helps autoplay rules)
    });
  }

  if (musicVol){
    musicVol.addEventListener("input", () => {
      bgmState.vol = clamp((musicVol.value|0)/100, 0, 1);
      saveBgmState();
      if (musicVolLabel) musicVolLabel.textContent = `${Math.round(bgmState.vol * 100)}%`;
      if (bgm) bgm.volume = bgmState.vol;
      if (bgmState.on) tryPlayBgm();
    });
  }

  // If music was enabled previously, start it on the first user action (browser autoplay rules)
  function unlockBgmOnce(){ tryPlayBgm(); }
  window.addEventListener("pointerdown", unlockBgmOnce, { once:true });
  window.addEventListener("keydown", unlockBgmOnce, { once:true });

  // Optional: pause when tab is hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (!bgm) return;
    if (document.hidden) bgm.pause();
    else if (bgmState.on) tryPlayBgm();
  });

  // ---------- Loop ----------
  let last=now();

  function update(dt){
    const t=now();

    // respawns
    for (const r of resources){
      if (!r.alive && r.respawnAt && t>=r.respawnAt){ r.alive=true; r.respawnAt=0; }
    }
    for (const m of mobs){
      if (!m.alive && m.respawnAt && t>=m.respawnAt){
        m.alive = true;
        m.respawnAt = 0;
        if (Number.isFinite(m.homeX) && Number.isFinite(m.homeY)) {
          m.x = m.homeX | 0;
          m.y = m.homeY | 0;
        }
        m.hp = m.maxHp;
        m.target = null;
        m.provokedUntil = 0;
        m.aggroUntil = 0;
        m.attackCooldownUntil = 0;
        m.moveCooldownUntil = 0;
        const c = tileCenter(m.x, m.y);
        m.px = c.cx;
        m.py = c.cy;
      }
    }

    // Keep player tile clear of mobs at tick start.
    for (let i=0; i<mobs.length; i++){
      const m = mobs[i];
      if (!m.alive) continue;
      const playerTargetingThis = (player.target?.kind === "mob" && player.target.index === i);
      const mobInCombat = (m.target === "player");
      if (m.x === player.x && m.y === player.y && (mobInCombat || playerTargetingThis)){
        pushMobOffPlayerTile(m);
      }
    }
    // expire campfires + associated ground-loot pruning
    expireCampfiresAndPruneLoot(t);

    // Station windows and availability are range-gated each tick.
    updateStationAvailability();

    // Check town project builds every tick
    tickProjectBuilds(t);



    // action completion
    if (player.action.type!=="idle" && t>=player.action.endsAt){
      const done=player.action.onComplete;
      player.action={type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
      if (typeof done==="function") done();
      if (player.target) ensureWalkIntoRangeAndAct();
    }

    // particles during chop/mine
    if (player.target && (player.action.type==="woodcut" || player.action.type==="mine")){
      const pct=actionProgress();
      if (pct>0.45 && pct<0.55){
        const tt=player.target;
        if (tt.kind==="res"){
          const r=resources[tt.index];
          if (r?.alive){
            if (!player._sparked){
              player._sparked = true;
              spawnGatherParticles(player.action.type==="woodcut" ? "wood" : "rock", r.x, r.y);
            }
          }
        }
      }
      if (pct>0.60) player._sparked = false;
    } else {
      player._sparked = false;
    }

    // movement
    if (player.path && player.path.length){
      const next=player.path[0];
      const {cx,cy}=tileCenter(next.x,next.y);
      const d=dist(player.px,player.py,cx,cy);
      if (d<1){
        const meleeTarget = (
          player.target?.kind === "mob" &&
          getCombatStyle() === "melee"
        ) ? mobs[player.target.index] : null;

        if (meleeTarget?.alive && next.x === meleeTarget.x && next.y === meleeTarget.y){
          // Combat-only safety net: never step onto your active melee target tile.
          player.path = [];
        } else {
          player.path.shift();
          const dx = next.x - player.x;
          const dy = next.y - player.y;
          if (dx || dy){ player.facing.x=clamp(dx,-1,1); player.facing.y=clamp(dy,-1,1); }
          player.x=next.x; player.y=next.y;
        }
      } else {
        const vx=(cx-player.px)/d;
        const vy=(cy-player.py)/d;
        const step=player.speed*dt;
        player.px += vx*Math.min(step,d);
        player.py += vy*Math.min(step,d);
      }
      if (player.target && (!player.path.length || inRangeOfCurrentTarget())) ensureWalkIntoRangeAndAct();
    } else {
      syncPlayerPix();
      if (player.target) ensureWalkIntoRangeAndAct();
    }
    // mobs: aggro + move + attack
    updateDungeonQuestTriggers();
    updateMobsAI(dt);
    if (player.hp <= 0) handlePlayerDeath();


    // auto-loot ground piles when in range
    attemptAutoLoot();

        updateFX();
    updateCamera();
    updateCoordsHUD();
    renderHPHUD();
    // Update town projects window if open
    if (windowsOpen.townProjects) renderTownProjectsUI();

  }

  function render(){
    const mouseWorldX = (mouse.x/VIEW_W)*viewWorldW() + camera.x;
    const mouseWorldY = (mouse.y/VIEW_H)*viewWorldH() + camera.y;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,VIEW_W,VIEW_H);

    ctx.setTransform(view.zoom,0,0,view.zoom, -camera.x*view.zoom, -camera.y*view.zoom);

    drawMap();
    drawDungeonDecor();
    drawResources();
    drawInteractables();
    drawMobs();
    drawLootMarkers();
    drawFX();
    drawPlayer();

    if (player.target){
      let tx,ty;
      if (player.target.kind==="res"){
        const r=resources[player.target.index];
        if (r?.alive){ tx=r.x; ty=r.y; }
      } else if (player.target.kind==="mob"){
        const m=mobs[player.target.index];
        if (m?.alive){ tx=m.x; ty=m.y; }
      } else if (
        player.target.kind==="bank" ||
        player.target.kind==="vendor" ||
        player.target.kind==="quest_npc" ||
        player.target.kind==="sealed_gate" ||
        player.target.kind==="brazier" ||
        player.target.kind==="ladder_down" ||
        player.target.kind==="ladder_up"
      ){
        const b=interactables[player.target.index];
        if (b){ tx=b.x; ty=b.y; }
      }

      if (tx!==undefined){
        ctx.strokeStyle="rgba(251,191,36,.9)";
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(tx*TILE+TILE/2, ty*TILE+TILE/2, 14, 0, Math.PI*2);
        ctx.stroke();
        ctx.lineWidth=1;
      }
    }

    drawHover(mouseWorldX, mouseWorldY, mouse.x, mouse.y);

    ctx.setTransform(1,0,0,1,0,0);
    drawMinimap();
    xpOrbs.draw();

    // ========== DEBUG OVERLAY ==========
    if (showDebugOverlay) {
      const activeZone = (typeof getActiveZone === "function") ? getActiveZone() : "unknown";
      const zoneState = (typeof getZoneState === "function") ? getZoneState(activeZone) : null;
      const interactablesArray = (zoneState && zoneState.interactables) || interactables || [];
      const projectNpcCount = interactablesArray.filter(it => it?.type === "project_npc").length;
      const projectNpcIds = interactablesArray.filter(it => it?.type === "project_npc").map(it => it?.npcId).join(", ");
      const totalCount = interactablesArray.length;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, 10, 350, 120);
      
      ctx.fillStyle = "#FBF124";
      ctx.font = "bold 14px monospace";
      ctx.fillText("[DEBUG OVERLAY - F9 to toggle]", 15, 30);
      
      ctx.font = "12px monospace";
      ctx.fillStyle = "#FFF";
      ctx.fillText(`Zone: ${activeZone}`, 15, 50);
      ctx.fillText(`Total Interactables: ${totalCount}`, 15, 68);
      ctx.fillText(`Project NPCs: ${projectNpcCount}`, 15, 86);
      ctx.fillText(`NPC IDs: ${projectNpcIds || "(none)"}`, 15, 104);
      
      ctx.restore();
    }
  }

  function loop(){
    const t=now();
    const dt=clamp((t-last)/1000, 0, 0.05);
    last=t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ========== DEBUG OVERLAY (F9 TOGGLE) ==========
  let showDebugOverlay = false;
  document.addEventListener("keydown", (e) => {
    if (e.key === "F9" || e.code === "F9") {
      e.preventDefault();
      showDebugOverlay = !showDebugOverlay;
      console.log(`[DEBUG] Overlay toggled: ${showDebugOverlay ? "ON" : "OFF"}`);
    }
  });

  // ---------- Boot ----------
  function bootstrap(){
initWorldSeed();

    // Initialize town system modules with game callbacks
    initTownSystem({ chatLine, now, checkProjectUnlocks });
    initProjectsSystem({
      getTownRenown,
      spendGold,
      chatLine,
      now,
      applyProjectBenefit,
      ensureInteractable,
      SMITHING_BANK_TILE,
      getHearthCampTile: getHearthCampCauldronTile
    });
    initDonationSystem({
      getTownRenown,
      grantTownRenown,
      spendGold,
      chatLine
    });

    // Update decor lookup after projects system is ready (in case they were loaded from save)
    getDecorAt = reinitializeDecorLookup();

    ensureCharacterMigration();
    getActiveCharacterId();

    loadChatUI();
    applyChatUI();

    loadWindowsUI();
    applyWindowVis();

    loadMeleeTraining();
    renderMeleeTrainingUI();

    const savedChar = loadCharacterPrefs();
    if (savedChar?.class && CLASS_DEFS[savedChar.class]) player.class = savedChar.class;
    player.color = CLASS_DEFS[player.class]?.color ?? player.color;
    if (savedChar?.name) player.name = String(savedChar.name).slice(0,14);

    startNewGame();
    mountDebugApi();

    // If station windows are open in UI state, ensure they close until in range.
    if (windowsOpen.bank && !availability.bank) windowsOpen.bank = false;
    if (windowsOpen.smithing && !availability.smithing) windowsOpen.smithing = false;
    if (windowsOpen.blacksmith && !availability.blacksmith) windowsOpen.blacksmith = false;
    applyWindowVis();

    if (TEST_MODE) {
      closeStartOverlay();
      if (charOverlay) charOverlay.style.display = "none";
      if (loadCharOverlay) loadCharOverlay.style.display = "none";
    } else {
      openStartOverlay();
    }

    renderPanelsOnBootstrap();

    if (!TEST_MODE) {
      chatLine(`<span class="muted">Tip:</span> Talk to Quartermaster Bryn in the starter castle to begin your first quest.`);
      chatLine(`<span class="muted">Tip:</span> Rat training packs are now south of the river. Cross a bridge to reach them early.`);
      chatLine(`<span class="muted">Tip:</span> The vendor is inside the shop east of the starter castle.`);
      chatLine(`<span class="muted">Tip:</span> Loot auto-picks up when you stand near it. If full, items stay on the ground.`);
      chatLine(`<span class="muted">Fletching:</span> Right-click <b>Knife</b> -> Use, then click a <b>Log</b> to fletch arrows into your quiver.`);
    }
  }

  // ---------- Bank icon initialization ----------
  updateBankIcon();

  // Expose renown functions for debug API
  const _grantQuestRenownImpl = grantQuestRenown;
  const _grantWardenDefeatRenownImpl = grantWardenDefeatRenown;

  // ========== DEBUG WINDOW (PASS 1 & PASS 2) ==========
  window.debugRenown = {
    grant: (amount) => grantTownRenown("rivermoor", amount | 0, "[debug]"),
    check: () => {
      const towns = getTownsRef();
      return {
        renown: towns.rivermoor.renown,
        milestones: { ...towns.rivermoor.milestones }
      };
    },
    reset: () => {
      resetTownState();
      chatLine("<span class=\"muted\">[debug] Renown reset to 0</span>");
    },
    // PASS 2: Quest renown testing
    completeQuest: (questId) => {
      const success = completeQuest(questId);
      if (success) {
        chatLine(`<span class="muted">[debug] Quest ${questId} completed</span>`);
      } else {
        chatLine(`<span class="warn">[debug] Failed to complete quest ${questId}</span>`);
      }
      return success;
    },
    checkQuestRenown: () => ({ ...renownGrants.quests }),
    resetQuestRenown: () => {
      renownGrants.quests = {};
      chatLine("<span class=\"muted\">[debug] Quest renown grants reset</span>");
    },
    grantQuestRenown: (questId) => {
      const success = _grantQuestRenownImpl(questId);
      if (success) {
        chatLine(`<span class="muted">[debug] Quest renown granted for ${questId}</span>`);
      } else {
        chatLine(`<span class="warn">[debug] Quest renown already granted or unknown quest</span>`);
      }
      return success;
    },
    // PASS 3: Warden defeat testing
    grantWardenDefeat: () => {
      const success = _grantWardenDefeatRenownImpl();
      if (success) {
        chatLine(`<span class="muted">[debug] Warden defeat renown granted</span>`);
      } else {
        chatLine(`<span class="warn">[debug] Warden renown already granted or in cooldown</span>`);
      }
      return success;
    },
    checkWardenDefeat: () => ({ ...renownGrants.wardens }),
    resetWardenDefeat: () => {
      renownGrants.wardens = {};
      chatLine("<span class=\"muted\">[debug] Warden defeat tracking reset</span>");
    },
    // PASS 4A: Town projects testing
    fundDock: () => {
      const result = fundTownProject("rivermoor", "dock");
      if (result.success) {
        chatLine(`<span class="good">[debug] Dock project funded! Building...</span>`);
      } else {
        chatLine(`<span class="warn">[debug] Dock funding failed: ${result.reason}</span>`);
      }
      return result;
    },
    projectState: () => {
      const state = getProjectState("rivermoor", "dock");
      const proj = getProjectsRef()?.rivermoor?.dock;
      return {
        state,
        fundedAt: proj?.fundedAt || 0,
        completedAt: proj?.completedAt || 0,
        buildTimeMs: proj?.buildTimeMs || 15000
      };
    },
    resetProjects: () => {
      resetProjectState();
      chatLine("<span class=\"muted\">[debug] Projects reset to locked</span>");
    },
    // PASS 5B: Town projects UI
    openProjectsUI: () => {
      openWindow("townProjects");
      chatLine("<span class=\"muted\">[debug] Town Projects window opened</span>");
    },
    // Debug: inspect interactables
    getInteractables: (filter = {}) => {
      const { type, x, y } = filter;
      let results = interactables;
      if (type) results = results.filter(i => i.type === type);
      if (x !== undefined) results = results.filter(i => i.x === x);
      if (y !== undefined) results = results.filter(i => i.y === y);
      return results;
    },
    // Debug: add items to inventory for testing
    addItem: (itemId, qty = 1) => {
      const added = addToInventory(itemId, qty | 0);
      chatLine(`<span class="muted">[debug] Added ${added}x ${itemId} to inventory</span>`);
      return added;
    },
    // Debug: Load full test loadout (items + gold + renown for all projects)
    testLoadout: () => {
      chatLine(`<span class="good">[debug] Test loadout starting...</span>`);
      
      // Directly add items to bank by finding slots
      try {
        // Clear bank first
        for (let i = 0; i < bank.length; i++) {
          bank[i] = null;
        }
        
        // Add logs
        bank[0] = { id: 'log', qty: 100 };
        chatLine(`<span class="muted">[debug] Added 100 logs</span>`);
        
        // Add iron bars  
        bank[1] = { id: 'iron_bar', qty: 15 };
        chatLine(`<span class="muted">[debug] Added 15 iron bars</span>`);
        
        // Add cooked food
        bank[2] = { id: 'cooked_rat_meat', qty: 15 };
        chatLine(`<span class="muted">[debug] Added 15 cooked food</span>`);
        
        // Add crude bars
        bank[3] = { id: 'crude_bar', qty: 5 };
        chatLine(`<span class="muted">[debug] Added 5 crude bars</span>`);
        
        // Add gold
        wallet.gold = 2000;
        chatLine(`<span class="muted">[debug] Set gold to 2000</span>`);
        
        // Add renown
        grantTownRenown("rivermoor", 70, "[debug testLoadout]");
        chatLine(`<span class="muted">[debug] Added 70 renown</span>`);
        
        // Open bank and render
        openWindow("bank");
        renderBank();
        
        chatLine(`<span class="good">[debug] Test loadout complete!</span>`);
        return true;
      } catch (e) {
        chatLine(`<span class="warn">[debug] ERROR: ${e.message}</span>`);
        console.error(e);
        return false;
      }
    },
    // Debug: complete First Watch, set combat skills to 15, equip iron gear
    firstWatchIron15: () => {
      const completed = completeQuest("first_watch");
      const targetXp = xpForLevel(15);
      const combatSkills = ["health", "accuracy", "power", "defense", "ranged", "sorcery"];
      for (const key of combatSkills) {
        if (Skills[key]) Skills[key].xp = targetXp;
      }
      recalcMaxHPFromHealth();
      player.hp = player.maxHp;
      renderSkills();
      renderHPHUD();

      const equipItem = (itemId) => {
        addToInventory(itemId, 1);
        const idx = inv.findIndex(s => s && s.id === itemId);
        if (idx >= 0) equipFromInv(idx);
      };

      equipItem("iron_helm");
      equipItem("iron_body");
      equipItem("iron_legs");
      equipItem("iron_shield");
      equipItem("iron_sword");
      renderInventoryAndEquipment();
      return completed;
    }
  };
  // ========== DEBUG WINDOW (PASS 1, PASS 2, PASS 3, PASS 4) ==========

  bootstrap();
  loop();

})();


