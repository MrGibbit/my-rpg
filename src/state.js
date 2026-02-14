import { W, H, RIVER_Y, ZOOM_DEFAULT } from "./config.js";

export const camera = { x: 0, y: 0 };
export const view = { zoom: ZOOM_DEFAULT };

// ---------- Map ----------
// 0 grass (walkable), 1 water (blocked), 2 cliff (blocked), 3 stone floor (walkable), 4 wall (blocked), 5 path/bridge (walkable)
export const map = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map[y][x] = 0;

for (let x = 2; x < W - 2; x++) { map[RIVER_Y][x] = 1; map[RIVER_Y + 1][x] = 1; }
for (const bx of [7, 8, 42, 43]) { map[RIVER_Y][bx] = 5; map[RIVER_Y + 1][bx] = 5; }

function stampCastle(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const edge = (x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1);
      map[y][x] = edge ? 4 : 3;
    }
  }
  const gateX = x0 + Math.floor(w / 2);
  const gateY = y0 + h - 1;
  map[gateY][gateX] = 5;
  map[gateY + 1][gateX] = 5;
  map[gateY + 2][gateX] = 5;
  return { gateX, gateY, x0, y0, w, h };
}

export const startCastle = stampCastle(2, 2, 12, 8);
for (let y = startCastle.gateY; y <= RIVER_Y + 1; y++) { map[y][startCastle.gateX] = 5; map[y][startCastle.gateX - 1] = 5; }
for (let x = Math.min(startCastle.gateX - 1, 7); x <= Math.max(startCastle.gateX, 8); x++) map[RIVER_Y - 1][x] = 5;
for (let y = RIVER_Y + 2; y < H - 2; y++) { map[y][8] = 5; }

for (let x = 8; x <= 42; x++) map[RIVER_Y - 3][x] = 5;
for (let y = RIVER_Y - 3; y <= RIVER_Y + 1; y++) map[y][42] = 5;

export const southKeep = stampCastle(44, 30, 12, 8);
for (let y = RIVER_Y + 2; y <= southKeep.gateY + 2; y++) map[y][42] = 5;
for (let x = 42; x <= southKeep.gateX; x++) map[southKeep.gateY + 2][x] = 5;

// ---------- Skills ----------
export const Skills = {
  accuracy: { name: "Accuracy", xp: 0 },
  power: { name: "Power", xp: 0 },
  defense: { name: "Defense", xp: 0 },
  ranged: { name: "Ranged", xp: 0 },
  sorcery: { name: "Sorcery", xp: 0 },
  health: { name: "Health", xp: 0 },
  fletching: { name: "Fletching", xp: 0 },
  woodcutting: { name: "Woodcut", xp: 0 },
  mining: { name: "Mining", xp: 0 },
  fishing: { name: "Fishing", xp: 0 },
  firemaking: { name: "Firemaking", xp: 0 },
  cooking: { name: "Cooking", xp: 0 },
};

export const lastSkillLevel = Object.create(null);
export const lastSkillXPMsgAt = Object.create(null);

// HP progression constants
export const BASE_HP = 30;
export const HP_PER_LEVEL = 2;

// ---------- Wallet / inventory / bank ----------
export const wallet = { gold: 0 };

export const MAX_INV = 28;
export const MAX_BANK = 56;
export const inv = Array.from({ length: MAX_INV }, () => null);
export const bank = Array.from({ length: MAX_BANK }, () => null);

// ---------- Quiver ----------
export const quiver = {
  wooden_arrow: 0
};

// ---------- Ground loot ----------
export const groundLoot = new Map();
export const manualDropLocks = new Map();
export const lootUi = {
  lastInvFullMsgAt: 0,
  lastInvFullMsgItem: null
};

// ---------- Equipment ----------
export const equipment = {
  weapon: null,
  offhand: null
};

// ---------- Melee Training selector ----------
export const meleeState = {
  selected: "accuracy"
};

// ---------- Entities ----------
export const resources = [];
export const mobs = [];
export const interactables = [];

// ---------- Persistent world seed ----------
export const worldState = {
  seed: 1337
};

// ---------- UI state ----------
export const availability = {
  bank: false,
  vendor: false,
  vendorInRangeIndex: -1,
  vendorTab: "buy"
};

// Open state: inventory + equipment can be open simultaneously.
export const windowsOpen = {
  inventory: false,
  equipment: false,
  skills: false,
  bank: false,
  settings: false,
  vendor: false,
};

export const useState = {
  activeItemId: null
};

export const characterState = {
  selectedClass: "Warrior"
};

export const chatUI = {
  left: 12,
  top: null,
  width: 420,
  height: 320,
  collapsed: false
};

export const gatherParticles = [];
export const combatFX = []; // {kind:"slash"|"arrow"|"bolt", x0,y0,x1,y1, born, life}

export const mouse = {
  x: 0,
  y: 0,
  seen: false
};

// ---------- Player ----------
export const player = {
  name: "Adventurer",
  class: "Warrior",
  color: "#ef4444",

  hp: BASE_HP,
  maxHp: BASE_HP,

  x: startCastle.x0 + 6,
  y: startCastle.y0 + 4,
  px: 0, py: 0,

  speed: 140,
  path: [],
  target: null, // {kind:"res"|"mob"|"bank", index}

  action: { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null },
  attackCooldownUntil: 0,
  invulnUntil: 0,

  facing: { x: 0, y: 1 },

  _sparked: false,
  _lastRangeMsgAt: 0
};
