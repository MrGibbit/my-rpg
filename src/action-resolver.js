export function createActionResolver(deps) {
  const PLAYER_ATTACK_COOLDOWN_MS = 1050;
  const {
    player,
    interactables,
    stopAction,
    inRangeOfTile,
    isWalkable,
    setPathTo,
    chatLine,
    availability,
    updateBankIcon,
    openWindow,
    renderVendorUI,
    renderSmithingUI,
    clamp,
    useState,
    COOK_RECIPES,
    SMELTING_TIERS,
    MINING_RESOURCE_RULES,
    hasItem,
    Items,
    startTimedAction,
    removeItemsFromInventory,
    setUseState,
    addToInventory,
    addXP,
    addGroundLoot,
    levelFromXP,
    Skills,
    emptyInvSlots,
    resources,
    now,
    getCombatStyle,
    resolveMeleeTileOverlap,
    tilesFromPlayerToTile,
    hasLineOfSightTiles,
    findBestTileWithinRange,
    findBestMeleeEngagePath,
    mobs,
    consumeFromQuiver,
    rollPlayerAttack,
    spawnCombatFX,
    meleeState,
    equipment,
    addGold,
    onUseLadder,
    onQuestEvent,
    onTalkQuestNpc,
    onTalkProjectNpc,
    onUseSealedGate,
    onUseDungeonBrazier,
    onMobDefeated
  } = deps;

  const XP_TIER_MIN = 1;
  const XP_TIER_MAX = 90;
  const MINING_XP_BASE = 40;
  const MINING_XP_TOP = 220;
  const MINING_XP_EXPONENT = 1.35;
  const SMELTING_XP_BASE = 20;
  const SMELTING_XP_TOP = 160;
  const SMELTING_XP_EXPONENT = 1.45;
  const MELEE_TRAIN_SKILLS = ["accuracy", "power", "defense"];
  const FISHING_CATCH_CHANCE_MIN = 0.34;
  const FISHING_CATCH_CHANCE_PER_LEVEL = 0.035;
  const FISHING_CATCH_CHANCE_MAX = 0.82;
  const FISHING_TIERS_STARTER = [
    { level: 30, itemId: "catfish", xp: 36 },
    { level: 20, itemId: "pufferfish", xp: 29 },
    { level: 10, itemId: "clownfish", xp: 22 },
    { level: 1, itemId: "goldfish", xp: 15 }
  ];
  const FISHING_TIERS_DOCK = [
    { level: 70, itemId: "moonfish", xp: 61 },
    { level: 55, itemId: "anglerfish", xp: 51 },
    { level: 40, itemId: "swordfish", xp: 43 }
  ];

  function getFishingTierPool(spotType) {
    return spotType === "fish_dock" ? FISHING_TIERS_DOCK : FISHING_TIERS_STARTER;
  }
  const AUTO_COOK_ITEM_IDS = [
    "rat_meat",
    "chaos_koi",
    "moonfish",
    "anglerfish",
    "swordfish",
    "catfish",
    "pufferfish",
    "clownfish",
    "goldfish"
  ];

  function clampTier(value) {
    return Math.max(XP_TIER_MIN, Math.min(XP_TIER_MAX, value | 0));
  }

  function xpFromTier(tier, baseXp, topXp, exponent) {
    const t = clampTier(tier);
    const pct = (t - XP_TIER_MIN) / (XP_TIER_MAX - XP_TIER_MIN);
    return Math.round(baseXp + (topXp - baseXp) * Math.pow(pct, exponent));
  }

  function readTier(row) {
    if (!row || typeof row !== "object") return XP_TIER_MIN;
    if (Number.isFinite(row.tier)) return clampTier(row.tier);
    if (Number.isFinite(row.level)) return clampTier(row.level);
    return XP_TIER_MIN;
  }

  function readLevel(row) {
    if (!row || typeof row !== "object") return 1;
    if (Number.isFinite(row.level)) return Math.max(1, row.level | 0);
    return Math.max(1, readTier(row));
  }

  function readSmeltingXp(row) {
    if (Number.isFinite(row?.xp)) return Math.max(1, row.xp | 0);
    return xpFromTier(readTier(row), SMELTING_XP_BASE, SMELTING_XP_TOP, SMELTING_XP_EXPONENT);
  }

  function readMiningXp(row) {
    if (Number.isFinite(row?.xp)) return Math.max(1, row.xp | 0);
    return xpFromTier(readTier(row), MINING_XP_BASE, MINING_XP_TOP, MINING_XP_EXPONENT);
  }

  function getMeleeTrainingSkills() {
    const raw = Array.isArray(meleeState?.selected) ? meleeState.selected : [meleeState?.selected];
    const picked = new Set();
    for (const key of raw) {
      if (key === "accuracy" || key === "power" || key === "defense") picked.add(key);
    }
    const out = [];
    for (const key of MELEE_TRAIN_SKILLS) {
      if (picked.has(key)) out.push(key);
    }
    if (!out.length) out.push("accuracy");
    return out;
  }

  function awardMeleeXpSplit(totalXp) {
    const xp = Math.max(0, totalXp | 0);
    if (!xp) return;

    const selected = getMeleeTrainingSkills();
    const count = selected.length;
    const each = Math.floor(xp / count);
    const rem = xp % count;

    if (each > 0) {
      for (const skillKey of selected) addXP(skillKey, each);
    }

    if (rem > 0) {
      const start = Math.max(0, meleeState?.splitCursor | 0) % count;
      for (let i = 0; i < rem; i++) {
        addXP(selected[(start + i) % count], 1);
      }
      if (meleeState && typeof meleeState === "object") {
        meleeState.splitCursor = (start + rem) % count;
      }
    }
  }

  const DEFAULT_SMELTING_TIERS = [
    { oreId: "ore", barId: "crude_bar", level: 1, tier: 1, xp: 20 },
    { oreId: "iron_ore", barId: "iron_bar", level: 10, tier: 10, xp: 25 }
  ];
  const DEFAULT_MINING_RESOURCE_RULES = {
    rock: { oreId: "ore", level: 1, tier: 1, xp: 40, label: "rock" },
    iron_rock: { oreId: "iron_ore", level: 10, tier: 10, xp: 48, label: "iron rock" }
  };
  const smeltingTierSource = (Array.isArray(SMELTING_TIERS) && SMELTING_TIERS.length)
    ? SMELTING_TIERS
    : DEFAULT_SMELTING_TIERS;
  const smeltingTiers = smeltingTierSource
    .map((row) => ({
      oreId: String(row?.oreId || ""),
      barId: String(row?.barId || ""),
      level: readLevel(row),
      tier: readTier(row),
      xp: readSmeltingXp(row)
    }))
    .filter((row) => row.oreId && row.barId)
    .sort((a, b) => (b.level - a.level));
  const miningRules = (MINING_RESOURCE_RULES && typeof MINING_RESOURCE_RULES === "object" && Object.keys(MINING_RESOURCE_RULES).length)
    ? MINING_RESOURCE_RULES
    : DEFAULT_MINING_RESOURCE_RULES;

  function emitQuestEvent(payload) {
    if (typeof onQuestEvent !== "function" || !payload || typeof payload !== "object") return;
    onQuestEvent(payload);
  }

  function getMiningRule(resourceType) {
    const key = String(resourceType || "");
    const row = miningRules[key];
    if (!row || typeof row !== "object") return null;
    const oreId = String(row.oreId || "");
    if (!oreId) return null;
    return {
      oreId,
      level: readLevel(row),
      tier: readTier(row),
      xp: readMiningXp(row),
      label: String(row.label || key || "resource")
    };
  }

  function getSmeltingPlan(smithingLevel) {
    const ownedTiers = smeltingTiers.filter((tier) => hasItem(tier.oreId));
    if (!ownedTiers.length) return { ok: false, reason: "no_ore" };

    const unlocked = ownedTiers.find((tier) => smithingLevel >= tier.level);
    if (unlocked) return { ok: true, tier: unlocked };

    const nearestTier = ownedTiers.reduce((best, tier) => {
      if (!best) return tier;
      return tier.level < best.level ? tier : best;
    }, null);
    return {
      ok: false,
      reason: "level",
      requiredLevel: nearestTier ? nearestTier.level : 1,
      tier: nearestTier
    };
  }

  function stopIfInventoryFull(message = "Inventory full.") {
    if (emptyInvSlots() > 0) return false;
    stopAction(message);
    return true;
  }

  function addGatherItemOrStop(itemId, fullMessage) {
    const got = addToInventory(itemId, 1);
    if (got === 1) return true;
    chatLine(fullMessage);
    stopAction();
    return false;
  }

  function finishGatherSuccess(skillKey, xpAmount, successMessage) {
    addXP(skillKey, xpAmount);
    chatLine(successMessage);
    stopIfInventoryFull("Inventory full.");
  }

  function startGatherAction(config) {
    const {
      actionType,
      durationMs,
      actionLabel,
      itemId,
      fullMessage,
      onCollected,
      skillKey,
      xpAmount,
      successMessage
    } = config;

    startTimedAction(actionType, durationMs, actionLabel, () => {
      if (stopIfInventoryFull("Inventory full.")) return;
      if (!addGatherItemOrStop(itemId, fullMessage)) return;
      emitQuestEvent({ type: "gather_item", itemId, skillKey, qty: 1 });

      if (typeof onCollected === "function") onCollected();
      finishGatherSuccess(skillKey, xpAmount, successMessage);
    });
  }

  // ---------- Batch Cooking Helpers ----------
  function findNextCookable(priorityItemId) {
    // If a specific item is prioritized and cookable, use it
    if (priorityItemId && COOK_RECIPES[priorityItemId] && hasItem(priorityItemId)) {
      return priorityItemId;
    }
    // Otherwise find the first cookable by priority order
    return AUTO_COOK_ITEM_IDS.find((itemId) => COOK_RECIPES[itemId] && hasItem(itemId)) || null;
  }

  function shouldContinueBatchCooking(cookId) {
    // cookId is the item we just cooked
    // Return true if we should cook again, false if we should stop
    if (!cookId) return false;
    
    // Find another cookable item
    const nextCookable = findNextCookable(null);
    if (!nextCookable) return false;

    // Make sure we have inventory space (at least one slot)
    if (emptyInvSlots() <= 0) return false;

    return true;
  }

  function ensureWalkIntoRangeAndAct() {
    const t = player.target;
    if (!t) return;

    if (t.kind === "bank") {
      const b = interactables[t.index];
      if (!b) return stopAction();

      if (!inRangeOfTile(b.x, b.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: b.x + dx, y: b.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to bank.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;

      chatLine(`<span class="muted">You open the bank chest.</span>`);
      availability.bank = true;
      updateBankIcon();

      openWindow("bank");
      stopAction();
      return;
    }

    if (t.kind === "vendor") {
      const v = interactables[t.index];
      if (!v) return stopAction();

      if (!inRangeOfTile(v.x, v.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: v.x + dx, y: v.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to vendor.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;

      chatLine(`<span class="muted">You start trading.</span>`);
      openWindow("vendor");
      renderVendorUI();

      stopAction();
      return;
    }

    if (t.kind === "quest_npc") {
      const npc = interactables[t.index];
      if (!npc) return stopAction();

      if (!inRangeOfTile(npc.x, npc.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to NPC.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;

      const npcId = String(npc.npcId || "quartermaster");
      if (typeof onTalkQuestNpc === "function") onTalkQuestNpc(npcId, npc);
      emitQuestEvent({ type: "talk_npc", npcId, qty: 1 });
      stopAction();
      return;
    }

    if (t.kind === "project_npc") {
      const npc = interactables[t.index];
      if (!npc) return stopAction();

      if (!inRangeOfTile(npc.x, npc.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: npc.x + dx, y: npc.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to NPC.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;

      const npcId = String(npc.npcId || "");
      if (typeof onTalkProjectNpc === "function") onTalkProjectNpc(npcId, npc);
      stopAction();
      return;
    }

    if (t.kind === "sealed_gate") {
      const gate = interactables[t.index];
      if (!gate) return stopAction();

      if (!inRangeOfTile(gate.x, gate.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: gate.x + dx, y: gate.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to sealed gate.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;
      if (typeof onUseSealedGate === "function") onUseSealedGate(gate);
      stopAction();
      return;
    }

    if (t.kind === "brazier") {
      const brazier = interactables[t.index];
      if (!brazier) return stopAction();

      if (!inRangeOfTile(brazier.x, brazier.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: brazier.x + dx, y: brazier.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to brazier.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      if (player.action.type !== "idle") return;
      if (typeof onUseDungeonBrazier === "function") onUseDungeonBrazier(brazier);
      stopAction();
      return;
    }

    if (t.kind === "ladder_down" || t.kind === "ladder_up") {
      const ladder = interactables[t.index];
      if (!ladder) return stopAction();

      if (!inRangeOfTile(ladder.x, ladder.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: ladder.x + dx, y: ladder.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to ladder.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(ladder.x - player.x, -1, 1);
      player.facing.y = clamp(ladder.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;

      const direction = (t.kind === "ladder_down") ? "down" : "up";
      const transitioned = (typeof onUseLadder === "function")
        ? !!onUseLadder(direction, ladder)
        : false;
      if (!transitioned) return stopAction("The ladder leads nowhere.");

      stopAction();
      return;
    }

    if (t.kind === "furnace") {
      const fz = interactables[t.index];
      if (!fz) return stopAction();

      if (!inRangeOfTile(fz.x, fz.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: fz.x + dx, y: fz.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to furnace.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(fz.x - player.x, -1, 1);
      player.facing.y = clamp(fz.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;
      const smithingLevel = levelFromXP(Skills.smithing?.xp ?? 0);
      const smeltPlan = getSmeltingPlan(smithingLevel);
      if (!smeltPlan.ok && smeltPlan.reason === "no_ore") {
        chatLine(`<span class="muted">The furnace is ready. You need ore.</span>`);
        stopAction();
        return;
      }
      if (!smeltPlan.ok && smeltPlan.reason === "level") {
        const oreName = Items[smeltPlan.tier?.oreId]?.name ?? smeltPlan.tier?.oreId ?? "that ore";
        stopAction(`You need Smithing level ${smeltPlan.requiredLevel} to smelt ${oreName}.`);
        return;
      }
      if (!smeltPlan.ok || !smeltPlan.tier) return;

      const smeltId = smeltPlan.tier.oreId;
      const smeltOutId = smeltPlan.tier.barId;
      const smeltXp = smeltPlan.tier.xp;
      chatLine(`You feed ${Items[smeltId]?.name ?? smeltId} into the furnace...`);
      startTimedAction("smelt", 1600, "Smelting...", () => {
        if (!removeItemsFromInventory(smeltId, 1)) {
          chatLine(`<span class="warn">You need ${Items[smeltId]?.name ?? smeltId}.</span>`);
          return;
        }
        const got = addToInventory(smeltOutId, 1);
        addXP("smithing", smeltXp);
        emitQuestEvent({ type: "smelt_item", itemId: smeltOutId, fromItemId: smeltId, qty: 1 });

        if (got === 1) {
          chatLine(`<span class="good">You smelt a ${Items[smeltOutId]?.name ?? smeltOutId}.</span> (+${smeltXp} XP)`);
        } else {
          addGroundLoot(player.x, player.y, smeltOutId, 1);
          chatLine(`<span class="warn">Inventory full: ${Items[smeltOutId]?.name ?? smeltOutId}</span> (+${smeltXp} XP)`);
        }
      });
      return;
    }

    if (t.kind === "anvil") {
      const av = interactables[t.index];
      if (!av) return stopAction();

      if (!inRangeOfTile(av.x, av.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: av.x + dx, y: av.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to anvil.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(av.x - player.x, -1, 1);
      player.facing.y = clamp(av.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;
      if (!hasItem("hammer")) {
        stopAction(`You need a ${Items.hammer?.name ?? "hammer"} to use the anvil.`);
        return;
      }

      chatLine(`<span class="muted">You step up to the anvil.</span>`);
      openWindow("smithing");
      renderSmithingUI();
      stopAction();
      return;
    }

    if (t.kind === "fire") {
      const f = interactables[t.index];
      if (!f) return stopAction();

      if (!inRangeOfTile(f.x, f.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: f.x + dx, y: f.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to fire.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(f.x - player.x, -1, 1);
      player.facing.y = clamp(f.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;

      const useCookable = (useState.activeItemId && COOK_RECIPES[useState.activeItemId] && hasItem(useState.activeItemId))
        ? useState.activeItemId
        : null;
      const autoCookId = AUTO_COOK_ITEM_IDS.find((itemId) => COOK_RECIPES[itemId] && hasItem(itemId)) || null;

      const cookId =
        useCookable ||
        autoCookId;

      if (!cookId) {
        chatLine(`<span class="muted">The fire crackles.</span>`);
        stopAction();
        return;
      }

      const rec = COOK_RECIPES[cookId];
      chatLine("You cook over the fire...");
      startTimedAction("cook", 1400, "Cooking...", () => {
        if (!removeItemsFromInventory(cookId, 1)) {
          chatLine(`<span class="warn">You need ${Items[cookId]?.name ?? cookId}.</span>`);
          return;
        }

        if (useState.activeItemId === cookId) setUseState(null);

        const got = addToInventory(rec.out, 1);
        emitQuestEvent({ type: "cook_any", inItemId: cookId, outItemId: rec.out, qty: 1 });
        if (got === 1) {
          addXP("cooking", rec.xp);
          chatLine(`<span class="good">You ${rec.verb}.</span> (+${rec.xp} XP)`);
        } else {
          addGroundLoot(player.x, player.y, rec.out, 1);
          addXP("cooking", rec.xp);
          chatLine(`<span class="warn">Inventory full: ${Items[rec.out].name}</span> (+${rec.xp} XP)`);
        }
      });

      return;
    }

    if (t.kind === "cauldron") {
      const c = interactables[t.index];
      if (!c) return stopAction();

      if (!inRangeOfTile(c.x, c.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to cauldron.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(c.x - player.x, -1, 1);
      player.facing.y = clamp(c.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;

      // On first interaction, store the priority item for the batch session
      if (t._cookPriority === undefined) {
        const priorityCookable = (useState.activeItemId && COOK_RECIPES[useState.activeItemId] && hasItem(useState.activeItemId))
          ? useState.activeItemId
          : null;
        t._cookPriority = priorityCookable;
      }

      // Find next cookable, prioritizing the stored item
      const cookId = findNextCookable(t._cookPriority);

      if (!cookId) {
        chatLine("Use a raw food item on the cauldron to cook it.");
        stopAction();
        return;
      }

      // Show initial message only on first cook
      if (player.action.type === "idle" && !player._lastCookMsg) {
        chatLine("You begin cooking at the cauldron...");
        player._lastCookMsg = true;
      }

      const rec = COOK_RECIPES[cookId];
      startTimedAction("cook", 1400, "Cooking...", () => {
        if (!removeItemsFromInventory(cookId, 1)) {
          chatLine(`<span class=\"warn\">You need ${Items[cookId]?.name ?? cookId}.</span>`);
          stopAction();
          return;
        }

        const got = addToInventory(rec.out, 1);
        emitQuestEvent({ type: "cook_any", inItemId: cookId, outItemId: rec.out, qty: 1 });
        
        if (got === 1) {
          addXP("cooking", rec.xp);
          chatLine(`<span class="good">You ${rec.verb}.</span> (+${rec.xp} XP)`);
        } else {
          addGroundLoot(player.x, player.y, rec.out, 1);
          addXP("cooking", rec.xp);
          chatLine(`<span class="warn">Inventory full: ${Items[rec.out].name}</span> (+${rec.xp} XP)`);
        }

        // Check if we should continue batch cooking
        if (!shouldContinueBatchCooking(cookId)) {
          // Determine why we're stopping
          const emptySlots = emptyInvSlots();
          if (emptySlots <= 0) {
            chatLine(`<span class="warn">You don't have enough inventory space.</span>`);
          } else {
            const nextCookable = findNextCookable(null);
            if (!nextCookable) {
              chatLine(`<span class="muted">You have no more raw food to cook.</span>`);
            }
          }
          
          // Clean up batch session
          delete t._cookPriority;
          player._lastCookMsg = false;
          if (useState.activeItemId === cookId) setUseState(null);
          stopAction();
        }
        // If shouldContinue, leave player.target set and the main loop will call us again
      });

      return;
    }

    if (t.kind === "fish") {
      const spot = interactables[t.index];
      if (!spot) return stopAction();

      if (!inRangeOfTile(spot.x, spot.y, 1.25)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to fishing spot.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(spot.x - player.x, -1, 1);
      player.facing.y = clamp(spot.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;

      const lvl = levelFromXP(Skills.fishing.xp);
      if (lvl < 1) {
        stopAction("Your Fishing level is too low.");
        return;
      }

      if (stopIfInventoryFull("Inventory full.")) return;

      startTimedAction("fish", 1600, "Fishing...", () => {
        if (stopIfInventoryFull("Inventory full.")) return;

        const lvlNow = levelFromXP(Skills.fishing.xp);
        const chance = clamp(
          FISHING_CATCH_CHANCE_MIN + lvlNow * FISHING_CATCH_CHANCE_PER_LEVEL,
          FISHING_CATCH_CHANCE_MIN,
          FISHING_CATCH_CHANCE_MAX
        );
        if (Math.random() > chance) {
          chatLine(`<span class="muted">You fail to catch anything.</span>`);
          return;
        }

        const tierPool = getFishingTierPool(spot.type);
        const fishTier = tierPool.find((tier) => lvlNow >= tier.level) || tierPool[tierPool.length - 1];
        const catchId = fishTier.itemId;
        const catchName = Items[catchId]?.name ?? catchId;
        const catchXp = fishTier.xp;

        if (!addGatherItemOrStop(catchId, `<span class="warn">Inventory full: ${catchName}</span>`)) return;
        emitQuestEvent({ type: "gather_item", itemId: catchId, skillKey: "fishing", qty: 1 });
        finishGatherSuccess("fishing", catchXp, `<span class="good">You catch ${catchName}.</span> (+${catchXp} XP)`);
      });

      return;
    }

    if (t.kind === "res") {
      const r = resources[t.index];
      if (!r || !r.alive) return stopAction("That resource is gone.");
      const miningRule = getMiningRule(r.type);
      if (r.type === "tree" && !hasItem("axe")) return stopAction("You need an axe.");
      if (miningRule && !hasItem("pick")) return stopAction("You need a pick.");

      if (!inRangeOfTile(r.x, r.y, 1.1)) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ x: r.x + dx, y: r.y + dy }))
          .filter((p) => isWalkable(p.x, p.y));
        if (!adj.length) return stopAction("No path to target.");
        adj.sort((a, c) => (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) - (Math.abs(c.x - player.x) + Math.abs(c.y - player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(r.x - player.x, -1, 1);
      player.facing.y = clamp(r.y - player.y, -1, 1);

      if (player.action.type !== "idle") return;
      if (miningRule && levelFromXP(Skills.mining?.xp ?? 0) < miningRule.level) {
        const label = miningRule.label || "that resource";
        return stopAction(`You need Mining level ${miningRule.level} to mine ${label}.`);
      }
      if (stopIfInventoryFull("Inventory full.")) return;

      if (r.type === "tree") {
        chatLine("You swing your axe at the tree...");
        startGatherAction({
          actionType: "woodcut",
          durationMs: 1400,
          actionLabel: "Chopping...",
          itemId: "log",
          fullMessage: `<span class="warn">Inventory full: ${Items.log.name}</span>`,
          onCollected: () => {
            r.alive = false;
            r.respawnAt = now() + 9000;
          },
          skillKey: "woodcutting",
          xpAmount: 35,
          successMessage: `<span class="good">You get a log.</span> (+35 XP)`
        });
      } else if (miningRule) {
        const mineXp = miningRule.xp;
        const oreId = miningRule.oreId;
        const label = miningRule.label || "rock";
        chatLine(`You chip away at the ${label}...`);
        startGatherAction({
          actionType: "mine",
          durationMs: 1600,
          actionLabel: "Mining...",
          itemId: oreId,
          fullMessage: `<span class="warn">Inventory full: ${Items[oreId]?.name ?? oreId}</span>`,
          onCollected: () => {
            r.alive = false;
            r.respawnAt = now() + 11000;
          },
          skillKey: "mining",
          xpAmount: mineXp,
          successMessage: `<span class="good">You mine ${Items[oreId]?.name ?? oreId} from the ${label}.</span> (+${mineXp} XP)`
        });
      } else {
        return stopAction("You can't gather that.");
      }
      return;
    }

    if (t.kind === "mob") {
      const m = mobs[t.index];
      if (!m || !m.alive) return stopAction("That creature is gone.");

      const tNow = now();
      const style = getCombatStyle();
      if (style === "melee" && resolveMeleeTileOverlap(m)) return;
      const maxRangeTiles = (style === "melee") ? 1.15 : 5.0;
      const dTiles = tilesFromPlayerToTile(m.x, m.y);
      const rangedOrMagic = (style !== "melee");
      const clearShot = !rangedOrMagic || hasLineOfSightTiles(player.x, player.y, m.x, m.y);

      if (dTiles > maxRangeTiles) {
        if (tNow < (player._pathTryUntil || 0)) return;
        player._pathTryUntil = tNow + 200;

        if (style !== "melee") {
          const tNow2 = now();
          if (!player._lastRangeMsgAt || (tNow2 - player._lastRangeMsgAt) > 900) {
            chatLine(`<span class="warn">Out of range (max 5).</span>`);
            player._lastRangeMsgAt = tNow2;
          }
          const best = findBestTileWithinRange(m.x, m.y, 5.0, { requireLineOfSight: true });
          if (!best) return stopAction("No path to target.");
          player.path = best.path;
          return;
        }

        const best = findBestMeleeEngagePath(m);
        if (!best) return stopAction("No path to target.");
        player.path = best.path;
        return;
      }

      if (rangedOrMagic && !clearShot) {
        if (tNow < (player._pathTryUntil || 0)) return;
        player._pathTryUntil = tNow + 200;

        const tNow2 = now();
        if (!player._lastRangeMsgAt || (tNow2 - player._lastRangeMsgAt) > 900) {
          chatLine(`<span class="warn">No clear shot.</span>`);
          player._lastRangeMsgAt = tNow2;
        }

        const best = findBestTileWithinRange(m.x, m.y, 5.0, { requireLineOfSight: true });
        if (!best) return stopAction("No clear shot.");
        player.path = best.path;
        return;
      }

      if (style === "melee" && resolveMeleeTileOverlap(m)) return;

      player.facing.x = clamp(m.x - player.x, -1, 1);
      player.facing.y = clamp(m.y - player.y, -1, 1);

      if (tNow < player.attackCooldownUntil) return;
      player.attackCooldownUntil = tNow + PLAYER_ATTACK_COOLDOWN_MS;

      if (style === "ranged") {
        if (!consumeFromQuiver("wooden_arrow", 1)) {
          chatLine(`<span class="warn">No arrows.</span>`);
          return stopAction();
        }
      }

      m.target = "player";
      m.provokedUntil = tNow + 15000;
      m.aggroUntil = tNow + 15000;

      const roll = rollPlayerAttack(style, m);
      const usingFireStaff = (equipment?.weapon === "fire_staff");

      if (style === "melee") spawnCombatFX("slash", m.x, m.y);
      if (style === "ranged") spawnCombatFX("arrow", m.x, m.y);
      if (style === "magic") {
        if (usingFireStaff) {
          spawnCombatFX("fire_bolt", m.x, m.y);
        } else {
          spawnCombatFX("bolt", m.x, m.y);
        }
      }

      const mobName = (m.name || "creature").toLowerCase();

      if (!roll.hit || roll.dmg <= 0) {
        if (style === "magic") {
          chatLine(`Your <b>${usingFireStaff ? "Fire Bolt" : "Air Bolt"}</b> splashes harmlessly on the ${mobName}.`);
        } else if (style === "ranged") {
          chatLine(`You shoot and miss the ${mobName}.`);
        } else {
          chatLine(`You swing and miss the ${mobName}.`);
        }
        return;
      }

      const dmg = roll.dmg;
      m.hp = Math.max(0, m.hp - dmg);

      addXP("health", dmg);

      if (style === "melee") {
        awardMeleeXpSplit(dmg);
      } else if (style === "ranged") {
        addXP("ranged", dmg);
      } else {
        addXP("sorcery", dmg);
      }

      if (style === "magic") {
        chatLine(`You cast <b>${usingFireStaff ? "Fire Bolt" : "Air Bolt"}</b> at the ${mobName} for <b>${dmg}</b>.`);
      } else if (style === "ranged") {
        chatLine(`You shoot the ${mobName} for <b>${dmg}</b>.`);
      } else {
        chatLine(`You hit the ${mobName} for <b>${dmg}</b>.`);
      }

      if (m.hp <= 0) {
        m.alive = false;
        m.respawnAt = (m.type === "skeleton_warden") ? 0 : (now() + 12000);
        m.hp = 0;
        m.target = null;
        m.provokedUntil = 0;
        m.aggroUntil = 0;
        m.attackCooldownUntil = 0;
        m.moveCooldownUntil = 0;
        chatLine(`<span class="good">You defeat the ${mobName}.</span>`);
        emitQuestEvent({ type: "kill_mob", mobType: String(m.type || ""), qty: 1 });

        if (m.type === "goblin") {
          if (Math.random() < 0.78) {
            const got = addToInventory("bone", 1);
            if (got === 1) {
              chatLine(`<span class="good">The goblin drops a bone.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "bone", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.bone.name}</span>`);
            }
          }
          if (Math.random() < 0.50) {
            const oreGot = addToInventory("ore", 1);
            if (oreGot === 1) {
              chatLine(`<span class="good">The goblin drops some ${Items.ore?.name ?? "ore"}.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "ore", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.ore.name}</span>`);
            }
          }
          if (Math.random() < 0.62) {
            const arrowCount = 2 + Math.floor(Math.random() * 5);
            addToInventory("wooden_arrow", arrowCount);
            chatLine(`<span class="good">The goblin drops ${arrowCount} wooden arrows.</span>`);
          }
          if (Math.random() < 0.88) {
            const g = 4 + Math.floor(Math.random() * 12);
            addGold(g);
            chatLine(`<span class="good">You gain ${g} gold.</span>`);
          }
        } else if (m.type === "skeleton_warden") {
          const g = 140 + Math.floor(Math.random() * 70);
          addGold(g);
          chatLine(`<span class="good">The Warden hoard yields ${g} gold.</span>`);
        } else if (m.type === "skeleton") {
          if (Math.random() < 0.95) {
            const got = addToInventory("bone", 1);
            if (got === 1) {
              chatLine(`<span class="good">The skeleton drops a bone.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "bone", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.bone.name}</span>`);
            }
          }
          if (Math.random() < 0.50) {
            const oreGot = addToInventory("iron_ore", 1);
            if (oreGot === 1) {
              chatLine(`<span class="good">The skeleton drops some ${Items.iron_ore?.name ?? "iron ore"}.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "iron_ore", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.iron_ore?.name ?? "iron ore"}</span>`);
            }
          }
          if (Math.random() < 0.04) {
            const got = addToInventory("fire_staff", 1);
            if (got === 1) {
              chatLine(`<span class="good">The skeleton drops a ${Items.fire_staff?.name ?? "Fire Staff"}!</span>`);
            } else {
              addGroundLoot(m.x, m.y, "fire_staff", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.fire_staff?.name ?? "Fire Staff"}</span>`);
            }
          }
          if (Math.random() < 0.75) {
            const g = 6 + Math.floor(Math.random() * 14);
            addGold(g);
            chatLine(`<span class="good">You gain ${g} gold.</span>`);
          }
        } else {
          if (Math.random() < 0.55) {
            const got = addToInventory("rat_meat", 1);
            if (got === 1) {
              chatLine(`<span class="good">The rat drops raw meat.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "rat_meat", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.rat_meat.name}</span>`);
            }
          }

          if (Math.random() < 0.75) {
            const got = addToInventory("bone", 1);
            if (got === 1) {
              chatLine(`<span class="good">The rat drops a bone.</span>`);
            } else {
              addGroundLoot(m.x, m.y, "bone", 1);
              chatLine(`<span class="warn">Inventory full: ${Items.bone.name}</span>`);
            }
            if (Math.random() < 0.65) {
              const g = 1 + Math.floor(Math.random() * 8);
              addGold(g);
              chatLine(`<span class="good">You gain ${g} gold.</span>`);
            }
          }
        }

        if (typeof onMobDefeated === "function") onMobDefeated(m);

        stopAction();
      }
    }
  }

  return { ensureWalkIntoRangeAndAct };
}
