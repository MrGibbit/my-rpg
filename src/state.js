import { W, H, RIVER_Y, ZOOM_DEFAULT } from "./config.js";

export const camera = { x: 0, y: 0 };
export const view = { zoom: ZOOM_DEFAULT };

// ---------- Map ----------
// 0 grass (walkable), 1 water (blocked), 2 cliff (blocked), 3 stone floor (walkable), 4 wall (blocked), 5 path/bridge (walkable)
export const map = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map[y][x] = 0;

for (let x = 2; x < W - 2; x++) { map[RIVER_Y][x] = 1; map[RIVER_Y + 1][x] = 1; }

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
export const southKeep = stampCastle(44, 30, 12, 8);

function hash01(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function paintPath(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const t = map[y][x];
  if (t === 0 || t === 5) map[y][x] = 5;
}

function carvePathSegment(x0, y0, x1, y1, seed) {
  let x = x0 | 0;
  let y = y0 | 0;
  let step = 0;
  let lastAxis = 0; // 1 = x, 2 = y

  while (true) {
    paintPath(x, y);

    if (x === x1 && y === y1) break;

    const dx = x1 - x;
    const dy = y1 - y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    // Very light width variation so roads remain mostly straight/readable.
    if (hash01(x, y, seed + 17 + step) < 0.03) {
      if (ax >= ay) {
        const sideY = hash01(x, y, seed + 23 + step) < 0.5 ? -1 : 1;
        paintPath(x, y + sideY);
      } else {
        const sideX = hash01(x, y, seed + 29 + step) < 0.5 ? -1 : 1;
        paintPath(x + sideX, y);
      }
    }

    if (ax && ay) {
      // Strongly bias toward the dominant axis to reduce zig-zag.
      const r = hash01(x, y, seed + step);
      let pickX;
      if (ax > ay) pickX = (r < 0.92);
      else if (ay > ax) pickX = (r < 0.08);
      else if (lastAxis === 1) pickX = (r < 0.72);
      else if (lastAxis === 2) pickX = (r < 0.28);
      else pickX = (r < 0.5);

      if (pickX) {
        x += Math.sign(dx);
        lastAxis = 1;
      } else {
        y += Math.sign(dy);
        lastAxis = 2;
      }
    } else if (ax) {
      x += Math.sign(dx);
      lastAxis = 1;
    } else if (ay) {
      y += Math.sign(dy);
      lastAxis = 2;
    }

    step++;
    if (step > W * H * 4) break;
  }
}

function carvePathPolyline(points, seed) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    carvePathSegment(a.x, a.y, b.x, b.y, seed + i * 97);
  }
}

const northGate = { x: startCastle.gateX, y: startCastle.gateY };
const southGate = { x: southKeep.gateX, y: southKeep.gateY + 2 };

// Starter castle -> north bridge approach.
carvePathPolyline([
  { x: northGate.x, y: northGate.y },
  { x: 8, y: RIVER_Y - 1 }
], 11);

// North main road (mostly straight with a gentle bend near the bridge approach).
carvePathPolyline([
  { x: 8, y: RIVER_Y - 1 },
  { x: 14, y: RIVER_Y - 2 },
  { x: 36, y: RIVER_Y - 2 },
  { x: 42, y: RIVER_Y - 3 }
], 29);

// North road -> south bridge approach.
carvePathPolyline([
  { x: 42, y: RIVER_Y - 3 },
  { x: 42, y: RIVER_Y - 1 }
], 47);

// South bridge -> south keep road.
carvePathPolyline([
  { x: 42, y: RIVER_Y + 2 },
  { x: 42, y: southGate.y - 2 },
  { x: 43, y: southGate.y - 1 },
  { x: 42, y: southGate.y }
], 71);

// South keep approach.
carvePathPolyline([
  { x: 42, y: southGate.y },
  { x: 49, y: southGate.y },
  { x: southGate.x, y: southGate.y }
], 89);

// Fixed single-width bridge lanes over water.
for (const bx of [8, 42]) {
  map[RIVER_Y][bx] = 5;
  map[RIVER_Y + 1][bx] = 5;
}

// Extra tie-in tiles around each bridge mouth.
for (const bx of [8, 42]) {
  paintPath(bx, RIVER_Y - 1);
  paintPath(bx, RIVER_Y + 2);
}

// ---------- Skills ----------
export const Skills = {
  accuracy: { name: "Accuracy", xp: 0 },
  power: { name: "Power", xp: 0 },
  defense: { name: "Defense", xp: 0 },
  ranged: { name: "Ranged", xp: 0 },
  sorcery: { name: "Sorcery", xp: 0 },
  health: { name: "Health", xp: 0 },
  fletching: { name: "Fletching", xp: 0 },
  woodcutting: { name: "Woodcutting", xp: 0 },
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
