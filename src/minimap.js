export function createMinimap(deps) {
  const {
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
    isWalkable,
    inBounds,
    setPathTo,
    getActiveZone
  } = deps;

  const mctx = minimap.getContext("2d");

  function drawMinimap() {
    const mw = minimap.width;
    const mh = minimap.height;
    mctx.clearRect(0, 0, mw, mh);

    const activeZone = (typeof getActiveZone === "function") ? String(getActiveZone() || "") : "";
    const inDungeon = (activeZone === "dungeon");

    const sx = mw / W;
    const sy = mh / H;
    const cellRect = (x, y) => {
      const x0 = Math.floor((x * mw) / W);
      const y0 = Math.floor((y * mh) / H);
      const x1 = Math.floor(((x + 1) * mw) / W);
      const y1 = Math.floor(((y + 1) * mh) / H);
      return {
        x0,
        y0,
        x1,
        y1,
        w: Math.max(1, x1 - x0),
        h: Math.max(1, y1 - y0)
      };
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = map[y][x];
        const r = cellRect(x, y);
        if (inDungeon) {
          const walkable = isWalkable(x, y);
          if (walkable) {
            mctx.fillStyle = (t === 5) ? "#b08a58" : "#dbe7f5"; // walkable room/bridge
          } else {
            if (t === 6) mctx.fillStyle = "#f97316"; // lava
            else mctx.fillStyle = (t === 1) ? "#1b3045" : "#060a10"; // blocked wall/pit
          }
        } else {
          if (t === 0) mctx.fillStyle = "#12301e";
          else if (t === 1) mctx.fillStyle = "#0d2a3d";
          else if (t === 2) mctx.fillStyle = "#2a2f3a";
          else if (t === 3) mctx.fillStyle = "#8d99a8"; // stone floor (lighter)
          else if (t === 4) mctx.fillStyle = "#1f2833"; // castle wall (darker)
          else if (t === 5) mctx.fillStyle = "#3a2f22";
          else mctx.fillStyle = "#0f1722";
        }
        mctx.fillRect(r.x0, r.y0, r.w, r.h);
      }
    }

    if (inDungeon) {
      mctx.fillStyle = "#0a0f17";
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!isWalkable(x, y)) continue;
          const r = cellRect(x, y);
          if (!isWalkable(x - 1, y)) mctx.fillRect(r.x0, r.y0, 1, r.h);
          if (!isWalkable(x + 1, y)) mctx.fillRect(Math.max(r.x1 - 1, r.x0), r.y0, 1, r.h);
          if (!isWalkable(x, y - 1)) mctx.fillRect(r.x0, r.y0, r.w, 1);
          if (!isWalkable(x, y + 1)) mctx.fillRect(r.x0, Math.max(r.y1 - 1, r.y0), r.w, 1);
        }
      }
    }

    const bankIt = interactables.find((it) => it.type === "bank");
    if (bankIt) {
      mctx.fillStyle = "#fbbf24";
      mctx.fillRect(bankIt.x * sx - 1, bankIt.y * sy - 1, 3, 3);
    }

    const ladderDownIt = interactables.find((it) => it.type === "ladder_down");
    if (ladderDownIt) {
      mctx.fillStyle = "#f59e0b";
      mctx.fillRect(ladderDownIt.x * sx - 1, ladderDownIt.y * sy - 1, 3, 3);
    }

    const ladderUpIt = interactables.find((it) => it.type === "ladder_up");
    if (ladderUpIt) {
      mctx.fillStyle = "#60a5fa";
      mctx.fillRect(ladderUpIt.x * sx - 1, ladderUpIt.y * sy - 1, 3, 3);
    }

    mctx.fillStyle = "#ffffff";
    mctx.fillRect(player.x * sx - 1, player.y * sy - 1, 3, 3);

    const vw = viewWorldW();
    const vh = viewWorldH();
    mctx.strokeStyle = "rgba(255,255,255,.55)";
    mctx.strokeRect(camera.x / WORLD_W * mw, camera.y / WORLD_H * mh, vw / WORLD_W * mw, vh / WORLD_H * mh);
  }

  function onMinimapMouseDown(e) {
    const rect = minimap.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    const tx = clamp(Math.floor(sx * W), 0, W - 1);
    const ty = clamp(Math.floor(sy * H), 0, H - 1);

    let gx = tx;
    let gy = ty;
    if (!isWalkable(gx, gy)) {
      let found = null;
      for (let r = 1; r <= 6 && !found; r++) {
        for (let oy = -r; oy <= r; oy++) {
          for (let ox = -r; ox <= r; ox++) {
            const nx = tx + ox;
            const ny = ty + oy;
            if (!inBounds(nx, ny)) continue;
            if (isWalkable(nx, ny)) {
              found = { x: nx, y: ny };
              break;
            }
          }
          if (found) break;
        }
      }
      if (found) {
        gx = found.x;
        gy = found.y;
      } else {
        return;
      }
    }

    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    setPathTo(gx, gy);
  }

  minimap.addEventListener("mousedown", onMinimapMouseDown);

  return { drawMinimap };
}
