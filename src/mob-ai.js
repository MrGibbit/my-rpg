export function createMobAI(deps) {
  const {
    isWalkable,
    resources,
    interactables,
    player,
    mobs,
    tileCenter,
    astar,
    stopAction,
    startCastle,
    wallet,
    getGold,
    renderGold,
    addGroundLoot,
    GOLD_ITEM_ID,
    chatLine,
    now,
    syncPlayerPix,
    inRectMargin,
    MOB_DEFS,
    dist,
    tilesBetweenTiles,
    rollMobAttack,
    clamp,
    getActiveZone
  } = deps;

  function mobTileWalkable(nx, ny) {
    if (!isWalkable(nx, ny)) return false;
    if (resources.some((r) => r.alive && r.x === nx && r.y === ny)) return false;
    if (interactables.some((it) => it.x === nx && it.y === ny && it.type !== "fire")) return false;
    return true;
  }

  function mobStepToward(mob, tx, ty) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const curH = Math.abs(tx - mob.x) + Math.abs(ty - mob.y);
    let best = null;
    let bestH = curH;

    for (const [dx, dy] of dirs) {
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      if (!mobTileWalkable(nx, ny)) continue;
      if (nx === player.x && ny === player.y) continue;
      if (mobs.some((o) => o !== mob && o.alive && o.x === nx && o.y === ny)) continue;

      const h = Math.abs(tx - nx) + Math.abs(ty - ny);
      if (h < bestH) {
        bestH = h;
        best = { x: nx, y: ny };
      }
    }

    if (best) {
      mob.x = best.x;
      mob.y = best.y;
      return true;
    }
    return false;
  }

  function findBestMeleeEngagePath(mob) {
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: mob.x + dx, y: mob.y + dy }))
      .filter((p) => isWalkable(p.x, p.y));

    if (!adj.length) return null;

    let best = null;
    for (const p of adj) {
      const path = astar(player.x, player.y, p.x, p.y);
      if (!path) continue;
      if (path.some((n) => n.x === mob.x && n.y === mob.y)) continue;
      if (!best || path.length < best.path.length) {
        best = { x: p.x, y: p.y, path };
      }
    }
    return best;
  }

  function pushMobOffPlayerTile(mob) {
    if (!mob || !mob.alive) return false;
    if (player.x !== mob.x || player.y !== mob.y) return false;
    const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dirs8 = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const candidates = dirs4.concat(dirs8);

    for (const [dx, dy] of candidates) {
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      if (!mobTileWalkable(nx, ny)) continue;
      if (nx === player.x && ny === player.y) continue;
      if (mobs.some((o) => o !== mob && o.alive && o.x === nx && o.y === ny)) continue;
      mob.x = nx;
      mob.y = ny;
      const c = tileCenter(nx, ny);
      mob.px = c.cx;
      mob.py = c.cy;
      return true;
    }

    for (const [dx, dy] of candidates) {
      const nx = mob.x + dx;
      const ny = mob.y + dy;
      if (!mobTileWalkable(nx, ny)) continue;
      if (nx === player.x && ny === player.y) continue;
      mob.x = nx;
      mob.y = ny;
      const c = tileCenter(nx, ny);
      mob.px = c.cx;
      mob.py = c.cy;
      return true;
    }

    if (Number.isFinite(mob.homeX) && Number.isFinite(mob.homeY)) {
      const hx = mob.homeX | 0;
      const hy = mob.homeY | 0;
      if (mobTileWalkable(hx, hy) && !(hx === player.x && hy === player.y)) {
        mob.x = hx;
        mob.y = hy;
        const c = tileCenter(hx, hy);
        mob.px = c.cx;
        mob.py = c.cy;
        return true;
      }
    }
    return false;
  }

  function resolveMeleeTileOverlap(mob) {
    if (!mob || !mob.alive) return false;
    if (player.x !== mob.x || player.y !== mob.y) return false;
    if (pushMobOffPlayerTile(mob)) return true;

    stopAction();
    return true;
  }

  function handlePlayerDeath() {
    const dx = player.x;
    const dy = player.y;

    const lost = Math.max(0, Math.floor(getGold() * 0.25));
    if (lost > 0) {
      wallet.gold = Math.max(0, (wallet.gold | 0) - lost);
      renderGold();
      addGroundLoot(dx, dy, GOLD_ITEM_ID, lost);
    }

    chatLine(`<span class="warn">You have died.</span>`);

    player.hp = player.maxHp;
    player.x = startCastle.x0 + 6;
    player.y = startCastle.y0 + 4;
    player.path = [];
    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };

    player.attackCooldownUntil = now() + 800;
    player.invulnUntil = now() + 2500;
    syncPlayerPix();
  }

  function updateMobsAI(dt) {
    const t = now();
    if (t < (player.invulnUntil || 0)) return;
    const activeZoneKey = (typeof getActiveZone === "function") ? String(getActiveZone() || "") : "";
    const inDungeonZone = (activeZoneKey === "dungeon");

    const playerSafe = inRectMargin(player.x, player.y, startCastle, 1);

    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (!m.alive) continue;

      if (!Number.isFinite(m.homeX) || !Number.isFinite(m.homeY)) {
        m.homeX = m.x;
        m.homeY = m.y;
      }
      if (!Number.isFinite(m.provokedUntil)) m.provokedUntil = 0;
      if (!Number.isFinite(m.aggroUntil)) m.aggroUntil = 0;
      if (!Number.isFinite(m.attackCooldownUntil)) m.attackCooldownUntil = 0;
      if (!Number.isFinite(m.moveCooldownUntil)) m.moveCooldownUntil = 0;

      if (!Number.isFinite(m.px) || !Number.isFinite(m.py)) {
        const c = tileCenter(m.x, m.y);
        m.px = c.cx;
        m.py = c.cy;
      }

      const def = MOB_DEFS[m.type] ?? {};
      const typeKey = String(m.type || "").toLowerCase();
      const aggroRange = Number.isFinite(def.aggroRange) ? def.aggroRange : 4.0;
      const leash = Number.isFinite(def.leash) ? def.leash : 7.0;
      const attackRange = Number.isFinite(def.attackRange) ? def.attackRange : 1.15;
      const atkSpeed = Number.isFinite(def.attackSpeedMs) ? def.attackSpeedMs : 1300;
      const aggroOnSight = (typeKey === "rat") ? false : (def.aggroOnSight !== false);

      const moveSpeed = Number.isFinite(def.moveSpeed) ? def.moveSpeed : 140;
      const c2 = tileCenter(m.x, m.y);
      const mcx = c2.cx;
      const mcy = c2.cy;
      const dPix = dist(m.px, m.py, mcx, mcy);
      if (dPix > 0.5) {
        const step = moveSpeed * dt;
        m.px += ((mcx - m.px) / dPix) * Math.min(step, dPix);
        m.py += ((mcy - m.py) / dPix) * Math.min(step, dPix);
      } else {
        m.px = mcx;
        m.py = mcy;
      }

      const dToPlayer = tilesBetweenTiles(m.x, m.y, player.x, player.y);
      const dFromHome = tilesBetweenTiles(m.x, m.y, m.homeX, m.homeY);
      const dPlayerFromHome = tilesBetweenTiles(player.x, player.y, m.homeX, m.homeY);

      const provoked = (t < m.provokedUntil);
      const engaged = (m.target === "player" && t < m.aggroUntil && (aggroOnSight || provoked));
      const playerTargetingThis = (player.target?.kind === "mob" && player.target.index === i);

      if (m.x === player.x && m.y === player.y) {
        if (m.target === "player" || playerTargetingThis) {
          pushMobOffPlayerTile(m);
          if (m.x === player.x && m.y === player.y) {
            m.target = null;
            m.aggroUntil = 0;
          }
        }
        continue;
      }

      if (!engaged) {
        if ((aggroOnSight || provoked) && !playerSafe && dToPlayer <= aggroRange) {
          m.target = "player";
          m.aggroUntil = t + 12000;
        } else if (dFromHome > 0.05) {
          if (t >= m.moveCooldownUntil) {
            m.moveCooldownUntil = t + 420;
            mobStepToward(m, m.homeX, m.homeY);
          }
        } else if (inDungeonZone && (typeKey === "rat" || typeKey === "goblin")) {
          if (t >= m.moveCooldownUntil) {
            const roamRadius = Math.min(leash, 3.2);
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const candidates = [];

            for (const [dx, dy] of dirs) {
              const nx = m.x + dx;
              const ny = m.y + dy;
              if (!mobTileWalkable(nx, ny)) continue;
              if (nx === player.x && ny === player.y) continue;
              if (mobs.some((o) => o !== m && o.alive && o.x === nx && o.y === ny)) continue;
              if (tilesBetweenTiles(nx, ny, m.homeX, m.homeY) > roamRadius) continue;
              candidates.push({ x: nx, y: ny });
            }

            m.moveCooldownUntil = t + 650 + Math.floor(Math.random() * 500);
            if (candidates.length) {
              const pick = candidates[Math.floor(Math.random() * candidates.length)];
              m.x = pick.x;
              m.y = pick.y;
            }
          }
        }
        continue;
      }

      if (playerSafe || dFromHome > leash || dPlayerFromHome > leash) {
        m.target = null;
        m.provokedUntil = 0;
        m.aggroUntil = 0;
        continue;
      }

      if (dToPlayer <= aggroRange + 1.0) {
        m.aggroUntil = t + 12000;
        if (!aggroOnSight) m.provokedUntil = t + 12000;
      }

      const tileAdjacent = (Math.abs(player.x - m.x) <= 1 && Math.abs(player.y - m.y) <= 1);

      if (dToPlayer > attackRange && !tileAdjacent) {
        if (t >= m.moveCooldownUntil) {
          m.moveCooldownUntil = t + 420;
          mobStepToward(m, player.x, player.y);
        }
        continue;
      }

      if (t < m.attackCooldownUntil) continue;
      m.attackCooldownUntil = t + atkSpeed;
      m.moveCooldownUntil = Math.max(m.moveCooldownUntil, t + Math.max(420, Math.floor(atkSpeed * 0.55)));

      const roll = rollMobAttack(m);
      if (roll.dmg <= 0) {
        chatLine(`<span class="muted">${m.name} misses you.</span>`);
        continue;
      }

      player.hp = clamp(player.hp - roll.dmg, 0, player.maxHp);
      chatLine(`<span class="warn">${m.name} hits you for <b>${roll.dmg}</b>.</span>`);
    }
  }

  return {
    mobTileWalkable,
    mobStepToward,
    findBestMeleeEngagePath,
    pushMobOffPlayerTile,
    resolveMeleeTileOverlap,
    handlePlayerDeath,
    updateMobsAI
  };
}
