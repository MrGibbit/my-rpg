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
    setPathTo
  } = deps;

  const mctx = minimap.getContext("2d");

  function drawMinimap() {
    const mw = minimap.width;
    const mh = minimap.height;
    mctx.clearRect(0, 0, mw, mh);

    const sx = mw / W;
    const sy = mh / H;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = map[y][x];
        if (t === 0) mctx.fillStyle = "#12301e";
        else if (t === 1) mctx.fillStyle = "#0d2a3d";
        else if (t === 2) mctx.fillStyle = "#2a2f3a";
        else if (t === 3 || t === 4) mctx.fillStyle = "#46505d";
        else if (t === 5) mctx.fillStyle = "#3a2f22";
        mctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx), Math.ceil(sy));
      }
    }

    const bankIt = interactables.find((it) => it.type === "bank");
    if (bankIt) {
      mctx.fillStyle = "#fbbf24";
      mctx.fillRect(bankIt.x * sx - 1, bankIt.y * sy - 1, 3, 3);
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
