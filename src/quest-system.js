export function createQuestSystem(deps) {
  const {
    questDefs,
    now,
    chatLine,
    renderQuests,
    syncDungeonQuestState,
    hasItem,
    addToInventory,
    addGroundLoot,
    player,
    addGold,
    onQuestCompleted
  } = deps;

  const QUESTS = Array.isArray(questDefs) ? questDefs : [];
  const QUESTS_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
  const questState = { byId: Object.create(null) };
  const QUEST_REWARD_TOKEN_BUCKET = "__rewards";
  const FIRST_WATCH_LAMP_TOKEN = "first_watch_xp_lamp_v1";
  const QUARTERMASTER_REPEAT_COOLDOWN_MS = 2500;
  let quartermasterTaskDigest = "";
  let quartermasterTaskDigestAt = 0;

  function resetQuartermasterTaskReminder() {
    quartermasterTaskDigest = "";
    quartermasterTaskDigestAt = 0;
  }

  function createQuestProgressRow(def) {
    const progress = Object.create(null);
    for (const obj of (def.objectives || [])) {
      const key = String(obj?.id || "");
      if (!key) continue;
      progress[key] = 0;
    }
    return {
      startedAt: 0,
      completedAt: 0,
      progress,
      tokens: Object.create(null)
    };
  }

  function getQuestDefById(questId) {
    const id = String(questId || "");
    return QUESTS_BY_ID.get(id) ?? null;
  }

  function resetQuestProgress() {
    resetQuartermasterTaskReminder();
    questState.byId = Object.create(null);
    for (const def of QUESTS) {
      const id = String(def?.id || "");
      if (!id) continue;
      questState.byId[id] = createQuestProgressRow(def);
    }
  }

  function getQuestProgress(questId) {
    const id = String(questId || "");
    if (!id || !QUESTS_BY_ID.has(id)) return null;
    if (!questState.byId[id]) questState.byId[id] = createQuestProgressRow(QUESTS_BY_ID.get(id));
    return questState.byId[id];
  }

  function isQuestCompleted(questId) {
    const row = getQuestProgress(questId);
    return !!(row && row.completedAt > 0);
  }

  function isQuestStarted(questId) {
    const row = getQuestProgress(questId);
    return !!(row && row.startedAt > 0);
  }

  function isQuestUnlocked(def) {
    if (!def?.id) return false;
    const reqs = Array.isArray(def?.requirements) ? def.requirements : [];
    for (const req of reqs) {
      if (!req || typeof req !== "object") continue;
      if (req.type === "quest_complete") {
        if (!isQuestCompleted(req.questId)) return false;
      }
    }
    return true;
  }

  function getQuestObjectiveTarget(obj) {
    return Math.max(1, obj?.target | 0);
  }

  function getQuestObjectiveProgress(questId, objectiveId) {
    const row = getQuestProgress(questId);
    if (!row) return 0;
    return Math.max(0, row.progress?.[objectiveId] | 0);
  }

  function isQuestObjectiveComplete(questId, objectiveId) {
    const def = getQuestDefById(questId);
    if (!def) return false;
    const obj = (def.objectives || []).find((o) => String(o?.id || "") === String(objectiveId || ""));
    if (!obj) return false;
    return getQuestObjectiveProgress(questId, objectiveId) >= getQuestObjectiveTarget(obj);
  }

  function hasQuestObjectiveToken(questId, objectiveId, token) {
    const row = getQuestProgress(questId);
    if (!row) return false;
    const key = String(objectiveId || "");
    const tok = String(token || "");
    if (!key || !tok) return false;
    return !!row.tokens?.[key]?.[tok];
  }

  function hasQuestRewardToken(questId, token) {
    const row = getQuestProgress(questId);
    if (!row) return false;
    const tok = String(token || "");
    if (!tok) return false;
    return !!row.tokens?.[QUEST_REWARD_TOKEN_BUCKET]?.[tok];
  }

  function markQuestRewardToken(questId, token) {
    const row = getQuestProgress(questId);
    if (!row) return false;
    const tok = String(token || "");
    if (!tok) return false;
    if (!row.tokens || typeof row.tokens !== "object") row.tokens = Object.create(null);
    if (!row.tokens[QUEST_REWARD_TOKEN_BUCKET] || typeof row.tokens[QUEST_REWARD_TOKEN_BUCKET] !== "object") {
      row.tokens[QUEST_REWARD_TOKEN_BUCKET] = Object.create(null);
    }
    row.tokens[QUEST_REWARD_TOKEN_BUCKET][tok] = 1;
    return true;
  }

  function grantFirstWatchLampReward(options = {}) {
    const retroactive = !!options.retroactive;
    if (hasQuestRewardToken("first_watch", FIRST_WATCH_LAMP_TOKEN)) return false;
    if (retroactive && hasItem("xp_lamp")) {
      markQuestRewardToken("first_watch", FIRST_WATCH_LAMP_TOKEN);
      return false;
    }
    const added = addToInventory("xp_lamp", 1);
    if (added > 0) {
      chatLine(retroactive
        ? `<span class="good">Retroactive reward: XP Lamp granted for First Watch.</span>`
        : `<span class="good">Quest reward: XP Lamp.</span>`);
    } else {
      addGroundLoot(player.x, player.y, "xp_lamp", 1);
      chatLine(retroactive
        ? `<span class="warn">Retroactive reward dropped: XP Lamp (inventory full).</span>`
        : `<span class="warn">Quest reward dropped: XP Lamp (inventory full).</span>`);
    }
    markQuestRewardToken("first_watch", FIRST_WATCH_LAMP_TOKEN);
    return true;
  }

  function objectiveMatchesQuestEvent(obj, ev) {
    if (!obj || !ev) return false;
    switch (obj.type) {
      case "gather_item":
        return ev.type === "gather_item" && String(ev.itemId || "") === String(obj.itemId || "");
      case "cook_any":
        return ev.type === "cook_any";
      case "smelt_item":
        if (ev.type !== "smelt_item") return false;
        if (!obj.itemId) return true;
        return String(ev.itemId || "") === String(obj.itemId || "");
      case "kill_mob":
        if (ev.type !== "kill_mob") return false;
        return String(ev.mobType || "") === String(obj.mobType || "");
      case "talk_npc":
        if (ev.type !== "talk_npc") return false;
        return String(ev.npcId || "") === String(obj.npcId || "");
      case "manual":
        if (ev.type !== "manual") return false;
        if (ev.objectiveId && String(ev.objectiveId || "") !== String(obj.id || "")) return false;
        return true;
      default:
        return false;
    }
  }

  function startQuest(questId) {
    const def = getQuestDefById(questId);
    const row = getQuestProgress(questId);
    if (!def || !row) return false;
    if (row.completedAt > 0) return false;
    if (!isQuestUnlocked(def)) return false;
    if (row.startedAt > 0) return false;
    row.startedAt = Date.now();
    chatLine(`<span class="good">Quest started: ${def.name}</span>`);
    renderQuests();
    return true;
  }

  function isQuestReadyToComplete(questId) {
    const def = getQuestDefById(questId);
    const row = getQuestProgress(questId);
    if (!def || !row || row.completedAt > 0) return false;
    for (const obj of (def.objectives || [])) {
      const objectiveId = String(obj?.id || "");
      if (!objectiveId) continue;
      const target = getQuestObjectiveTarget(obj);
      const current = getQuestObjectiveProgress(questId, objectiveId);
      if (current < target) return false;
    }
    return true;
  }

  function grantQuestRewards(questId) {
    if (questId === "first_watch") {
      if (!hasItem("warden_key_fragment")) {
        const added = addToInventory("warden_key_fragment", 1);
        if (added > 0) {
          chatLine(`<span class="good">Quest reward: Warden Key Fragment.</span>`);
        } else {
          addGroundLoot(player.x, player.y, "warden_key_fragment", 1);
          chatLine(`<span class="warn">Quest reward dropped: Warden Key Fragment (inventory full).</span>`);
        }
      }
      grantFirstWatchLampReward();
      addGold(150);
      chatLine(`<span class="good">Quest reward: 150 gold.</span>`);
      return;
    }
    if (questId === "ashes_under_the_keep") {
      if (!hasItem("wardens_brand")) {
        const added = addToInventory("wardens_brand", 1);
        if (added > 0) {
          chatLine(`<span class="good">Quest reward: Warden's Brand.</span>`);
        } else {
          addGroundLoot(player.x, player.y, "wardens_brand", 1);
          chatLine(`<span class="warn">Quest reward dropped: Warden's Brand (inventory full).</span>`);
        }
      }
      addGold(350);
      chatLine(`<span class="good">Quest reward: 350 gold.</span>`);
    }
  }

  function completeQuest(questId) {
    const def = getQuestDefById(questId);
    const row = getQuestProgress(questId);
    if (!def || !row || row.completedAt > 0) return false;

    row.completedAt = Date.now();
    chatLine(`<span class="good">Quest complete: ${def.name}</span>`);
    grantQuestRewards(def.id);

    for (const next of QUESTS) {
      if (!next || next.id === def.id) continue;
      if (isQuestCompleted(next.id)) continue;
      if (isQuestUnlocked(next)) {
        chatLine(`<span class="muted">New quest available: ${next.name}</span>`);
      }
    }

    if (typeof onQuestCompleted === "function") {
      onQuestCompleted(def.id);
    }
    renderQuests();
    return true;
  }

  function trackQuestEvent(ev) {
    if (!ev || typeof ev !== "object") return;
    let changed = false;
    for (const def of QUESTS) {
      if (!def?.id) continue;
      if (ev.type === "manual" && ev.questId && String(ev.questId || "") !== String(def.id || "")) continue;
      const row = getQuestProgress(def.id);
      if (!row || row.completedAt > 0) continue;
      if (row.startedAt <= 0) continue;
      if (!isQuestUnlocked(def)) continue;

      for (const obj of (def.objectives || [])) {
        const objectiveId = String(obj?.id || "");
        if (!objectiveId) continue;
        if (!objectiveMatchesQuestEvent(obj, ev)) continue;

        const target = getQuestObjectiveTarget(obj);
        const current = getQuestObjectiveProgress(def.id, objectiveId);
        if (current >= target) continue;
        const token = String(ev.token || "");
        if (token) {
          if (!row.tokens || typeof row.tokens !== "object") row.tokens = Object.create(null);
          if (!row.tokens[objectiveId] || typeof row.tokens[objectiveId] !== "object") {
            row.tokens[objectiveId] = Object.create(null);
          }
          if (row.tokens[objectiveId][token]) continue;
          row.tokens[objectiveId][token] = 1;
        }
        if (
          obj.type === "talk_npc" &&
          objectiveId === "report_quartermaster" &&
          current >= 1
        ) {
          const canReport = (def.objectives || [])
            .filter((o) => String(o?.id || "") !== objectiveId)
            .every((o) => {
              const otherId = String(o?.id || "");
              if (!otherId) return true;
              return getQuestObjectiveProgress(def.id, otherId) >= getQuestObjectiveTarget(o);
            });
          if (!canReport) continue;
        }
        const gain = Math.max(1, ev.qty | 0);
        row.progress[objectiveId] = Math.min(target, current + gain);
        changed = true;
      }

      if (isQuestReadyToComplete(def.id)) {
        completeQuest(def.id);
        changed = true;
      }
    }

    if (changed) {
      syncDungeonQuestState();
      renderQuests();
    }
  }

  function getQuestSnapshot() {
    const byId = {};
    for (const def of QUESTS) {
      const id = String(def?.id || "");
      if (!id) continue;
      const row = getQuestProgress(id);
      if (!row) continue;
      byId[id] = {
        startedAt: Math.max(0, Math.floor(Number(row.startedAt) || 0)),
        completedAt: Math.max(0, Math.floor(Number(row.completedAt) || 0)),
        progress: { ...(row.progress || {}) },
        tokens: Object.fromEntries(
          Object.entries(row.tokens || {})
            .filter(([objectiveId, tokenBag]) => objectiveId && tokenBag && typeof tokenBag === "object")
            .map(([objectiveId, tokenBag]) => [objectiveId, { ...tokenBag }])
        )
      };
    }
    return { byId };
  }

  function applyQuestSnapshot(data) {
    resetQuestProgress();
    const rows = (data && typeof data === "object" && data.byId && typeof data.byId === "object")
      ? data.byId
      : null;
    if (rows) {
      for (const def of QUESTS) {
        const id = String(def?.id || "");
        if (!id) continue;
        const src = rows[id];
        if (!src || typeof src !== "object") continue;
        const row = getQuestProgress(id);
        row.startedAt = Math.max(0, Math.floor(Number(src.startedAt) || 0));
        row.completedAt = Math.max(0, Math.floor(Number(src.completedAt) || 0));
        row.tokens = Object.create(null);
        const srcTokens = (src.tokens && typeof src.tokens === "object") ? src.tokens : null;
        if (srcTokens) {
          for (const [tokenGroup, tokenBag] of Object.entries(srcTokens)) {
            if (!tokenGroup || !tokenBag || typeof tokenBag !== "object") continue;
            row.tokens[tokenGroup] = { ...tokenBag };
          }
        }
        for (const obj of (def.objectives || [])) {
          const objectiveId = String(obj?.id || "");
          if (!objectiveId) continue;
          const target = getQuestObjectiveTarget(obj);
          const cur = Math.max(0, src.progress?.[objectiveId] | 0);
          row.progress[objectiveId] = Math.min(target, cur);
        }
      }
    }
    if (isQuestCompleted("first_watch")) {
      grantFirstWatchLampReward({ retroactive: true });
    }
    syncDungeonQuestState();
    renderQuests();
  }

  function getQuestRemainingObjectiveLines(questId) {
    const def = getQuestDefById(questId);
    if (!def) return [];
    const lines = [];
    for (const obj of (def.objectives || [])) {
      const objectiveId = String(obj?.id || "");
      if (!objectiveId) continue;
      const target = getQuestObjectiveTarget(obj);
      const current = getQuestObjectiveProgress(questId, objectiveId);
      if (current >= target) continue;
      lines.push(`${obj.label} (${current}/${target})`);
    }
    return lines;
  }

  function shouldThrottleQuartermasterTaskReminder(questId, lines) {
    if (!Array.isArray(lines) || !lines.length) return false;
    const digest = `${String(questId || "")}|${lines.join("|")}`;
    const t = now();
    if (quartermasterTaskDigest === digest && (t - quartermasterTaskDigestAt) < QUARTERMASTER_REPEAT_COOLDOWN_MS) {
      quartermasterTaskDigestAt = t;
      return true;
    }
    quartermasterTaskDigest = digest;
    quartermasterTaskDigestAt = t;
    return false;
  }

  function handleQuartermasterTalk() {
    const firstId = "first_watch";
    const secondId = "ashes_under_the_keep";

    const firstCompleted = isQuestCompleted(firstId);
    const firstStarted = isQuestStarted(firstId);

    if (!firstCompleted && !firstStarted) {
      resetQuartermasterTaskReminder();
      startQuest(firstId);
      chatLine(`<span class="muted">Quartermaster:</span> We need proof you can hold the line. Train, craft, and report back.`);
    } else if (!firstCompleted) {
      const left = getQuestRemainingObjectiveLines(firstId);
      if (left.length) {
        if (shouldThrottleQuartermasterTaskReminder(firstId, left)) {
          chatLine(`<span class="muted">Quartermaster:</span> Same orders. Check your quest log for the remaining tasks.`);
          return;
        }
        chatLine(`<span class="muted">Quartermaster:</span> Keep at it. Remaining tasks:`);
        for (const line of left.slice(0, 4)) {
          chatLine(`<span class="muted"> - ${line}</span>`);
        }
        if (left.length > 4) chatLine(`<span class="muted"> - ...and ${left.length - 4} more.</span>`);
      }
    } else {
      const secondCompleted = isQuestCompleted(secondId);
      const secondStarted = isQuestStarted(secondId);
      if (!secondCompleted && !secondStarted && isQuestUnlocked(getQuestDefById(secondId))) {
        resetQuartermasterTaskReminder();
        startQuest(secondId);
        chatLine(`<span class="muted">Quartermaster:</span> The lower keep is waking. Take your fragment and prepare for the Warden.`);
      } else if (!secondCompleted && secondStarted) {
        const left = getQuestRemainingObjectiveLines(secondId);
        if (left.length) {
          if (shouldThrottleQuartermasterTaskReminder(secondId, left)) {
            chatLine(`<span class="muted">Quartermaster:</span> Same orders. Check your quest log for the remaining tasks.`);
            return;
          }
          chatLine(`<span class="muted">Quartermaster:</span> Ashes Under the Keep remains unfinished:`);
          for (const line of left.slice(0, 4)) {
            chatLine(`<span class="muted"> - ${line}</span>`);
          }
        } else {
          resetQuartermasterTaskReminder();
          chatLine(`<span class="muted">Quartermaster:</span> Hold steady. The way forward will open soon.`);
        }
      } else {
        resetQuartermasterTaskReminder();
        chatLine(`<span class="muted">Quartermaster:</span> You have done enough for now.`);
      }
    }
  }

  function getQuestGiverNpcId(def) {
    const direct = String(def?.giverNpcId || "").trim();
    if (direct) return direct;
    const objectiveNpcIds = new Set();
    for (const obj of (def?.objectives || [])) {
      if (String(obj?.type || "") !== "talk_npc") continue;
      const npcId = String(obj?.npcId || "").trim();
      if (!npcId) continue;
      objectiveNpcIds.add(npcId);
      if (objectiveNpcIds.size > 1) break;
    }
    if (objectiveNpcIds.size === 1) {
      for (const id of objectiveNpcIds) return id;
    }
    return "";
  }

  function npcHasPendingQuestMarker(npcId) {
    const id = String(npcId || "").trim();
    if (!id) return false;
    for (const def of QUESTS) {
      const questId = String(def?.id || "");
      if (!questId) continue;
      if (isQuestCompleted(questId)) continue;
      if (getQuestGiverNpcId(def) !== id) continue;
      if (!isQuestStarted(questId) && !isQuestUnlocked(def)) continue;
      return true;
    }
    return false;
  }

  resetQuestProgress();

  return {
    questList: QUESTS,
    getQuestDefById,
    resetQuestProgress,
    getQuestProgress,
    isQuestCompleted,
    isQuestStarted,
    isQuestUnlocked,
    getQuestObjectiveTarget,
    getQuestObjectiveProgress,
    isQuestObjectiveComplete,
    hasQuestObjectiveToken,
    isQuestReadyToComplete,
    completeQuest,
    trackQuestEvent,
    getQuestSnapshot,
    applyQuestSnapshot,
    handleQuartermasterTalk,
    npcHasPendingQuestMarker
  };
}
