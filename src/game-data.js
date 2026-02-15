export const COOK_RECIPES = {
  rat_meat: { out: "cooked_rat_meat", xp: 12, verb: "cook some meat" },
  goldfish: { out: "goldfish_cracker", xp: 12, verb: "cook a gold fish cracker" },
};

export const CLASS_DEFS = {
  Warrior: { color: "#ef4444" },
  Ranger: { color: "#facc15" },
  Mage: { color: "#22d3ee" },
};

export const MOB_DEFS = {
  rat: {
    name: "Rat",
    hp: 8,
    levels: { accuracy: 1, power: 1, defense: 1, ranged: 1, sorcery: 1, health: 1 },
    aggroOnSight: false,
    moveSpeed: 140,
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
    aggroRange: 4.4,
    leash: 8.0,
    attackRange: 1.15,
    attackSpeedMs: 1500,
    maxHit: 2
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
  { id: "sword", price: 60, bulk: [1] },
  { id: "shield", price: 60, bulk: [1] },
  { id: "bow", price: 75, bulk: [1] }
];

export const DEFAULT_MOB_LEVELS = {
  accuracy: 1,
  power: 1,
  defense: 1,
  ranged: 1,
  sorcery: 1,
  health: 1
};
