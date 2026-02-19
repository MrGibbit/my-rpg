export function seedResources(deps) {
  const {
    resources,
    map,
    inBounds,
    nearTileTypeInMap,
    inRectMargin,
    startCastle,
    vendorShop,
    southKeep,
    keyXY,
    makeRng,
    randInt,
    worldSeed,
    placeResource,
    OVERWORLD_LADDER_DOWN
  } = deps;

  resources.length = 0;

  const rng = makeRng(worldSeed ^ 0xA53C9E27);
  const used = new Set();

  const reserved = new Set([
    keyXY(startCastle.x0 + 4, startCastle.y0 + 3),
    keyXY(vendorShop.x0, vendorShop.y0),
    keyXY(startCastle.x0 + 5, startCastle.y0 + 4),
    keyXY(startCastle.x0 + 6, startCastle.y0 + 4),
    keyXY(OVERWORLD_LADDER_DOWN.x, OVERWORLD_LADDER_DOWN.y)
  ]);

  function nearTileType(x, y, tileVal, radius) {
    return nearTileTypeInMap(map, inBounds, x, y, tileVal, radius);
  }

  function tileOkForResource(x, y) {
    if (!inBounds(x, y)) return false;
    if (map[y][x] !== 0) return false;
    if (nearTileType(x, y, 5, 1)) return false;
    if (inRectMargin(x, y, startCastle, 2)) return false;
    if (inRectMargin(x, y, vendorShop, 2)) return false;
    if (inRectMargin(x, y, southKeep, 2)) return false;
    if (reserved.has(keyXY(x, y))) return false;
    if (used.has(keyXY(x, y))) return false;
    return true;
  }

  function placeRes(type, x, y) {
    used.add(keyXY(x, y));
    placeResource(type, x, y);
  }

  function tooCloseToSameType(type, x, y, minDistTiles) {
    for (const r of resources) {
      if (!r.alive || r.type !== type) continue;
      if (Math.hypot(r.x - x, r.y - y) < minDistTiles) return true;
    }
    return false;
  }

  const TREE_ZONES = [
    { x1: 16, y1: 5, x2: 57, y2: 18, w: 1.00 },
    { x1: 3, y1: 25, x2: 25, y2: 38, w: 1.00 },
    { x1: 30, y1: 24, x2: 58, y2: 38, w: 0.85 },
    { x1: 0, y1: 12, x2: 14, y2: 38, w: 0.55 },
    { x1: 18, y1: 18, x2: 40, y2: 26, w: 0.60 }
  ];

  const ROCK_ZONES = [
    { x1: 12, y1: 3, x2: 26, y2: 16, w: 1.00 },
    { x1: 4, y1: 24, x2: 18, y2: 38, w: 1.00 },
    { x1: 22, y1: 26, x2: 40, y2: 36, w: 0.85 },
    { x1: 42, y1: 24, x2: 58, y2: 38, w: 0.70 }
  ];

  function pickZone(zones) {
    const total = zones.reduce((a, z) => a + z.w, 0);
    let r = rng() * total;
    for (const z of zones) {
      r -= z.w;
      if (r <= 0) return z;
    }
    return zones[zones.length - 1];
  }

  function sampleInZone(z) {
    return { x: randInt(rng, z.x1, z.x2), y: randInt(rng, z.y1, z.y2) };
  }

  const TREE_TOTAL = 30;
  const GROVE_COUNT = 4;
  const groveCenters = [];
  const groveCenterMinDist = 10;

  function findGroveCenter() {
    for (let a = 0; a < 2500; a++) {
      const z = pickZone(TREE_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForResource(p.x, p.y)) continue;
      let ok = true;
      for (const c of groveCenters) {
        if (Math.hypot(c.x - p.x, c.y - p.y) < groveCenterMinDist) { ok = false; break; }
      }
      if (!ok) continue;
      return p;
    }
    return null;
  }

  for (let i = 0; i < GROVE_COUNT; i++) {
    const c = findGroveCenter();
    if (c) groveCenters.push(c);
  }

  function fillGrove(cx, cy, want) {
    let placed = 0;
    for (let a = 0; a < want * 45 && placed < want; a++) {
      const ang = rng() * Math.PI * 2;
      const rr = (1.0 + rng() * 4.0) * (rng() ** 0.55);
      const x = Math.round(cx + Math.cos(ang) * rr);
      const y = Math.round(cy + Math.sin(ang) * rr);

      if (!tileOkForResource(x, y)) continue;
      if (tooCloseToSameType("tree", x, y, 1.35)) continue;

      placeRes("tree", x, y);
      placed++;
    }
    return placed;
  }

  for (const c of groveCenters) {
    const groveSize = randInt(rng, 6, 9);
    fillGrove(c.x, c.y, groveSize);
  }

  for (let a = 0; a < 12000 && resources.filter((r) => r.type === "tree").length < TREE_TOTAL; a++) {
    const z = pickZone(TREE_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForResource(p.x, p.y)) continue;
    if (tooCloseToSameType("tree", p.x, p.y, 1.05)) continue;
    placeRes("tree", p.x, p.y);
  }

  const ROCK_TOTAL = 12;
  const ROCK_CLUSTER_COUNT = 3;

  function tileOkForRock(x, y) {
    if (!tileOkForResource(x, y)) return false;
    return true;
  }

  function findRockCenter(preferCliff) {
    for (let a = 0; a < 2500; a++) {
      const z = pickZone(ROCK_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForRock(p.x, p.y)) continue;

      if (preferCliff && !nearTileType(p.x, p.y, 2, 1)) continue;
      return p;
    }
    return null;
  }

  let rocksPlaced = 0;

  function fillRockCluster(cx, cy, want) {
    let placed = 0;
    for (let a = 0; a < want * 35 && placed < want; a++) {
      const x = cx + randInt(rng, -2, 2);
      const y = cy + randInt(rng, -2, 2);
      if (!tileOkForRock(x, y)) continue;
      if (tooCloseToSameType("rock", x, y, 1.15)) continue;
      placeRes("rock", x, y);
      placed++;
    }
    return placed;
  }

  for (let i = 0; i < ROCK_CLUSTER_COUNT && rocksPlaced < ROCK_TOTAL; i++) {
    const c = findRockCenter(true) || findRockCenter(false);
    if (!c) break;
    const sz = randInt(rng, 3, 5);
    rocksPlaced += fillRockCluster(c.x, c.y, Math.min(sz, ROCK_TOTAL - rocksPlaced));
  }

  for (let a = 0; a < 8000 && rocksPlaced < ROCK_TOTAL; a++) {
    const z = pickZone(ROCK_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForRock(p.x, p.y)) continue;
    if (tooCloseToSameType("rock", p.x, p.y, 1.15)) continue;
    placeRes("rock", p.x, p.y);
    rocksPlaced++;
  }

  const IRON_ROCK_TOTAL = 8;
  let ironPlaced = 0;
  for (let a = 0; a < 12000 && ironPlaced < IRON_ROCK_TOTAL; a++) {
    const z = pickZone(ROCK_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForRock(p.x, p.y)) continue;
    if (!nearTileType(p.x, p.y, 2, 1)) continue;
    if (tooCloseToSameType("iron_rock", p.x, p.y, 1.10)) continue;
    placeRes("iron_rock", p.x, p.y);
    ironPlaced++;
  }
}
