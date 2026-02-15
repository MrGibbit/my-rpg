export function createDebugAPI(deps) {
  const {
    debugApiEnabled,
    testMode,
    getActiveZone,
    inv,
    wallet,
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
    getQuestSnapshot,
    emitQuestEvent,
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
      windowsOpen: { ...windowsOpen }
    };
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
        deserialize(raw);
        return true;
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
      }
    };

    window.__classicRpg = api;
  }

  return {
    getDebugState,
    mountDebugApi
  };
}
