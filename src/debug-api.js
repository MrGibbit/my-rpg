export function createDebugAPI(deps) {
  const {
    debugApiEnabled,
    testMode,
    getActiveZone,
    inv,
    wallet,
    Items,
    player,
    mobs,
    resources,
    interactables,
    groundLoot,
    windowsOpen,
    overworldLadderDown,
    dungeonLadderUp,
    startNewGame,
    setCurrentZone,
    defaultSpawnForZone,
    teleportPlayerTo,
    updateCamera,
    inBounds,
    getEntityAt,
    beginInteraction,
    useLadder,
    saveCharacterPrefs,
    getCurrentSaveKey,
    serialize,
    deserialize,
    getLastLoadRepairReport,
    getQuestSnapshot,
    emitQuestEvent,
    getTownRenown,
    grantTownRenown,
    addGold,
    addToInventory,
    renderInv,
    forceActionCompleteError,
    clamp,
    update,
    render
  } = deps;

  function getInventoryQty(itemId) {
    const id = String(itemId || "");
    if (!id || !Array.isArray(inv)) return 0;
    let total = 0;
    for (const slot of inv) {
      if (!slot || String(slot.id || "") !== id) continue;
      total += Math.max(0, slot.qty | 0);
    }
    return total;
  }

  function getDebugState() {
    return {
      zone: getActiveZone(),
      player: {
        x: player.x | 0,
        y: player.y | 0,
        hp: player.hp | 0,
        maxHp: player.maxHp | 0,
        class: player.class,
        name: player.name
      },
      counts: {
        mobs: mobs.length | 0,
        resources: resources.length | 0,
        interactables: interactables.length | 0,
        lootPiles: groundLoot.size | 0
      },
      interactables: Array.from(interactables).map(it => ({
        type: it?.type,
        x: it?.x,
        y: it?.y,
        npcId: it?.npcId,
        name: it?.name
      })),
      windowsOpen: { ...windowsOpen }
    };
  }

  function addStackToInventory(itemId, qty) {
    const id = String(itemId || "");
    const amount = Math.max(0, qty | 0);
    if (!id || amount <= 0) return 0;
    const item = Items?.[id];

    if (item?.stack) {
      const slot = inv.find((s) => s && s.id === id);
      if (slot) {
        slot.qty = Math.max(1, (slot.qty | 0) + amount);
        return amount;
      }
      const empty = inv.findIndex((s) => !s);
      if (empty < 0) return 0;
      inv[empty] = { id, qty: amount };
      return amount;
    }

    let added = 0;
    for (let i = 0; i < amount; i++) {
      const empty = inv.findIndex((s) => !s);
      if (empty < 0) break;
      inv[empty] = { id, qty: 1 };
      added++;
    }
    return added;
  }

  function mountDebugApi() {
    if (!debugApiEnabled) return;

    const api = {
      testMode,
      getState: () => getDebugState(),
      getQuests: () => {
        if (typeof getQuestSnapshot !== "function") return null;
        return getQuestSnapshot();
      },
      questEvent: (payload) => {
        if (!payload || typeof payload !== "object" || typeof emitQuestEvent !== "function") {
          return { ok: false };
        }
        emitQuestEvent(payload);
        return {
          ok: true,
          quests: (typeof getQuestSnapshot === "function") ? getQuestSnapshot() : null
        };
      },
      getItemQty: (itemId) => getInventoryQty(itemId),
      getGold: () => Math.max(0, wallet?.gold | 0),
      getLadders: () => ({
        overworldDown: { ...overworldLadderDown },
        dungeonUp: { ...dungeonLadderUp }
      }),
      newGame: () => {
        startNewGame();
        return getDebugState();
      },
      setZone: (zoneKey, options = {}) => {
        const key = String(zoneKey || "").toLowerCase();
        const spawn = (options?.spawn !== false);
        const changed = setCurrentZone(key);
        if (spawn) {
          const p = defaultSpawnForZone(key);
          teleportPlayerTo(p.x, p.y, { requireWalkable: false, invulnMs: 1200 });
        } else {
          updateCamera();
        }
        return { changed, zone: getActiveZone(), ok: (getActiveZone() === key) };
      },
      interactTile: (x, y) => {
        const tx = x | 0;
        const ty = y | 0;
        if (!inBounds(tx, ty)) return { ok: false, reason: "out_of_bounds" };
        const ent = getEntityAt(tx, ty);
        if (!ent) return { ok: false, reason: "no_entity" };
        if (ent.kind === "decor") return { ok: false, reason: "decor_only", kind: ent.kind };
        beginInteraction(ent);
        return { ok: true, kind: ent.kind };
      },
      useLadder: (direction) => useLadder(direction),
      teleport: (x, y, options = {}) => teleportPlayerTo(x, y, options),
      saveNow: () => {
        saveCharacterPrefs({ createNew: false });
        localStorage.setItem(getCurrentSaveKey(), serialize());
        return true;
      },
      loadNow: () => {
        const raw = localStorage.getItem(getCurrentSaveKey());
        if (!raw) return false;
        return !!deserialize(raw);
      },
      getLoadRepairReport: () => {
        if (typeof getLastLoadRepairReport !== "function") return null;
        return getLastLoadRepairReport();
      },
      clearSave: () => {
        localStorage.removeItem(getCurrentSaveKey());
        return true;
      },
      tickMs: (ms = 16) => {
        const dt = clamp((Number(ms) || 0) / 1000, 0, 0.25);
        update(dt);
        render();
        return getDebugState();
      },
      triggerActionCompleteError: () => {
        if (typeof forceActionCompleteError !== "function") return false;
        return !!forceActionCompleteError();
      },
      projectKit: (options = {}) => {
        const targetRenown = Math.max(0, (options.renown ?? 70) | 0);
        const targetGold = Math.max(0, (options.gold ?? 2000) | 0);
        const items = options.items || {
          log: 100,
          iron_bar: 15,
          cooked_food: 15,
          crude_bar: 5
        };

        if (typeof getTownRenown === "function" && typeof grantTownRenown === "function") {
          const current = getTownRenown("rivermoor") | 0;
          const delta = Math.max(0, targetRenown - current);
          if (delta > 0) grantTownRenown("rivermoor", delta, "Debug project kit applied.");
        }

        if (typeof addGold === "function") {
          const have = Math.max(0, wallet?.gold | 0);
          const delta = Math.max(0, targetGold - have);
          if (delta > 0) addGold(delta);
        }

        if (items && typeof items === "object") {
          for (const [id, qty] of Object.entries(items)) {
            const amount = Math.max(0, qty | 0);
            if (amount <= 0) continue;
            if (typeof addToInventory === "function") {
              addStackToInventory(id, amount);
            }
          }
          if (typeof renderInv === "function") renderInv();
        }

        return {
          ok: true,
          renown: (typeof getTownRenown === "function") ? getTownRenown("rivermoor") : null,
          gold: Math.max(0, wallet?.gold | 0)
        };
      }
    };

    window.__classicRpg = api;
  }

  return {
    getDebugState,
    mountDebugApi
  };
}
