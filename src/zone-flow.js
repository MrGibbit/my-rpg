export function createZoneFlow(deps) {
  const {
    // World/state basics
    map,
    W,
    H,
    ZONE_KEYS,
    getActiveZone,
    setActiveZone,
    getZoneState,
    rebuildNavigation,
    updateCamera,
    inBounds,
    isWalkable,
    now,
    player,
    startCastle,
    syncPlayerPix,
    tileCenter,
    // Runtime collections
    resources,
    mobs,
    interactables,
    inv,
    bank,
    quiver,
    wallet,
    equipment,
    windowsOpen,
    // Quest and gameplay hooks
    isQuestStarted,
    isQuestCompleted,
    isQuestObjectiveComplete,
    hasQuestObjectiveToken,
    getQuestProgress,
    getQuestDefById,
    getQuestObjectiveTarget,
    isQuestReadyToComplete,
    completeQuest,
    trackQuestEvent,
    hasItem,
    removeItemsFromInventory,
    placeMob,
    placeResource,
    ensureInteractable,
    // Constants for dungeon/flow
    DUNGEON_LEGACY_MOB_LAYOUTS,
    DUNGEON_DEFAULT_MOB_SPAWNS,
    DUNGEON_SOUTH_SKELETON_SPAWNS,
    DUNGEON_SOUTH_IRON_ROCK_SPAWNS,
    DUNGEON_LADDER_UP,
    DUNGEON_WING_GATE,
    DUNGEON_WING_GATE_BOTTOM,
    DUNGEON_WING_ROOM,
    DUNGEON_WING_BRAZIERS,
    DUNGEON_WARDEN_SPAWN,
    DUNGEON_SPAWN_TILE,
    OVERWORLD_RETURN_TILE,
    MOB_DEFS,
    ZOOM_DEFAULT,
    BASE_HP,
    BANK_START_SLOTS,
    // World/system ops
    clearSlots,
    setBankCapacity,
    resetWorldUpgrades,
    resetQuestProgress,
    resetRenownGrants,
    closeCtxMenu,
    setUseState,
    applyWindowVis,
    setZoom,
    recalcMaxHPFromHealth,
    applyStartingInventory,
    initWorldSeed,
    seedResources,
    seedMobs,
    seedInteractables,
    // Character/profile ops
    getActiveCharacterId,
    deleteCharacterById,
    refreshStartOverlay,
    Skills,
    // Rendering + UI feedback
    renderSkills,
    renderQuests,
    renderInv,
    renderBank,
    renderEquipment,
    renderQuiver,
    renderHPHUD,
    chatLine
  } = deps;

  function clearZoneRuntime(zoneKey) {
    const zone = getZoneState(zoneKey);
    if (!zone) return;
    zone.resources.length = 0;
    zone.mobs.length = 0;
    zone.interactables.length = 0;
    zone.groundLoot.clear();
    zone.manualDropLocks.clear();
  }

  function clearAllZoneRuntime() {
    clearZoneRuntime(ZONE_KEYS.OVERWORLD);
    clearZoneRuntime(ZONE_KEYS.DUNGEON);
  }

  function withZone(zoneKey, fn) {
    const prev = getActiveZone();
    const next = (zoneKey === ZONE_KEYS.DUNGEON) ? ZONE_KEYS.DUNGEON : ZONE_KEYS.OVERWORLD;
    const changed = (prev !== next);
    if (changed) {
      setActiveZone(next);
      rebuildNavigation();
    }
    try {
      return fn();
    } finally {
      if (changed) {
        setActiveZone(prev);
        rebuildNavigation();
      }
    }
  }

  function dungeonLayoutSignature(layout) {
    return layout
      .map((s) => `${s.type}:${s.x},${s.y}`)
      .sort()
      .join("|");
  }

  function migrateDungeonLegacyMobLayout() {
    const sig = dungeonLayoutSignature(
      mobs.map((m) => ({
        type: String(m.type || ""),
        x: (Number.isFinite(m.homeX) ? m.homeX : m.x) | 0,
        y: (Number.isFinite(m.homeY) ? m.homeY : m.y) | 0
      }))
    );
    const legacySigs = DUNGEON_LEGACY_MOB_LAYOUTS.map(dungeonLayoutSignature);
    if (!legacySigs.includes(sig)) return false;

    const byType = new Map();
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      const k = String(m.type || "");
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k).push(i);
    }
    for (const idxs of byType.values()) {
      idxs.sort((a, b) => {
        const ma = mobs[a];
        const mb = mobs[b];
        const ax = (Number.isFinite(ma.homeX) ? ma.homeX : ma.x) | 0;
        const ay = (Number.isFinite(ma.homeY) ? ma.homeY : ma.y) | 0;
        const bx = (Number.isFinite(mb.homeX) ? mb.homeX : mb.x) | 0;
        const by = (Number.isFinite(mb.homeY) ? mb.homeY : mb.y) | 0;
        return (ay - by) || (ax - bx);
      });
    }

    for (const spot of DUNGEON_DEFAULT_MOB_SPAWNS) {
      const bucket = byType.get(spot.type);
      if (!bucket || !bucket.length) continue;
      const idx = bucket.shift();
      const m = mobs[idx];
      m.homeX = spot.x | 0;
      m.homeY = spot.y | 0;
      m.target = null;
      m.provokedUntil = 0;
      m.aggroUntil = 0;
      m.attackCooldownUntil = 0;
      m.moveCooldownUntil = 0;
      if (m.alive) {
        m.x = m.homeX;
        m.y = m.homeY;
      }
    }
    return true;
  }

  function rebuildDungeonTileLayout() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) map[y][x] = 4;
    }

    function carveRect(x0, y0, x1, y1, tile = 3) {
      const ax0 = Math.max(0, Math.min(x0, x1));
      const ay0 = Math.max(0, Math.min(y0, y1));
      const ax1 = Math.min(W - 1, Math.max(x0, x1));
      const ay1 = Math.min(H - 1, Math.max(y0, y1));
      for (let y = ay0; y <= ay1; y++) {
        for (let x = ax0; x <= ax1; x++) map[y][x] = tile;
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

    // Sealed boss wing corridor and chamber (opened via quest progression).
    carveRect(36, 29, 41, 30, 3);
    carveRect(DUNGEON_WING_ROOM.x0, DUNGEON_WING_ROOM.y0, DUNGEON_WING_ROOM.x1, DUNGEON_WING_ROOM.y1, 3);

    // Center lava pit and narrow crossing in the wing.
    carveRect(46, 28, 50, 31, 6);
    carveRect(48, 28, 48, 31, 5);

    // Side alcove.
    carveRect(17, 27, 21, 31, 3);
    carveRect(21, 28, 22, 29, 3);

    // Small northern crypt nook.
    carveRect(26, 3, 31, 5, 3);

    // Rubble blockers for visual variety.
    carveRect(24, 30, 25, 31, 2);
    carveRect(32, 27, 33, 28, 2);

    // Gate tiles always stay blocked; the player passes through by interacting with the gate.
    map[DUNGEON_WING_GATE.y][DUNGEON_WING_GATE.x] = 4;
    map[DUNGEON_WING_GATE_BOTTOM.y][DUNGEON_WING_GATE_BOTTOM.x] = 4;
  }

  function seedDungeonZone(options = {}) {
    const forcePopulateMobs = !!options.forcePopulateMobs;
    const migrateLegacyPositions = !!options.migrateLegacyPositions;
    withZone(ZONE_KEYS.DUNGEON, () => {
      rebuildDungeonTileLayout();
      resources.length = 0;
      for (const spot of DUNGEON_SOUTH_IRON_ROCK_SPAWNS) {
        placeResource("iron_rock", spot.x, spot.y);
      }
      ensureInteractable("ladder_up", DUNGEON_LADDER_UP.x, DUNGEON_LADDER_UP.y);
      ensureInteractable("sealed_gate", DUNGEON_WING_GATE.x, DUNGEON_WING_GATE.y, { open: false, segment: "top" });
      ensureInteractable("sealed_gate", DUNGEON_WING_GATE_BOTTOM.x, DUNGEON_WING_GATE_BOTTOM.y, { open: false, segment: "bottom" });
      for (const brazier of DUNGEON_WING_BRAZIERS) {
        ensureInteractable("brazier", brazier.x, brazier.y, { brazierId: brazier.id, lit: false });
      }

      if (forcePopulateMobs) mobs.length = 0;
      if (!mobs.length) {
        for (const spot of DUNGEON_DEFAULT_MOB_SPAWNS) {
          placeMob(spot.type, spot.x, spot.y);
        }
      } else if (migrateLegacyPositions) {
        migrateDungeonLegacyMobLayout();
      }

      function ensureMobSpawnSlot(type, x, y) {
        const existing = mobs.find((m) =>
          String(m.type || "") === String(type) &&
          ((Number.isFinite(m.homeX) ? (m.homeX | 0) : (m.x | 0)) === (x | 0)) &&
          ((Number.isFinite(m.homeY) ? (m.homeY | 0) : (m.y | 0)) === (y | 0))
        );

        if (!existing) {
          placeMob(type, x, y);
          return;
        }

        // Recovery for stale saves: dead mob with no respawn timer should not block a spawn slot forever.
        if (!existing.alive && (existing.respawnAt | 0) <= 0) {
          const def = MOB_DEFS[type] ?? { hp: 12 };
          existing.homeX = x | 0;
          existing.homeY = y | 0;
          existing.x = existing.homeX;
          existing.y = existing.homeY;
          existing.maxHp = Math.max(1, (existing.maxHp | 0) || (def.hp | 0) || 12);
          existing.hp = existing.maxHp;
          existing.alive = true;
          existing.respawnAt = 0;
          existing.target = null;
          existing.provokedUntil = 0;
          existing.aggroUntil = 0;
          existing.attackCooldownUntil = 0;
          existing.moveCooldownUntil = 0;
          const c = tileCenter(existing.x, existing.y);
          existing.px = c.cx;
          existing.py = c.cy;
        }
      }

      for (const spot of DUNGEON_DEFAULT_MOB_SPAWNS) {
        ensureMobSpawnSlot(spot.type, spot.x, spot.y);
      }
      for (const spot of DUNGEON_SOUTH_SKELETON_SPAWNS) {
        ensureMobSpawnSlot("skeleton", spot.x, spot.y);
      }

      syncDungeonQuestState();
    });
  }

  function isInDungeonWing(x, y) {
    return (
      x >= DUNGEON_WING_ROOM.x0 &&
      y >= DUNGEON_WING_ROOM.y0 &&
      x <= DUNGEON_WING_ROOM.x1 &&
      y <= DUNGEON_WING_ROOM.y1
    );
  }

  function setDungeonGateOpen(_open) {
    const zone = getZoneState(ZONE_KEYS.DUNGEON);
    if (!zone?.map) return;
    let changed = false;
    for (const tilePos of [DUNGEON_WING_GATE, DUNGEON_WING_GATE_BOTTOM]) {
      if (!zone.map[tilePos.y]) continue;
      if ((zone.map[tilePos.y][tilePos.x] | 0) !== 4) {
        zone.map[tilePos.y][tilePos.x] = 4;
        changed = true;
      }
    }
    if (changed && getActiveZone() === ZONE_KEYS.DUNGEON) rebuildNavigation();
  }

  function syncDungeonQuestState() {
    const secondId = "ashes_under_the_keep";
    const gateObjectiveId = "enter_wing";
    const brazierObjectiveId = "light_brazier";
    const wardenObjectiveId = "defeat_warden";
    const secondStarted = isQuestStarted(secondId);
    const secondCompleted = isQuestCompleted(secondId);
    const wardenDefeated = isQuestObjectiveComplete(secondId, wardenObjectiveId);

    const gateOpen = secondCompleted || isQuestObjectiveComplete(secondId, gateObjectiveId);
    setDungeonGateOpen(gateOpen);

    const dungeonZone = getZoneState(ZONE_KEYS.DUNGEON);
    if (!dungeonZone) return;

    for (const gateIt of dungeonZone.interactables) {
      if (gateIt.type !== "sealed_gate") continue;
      gateIt.open = gateOpen;
    }

    for (const brazier of DUNGEON_WING_BRAZIERS) {
      const token = `brazier:${brazier.id}`;
      const it = dungeonZone.interactables.find((row) =>
        row.type === "brazier" &&
        row.x === brazier.x &&
        row.y === brazier.y &&
        String(row.brazierId || "") === String(brazier.id)
      );
      if (!it) continue;
      if (!wardenDefeated) {
        it.lit = hasQuestObjectiveToken(secondId, brazierObjectiveId, token);
      }
    }

    const braziersComplete = DUNGEON_WING_BRAZIERS.every((brazier) => {
      if (!wardenDefeated) {
        return hasQuestObjectiveToken(secondId, brazierObjectiveId, `brazier:${brazier.id}`);
      }
      const it = dungeonZone.interactables.find((row) =>
        row.type === "brazier" &&
        row.x === brazier.x &&
        row.y === brazier.y &&
        String(row.brazierId || "") === String(brazier.id)
      );
      return !!it?.lit;
    });
    const hasWingFixtures = dungeonZone.interactables.some((it) => it.type === "sealed_gate");
    const shouldSpawnWarden = hasWingFixtures && secondStarted && gateOpen && braziersComplete;

    const warden = dungeonZone.mobs.find((m) => String(m?.type || "") === "skeleton_warden");
    if (shouldSpawnWarden) {
      if (!warden) {
        withZone(ZONE_KEYS.DUNGEON, () => {
          placeMob("skeleton_warden", DUNGEON_WARDEN_SPAWN.x, DUNGEON_WARDEN_SPAWN.y);
        });
        if (getActiveZone() === ZONE_KEYS.DUNGEON) {
          chatLine(`<span class="warn">A heavy rattle rolls through the wing. The Skeleton Warden awakens.</span>`);
        }
      } else if (warden.alive) {
        warden.homeX = DUNGEON_WARDEN_SPAWN.x;
        warden.homeY = DUNGEON_WARDEN_SPAWN.y;
      }
    }
  }

  function resetDungeonWardenBraziers() {
    const dungeonZone = getZoneState(ZONE_KEYS.DUNGEON);
    if (!dungeonZone) return;
    for (const it of dungeonZone.interactables) {
      if (it.type === "brazier") it.lit = false;
    }
  }

  function handleMobDefeated(mob) {
    if (String(mob?.type || "") !== "skeleton_warden") return;

    const dungeonZone = getZoneState(ZONE_KEYS.DUNGEON);
    if (dungeonZone) {
      const idx = dungeonZone.mobs.indexOf(mob);
      if (idx >= 0) dungeonZone.mobs.splice(idx, 1);
    }

    const secondId = "ashes_under_the_keep";
    if (isQuestStarted(secondId) && !isQuestCompleted(secondId)) {
      const row = getQuestProgress(secondId);
      const def = getQuestDefById(secondId);
      if (row && def) {
        const enterObjectiveId = "enter_wing";
        const brazierObjectiveId = "light_brazier";
        const wardenObjectiveId = "defeat_warden";
        const enterObjective = (def.objectives || []).find((o) => String(o?.id || "") === enterObjectiveId);
        const brazierObjective = (def.objectives || []).find((o) => String(o?.id || "") === brazierObjectiveId);
        const wardenObjective = (def.objectives || []).find((o) => String(o?.id || "") === wardenObjectiveId);

        if (row.progress && typeof row.progress === "object") {
          row.progress[enterObjectiveId] = Math.max(
            getQuestObjectiveTarget(enterObjective || { target: 1 }),
            row.progress[enterObjectiveId] | 0
          );
          row.progress[wardenObjectiveId] = Math.max(
            getQuestObjectiveTarget(wardenObjective || { target: 1 }),
            row.progress[wardenObjectiveId] | 0
          );
        }

        if (!row.tokens || typeof row.tokens !== "object") row.tokens = Object.create(null);
        if (!row.tokens[brazierObjectiveId] || typeof row.tokens[brazierObjectiveId] !== "object") {
          row.tokens[brazierObjectiveId] = Object.create(null);
        }
        for (const brazier of DUNGEON_WING_BRAZIERS) {
          row.tokens[brazierObjectiveId][`brazier:${brazier.id}`] = 1;
        }
        if (row.progress && typeof row.progress === "object") {
          const litCount = DUNGEON_WING_BRAZIERS.reduce((n, brazier) => {
            const token = `brazier:${brazier.id}`;
            return n + (row.tokens[brazierObjectiveId]?.[token] ? 1 : 0);
          }, 0);
          row.progress[brazierObjectiveId] = Math.max(
            Math.min(getQuestObjectiveTarget(brazierObjective || { target: DUNGEON_WING_BRAZIERS.length }), litCount),
            row.progress[brazierObjectiveId] | 0
          );
        }
      }
    }

    resetDungeonWardenBraziers();
    if (isQuestReadyToComplete(secondId)) completeQuest(secondId);
    chatLine(`<span class="muted">As the Warden collapses, the ritual braziers gutter out.</span>`);
    syncDungeonQuestState();
    renderQuests();
  }

  function handleUseSealedGate(gate) {
    const secondId = "ashes_under_the_keep";
    const gateObjectiveId = "enter_wing";
    const gateAlreadyUnlocked = (
      !!gate?.open ||
      isQuestCompleted(secondId) ||
      isQuestObjectiveComplete(secondId, gateObjectiveId)
    );

    if (!gateAlreadyUnlocked && !hasItem("warden_key_fragment")) {
      chatLine(`<span class="warn">The lock rejects you. You need the Warden Key Fragment.</span>`);
      return;
    }

    const gy = Number.isFinite(gate?.y) ? (gate.y | 0) : DUNGEON_WING_GATE.y;
    const fromLeft = (player.x <= DUNGEON_WING_GATE.x);
    const candidateY = [gy, (gy === DUNGEON_WING_GATE.y ? DUNGEON_WING_GATE_BOTTOM.y : DUNGEON_WING_GATE.y)];
    let moved = false;
    for (const y of candidateY) {
      const tx = fromLeft ? (DUNGEON_WING_GATE.x + 1) : (DUNGEON_WING_GATE.x - 1);
      if (teleportPlayerTo(tx, y, { requireWalkable: true })) {
        moved = true;
        break;
      }
    }

    if (!moved) {
      chatLine(`<span class="warn">The gate won't budge from this angle.</span>`);
      return;
    }

    if (!gateAlreadyUnlocked) {
      removeItemsFromInventory("warden_key_fragment", 1);
      chatLine(`<span class="good">Your key fragment resonates, then crumbles. The gate unlocks for good.</span>`);

      if (isQuestStarted(secondId) && !isQuestCompleted(secondId)) {
        trackQuestEvent({
          type: "manual",
          questId: secondId,
          objectiveId: gateObjectiveId,
          qty: 1,
          token: "wing_gate_pass"
        });
      } else {
        const row = getQuestProgress(secondId);
        const def = getQuestDefById(secondId);
        const gateObjective = (def?.objectives || []).find((o) => String(o?.id || "") === gateObjectiveId);
        const target = getQuestObjectiveTarget(gateObjective || { target: 1 });
        if (row?.progress) {
          row.progress[gateObjectiveId] = Math.max(target, row.progress[gateObjectiveId] | 0);
          if (!row.tokens || typeof row.tokens !== "object") row.tokens = Object.create(null);
          if (!row.tokens[gateObjectiveId] || typeof row.tokens[gateObjectiveId] !== "object") {
            row.tokens[gateObjectiveId] = Object.create(null);
          }
          row.tokens[gateObjectiveId].wing_gate_pass = 1;
        }
      }
    } else {
      chatLine(`<span class="good">The gate remains open.</span>`);
    }
    syncDungeonQuestState();
  }

  function handleUseDungeonBrazier(brazier) {
    const secondId = "ashes_under_the_keep";
    const objectiveId = "light_brazier";
    const wardenDefeated = isQuestObjectiveComplete(secondId, "defeat_warden");
    if (!isQuestStarted(secondId)) {
      chatLine(`<span class="muted">Cold ash. It seems tied to some unfinished ritual.</span>`);
      return;
    }
    if (!isQuestObjectiveComplete(secondId, "enter_wing")) {
      chatLine(`<span class="muted">You should unseal the gate before disturbing the braziers.</span>`);
      return;
    }

    const brazierId = String(brazier?.brazierId || "");
    const token = `brazier:${brazierId}`;
    if (!brazierId) {
      chatLine(`<span class="muted">The brazier is broken and cannot be lit.</span>`);
      return;
    }

    if (!wardenDefeated && hasQuestObjectiveToken(secondId, objectiveId, token)) {
      chatLine(`<span class="muted">That brazier is already burning.</span>`);
      return;
    }
    if (wardenDefeated && brazier?.lit) {
      chatLine(`<span class="muted">That brazier is already burning.</span>`);
      return;
    }

    chatLine(`<span class="good">You rekindle the brazier. Old runes flare to life.</span>`);
    if (wardenDefeated) {
      if (brazier) brazier.lit = true;
    } else {
      trackQuestEvent({
        type: "manual",
        questId: secondId,
        objectiveId,
        qty: 1,
        token
      });
    }
    if (brazier) brazier.lit = true;
    syncDungeonQuestState();
  }

  function updateDungeonQuestTriggers() {
    const secondId = "ashes_under_the_keep";
    if (getActiveZone() !== ZONE_KEYS.DUNGEON) return;
    if (!isQuestStarted(secondId) || isQuestCompleted(secondId)) return;
    if (isQuestObjectiveComplete(secondId, "enter_wing")) return;
    if (!isInDungeonWing(player.x, player.y)) return;

    chatLine(`<span class="muted">You step into the sealed wing. The air turns ash-cold.</span>`);
    trackQuestEvent({
      type: "manual",
      questId: secondId,
      objectiveId: "enter_wing",
      qty: 1,
      token: "wing_entry"
    });
    syncDungeonQuestState();
  }

  function useLadder(direction) {
    if (direction === "down") {
      if (getActiveZone() !== ZONE_KEYS.OVERWORLD) return false;
      seedDungeonZone({ forcePopulateMobs: false, migrateLegacyPositions: true });
      setCurrentZone(ZONE_KEYS.DUNGEON, { syncCamera: false });
      teleportPlayerTo(DUNGEON_SPAWN_TILE.x, DUNGEON_SPAWN_TILE.y, { requireWalkable: true, invulnMs: 900 });
      chatLine(`<span class="muted">You climb down the ladder into a dungeon.</span>`);
      return true;
    }
    if (direction === "up") {
      if (getActiveZone() !== ZONE_KEYS.DUNGEON) return false;
      setCurrentZone(ZONE_KEYS.OVERWORLD, { syncCamera: false });
      teleportPlayerTo(OVERWORLD_RETURN_TILE.x, OVERWORLD_RETURN_TILE.y, { requireWalkable: true, invulnMs: 900 });
      chatLine(`<span class="muted">You climb up and return to the surface.</span>`);
      return true;
    }
    return false;
  }

  function setCurrentZone(zoneKey, options = {}) {
    const prev = getActiveZone();
    if (!setActiveZone(zoneKey)) return false;
    rebuildNavigation();

    if (!options.keepTarget) player.target = null;
    if (!options.keepPath) player.path = [];
    if (!options.keepAction) {
      player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    }

    if (options.syncCamera !== false) updateCamera();
    return prev !== getActiveZone();
  }

  function defaultSpawnForZone(zoneKey) {
    if (zoneKey === ZONE_KEYS.DUNGEON) return { x: DUNGEON_SPAWN_TILE.x, y: DUNGEON_SPAWN_TILE.y };
    return { x: startCastle.x0 + 6, y: startCastle.y0 + 4 };
  }

  function teleportPlayerTo(tx, ty, options = {}) {
    const x = tx | 0;
    const y = ty | 0;
    if (!inBounds(x, y)) return false;
    if (options.requireWalkable !== false && !isWalkable(x, y)) return false;

    player.x = x;
    player.y = y;
    player.path = [];
    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    syncPlayerPix();

    if (options.invulnMs > 0) player.invulnUntil = now() + (options.invulnMs | 0);
    updateCamera();
    return true;
  }

  function resetCharacter() {
    const deletedId = getActiveCharacterId();
    deleteCharacterById(deletedId);
    refreshStartOverlay();

    for (const k of Object.keys(Skills)) Skills[k].xp = 0;
    clearSlots(inv);
    clearSlots(bank);
    setBankCapacity(BANK_START_SLOTS, { silent: true });
    quiver.wooden_arrow = 0;
    wallet.gold = 0;

    equipment.weapon = null;
    equipment.offhand = null;
    equipment.head = null;
    equipment.body = null;
    equipment.legs = null;
    equipment.hands = null;
    equipment.feet = null;
    resetWorldUpgrades();
    resetQuestProgress();
    resetRenownGrants();

    setCurrentZone(ZONE_KEYS.OVERWORLD, { keepAction: true, keepPath: true, keepTarget: true, syncCamera: false });
    clearAllZoneRuntime();

    player.path = [];
    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    player.hp = BASE_HP;
    player.maxHp = BASE_HP;

    closeCtxMenu();
    setUseState(null);

    for (const k of Object.keys(windowsOpen)) windowsOpen[k] = false;
    applyWindowVis();

    renderSkills();
    renderQuests();
    renderInv();
    renderBank();
    renderEquipment();
    renderQuiver();
    renderHPHUD();
    updateCamera();
  }

  function startNewGame() {
    closeCtxMenu();
    setUseState(null);

    initWorldSeed();

    for (const k of Object.keys(Skills)) Skills[k].xp = 0;

    clearSlots(bank);
    setBankCapacity(BANK_START_SLOTS, { silent: true });
    quiver.wooden_arrow = 0;
    wallet.gold = 0;
    equipment.weapon = null;
    equipment.offhand = null;
    equipment.head = null;
    equipment.body = null;
    equipment.legs = null;
    equipment.hands = null;
    equipment.feet = null;
    resetWorldUpgrades();
    resetQuestProgress();
    resetRenownGrants();
    setCurrentZone(ZONE_KEYS.OVERWORLD, { keepAction: true, keepPath: true, keepTarget: true, syncCamera: false });
    clearAllZoneRuntime();

    recalcMaxHPFromHealth();
    player.hp = player.maxHp;

    applyStartingInventory();

    seedResources();
    seedMobs();
    seedInteractables();

    // [DEBUG] Log diagnostic info after seeding
    const activeZoneAfterSeed = getActiveZone();
    const projectNpcCount = (interactables || []).filter(it => it.type === 'project_npc').length;
    const projectNpcIds = (interactables || []).filter(it => it.type === 'project_npc').map(it => it.npcId);
    if (projectNpcCount > 0) {
      console.log(`[DEBUG NEW GAME] zone=${activeZoneAfterSeed} interactablesTotal=${(interactables || []).length} projectNpcCount=${projectNpcCount} npcIds=[${projectNpcIds.join(',')}]`);
    }
    
    seedDungeonZone({ forcePopulateMobs: true });

    player.x = startCastle.x0 + 6;
    player.y = startCastle.y0 + 4;
    syncPlayerPix();
    player.path = [];
    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    player.attackCooldownUntil = 0;
    player.invulnUntil = now() + 1200;

    player._lastRangeMsgAt = 0;

    setZoom(ZOOM_DEFAULT);

    renderSkills();
    renderQuests();
    renderInv();
    renderBank();
    renderEquipment();
    renderQuiver();
    renderHPHUD();
    updateCamera();
  }

  return {
    clearZoneRuntime,
    clearAllZoneRuntime,
    withZone,
    dungeonLayoutSignature,
    migrateDungeonLegacyMobLayout,
    rebuildDungeonTileLayout,
    seedDungeonZone,
    isInDungeonWing,
    setDungeonGateOpen,
    syncDungeonQuestState,
    resetDungeonWardenBraziers,
    handleMobDefeated,
    handleUseSealedGate,
    handleUseDungeonBrazier,
    updateDungeonQuestTriggers,
    useLadder,
    setCurrentZone,
    defaultSpawnForZone,
    teleportPlayerTo,
    resetCharacter,
    startNewGame
  };
}
