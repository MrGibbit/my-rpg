export function createActionResolver(deps) {
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
    onUseLadder
  } = deps;

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

      if (typeof onCollected === "function") onCollected();
      finishGatherSuccess(skillKey, xpAmount, successMessage);
    });
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

      const hasCrudeOre = hasItem("ore");
      const hasIronOre = hasItem("iron_ore");
      if (!hasCrudeOre && !hasIronOre) {
        chatLine(`<span class="muted">The furnace is ready. You need ore.</span>`);
        stopAction();
        return;
      }

      const smeltId = hasIronOre ? "iron_ore" : "ore";
      chatLine(`You feed ${Items[smeltId]?.name ?? smeltId} into the furnace...`);
      startTimedAction("smelt", 1600, "Smelting...", () => {
        if (!removeItemsFromInventory(smeltId, 1)) {
          chatLine(`<span class="warn">You need ${Items[smeltId]?.name ?? smeltId}.</span>`);
          return;
        }

        const smeltXp = 45;
        const got = addToInventory("crude_bar", 1);
        addXP("smithing", smeltXp);

        if (got === 1) {
          chatLine(`<span class="good">You smelt a ${Items.crude_bar?.name ?? "Crude Bar"}.</span> (+${smeltXp} XP)`);
        } else {
          addGroundLoot(player.x, player.y, "crude_bar", 1);
          chatLine(`<span class="warn">Inventory full: ${Items.crude_bar?.name ?? "crude_bar"}</span> (+${smeltXp} XP)`);
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

      const cookId =
        useCookable ||
        (hasItem("rat_meat") ? "rat_meat" :
          (hasItem("goldfish") ? "goldfish" : null));

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
        const chance = clamp(0.35 + lvlNow * 0.05, 0.35, 0.90);
        if (Math.random() > chance) {
          chatLine(`<span class="muted">You fail to catch anything.</span>`);
          return;
        }

        if (!addGatherItemOrStop("goldfish", `<span class="warn">Inventory full: ${Items.goldfish.name}</span>`)) return;
        finishGatherSuccess("fishing", 18, `<span class="good">You catch a gold fish.</span> (+18 XP)`);
      });

      return;
    }

    if (t.kind === "res") {
      const r = resources[t.index];
      if (!r || !r.alive) return stopAction("That resource is gone.");
      const isRock = (r.type === "rock");
      const isIronRock = (r.type === "iron_rock");
      if (r.type === "tree" && !hasItem("axe")) return stopAction("You need an axe.");
      if ((isRock || isIronRock) && !hasItem("pick")) return stopAction("You need a pick.");

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
      if (isIronRock && levelFromXP(Skills.mining.xp) < 10) {
        return stopAction("You need Mining level 10 to mine iron rocks.");
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
      } else if (isRock || isIronRock) {
        const mineXp = isIronRock ? 65 : 40;
        const verb = isIronRock ? "iron rock" : "rock";
        const oreId = isIronRock ? "iron_ore" : "ore";
        chatLine(`You chip away at the ${verb}...`);
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
          successMessage: `<span class="good">You mine ${Items[oreId]?.name ?? oreId} from the ${verb}.</span> (+${mineXp} XP)`
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
      player.attackCooldownUntil = tNow + 900;

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
        addXP(meleeState.selected, dmg);
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
        m.respawnAt = now() + 12000;
        m.hp = 0;
        m.target = null;
        m.provokedUntil = 0;
        m.aggroUntil = 0;
        m.attackCooldownUntil = 0;
        m.moveCooldownUntil = 0;
        chatLine(`<span class="good">You defeat the ${mobName}.</span>`);

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

        stopAction();
      }
    }
  }

  return { ensureWalkIntoRangeAndAct };
}
