const { test, expect } = require("@playwright/test");

async function applySavePatch(page, patch) {
  const ok = await page.evaluate((nextPatch) => {
    const patchData = (nextPatch && typeof nextPatch === "object") ? nextPatch : {};
    window.__classicRpg.saveNow();

    let saveKey = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = String(localStorage.key(i) || "");
      if (k.includes("classic_inspired_rpg_save_v10_quiver_loot_health_windows")) {
        saveKey = k;
        break;
      }
    }
    if (!saveKey) return false;

    const raw = localStorage.getItem(saveKey);
    if (!raw) return false;

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!data || typeof data !== "object") return false;

    if (typeof patchData.walletGold === "number") {
      const value = Math.max(0, patchData.walletGold | 0);
      data.wallet = { ...(data.wallet || {}), gold: value };
    }

    if (patchData.skills && typeof patchData.skills === "object") {
      data.skills = { ...(data.skills || {}) };
      for (const [skillKey, xp] of Object.entries(patchData.skills)) {
        data.skills[skillKey] = Math.max(0, xp | 0);
      }
    }

    if (Array.isArray(patchData.inv)) {
      data.inv = patchData.inv
        .filter((s) => s && typeof s === "object" && s.id)
        .map((s) => ({ id: String(s.id), qty: Math.max(1, s.qty | 0) }));
    }

    if (patchData.towns && typeof patchData.towns === "object") {
      data.towns = patchData.towns;
    }

    if (patchData.projects && typeof patchData.projects === "object") {
      data.projects = patchData.projects;
    }

    localStorage.setItem(saveKey, JSON.stringify(data));
    return window.__classicRpg.loadNow();
  }, patch);

  expect(ok).toBeTruthy();
}

async function setWalletGold(page, gold) {
  await applySavePatch(page, { walletGold: gold });
}

async function setSkillsXp(page, skills) {
  await applySavePatch(page, { skills });
}

async function setInventory(page, inv) {
  await applySavePatch(page, { inv });
}

async function setTownData(page, townData) {
  await applySavePatch(page, { towns: townData });
}

async function setProjectsData(page, projectsData) {
  await applySavePatch(page, { projects: projectsData });
}

test("boot, debug API, zone swap, save/load", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  const initial = await page.evaluate(() => window.__classicRpg.getState());
  expect(initial.zone).toBe("overworld");
  expect(initial.player.hp).toBeGreaterThan(0);

  await page.click("#iconQst");
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.quests === true);

  const nearQuartermaster = await page.evaluate(() => {
    return window.__classicRpg.teleport(8, 6, { requireWalkable: true });
  });
  expect(nearQuartermaster).toBeTruthy();

  const talkQuartermaster = await page.evaluate(() => {
    return window.__classicRpg.interactTile(7, 6);
  });
  expect(talkQuartermaster.ok).toBeTruthy();
  expect(talkQuartermaster.kind).toBe("quest_npc");

  const smithBankBeforeUnlock = await page.evaluate(() => {
    return window.__classicRpg.interactTile(53, 34);
  });
  expect(smithBankBeforeUnlock.ok).toBeFalsy();
  expect(smithBankBeforeUnlock.reason).toBe("no_entity");

  const nearBlacksmith = await page.evaluate(() => {
    return window.__classicRpg.teleport(53, 33, { requireWalkable: true });
  });
  expect(nearBlacksmith).toBeTruthy();

  const talkBlacksmith = await page.evaluate(() => {
    return window.__classicRpg.interactTile(52, 33);
  });
  expect(talkBlacksmith.ok).toBeTruthy();
  expect(talkBlacksmith.kind).toBe("project_npc");
  // Blacksmith now opens Town Projects directly
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.townProjects === true);

  // Setup storage project as complete via save patch
  // This simulates the player having completed the "Blacksmith Storage" town project
  await setTownData(page, {
    rivermoor: {
      renown: 50,
      donations: 0,
      milestones: 0
    }
  });

  await setProjectsData(page, {
    rivermoor: {
      dock: { state: "locked", fundedAt: 0, completedAt: 0, buildTimeMs: 15000 },
      storage: { state: "complete", fundedAt: 0, completedAt: 1000, buildTimeMs: 18000 },
      hearth: { state: "locked", fundedAt: 0, completedAt: 0, buildTimeMs: 17000 },
      flourishing: { state: "locked", fundedAt: 0, completedAt: 0, buildTimeMs: 0 }
    }
  });

  // Reload to apply the project completion and spawn the chest
  await page.evaluate(() => window.__classicRpg.loadNow());

  // Verify the chest now appears
  const smithBankAfterUnlock = await page.evaluate(() => {
    return window.__classicRpg.interactTile(53, 34);
  });
  expect(smithBankAfterUnlock.ok).toBeTruthy();
  expect(smithBankAfterUnlock.kind).toBe("bank");

  // Close town projects window
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.townProjects === false);

  const ladders = await page.evaluate(() => window.__classicRpg.getLadders());
  expect(ladders.overworldDown).toBeTruthy();
  expect(ladders.dungeonUp).toBeTruthy();

  const nearOverworldLadder = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.teleport(l.x + 1, l.y, { requireWalkable: true });
  });
  expect(nearOverworldLadder).toBeTruthy();

  const interactDown = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.interactTile(l.x, l.y);
  });
  expect(interactDown.ok).toBeTruthy();
  await page.waitForFunction(() => window.__classicRpg.getState().zone === "dungeon");

  const nearSealedGate = await page.evaluate(() => {
    return window.__classicRpg.teleport(35, 29, { requireWalkable: true });
  });
  expect(nearSealedGate).toBeTruthy();

  const interactSealedGate = await page.evaluate(() => {
    return window.__classicRpg.interactTile(36, 29);
  });
  expect(interactSealedGate.ok).toBeTruthy();
  expect(interactSealedGate.kind).toBe("sealed_gate");

  const nearDungeonLadder = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().dungeonUp;
    return window.__classicRpg.teleport(l.x + 1, l.y, { requireWalkable: true });
  });
  expect(nearDungeonLadder).toBeTruthy();

  const interactUp = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().dungeonUp;
    return window.__classicRpg.interactTile(l.x, l.y);
  });
  expect(interactUp.ok).toBeTruthy();
  await page.waitForFunction(() => window.__classicRpg.getState().zone === "overworld");

  await page.evaluate(() => window.__classicRpg.saveNow());
  const loadOk = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(loadOk).toBeTruthy();

  const afterLoad = await page.evaluate(() => window.__classicRpg.getState());
  expect(afterLoad.zone).toBe("overworld");

  const smithBankAfterLoad = await page.evaluate(() => {
    return window.__classicRpg.interactTile(53, 34);
  });
  expect(smithBankAfterLoad.ok).toBeTruthy();
  expect(smithBankAfterLoad.kind).toBe("bank");
});

test("iron ore progression: mining and smelting require level 10 and smelt to iron bars", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  await page.evaluate(() => {
    window.__classicRpg.clearSave();
    window.__classicRpg.newGame();
  });

  await setInventory(page, [
    { id: "pick", qty: 1 },
    { id: "hammer", qty: 1 },
    { id: "iron_ore", qty: 1 }
  ]);

  await setSkillsXp(page, { mining: 2024, smithing: 2024 }); // Level 9
  await page.evaluate(() => window.__classicRpg.setZone("dungeon", { spawn: true }));

  const lowMining = await page.evaluate(() => {
    const moved = window.__classicRpg.teleport(24, 25, { requireWalkable: true });
    const beforeOre = window.__classicRpg.getItemQty("iron_ore");
    const result = window.__classicRpg.interactTile(24, 26);
    window.__classicRpg.tickMs(16);
    const afterOre = window.__classicRpg.getItemQty("iron_ore");
    return { moved, beforeOre, afterOre, result };
  });

  expect(lowMining.moved).toBeTruthy();
  expect(lowMining.result.ok).toBeTruthy();
  expect(lowMining.result.kind).toBe("res");
  expect(lowMining.afterOre).toBe(lowMining.beforeOre);

  await setSkillsXp(page, { mining: 2025 }); // Level 10
  await page.evaluate(() => window.__classicRpg.setZone("dungeon", { spawn: true }));

  const highMining = await page.evaluate(async () => {
    const moved = window.__classicRpg.teleport(24, 25, { requireWalkable: true });
    const beforeOre = window.__classicRpg.getItemQty("iron_ore");
    const result = window.__classicRpg.interactTile(24, 26);
    await new Promise((resolve) => setTimeout(resolve, 1750));
    window.__classicRpg.tickMs(16);
    const afterOre = window.__classicRpg.getItemQty("iron_ore");
    return { moved, beforeOre, afterOre, result };
  });

  expect(highMining.moved).toBeTruthy();
  expect(highMining.result.ok).toBeTruthy();
  expect(highMining.result.kind).toBe("res");
  expect(highMining.afterOre).toBe(highMining.beforeOre + 1);

  await setSkillsXp(page, { smithing: 2024 }); // Level 9
  await page.evaluate(() => window.__classicRpg.setZone("overworld", { spawn: true }));

  const lowSmelt = await page.evaluate(() => {
    const moved = window.__classicRpg.teleport(49, 33, { requireWalkable: true });
    const beforeOre = window.__classicRpg.getItemQty("iron_ore");
    const beforeBar = window.__classicRpg.getItemQty("iron_bar");
    const result = window.__classicRpg.interactTile(48, 33);
    window.__classicRpg.tickMs(16);
    const afterOre = window.__classicRpg.getItemQty("iron_ore");
    const afterBar = window.__classicRpg.getItemQty("iron_bar");
    return { moved, beforeOre, beforeBar, afterOre, afterBar, result };
  });

  expect(lowSmelt.moved).toBeTruthy();
  expect(lowSmelt.result.ok).toBeTruthy();
  expect(lowSmelt.result.kind).toBe("furnace");
  expect(lowSmelt.afterOre).toBe(lowSmelt.beforeOre);
  expect(lowSmelt.afterBar).toBe(lowSmelt.beforeBar);

  await setSkillsXp(page, { smithing: 2025 }); // Level 10
  await page.evaluate(() => window.__classicRpg.setZone("overworld", { spawn: true }));

  const highSmelt = await page.evaluate(async () => {
    const moved = window.__classicRpg.teleport(49, 33, { requireWalkable: true });
    const beforeOre = window.__classicRpg.getItemQty("iron_ore");
    const beforeBar = window.__classicRpg.getItemQty("iron_bar");
    const result = window.__classicRpg.interactTile(48, 33);
    await new Promise((resolve) => setTimeout(resolve, 1750));
    window.__classicRpg.tickMs(16);
    const afterOre = window.__classicRpg.getItemQty("iron_ore");
    const afterBar = window.__classicRpg.getItemQty("iron_bar");
    return { moved, beforeOre, beforeBar, afterOre, afterBar, result };
  });

  expect(highSmelt.moved).toBeTruthy();
  expect(highSmelt.result.ok).toBeTruthy();
  expect(highSmelt.result.kind).toBe("furnace");
  expect(highSmelt.afterOre).toBe(highSmelt.beforeOre - 1);
  expect(highSmelt.afterBar).toBe(highSmelt.beforeBar + 1);
});

test("iron bars show smithing recipes and can forge iron gear", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  await page.evaluate(() => {
    window.__classicRpg.clearSave();
    window.__classicRpg.newGame();
  });

  await setInventory(page, [
    { id: "hammer", qty: 1 },
    { id: "iron_bar", qty: 4 }
  ]);
  await setSkillsXp(page, { smithing: 3500 }); // high enough for level 12+ recipes
  await page.evaluate(() => window.__classicRpg.setZone("overworld", { spawn: true }));

  const opened = await page.evaluate(() => {
    const moved = window.__classicRpg.teleport(51, 33, { requireWalkable: true });
    const result = window.__classicRpg.interactTile(50, 33);
    window.__classicRpg.tickMs(16);
    return { moved, result };
  });
  expect(opened.moved).toBeTruthy();
  expect(opened.result.ok).toBeTruthy();
  expect(opened.result.kind).toBe("anvil");
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.smithing === true);

  await expect(page.locator("#smithingList .shopName", { hasText: "Iron Bar" })).toHaveCount(1);
  const ironDaggerBtn = page.locator("#smithingList .shopRow", { hasText: "Iron Dagger" }).locator("button.shopBtn");
  await expect(ironDaggerBtn).toBeEnabled();

  const beforeCraft = await page.evaluate(() => ({
    bars: window.__classicRpg.getItemQty("iron_bar"),
    dagger: window.__classicRpg.getItemQty("iron_dagger")
  }));
  await ironDaggerBtn.click();
  await page.waitForTimeout(1750);
  await page.evaluate(() => window.__classicRpg.tickMs(16));

  const afterCraft = await page.evaluate(() => ({
    bars: window.__classicRpg.getItemQty("iron_bar"),
    dagger: window.__classicRpg.getItemQty("iron_dagger")
  }));
  expect(afterCraft.bars).toBe(beforeCraft.bars - 1);
  expect(afterCraft.dagger).toBe(beforeCraft.dagger + 1);
});

test("crude armor smithing supports level-gated recipes up to level 10", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  await page.evaluate(() => {
    window.__classicRpg.clearSave();
    window.__classicRpg.newGame();
  });

  await setInventory(page, [
    { id: "hammer", qty: 1 },
    { id: "crude_bar", qty: 8 }
  ]);

  await setSkillsXp(page, { smithing: 2024 }); // Level 9
  await page.evaluate(() => window.__classicRpg.setZone("overworld", { spawn: true }));

  const openSmithingLow = await page.evaluate(() => {
    const moved = window.__classicRpg.teleport(51, 33, { requireWalkable: true });
    const result = window.__classicRpg.interactTile(50, 33);
    window.__classicRpg.tickMs(16);
    return { moved, result };
  });
  expect(openSmithingLow.moved).toBeTruthy();
  expect(openSmithingLow.result.ok).toBeTruthy();
  expect(openSmithingLow.result.kind).toBe("anvil");
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.smithing === true);

  const bodyForgeBtnLow = page.locator("#smithingList .shopRow", { hasText: "Crude Body" }).locator("button.shopBtn");
  await expect(bodyForgeBtnLow).toBeDisabled();

  await page.locator("#smithingList .shopRow", { hasText: "Crude Helm" }).locator("button.shopBtn").click();
  await page.waitForTimeout(1750);
  await page.evaluate(() => window.__classicRpg.tickMs(16));

  await page.locator("#smithingList .shopRow", { hasText: "Crude Legs" }).locator("button.shopBtn").click();
  await page.waitForTimeout(1750);
  await page.evaluate(() => window.__classicRpg.tickMs(16));

  const lowCraftQty = await page.evaluate(() => ({
    helm: window.__classicRpg.getItemQty("crude_helm"),
    legs: window.__classicRpg.getItemQty("crude_legs"),
    body: window.__classicRpg.getItemQty("crude_body")
  }));
  expect(lowCraftQty.helm).toBeGreaterThanOrEqual(1);
  expect(lowCraftQty.legs).toBeGreaterThanOrEqual(1);
  expect(lowCraftQty.body).toBe(0);

  await setSkillsXp(page, { smithing: 2025 }); // Level 10

  const openSmithingHigh = await page.evaluate(() => {
    const moved = window.__classicRpg.teleport(51, 33, { requireWalkable: true });
    const result = window.__classicRpg.interactTile(50, 33);
    window.__classicRpg.tickMs(16);
    return { moved, result };
  });
  expect(openSmithingHigh.moved).toBeTruthy();
  expect(openSmithingHigh.result.ok).toBeTruthy();
  expect(openSmithingHigh.result.kind).toBe("anvil");
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.smithing === true);

  const bodyForgeBtnHigh = page.locator("#smithingList .shopRow", { hasText: "Crude Body" }).locator("button.shopBtn");
  await expect(bodyForgeBtnHigh).toBeEnabled();
  await bodyForgeBtnHigh.click();
  await page.waitForTimeout(1750);
  await page.evaluate(() => window.__classicRpg.tickMs(16));

  const highCraftQty = await page.evaluate(() => ({
    body: window.__classicRpg.getItemQty("crude_body")
  }));
  expect(highCraftQty.body).toBeGreaterThanOrEqual(1);
});

test("Town Projects window renders via Blacksmith button", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  // Go to Blacksmith
  const nearBlacksmith = await page.evaluate(() => {
    return window.__classicRpg.teleport(53, 33, { requireWalkable: true });
  });
  expect(nearBlacksmith).toBeTruthy();

  // Interact with Blacksmith to open window
  const talkBlacksmith = await page.evaluate(() => {
    return window.__classicRpg.interactTile(52, 33);
  });
  expect(talkBlacksmith.ok).toBeTruthy();
  expect(talkBlacksmith.kind).toBe("project_npc");
  // Blacksmith now opens Town Projects directly
  await page.waitForFunction(() => window.__classicRpg.getState().windowsOpen.townProjects === true);

  // Verify Town Projects is open (no Blacksmith legacy window)
  const townProjOpen = await page.evaluate(() => {
    return window.__classicRpg.getState().windowsOpen.townProjects === true;
  });
  expect(townProjOpen).toBeTruthy();

  // Blacksmith window should NOT be open
  const blacksmithClosed = await page.evaluate(() => {
    return window.__classicRpg.getState().windowsOpen.blacksmith === false;
  });
  expect(blacksmithClosed).toBeTruthy();

  // Wait for project card to render (Blacksmith opens single-view focused on "storage" project)
  const projectCards = await page.locator(".projectRow").count();
  expect(projectCards).toBe(1);

  // Verify the storage project is visible (Blacksmith's focused project)
  const storageCard = page.locator(".projectRow", { hasText: "Storage" });
  await expect(storageCard).toBeVisible();

  // Project NPC single-view is locked (except mayor), so no "View all" button here.
  const viewAllBtn = page.locator("button", { hasText: "View all" });
  await expect(viewAllBtn).toHaveCount(0);

  // Verify renown display is present (in Town Projects grid)
  const renownDisplay = page.locator("#projectsRenownPill");
  await expect(renownDisplay).toBeVisible();
});

test("malformed save payload is normalized on load", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  const result = await page.evaluate(() => {
    window.__classicRpg.saveNow();

    let saveKey = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = String(localStorage.key(i) || "");
      if (k.includes("classic_inspired_rpg_save_v10_quiver_loot_health_windows")) {
        saveKey = k;
        break;
      }
    }
    if (!saveKey) return { ok: false, reason: "missing_save_key" };

    const raw = localStorage.getItem(saveKey);
    if (!raw) return { ok: false, reason: "missing_save_raw" };

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_existing_save_json" };
    }

    data.activeZone = "bad_zone_key";
    data.player = {
      ...(data.player || {}),
      x: 999999,
      y: -999999,
      hp: "bad_hp",
      maxHp: -999
    };
    data.wallet = { ...(data.wallet || {}), gold: -5000 };
    data.quiver = { ...(data.quiver || {}), wooden_arrow: -10 };
    data.bankCapacity = 999999;
    data.zoom = "not_a_number";

    localStorage.setItem(saveKey, JSON.stringify(data));

    const loaded = window.__classicRpg.loadNow();
    const repairReport = window.__classicRpg.getLoadRepairReport?.() || null;
    const state = window.__classicRpg.getState();
    const teleportResult = window.__classicRpg.teleport(state.player.x, state.player.y, { requireWalkable: true });
    const teleportOk = (teleportResult && typeof teleportResult === "object")
      ? !!teleportResult.ok
      : !!teleportResult;

    return {
      ok: true,
      loaded,
      zone: state.zone,
      player: state.player,
      gold: window.__classicRpg.getGold(),
      teleportOk,
      repairReport
    };
  });

  expect(result.ok).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.zone).toBe("overworld");
  expect(Number.isFinite(result.player.x)).toBeTruthy();
  expect(Number.isFinite(result.player.y)).toBeTruthy();
  expect(result.player.x).toBeGreaterThanOrEqual(0);
  expect(result.player.y).toBeGreaterThanOrEqual(0);
  expect(result.player.maxHp).toBeGreaterThan(0);
  expect(result.player.hp).toBeGreaterThanOrEqual(0);
  expect(result.player.hp).toBeLessThanOrEqual(result.player.maxHp);
  expect(result.gold).toBe(0);
  expect(result.teleportOk).toBeTruthy();
  expect(result.repairReport).toBeTruthy();
  expect(result.repairReport.ok).toBeTruthy();
  expect(result.repairReport.repaired).toBeTruthy();
  expect(Array.isArray(result.repairReport.reasons)).toBeTruthy();
  expect(result.repairReport.reasons.length).toBeGreaterThan(0);
  expect(result.repairReport.reasons).toContain("active_zone_fallback");
  expect(result.repairReport.reasons).toContain("wallet_gold_clamped");
});

test("runtime guard contains thrown action completion callback", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  const result = await page.evaluate(() => {
    const armed = window.__classicRpg.triggerActionCompleteError();
    if (!armed) return { ok: false, reason: "trigger_unavailable" };

    let tickOk = false;
    let state = null;
    try {
      state = window.__classicRpg.tickMs(16);
      tickOk = !!state;
    } catch (err) {
      return {
        ok: false,
        reason: "tick_threw",
        message: String(err?.message || err)
      };
    }

    const secondState = window.__classicRpg.tickMs(16);
    return {
      ok: true,
      tickOk,
      zone: state?.zone,
      playerHp: state?.player?.hp,
      secondTickOk: !!secondState
    };
  });

  expect(result.ok).toBeTruthy();
  expect(result.tickOk).toBeTruthy();
  expect(result.secondTickOk).toBeTruthy();
  expect(result.zone).toBeTruthy();
  expect(result.playerHp).toBeGreaterThan(0);
});
