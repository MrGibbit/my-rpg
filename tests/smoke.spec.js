const { test, expect } = require("@playwright/test");

test("boot, debug API, zone swap, save/load", async ({ page }) => {
  await page.goto("/?test=1", { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => {
    return typeof window.__classicRpg === "object" && typeof window.__classicRpg.getState === "function";
  });

  const initial = await page.evaluate(() => window.__classicRpg.getState());
  expect(initial.zone).toBe("overworld");
  expect(initial.player.hp).toBeGreaterThan(0);

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
});
