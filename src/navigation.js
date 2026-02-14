export function createNavigation(map, width, height) {
  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < width && y < height;
  }

  function isWalkable(x, y) {
    if (!inBounds(x, y)) return false;
    return map[y][x] === 0 || map[y][x] === 3 || map[y][x] === 5;
  }

  function isIndoors(x, y) {
    if (!inBounds(x, y)) return false;
    return map[y][x] === 3;
  }

  function astar(sx, sy, gx, gy) {
    sx |= 0; sy |= 0; gx |= 0; gy |= 0;
    if (!isWalkable(gx, gy) || !isWalkable(sx, sy)) return null;
    if (sx === gx && sy === gy) return [];

    const key = (x, y) => (y * width + x);
    const open = new Map();
    const came = new Map();
    const g = new Map();
    const f = new Map();
    const h = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    const sk = key(sx, sy);
    g.set(sk, 0);
    f.set(sk, h(sx, sy));
    open.set(sk, { x: sx, y: sy });

    while (open.size) {
      let bestK = null;
      let bestN = null;
      let bestF = Infinity;

      for (const [k, n] of open.entries()) {
        const fs = f.get(k) ?? Infinity;
        if (fs < bestF) {
          bestF = fs;
          bestK = k;
          bestN = n;
        }
      }

      if (!bestN) break;

      if (bestN.x === gx && bestN.y === gy) {
        const path = [];
        let ck = bestK;

        while (came.has(ck)) {
          const prev = came.get(ck);
          const cy = Math.floor(ck / width);
          const cx = ck - cy * width;
          path.push({ x: cx, y: cy });
          ck = prev;
        }

        path.reverse();
        return path;
      }

      open.delete(bestK);

      for (const [dx, dy] of dirs) {
        const nx = bestN.x + dx;
        const ny = bestN.y + dy;
        if (!isWalkable(nx, ny)) continue;

        const nk = key(nx, ny);
        const tentative = (g.get(bestK) ?? Infinity) + 1;
        if (tentative < (g.get(nk) ?? Infinity)) {
          came.set(nk, bestK);
          g.set(nk, tentative);
          f.set(nk, tentative + h(nx, ny));
          if (!open.has(nk)) open.set(nk, { x: nx, y: ny });
        }
      }
    }

    return null;
  }

  return { inBounds, isWalkable, isIndoors, astar };
}
