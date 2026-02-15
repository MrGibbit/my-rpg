export function createPersistence(deps) {
  const {
    now,
    player,
    Skills,
    inv,
    bank,
    view,
    equipment,
    quiver,
    wallet,
    groundLoot,
    resources,
    mobs,
    interactables,
    GROUND_LOOT_DESPAWN_MS,
    seedResources,
    seedMobs,
    seedInteractables,
    MOB_DEFS,
    DEFAULT_MOB_LEVELS,
    calcCombatLevelFromLevels,
    clamp,
    tileCenter,
    makeRng,
    worldState,
    randInt,
    placeMob,
    map,
    RIVER_Y,
    getActiveZone,
    setActiveZone,
    getZoneState,
    CLASS_DEFS,
    syncPlayerPix,
    recalcMaxHPFromHealth,
    clearSlots,
    Items,
    GOLD_ITEM_ID,
    addGold,
    addToInventory,
    MAX_BANK,
    setZoom,
    manualDropLocks,
    onZoneChanged,
    renderAfterLoad
  } = deps;

  const OVERWORLD_ZONE = "overworld";
  const DUNGEON_ZONE = "dungeon";
  const ZONE_ORDER = [OVERWORLD_ZONE, DUNGEON_ZONE];

  function getKnownZoneKeys() {
    if (typeof getZoneState !== "function") return [OVERWORLD_ZONE];
    return ZONE_ORDER.filter((zoneKey) => !!getZoneState(zoneKey));
  }

  function getZoneRuntime(zoneKey) {
    if (typeof getZoneState === "function") {
      const zone = getZoneState(zoneKey);
      if (zone) {
        return {
          map: zone.map,
          width: zone.width | 0,
          height: zone.height | 0,
          resources: zone.resources,
          mobs: zone.mobs,
          interactables: zone.interactables,
          groundLoot: zone.groundLoot,
          manualDropLocks: zone.manualDropLocks
        };
      }
    }

    return {
      map,
      width: map?.[0]?.length ?? 0,
      height: map?.length ?? 0,
      resources,
      mobs,
      interactables,
      groundLoot,
      manualDropLocks
    };
  }

  function normalizeZoneKey(zoneKey) {
    const key = String(zoneKey || "").trim();
    return getKnownZoneKeys().includes(key) ? key : OVERWORLD_ZONE;
  }

  function runInZone(zoneKey, fn) {
    if (typeof setActiveZone !== "function" || typeof getActiveZone !== "function") return fn();

    const prev = normalizeZoneKey(getActiveZone());
    const next = normalizeZoneKey(zoneKey);

    if (prev !== next) {
      setActiveZone(next);
      if (typeof onZoneChanged === "function") onZoneChanged(next, prev);
    }

    try {
      return fn();
    } finally {
      if (prev !== next) {
        setActiveZone(prev);
        if (typeof onZoneChanged === "function") onZoneChanged(prev, next);
      }
    }
  }

  function serializeGroundLoot(lootMap, t) {
    return Array.from(lootMap.entries()).map(([k, pile]) => {
      const expiresIn = Number.isFinite(pile.expiresAt)
        ? Math.max(0, Math.floor(pile.expiresAt - t))
        : GROUND_LOOT_DESPAWN_MS;
      return [k, Array.from(pile.entries()), expiresIn];
    });
  }

  function serializeWorld(runtime, t) {
    return {
      resources: runtime.resources.map((r) => ({
        type: r.type,
        x: r.x,
        y: r.y,
        alive: !!r.alive,
        respawnIn: (!r.alive && r.respawnAt) ? Math.max(0, Math.floor(r.respawnAt - t)) : 0
      })),
      mobs: runtime.mobs.map((m) => ({
        type: m.type,
        name: m.name,
        x: m.x,
        y: m.y,
        homeX: (m.homeX ?? m.x),
        homeY: (m.homeY ?? m.y),
        hp: (m.hp | 0),
        maxHp: (m.maxHp | 0),
        alive: !!m.alive,
        respawnIn: (!m.alive && m.respawnAt) ? Math.max(0, Math.floor(m.respawnAt - t)) : 0,
        levels: m.levels ?? null
      })),
      fires: runtime.interactables
        .filter((it) => it.type === "fire")
        .map((it) => ({
          x: it.x,
          y: it.y,
          expiresIn: it.expiresAt ? Math.max(0, Math.floor(it.expiresAt - t)) : 0
        }))
    };
  }

  function serialize() {
    const t = now();
    const savedAt = Date.now();
    const activeZone = normalizeZoneKey(typeof getActiveZone === "function" ? getActiveZone() : OVERWORLD_ZONE);

    const zones = {};
    for (const zoneKey of getKnownZoneKeys()) {
      const runtime = getZoneRuntime(zoneKey);
      zones[zoneKey] = {
        groundLoot: serializeGroundLoot(runtime.groundLoot, t),
        world: serializeWorld(runtime, t)
      };
    }

    const overworldSnapshot = zones[OVERWORLD_ZONE] ?? zones[activeZone] ?? {
      groundLoot: serializeGroundLoot(groundLoot, t),
      world: serializeWorld(getZoneRuntime(activeZone), t)
    };

    return JSON.stringify({
      v: 3,
      savedAt,
      activeZone,
      player: {
        x: player.x,
        y: player.y,
        name: player.name,
        class: player.class,
        color: player.color,
        hp: player.hp,
        maxHp: player.maxHp
      },
      skills: Object.fromEntries(Object.entries(Skills).map(([k, v]) => [k, v.xp])),
      inv,
      bank,
      zoom: view.zoom,
      equipment: { ...equipment },
      quiver: { ...quiver },
      wallet: { ...wallet },
      zones,
      // Legacy compatibility fields (overworld snapshot)
      groundLoot: overworldSnapshot.groundLoot,
      world: overworldSnapshot.world
    });
  }

  function restoreGroundLootForZone(runtime, lootRows, t0) {
    runtime.groundLoot.clear();
    runtime.manualDropLocks?.clear();

    if (!Array.isArray(lootRows)) return;
    for (const row of lootRows) {
      if (!Array.isArray(row) || row.length < 2) continue;

      const k = row[0];
      const entries = row[1];
      const expiresIn = (row.length >= 3) ? (row[2] | 0) : GROUND_LOOT_DESPAWN_MS;
      if (!k || !Array.isArray(entries)) continue;

      const pile = new Map();
      pile.createdAt = t0;
      pile.expiresAt = t0 + Math.max(0, expiresIn);

      for (const [id, qty] of entries) {
        if (!Items[id]) continue;
        pile.set(id, Math.max(0, qty | 0));
      }

      if (pile.size) runtime.groundLoot.set(k, pile);
    }
  }

  function ensureGoblinFallback(runtime, t0) {
    if (runtime.mobs.some((m) => m && m.type === "goblin")) return;

    const mapRef = runtime.map;
    const width = runtime.width;
    const height = runtime.height;
    const goblinSeedRng = makeRng(worldState.seed ^ 0x77C4D91F);
    const anchorX = 37;
    const anchorY = 13;
    const desired = 4;
    let placed = 0;

    function inBoundsLocal(x, y) {
      return x >= 0 && y >= 0 && x < width && y < height;
    }

    function isWalkableLocal(x, y) {
      if (!inBoundsLocal(x, y)) return false;
      const t = mapRef[y][x];
      return t === 0 || t === 3 || t === 5;
    }

    function tileOkForLoadedGoblin(x, y) {
      if (!inBoundsLocal(x, y)) return false;
      if (!isWalkableLocal(x, y)) return false;
      if (mapRef[y][x] !== 0) return false;
      if (y > (RIVER_Y - 5)) return false;
      if (Math.abs(x - anchorX) > 7 || Math.abs(y - anchorY) > 5) return false;
      if (runtime.resources.some((r) => r.alive && r.x === x && r.y === y)) return false;
      if (runtime.interactables.some((it) => it.x === x && it.y === y)) return false;
      if (runtime.mobs.some((m) => m.alive && m.x === x && m.y === y)) return false;
      return true;
    }

    runInZone(OVERWORLD_ZONE, () => {
      for (let a = 0; a < 4000 && placed < desired; a++) {
        const x = anchorX + randInt(goblinSeedRng, -7, 7);
        const y = anchorY + randInt(goblinSeedRng, -5, 5);
        if (!tileOkForLoadedGoblin(x, y)) continue;
        placeMob("goblin", x, y);
        placed++;
      }
    });

    // placeMob does not always initialize pixel position if code changes in future.
    for (const m of runtime.mobs) {
      if (Number.isFinite(m?.px) && Number.isFinite(m?.py)) continue;
      const c = tileCenter(m.x | 0, m.y | 0);
      m.px = c.cx;
      m.py = c.cy;
      if (!Number.isFinite(m.respawnAt)) m.respawnAt = t0;
    }
  }

  function ensureIronRockFallback(runtime) {
    if (runtime.resources.some((r) => r && r.type === "iron_rock")) return;

    const mapRef = runtime.map;
    const width = runtime.width;
    const height = runtime.height;
    const ironSeedRng = makeRng(worldState.seed ^ 0x3A11FE23);
    const desired = 8;
    let placed = 0;

    function inBoundsLocal(x, y) {
      return x >= 0 && y >= 0 && x < width && y < height;
    }

    function nearTileTypeLocal(x, y, tileVal, radius = 1) {
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (!inBoundsLocal(nx, ny)) continue;
          if (mapRef[ny][nx] === tileVal) return true;
        }
      }
      return false;
    }

    function tileOkForLoadedIronRock(x, y) {
      if (!inBoundsLocal(x, y)) return false;
      if (mapRef[y][x] !== 0) return false;
      if (!nearTileTypeLocal(x, y, 2, 1)) return false;
      if (runtime.resources.some((r) => r.x === x && r.y === y)) return false;
      if (runtime.interactables.some((it) => it.x === x && it.y === y)) return false;
      return true;
    }

    for (let a = 0; a < 12000 && placed < desired; a++) {
      const x = randInt(ironSeedRng, 0, width - 1);
      const y = randInt(ironSeedRng, 0, height - 1);
      if (!tileOkForLoadedIronRock(x, y)) continue;
      runtime.resources.push({
        type: "iron_rock",
        x,
        y,
        alive: true,
        respawnAt: 0
      });
      placed++;
    }
  }

  function restoreWorldForZone(zoneKey, zonePayload, t0) {
    const runtime = getZoneRuntime(zoneKey);
    const worldPayload = zonePayload?.world;

    runtime.resources.length = 0;
    runtime.mobs.length = 0;
    runtime.interactables.length = 0;

    if (Array.isArray(worldPayload?.resources)) {
      for (const r of worldPayload.resources) {
        if (!r) continue;
        runtime.resources.push({
          type: r.type,
          x: r.x | 0,
          y: r.y | 0,
          alive: !!r.alive,
          respawnAt: (!r.alive && (r.respawnIn | 0) > 0) ? (t0 + (r.respawnIn | 0)) : 0
        });
      }
    } else if (zoneKey === OVERWORLD_ZONE) {
      runInZone(zoneKey, () => seedResources());
    }

    if (Array.isArray(worldPayload?.mobs)) {
      for (const mm of worldPayload.mobs) {
        if (!mm) continue;

        const def = MOB_DEFS[mm.type] ?? { name: mm.type, hp: 12, levels: {} };
        const lvls = { ...DEFAULT_MOB_LEVELS, ...(mm.levels || def.levels || {}) };
        const combatLevel = calcCombatLevelFromLevels(lvls);

        const x = mm.x | 0;
        const y = mm.y | 0;
        const maxHp = Math.max(1, (mm.maxHp | 0) || (def.hp | 0) || 12);
        const hp = clamp((mm.hp | 0) || maxHp, 0, maxHp);

        const mob = {
          type: mm.type,
          name: mm.name || def.name || mm.type,
          x,
          y,
          homeX: (mm.homeX ?? x) | 0,
          homeY: (mm.homeY ?? y) | 0,
          hp,
          maxHp,
          alive: !!mm.alive,
          respawnAt: (!mm.alive && (mm.respawnIn | 0) > 0) ? (t0 + (mm.respawnIn | 0)) : 0,
          target: null,
          provokedUntil: 0,
          aggroUntil: 0,
          attackCooldownUntil: 0,
          moveCooldownUntil: 0,
          levels: lvls,
          combatLevel
        };

        const c = tileCenter(x, y);
        mob.px = c.cx;
        mob.py = c.cy;
        runtime.mobs.push(mob);
      }
    } else if (zoneKey === OVERWORLD_ZONE) {
      runInZone(zoneKey, () => seedMobs());
    }

    if (zoneKey === OVERWORLD_ZONE) {
      runInZone(zoneKey, () => seedInteractables());
      ensureGoblinFallback(runtime, t0);
      ensureIronRockFallback(runtime);
    }

    if (Array.isArray(worldPayload?.fires)) {
      for (const f of worldPayload.fires) {
        if (!f) continue;
        const expiresIn = Math.max(0, f.expiresIn | 0);
        runtime.interactables.push({
          type: "fire",
          x: f.x | 0,
          y: f.y | 0,
          createdAt: t0,
          expiresAt: expiresIn ? (t0 + expiresIn) : (t0 + 60000)
        });
      }
    }

    const fallbackLootRows = (zoneKey === OVERWORLD_ZONE) ? zonePayload?.legacyGroundLoot : null;
    restoreGroundLootForZone(runtime, zonePayload?.groundLoot ?? fallbackLootRows, t0);
  }

  function restoreSkillsFromSave(data) {
    if (!data?.skills) return;
    for (const k of Object.keys(Skills)) {
      if (typeof data.skills[k] === "number") Skills[k].xp = data.skills[k] | 0;
    }

    // Migrate old Combat XP -> Accuracy/Power/Defense/Ranged (25% each)
    if (typeof data.skills.combat === "number") {
      const c = Math.max(0, data.skills.combat | 0);
      const q = Math.floor(c / 4);
      const rem = c - q * 4;
      Skills.accuracy.xp += q;
      Skills.power.xp += q + rem;
      Skills.defense.xp += q;
      Skills.ranged.xp += q;
    }
  }

  function restoreInventoryFromSave(data) {
    if (!Array.isArray(data?.inv)) return;
    clearSlots(inv);
    for (const s of data.inv) {
      if (!s) continue;
      const rawId = s.id;
      const id = (rawId === "bronze_arrow") ? "wooden_arrow" : rawId;
      const item = Items[id];
      if (!item) continue;

      const qty = Math.max(1, (s.qty | 0) || 1);
      if (id === GOLD_ITEM_ID) {
        addGold(qty);
      } else {
        addToInventory(id, qty, { forceInventory: item.ammo });
      }
    }
  }

  function restoreBankFromSave(data) {
    if (!Array.isArray(data?.bank)) return;
    clearSlots(bank);
    const totals = new Map();
    const order = [];

    for (let i = 0; i < data.bank.length; i++) {
      const s = data.bank[i];
      if (!s) continue;

      const id = (s.id === "bronze_arrow") ? "wooden_arrow" : s.id;
      const item = Items[id];
      if (!item) continue;

      const qty = Math.max(1, (s.qty | 0) || 1);
      if (id === GOLD_ITEM_ID) {
        addGold(qty);
        continue;
      }

      if (!totals.has(id)) {
        totals.set(id, 0);
        order.push(id);
      }
      totals.set(id, (totals.get(id) | 0) + qty);
    }

    for (let i = 0; i < Math.min(MAX_BANK, order.length); i++) {
      const id = order[i];
      bank[i] = { id, qty: totals.get(id) | 0 };
    }
  }

  function deserialize(str) {
    const data = JSON.parse(str);
    const t0 = now();

    if (data?.player) {
      player.x = data.player.x | 0;
      player.y = data.player.y | 0;
      player.name = String(data.player.name || player.name).slice(0, 14);

      const cls = data.player.class;
      player.class = (cls && CLASS_DEFS[cls]) ? cls : (player.class || "Warrior");
      player.color = data.player.color || (CLASS_DEFS[player.class]?.color ?? player.color);
      player.maxHp = (data.player.maxHp | 0) || player.maxHp;
      player.hp = (data.player.hp | 0) || player.maxHp;

      syncPlayerPix();
      player.path = [];
      player.target = null;
      player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    }

    const zonesFromSave = (data?.zones && typeof data.zones === "object") ? data.zones : null;
    const legacyOverworldZone = {
      world: data?.world,
      groundLoot: data?.groundLoot,
      legacyGroundLoot: data?.groundLoot
    };

    for (const zoneKey of getKnownZoneKeys()) {
      const zonePayload = zonesFromSave?.[zoneKey] ?? (zoneKey === OVERWORLD_ZONE ? legacyOverworldZone : null);
      restoreWorldForZone(zoneKey, zonePayload, t0);
    }

    const activeZone = normalizeZoneKey(data?.activeZone);
    if (typeof setActiveZone === "function") {
      const prev = (typeof getActiveZone === "function")
        ? normalizeZoneKey(getActiveZone())
        : OVERWORLD_ZONE;
      setActiveZone(activeZone);
      if (prev !== activeZone && typeof onZoneChanged === "function") onZoneChanged(activeZone, prev);
    }
    if (worldState && typeof worldState === "object") {
      worldState.activeZone = activeZone;
    }

    restoreSkillsFromSave(data);

    recalcMaxHPFromHealth();
    player.hp = clamp(player.hp, 0, player.maxHp);

    quiver.wooden_arrow = 0;
    if (data?.quiver && typeof data.quiver.wooden_arrow === "number") {
      quiver.wooden_arrow = Math.max(0, data.quiver.wooden_arrow | 0);
    }

    wallet.gold = 0;
    if (data?.wallet && typeof data.wallet.gold === "number") {
      wallet.gold = Math.max(0, data.wallet.gold | 0);
    }

    restoreInventoryFromSave(data);
    restoreBankFromSave(data);

    if (data?.equipment) {
      equipment.weapon = data.equipment.weapon ?? null;
      equipment.offhand = data.equipment.offhand ?? null;

      if (equipment.weapon && (!Items[equipment.weapon] || Items[equipment.weapon].ammo)) equipment.weapon = null;
      if (equipment.offhand && (!Items[equipment.offhand] || Items[equipment.offhand].ammo)) equipment.offhand = null;
    }

    if (typeof data?.zoom === "number") setZoom(data.zoom);
    renderAfterLoad();
  }

  return { serialize, deserialize };
}
