const { test, expect } = require("@playwright/test");

async function getQuestRow(page, questId) {
  return page.evaluate((id) => {
    const snap = window.__classicRpg.getQuests();
    return snap?.byId?.[id] || null;
  }, questId);
}

async function emitQuestEvent(page, payload) {
  const result = await page.evaluate((ev) => window.__classicRpg.questEvent(ev), payload);
  expect(result?.ok).toBeTruthy();
}

async function bootTestWorld(page) {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return (
      typeof window.__classicRpg === "object" &&
      typeof window.__classicRpg.getState === "function" &&
      typeof window.__classicRpg.getQuests === "function" &&
      typeof window.__classicRpg.questEvent === "function"
    );
  });

  await page.evaluate(() => {
    window.__classicRpg.clearSave();
    window.__classicRpg.newGame();
  });
}

test("sealed gate blocks player without key fragment", async ({ page }) => {
  await bootTestWorld(page);

  const nearOverworldLadder = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.teleport(l.x + 1, l.y, { requireWalkable: true });
  });
  expect(nearOverworldLadder).toBeTruthy();

  const climbDown = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.interactTile(l.x, l.y);
  });
  expect(climbDown.ok).toBeTruthy();
  await page.waitForFunction(() => window.__classicRpg.getState().zone === "dungeon");

  const gateResult = await page.evaluate(() => {
    const teleported = window.__classicRpg.teleport(35, 29, { requireWalkable: true });
    const before = window.__classicRpg.getState().player;
    const keyQtyBefore = window.__classicRpg.getItemQty("warden_key_fragment");
    const interacted = window.__classicRpg.interactTile(36, 29);
    window.__classicRpg.tickMs(200);
    window.__classicRpg.tickMs(200);
    const after = window.__classicRpg.getState().player;
    const keyQtyAfter = window.__classicRpg.getItemQty("warden_key_fragment");
    const ashes = window.__classicRpg.getQuests()?.byId?.ashes_under_the_keep || null;
    return {
      teleported,
      interacted,
      before,
      after,
      keyQtyBefore,
      keyQtyAfter,
      enterWingProgress: ashes?.progress?.enter_wing || 0
    };
  });

  expect(gateResult.teleported).toBeTruthy();
  expect(gateResult.interacted?.ok).toBeTruthy();
  expect(gateResult.interacted?.kind).toBe("sealed_gate");
  expect(gateResult.keyQtyBefore).toBe(0);
  expect(gateResult.keyQtyAfter).toBe(0);
  expect(gateResult.before.x).toBe(35);
  expect(gateResult.after.x).toBe(35);
  expect(gateResult.enterWingProgress).toBe(0);
});

test("questline progression and persistence regression", async ({ page }) => {
  await bootTestWorld(page);

  const initialGold = await page.evaluate(() => window.__classicRpg.getGold());

  const nearQuartermaster = await page.evaluate(() => {
    return window.__classicRpg.teleport(8, 6, { requireWalkable: true });
  });
  expect(nearQuartermaster).toBeTruthy();

  const talkQuartermasterStart = await page.evaluate(() => {
    return window.__classicRpg.interactTile(7, 6);
  });
  expect(talkQuartermasterStart.ok).toBeTruthy();
  expect(talkQuartermasterStart.kind).toBe("quest_npc");

  let firstWatch = await getQuestRow(page, "first_watch");
  expect(firstWatch?.startedAt).toBeGreaterThan(0);
  expect(firstWatch?.completedAt).toBe(0);
  expect(firstWatch?.progress?.report_quartermaster).toBe(1);

  await emitQuestEvent(page, { type: "gather_item", itemId: "log", qty: 3 });
  await emitQuestEvent(page, { type: "gather_item", itemId: "ore", qty: 3 });
  await emitQuestEvent(page, { type: "cook_any", qty: 2 });
  await emitQuestEvent(page, { type: "smelt_item", itemId: "crude_bar", qty: 3 });
  await emitQuestEvent(page, { type: "kill_mob", mobType: "rat", qty: 2 });

  firstWatch = await getQuestRow(page, "first_watch");
  expect(firstWatch?.progress?.chop_log).toBe(3);
  expect(firstWatch?.progress?.mine_ore).toBe(3);
  expect(firstWatch?.progress?.cook_food).toBe(2);
  expect(firstWatch?.progress?.smelt_bar).toBe(3);
  expect(firstWatch?.progress?.slay_rat).toBe(2);
  expect(firstWatch?.progress?.report_quartermaster).toBe(1);
  expect(firstWatch?.completedAt).toBe(0);

  await page.evaluate(() => window.__classicRpg.saveNow());
  const loadMidFirstWatch = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(loadMidFirstWatch).toBeTruthy();

  firstWatch = await getQuestRow(page, "first_watch");
  expect(firstWatch?.progress?.chop_log).toBe(3);
  expect(firstWatch?.progress?.mine_ore).toBe(3);
  expect(firstWatch?.progress?.cook_food).toBe(2);
  expect(firstWatch?.progress?.smelt_bar).toBe(3);
  expect(firstWatch?.progress?.slay_rat).toBe(2);
  expect(firstWatch?.progress?.report_quartermaster).toBe(1);
  expect(firstWatch?.completedAt).toBe(0);

  const nearQuartermasterAgain = await page.evaluate(() => {
    return window.__classicRpg.teleport(8, 6, { requireWalkable: true });
  });
  expect(nearQuartermasterAgain).toBeTruthy();

  const talkQuartermasterComplete = await page.evaluate(() => {
    return window.__classicRpg.interactTile(7, 6);
  });
  expect(talkQuartermasterComplete.ok).toBeTruthy();
  expect(talkQuartermasterComplete.kind).toBe("quest_npc");

  firstWatch = await getQuestRow(page, "first_watch");
  expect(firstWatch?.progress?.report_quartermaster).toBe(2);
  expect(firstWatch?.completedAt).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__classicRpg.getItemQty("warden_key_fragment"))).toBe(1);

  const goldAfterFirstWatch = await page.evaluate(() => window.__classicRpg.getGold());
  expect(goldAfterFirstWatch).toBeGreaterThanOrEqual(initialGold + 150);

  const talkQuartermasterSecondQuest = await page.evaluate(() => {
    return window.__classicRpg.interactTile(7, 6);
  });
  expect(talkQuartermasterSecondQuest.ok).toBeTruthy();
  expect(talkQuartermasterSecondQuest.kind).toBe("quest_npc");

  let ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.startedAt).toBeGreaterThan(0);
  expect(ashes?.completedAt).toBe(0);
  expect(ashes?.progress?.briefing).toBe(1);
  expect(ashes?.progress?.enter_wing).toBe(0);
  expect(ashes?.progress?.light_brazier).toBe(0);
  expect(ashes?.progress?.defeat_warden).toBe(0);

  const nearOverworldLadder = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.teleport(l.x + 1, l.y, { requireWalkable: true });
  });
  expect(nearOverworldLadder).toBeTruthy();

  const climbDown = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.interactTile(l.x, l.y);
  });
  expect(climbDown.ok).toBeTruthy();
  await page.waitForFunction(() => window.__classicRpg.getState().zone === "dungeon");

  const nearSealedGate = await page.evaluate(() => {
    return window.__classicRpg.teleport(35, 29, { requireWalkable: true });
  });
  expect(nearSealedGate).toBeTruthy();

  const useSealedGate = await page.evaluate(() => {
    return window.__classicRpg.interactTile(36, 29);
  });
  expect(useSealedGate.ok).toBeTruthy();
  expect(useSealedGate.kind).toBe("sealed_gate");

  ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.progress?.enter_wing).toBe(1);
  expect(await page.evaluate(() => window.__classicRpg.getItemQty("warden_key_fragment"))).toBe(0);

  const mobsBeforeBraziers = await page.evaluate(() => window.__classicRpg.getState().counts.mobs);

  const nearWestBrazier = await page.evaluate(() => {
    return window.__classicRpg.teleport(43, 26, { requireWalkable: true });
  });
  expect(nearWestBrazier).toBeTruthy();

  const lightWestBrazier = await page.evaluate(() => {
    return window.__classicRpg.interactTile(44, 26);
  });
  expect(lightWestBrazier.ok).toBeTruthy();
  expect(lightWestBrazier.kind).toBe("brazier");

  const nearEastBrazier = await page.evaluate(() => {
    return window.__classicRpg.teleport(52, 26, { requireWalkable: true });
  });
  expect(nearEastBrazier).toBeTruthy();

  const lightEastBrazier = await page.evaluate(() => {
    return window.__classicRpg.interactTile(53, 26);
  });
  expect(lightEastBrazier.ok).toBeTruthy();
  expect(lightEastBrazier.kind).toBe("brazier");

  ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.progress?.light_brazier).toBe(2);

  const mobsAfterBraziers = await page.evaluate(() => window.__classicRpg.getState().counts.mobs);
  expect(mobsAfterBraziers).toBeGreaterThanOrEqual(mobsBeforeBraziers + 1);

  await page.evaluate(() => window.__classicRpg.saveNow());
  const loadMidAshes = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(loadMidAshes).toBeTruthy();

  ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.progress?.briefing).toBe(1);
  expect(ashes?.progress?.enter_wing).toBe(1);
  expect(ashes?.progress?.light_brazier).toBe(2);
  expect(ashes?.progress?.defeat_warden).toBe(0);
  expect(ashes?.completedAt).toBe(0);

  await emitQuestEvent(page, { type: "kill_mob", mobType: "skeleton_warden", qty: 1 });

  ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.progress?.defeat_warden).toBe(1);
  expect(ashes?.completedAt).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__classicRpg.getItemQty("wardens_brand"))).toBe(1);

  const finalGold = await page.evaluate(() => window.__classicRpg.getGold());
  expect(finalGold).toBeGreaterThanOrEqual(initialGold + 500);

  await page.evaluate(() => window.__classicRpg.saveNow());
  const finalLoad = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(finalLoad).toBeTruthy();

  ashes = await getQuestRow(page, "ashes_under_the_keep");
  expect(ashes?.completedAt).toBeGreaterThan(0);
});

test("quest rewards are not duplicated after save-load", async ({ page }) => {
  await bootTestWorld(page);

  await page.evaluate(() => {
    return window.__classicRpg.teleport(8, 6, { requireWalkable: true });
  });
  await page.evaluate(() => window.__classicRpg.interactTile(7, 6));

  await emitQuestEvent(page, { type: "gather_item", itemId: "log", qty: 3 });
  await emitQuestEvent(page, { type: "gather_item", itemId: "ore", qty: 3 });
  await emitQuestEvent(page, { type: "cook_any", qty: 2 });
  await emitQuestEvent(page, { type: "smelt_item", itemId: "crude_bar", qty: 3 });
  await emitQuestEvent(page, { type: "kill_mob", mobType: "rat", qty: 2 });
  await page.evaluate(() => window.__classicRpg.interactTile(7, 6));
  await page.evaluate(() => window.__classicRpg.interactTile(7, 6));

  const nearOverworldLadder = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.teleport(l.x + 1, l.y, { requireWalkable: true });
  });
  expect(nearOverworldLadder).toBeTruthy();

  const climbDown = await page.evaluate(() => {
    const l = window.__classicRpg.getLadders().overworldDown;
    return window.__classicRpg.interactTile(l.x, l.y);
  });
  expect(climbDown.ok).toBeTruthy();
  await page.waitForFunction(() => window.__classicRpg.getState().zone === "dungeon");

  await page.evaluate(() => {
    window.__classicRpg.teleport(35, 29, { requireWalkable: true });
    window.__classicRpg.interactTile(36, 29);
    window.__classicRpg.tickMs(200);
    window.__classicRpg.teleport(43, 26, { requireWalkable: true });
    window.__classicRpg.interactTile(44, 26);
    window.__classicRpg.tickMs(200);
    window.__classicRpg.teleport(52, 26, { requireWalkable: true });
    window.__classicRpg.interactTile(53, 26);
    window.__classicRpg.tickMs(200);
  });

  await emitQuestEvent(page, { type: "kill_mob", mobType: "skeleton_warden", qty: 1 });

  const beforeLoad = await page.evaluate(() => ({
    gold: window.__classicRpg.getGold(),
    brandQty: window.__classicRpg.getItemQty("wardens_brand"),
    firstQuest: window.__classicRpg.getQuests()?.byId?.first_watch || null,
    secondQuest: window.__classicRpg.getQuests()?.byId?.ashes_under_the_keep || null
  }));

  expect(beforeLoad.brandQty).toBe(1);
  expect(beforeLoad.secondQuest?.completedAt).toBeGreaterThan(0);

  await page.evaluate(() => window.__classicRpg.saveNow());
  const load1 = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(load1).toBeTruthy();
  const load2 = await page.evaluate(() => window.__classicRpg.loadNow());
  expect(load2).toBeTruthy();

  const afterLoad = await page.evaluate(() => ({
    gold: window.__classicRpg.getGold(),
    brandQty: window.__classicRpg.getItemQty("wardens_brand"),
    firstQuest: window.__classicRpg.getQuests()?.byId?.first_watch || null,
    secondQuest: window.__classicRpg.getQuests()?.byId?.ashes_under_the_keep || null
  }));

  expect(afterLoad.brandQty).toBe(1);
  expect(afterLoad.gold).toBe(beforeLoad.gold);
  expect(afterLoad.firstQuest?.completedAt).toBe(beforeLoad.firstQuest?.completedAt);
  expect(afterLoad.secondQuest?.completedAt).toBe(beforeLoad.secondQuest?.completedAt);
});
