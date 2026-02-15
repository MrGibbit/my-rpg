export const WORLD_SEED_KEY = "classic_world_seed_v1";

export function initWorldSeed(storage, worldState) {
  try {
    const raw = storage.getItem(WORLD_SEED_KEY);
    const n = raw == null ? NaN : parseInt(raw, 10);

    if (Number.isFinite(n) && n > 0) {
      worldState.seed = (n >>> 0);
      return;
    }

    // First run (or invalid): lock in the default seed.
    worldState.seed = (worldState.seed >>> 0);
    storage.setItem(WORLD_SEED_KEY, String(worldState.seed));
  } catch {
    // If storage is blocked, keep a stable default seed.
    worldState.seed = (worldState.seed >>> 0);
  }
}

export function makeRng(seed) {
  let t = (seed >>> 0) || 0x12345678;
  return function rng() {
    // xorshift32
    t ^= (t << 13); t >>>= 0;
    t ^= (t >>> 17); t >>>= 0;
    t ^= (t << 5); t >>>= 0;
    return (t >>> 0) / 4294967296;
  };
}

export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

export function keyXY(x, y) {
  return `${x},${y}`;
}

export function inRectMargin(x, y, rect, margin) {
  return (
    x >= rect.x0 - margin && x <= (rect.x0 + rect.w - 1) + margin &&
    y >= rect.y0 - margin && y <= (rect.y0 + rect.h - 1) + margin
  );
}

export function nearTileType(map, inBounds, x, y, tileVal, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (map[ny][nx] === tileVal) return true;
    }
  }
  return false;
}
