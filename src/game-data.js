// ========== RIVERMOOR RENOWN SYSTEM ==========
export const RENOWN_SOURCES = {
  FIRST_QUEST: 20,
  SECOND_QUEST: 20,
  FIRST_WARDEN_KILL: 20,
  WARDEN_KILL_SUBSEQUENT: 1,
  PROJECT_COMPLETION: 10,
  GOLD_DONATION_PER_100: 0       // Gold donations do NOT grant renown (removed to prevent farming)
};

// Rivermoor tutorial cap is 70 renown
export const RENOWN_MILESTONES = {
  10: "Mayor watches",
  25: "Dock available",
  50: "Storage available",
  60: "Hearth available",
  70: "Flourishing"
};

export const QUEST_RENOWN_REWARDS = {
  first_watch: { townId: "rivermoor", amount: 20 },
  ashes_under_the_keep: { townId: "rivermoor", amount: 20 }
};

export const WARDEN_RENOWN_CONFIG = {
  skeleton_warden: { townId: "rivermoor", amount: 20, cooldownMs: 10 * 60 * 1000, firstKillOnly: true }
};

// ========== RIVERMOOR PROJECT DONATIONS SYSTEM ==========
// Each project requires specific items and gold. Donations drive tutorial progression.
export const PROJECT_REQUIREMENTS = {
  dock: {
    items: { log: 40, iron_bar: 5 },
    gold: 500
  },
  storage: {
    items: { log: 60, iron_bar: 10 },
    gold: 1000
  },
  hearth: {
    items: { cooked_food: 15, crude_bar: 5 },
    gold: 500
  }
};

/**
 * Check if an itemId matches a category requirement
 * Categories: "cooked_food" matches any item starting with "cooked_"
 */
export function isItemInCategory(itemId, category) {
  if (category === "cooked_food") {
    return String(itemId).startsWith("cooked_");
  }
  // Direct match for specific items
  return itemId === category;
}
// =========================================

export const COOK_RECIPES = {
  rat_meat: { out: "cooked_rat_meat", xp: 12, verb: "cook some meat" },
  goldfish: { out: "goldfish_cracker", xp: 12, verb: "cook a gold fish cracker" },
  clownfish: { out: "cooked_clownfish", xp: 16, verb: "cook a clownfish" },
  pufferfish: { out: "cooked_pufferfish", xp: 20, verb: "cook a pufferfish" },
  catfish: { out: "cooked_catfish", xp: 24, verb: "cook a catfish" },
  swordfish: { out: "cooked_swordfish", xp: 28, verb: "cook a swordfish" },
  anglerfish: { out: "cooked_anglerfish", xp: 34, verb: "cook an anglerfish" },
  moonfish: { out: "cooked_moonfish", xp: 40, verb: "cook a moonfish" },
  chaos_koi: { out: "cooked_chaos_koi", xp: 48, verb: "cook a chaos koi" },
};

export const CLASS_DEFS = {
  Warrior: { color: "#ef4444" },
  Ranger: { color: "#facc15" },
  Mage: { color: "#22d3ee" },
};

// Metal progression is centralized so adding new ore/bar tiers only requires
// adding rows to METAL_TIERS.
const METAL_TIER_MIN = 1;
const METAL_TIER_MAX = 90;

const MINING_XP_CURVE = {
  base: 40,
  top: 220,
  exponent: 1.35
};

const SMELTING_XP_CURVE = {
  base: 20,
  top: 160,
  exponent: 1.45
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function xpForTier(tier, curve) {
  const t = clamp(tier | 0, METAL_TIER_MIN, METAL_TIER_MAX);
  const pct = (t - METAL_TIER_MIN) / (METAL_TIER_MAX - METAL_TIER_MIN);
  return Math.round(curve.base + (curve.top - curve.base) * Math.pow(pct, curve.exponent));
}

export const METAL_TIERS = [
  {
    key: "crude",
    tier: 1,
    level: 1,
    resourceType: "rock",
    label: "rock",
    oreId: "ore",
    barId: "crude_bar"
  },
  {
    key: "iron",
    tier: 10,
    level: 10,
    resourceType: "iron_rock",
    label: "iron rock",
    oreId: "iron_ore",
    barId: "iron_bar"
  }
];

// Used by furnace smelting.
export const SMELTING_TIERS = METAL_TIERS.map((row) => ({
  oreId: row.oreId,
  barId: row.barId,
  level: row.level,
  tier: row.tier,
  xp: xpForTier(row.tier, SMELTING_XP_CURVE)
}));

// Used by mining resource interactions.
export const MINING_RESOURCE_RULES = Object.fromEntries(
  METAL_TIERS.map((row) => [
    row.resourceType,
    {
      oreId: row.oreId,
      level: row.level,
      tier: row.tier,
      xp: xpForTier(row.tier, MINING_XP_CURVE),
      label: row.label
    }
  ])
);

export const MOB_DEFS = {
  rat: {
    name: "Rat",
    hp: 8,
    levels: { accuracy: 1, power: 1, defense: 1, ranged: 1, sorcery: 1, health: 1 },
    aggroOnSight: false,
    moveSpeed: 140,
    dungeonRoamMinMs: 2800,
    dungeonRoamMaxMs: 4500,
    aggroRange: 4.0,
    leash: 7.0,
    attackRange: 1.15,
    attackSpeedMs: 1600,
    maxHit: 1
  },
  goblin: {
    name: "Goblin",
    hp: 14,
    levels: { accuracy: 4, power: 4, defense: 2, ranged: 1, sorcery: 1, health: 2 },
    aggroOnSight: false,
    moveSpeed: 145,
    dungeonRoamMinMs: 2800,
    dungeonRoamMaxMs: 4500,
    aggroRange: 4.4,
    leash: 8.0,
    attackRange: 1.15,
    attackSpeedMs: 1500,
    maxHit: 2
  },
  skeleton: {
    name: "Skeleton",
    hp: 22,
    levels: { accuracy: 8, power: 8, defense: 4, ranged: 1, sorcery: 1, health: 4 },
    aggroOnSight: false,
    moveSpeed: 138,
    aggroRange: 4.2,
    leash: 8.5,
    attackRange: 1.15,
    attackSpeedMs: 1700,
    maxHit: 3
  },
  skeleton_warden: {
    name: "Skeleton Warden",
    hp: 72,
    levels: { accuracy: 17, power: 17, defense: 14, ranged: 1, sorcery: 1, health: 12 },
    aggroOnSight: true,
    moveSpeed: 132,
    aggroRange: 14.5,
    leash: 14.5,
    attackRange: 1.2,
    attackSpeedMs: 1600,
    maxHit: 6
  }
};

export const VENDOR_SELL_MULT = 0.5;

export const DEFAULT_VENDOR_STOCK = [
  { id: "wooden_arrow", price: 1, bulk: [1, 10, 50] },
  { id: "log", price: 2, bulk: [1, 5] },
  { id: "ore", price: 3, bulk: [1, 5] },
  { id: "bone", price: 1, bulk: [1, 5] },
  { id: "axe", price: 25, bulk: [1] },
  { id: "pick", price: 25, bulk: [1] },
  { id: "hammer", price: 5, bulk: [1] },
  { id: "staff", price: 45, bulk: [1] },
  { id: "crude_sword", price: 60, bulk: [1] },
  { id: "crude_shield", price: 60, bulk: [1] },
  { id: "bow", price: 75, bulk: [1] }
];

// These items can be sold to the vendor but are not shown in the buy stock.
// Values are base prices before VENDOR_SELL_MULT is applied.
export const DEFAULT_VENDOR_SELL_ONLY_PRICES = {
  crude_bar: 6,
  iron_bar: 12,
  crude_dagger: 12,
  crude_sword: 24,
  crude_shield: 24,
  crude_helm: 14,
  crude_legs: 18,
  crude_body: 26,
  iron_dagger: 24,
  iron_sword: 42,
  iron_shield: 44,
  iron_helm: 28,
  iron_legs: 34,
  iron_body: 52,
  bone_meal: 8
};

export const DEFAULT_MOB_LEVELS = {
  accuracy: 1,
  power: 1,
  defense: 1,
  ranged: 1,
  sorcery: 1,
  health: 1
};

export const QUEST_DEFS = [
  {
    id: "first_watch",
    name: "First Watch",
    giverNpcId: "quartermaster",
    summary: "Prove you can survive outside the keep.",
    requirements: [],
    objectives: [
      { id: "chop_log", label: "Chop logs", type: "gather_item", itemId: "log", target: 3 },
      { id: "mine_ore", label: "Mine ore", type: "gather_item", itemId: "ore", target: 3 },
      { id: "cook_food", label: "Cook food", type: "cook_any", target: 2 },
      { id: "smelt_bar", label: "Smelt crude bars", type: "smelt_item", itemId: "crude_bar", target: 3 },
      { id: "slay_rat", label: "Defeat rats", type: "kill_mob", mobType: "rat", target: 2 },
      { id: "report_quartermaster", label: "Report to Quartermaster", type: "talk_npc", npcId: "quartermaster", target: 2 }
    ],
    rewards: [
      "Warden Key Fragment",
      "150 Gold",
      "XP Lamp (100 XP)"
    ]
  },
  {
    id: "ashes_under_the_keep",
    name: "Ashes Under the Keep",
    giverNpcId: "quartermaster",
    summary: "Descend into the old halls and challenge the Warden.",
    requirements: [
      { type: "quest_complete", questId: "first_watch", label: "Complete First Watch" }
    ],
    objectives: [
      { id: "briefing", label: "Receive briefing from Quartermaster", type: "talk_npc", npcId: "quartermaster", target: 1 },
      { id: "enter_wing", label: "Enter the sealed wing", type: "manual", target: 1 },
      { id: "light_brazier", label: "Light dead braziers", type: "manual", target: 2 },
      { id: "defeat_warden", label: "Defeat the Skeleton Warden", type: "kill_mob", mobType: "skeleton_warden", target: 1 }
    ],
    rewards: [
      "Warden's Brand",
      "350 Gold"
    ]
  }
];
