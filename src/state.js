import { W, H, RIVER_Y, ZOOM_DEFAULT } from "./config.js";

export const camera = { x: 0, y: 0 };
export const view = { zoom: ZOOM_DEFAULT };

export const ZONE_KEYS = Object.freeze({
  OVERWORLD: "overworld",
  DUNGEON: "dungeon"
});

function makeTileMap(fill = 0) {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
}

function makeZoneWorld(fill = 0) {
  return {
    width: W,
    height: H,
    map: makeTileMap(fill),
    resources: [],
    mobs: [],
    interactables: [],
    groundLoot: new Map(),
    manualDropLocks: new Map()
  };
}

const zoneWorlds = {
  [ZONE_KEYS.OVERWORLD]: makeZoneWorld(0),
  [ZONE_KEYS.DUNGEON]: makeZoneWorld(4)
};

let activeZone = ZONE_KEYS.OVERWORLD;

function normalizeZoneKey(zoneKey) {
  if (zoneKey === ZONE_KEYS.OVERWORLD || zoneKey === ZONE_KEYS.DUNGEON) return zoneKey;
  return ZONE_KEYS.OVERWORLD;
}

function getZoneWorld(zoneKey = activeZone) {
  const key = normalizeZoneKey(zoneKey);
  return zoneWorlds[key] ?? zoneWorlds[ZONE_KEYS.OVERWORLD];
}

function bindToCollection(value, collection) {
  return (typeof value === "function") ? value.bind(collection) : value;
}

function makeArrayProxy(selectArray) {
  return new Proxy([], {
    get(_target, prop) {
      const arr = selectArray();
      return bindToCollection(arr[prop], arr);
    },
    set(_target, prop, value) {
      selectArray()[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in selectArray();
    },
    ownKeys() {
      return Reflect.ownKeys(selectArray());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(selectArray(), prop);
    },
    deleteProperty(_target, prop) {
      return delete selectArray()[prop];
    }
  });
}

function makeMapProxy(selectMap) {
  return new Proxy(new Map(), {
    get(_target, prop) {
      const m = selectMap();
      return bindToCollection(m[prop], m);
    },
    set(_target, prop, value) {
      selectMap()[prop] = value;
      return true;
    },
    has(_target, prop) {
      return prop in selectMap();
    },
    ownKeys() {
      return Reflect.ownKeys(selectMap());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(selectMap(), prop);
    }
  });
}

// ---------- Overworld map ----------
// 0 grass (walkable), 1 water (blocked), 2 cliff (blocked), 3 stone floor (walkable), 4 wall (blocked), 5 path/bridge (walkable)
const overworldMap = zoneWorlds[ZONE_KEYS.OVERWORLD].map;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    overworldMap[y][x] = 0;
  }
}

for (let x = 2; x < W - 2; x++) {
  overworldMap[RIVER_Y][x] = 1;
  overworldMap[RIVER_Y + 1][x] = 1;
}

function stampCastle(tileMap, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const edge = (x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1);
      tileMap[y][x] = edge ? 4 : 3;
    }
  }
  const gateX = x0 + Math.floor(w / 2);
  const gateY = y0 + h - 1;
  tileMap[gateY][gateX] = 5;
  tileMap[gateY + 1][gateX] = 5;
  tileMap[gateY + 2][gateX] = 5;
  return { gateX, gateY, x0, y0, w, h };
}

export const startCastle = stampCastle(overworldMap, 2, 2, 12, 8);
export const vendorShop = stampCastle(overworldMap, 16, 3, 8, 6);
export const southKeep = stampCastle(overworldMap, 44, 30, 12, 8);

function hash01(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function paintPath(tileMap, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const t = tileMap[y][x];
  if (t === 0 || t === 5) tileMap[y][x] = 5;
}

function carvePathSegment(tileMap, x0, y0, x1, y1, seed) {
  let x = x0 | 0;
  let y = y0 | 0;
  let step = 0;
  let lastAxis = 0; // 1 = x, 2 = y

  while (true) {
    paintPath(tileMap, x, y);

    if (x === x1 && y === y1) break;

    const dx = x1 - x;
    const dy = y1 - y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    if (hash01(x, y, seed + 17 + step) < 0.03) {
      if (ax >= ay) {
        const sideY = hash01(x, y, seed + 23 + step) < 0.5 ? -1 : 1;
        paintPath(tileMap, x, y + sideY);
      } else {
        const sideX = hash01(x, y, seed + 29 + step) < 0.5 ? -1 : 1;
        paintPath(tileMap, x + sideX, y);
      }
    }

    if (ax && ay) {
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

function carvePathPolyline(tileMap, points, seed) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    carvePathSegment(tileMap, a.x, a.y, b.x, b.y, seed + i * 97);
  }
}

const northGate = { x: startCastle.gateX, y: startCastle.gateY };
const shopGate = { x: vendorShop.gateX, y: vendorShop.gateY + 2 };
const southGate = { x: southKeep.gateX, y: southKeep.gateY + 2 };

carvePathPolyline(overworldMap, [
  { x: northGate.x, y: northGate.y + 1 },
  { x: shopGate.x, y: shopGate.y }
], 19);

carvePathPolyline(overworldMap, [
  { x: northGate.x, y: northGate.y },
  { x: 8, y: RIVER_Y - 1 }
], 11);

carvePathPolyline(overworldMap, [
  { x: 8, y: RIVER_Y - 1 },
  { x: 14, y: RIVER_Y - 2 },
  { x: 36, y: RIVER_Y - 2 },
  { x: 42, y: RIVER_Y - 3 }
], 29);

carvePathPolyline(overworldMap, [
  { x: 42, y: RIVER_Y - 3 },
  { x: 42, y: RIVER_Y - 1 }
], 47);

carvePathPolyline(overworldMap, [
  { x: 42, y: RIVER_Y + 2 },
  { x: 42, y: southGate.y - 2 },
  { x: 43, y: southGate.y - 1 },
  { x: 42, y: southGate.y }
], 71);

carvePathPolyline(overworldMap, [
  { x: 42, y: southGate.y },
  { x: 49, y: southGate.y },
  { x: southGate.x, y: southGate.y }
], 89);

for (const bx of [8, 42]) {
  overworldMap[RIVER_Y][bx] = 5;
  overworldMap[RIVER_Y + 1][bx] = 5;
}

for (const bx of [8, 42]) {
  paintPath(overworldMap, bx, RIVER_Y - 1);
  paintPath(overworldMap, bx, RIVER_Y + 2);
}

function buildDungeonTemplate() {
  const dMap = zoneWorlds[ZONE_KEYS.DUNGEON].map;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) dMap[y][x] = 4;
  }

  function carveRect(x0, y0, x1, y1, tile = 3) {
    const ax0 = Math.max(0, Math.min(x0, x1));
    const ay0 = Math.max(0, Math.min(y0, y1));
    const ax1 = Math.min(W - 1, Math.max(x0, x1));
    const ay1 = Math.min(H - 1, Math.max(y0, y1));
    for (let y = ay0; y <= ay1; y++) {
      for (let x = ax0; x <= ax1; x++) dMap[y][x] = tile;
    }
  }

  // Entry room (ladder-up zone).
  carveRect(6, 7, 14, 14, 3);

  // Main east corridor.
  carveRect(15, 10, 22, 11, 3);

  // Mid chamber.
  carveRect(23, 6, 34, 16, 3);

  // Bridge over a small pit in the mid chamber.
  carveRect(27, 10, 29, 12, 1);
  carveRect(28, 10, 28, 12, 5);

  // South descent corridor.
  carveRect(28, 17, 29, 24, 3);

  // Lower hall.
  carveRect(22, 25, 35, 34, 3);

  // Side alcove.
  carveRect(17, 27, 21, 31, 3);
  carveRect(21, 28, 22, 29, 3);

  // Small northern crypt nook.
  carveRect(26, 3, 31, 5, 3);

  // Rubble blockers for visual variety.
  carveRect(24, 30, 25, 31, 2);
  carveRect(32, 27, 33, 28, 2);
}

buildDungeonTemplate();

export const map = makeArrayProxy(() => getZoneWorld().map);

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
  smithing: { name: "Smithing", xp: 0 },
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
export const groundLoot = makeMapProxy(() => getZoneWorld().groundLoot);
export const manualDropLocks = makeMapProxy(() => getZoneWorld().manualDropLocks);
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
export const resources = makeArrayProxy(() => getZoneWorld().resources);
export const mobs = makeArrayProxy(() => getZoneWorld().mobs);
export const interactables = makeArrayProxy(() => getZoneWorld().interactables);

// ---------- Persistent world seed ----------
export const worldState = {
  seed: 1337,
  activeZone: activeZone
};

export function getActiveZone() {
  const key = normalizeZoneKey(worldState.activeZone);
  if (key !== activeZone) activeZone = key;
  return activeZone;
}

export function setActiveZone(zoneKey) {
  const next = normalizeZoneKey(zoneKey);
  if (!zoneWorlds[next]) return false;
  activeZone = next;
  worldState.activeZone = next;
  return true;
}

export function getZoneState(zoneKey = activeZone) {
  return getZoneWorld(zoneKey);
}

export function getZoneDimensions(zoneKey = activeZone) {
  const zone = getZoneWorld(zoneKey);
  return { width: zone.width, height: zone.height };
}

// ---------- UI state ----------
export const availability = {
  bank: false,
  vendor: false,
  smithing: false,
  vendorInRangeIndex: -1,
  vendorTab: "buy"
};

// Open state: inventory + equipment can be open simultaneously.
export const windowsOpen = {
  inventory: false,
  equipment: false,
  skills: false,
  bank: false,
  smithing: false,
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
