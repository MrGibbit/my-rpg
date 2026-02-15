export function createInteractionHelpers(deps) {
  const {
    chatLine,
    mobs,
    DECOR_EXAMINE_TEXT,
    closeCtxMenu,
    player,
    ensureWalkIntoRangeAndAct,
    setPathTo,
    getEntityAt
  } = deps;

  function examineEntity(ent) {
    if (!ent) return;
    if (ent.kind === "mob") {
      const mob = mobs[ent.index];
      if (mob?.type === "goblin") {
        chatLine(`<span class="muted">A mean little goblin with scavenged gear.</span>`);
      } else {
        chatLine(`<span class="muted">It's a small, scrappy rat.</span>`);
      }
    }
    if (ent.kind === "res" && ent.label === "Tree") chatLine(`<span class="muted">A sturdy tree. Looks good for logs.</span>`);
    if (ent.kind === "res" && ent.label === "Rock") chatLine(`<span class="muted">A mineral rock. Might contain crude ore.</span>`);
    if (ent.kind === "bank") chatLine(`<span class="muted">A secure bank chest.</span>`);
    if (ent.kind === "vendor") chatLine(`<span class="muted">A traveling vendor. Buys and sells goods.</span>`);
    if (ent.kind === "fire") chatLine(`<span class="muted">A warm campfire. Great for cooking.</span>`);
    if (ent.kind === "fish") chatLine(`<span class="muted">A bubbling fishing spot in the river.</span>`);
    if (ent.kind === "furnace") chatLine(`<span class="muted">A sturdy furnace. You can smelt crude ore into crude bars here.</span>`);
    if (ent.kind === "anvil") chatLine(`<span class="muted">A heavy anvil for shaping bars into gear.</span>`);
    if (ent.kind === "ladder_down") chatLine(`<span class="muted">A ladder descending into darkness.</span>`);
    if (ent.kind === "ladder_up") chatLine(`<span class="muted">A ladder leading back to the surface.</span>`);
    if (ent.kind === "decor") {
      const msg = DECOR_EXAMINE_TEXT[ent.decorId] ?? `A ${String(ent.label || "decoration").toLowerCase()}.`;
      chatLine(`<span class="muted">${msg}</span>`);
    }
  }

  function beginInteraction(ent) {
    closeCtxMenu();
    if (ent?.kind === "decor") {
      examineEntity(ent);
      return;
    }
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    player.target = { kind: ent.kind, index: ent.index };
    ensureWalkIntoRangeAndAct();
  }

  function clickToInteract(tileX, tileY) {
    const ent = getEntityAt(tileX, tileY);
    if (ent) {
      if (ent.kind !== "decor") {
        beginInteraction(ent);
        return;
      }
    }

    player.target = null;
    player.action = { type: "idle", endsAt: 0, total: 0, label: "Idle", onComplete: null };
    setPathTo(tileX, tileY);
  }

  return {
    examineEntity,
    beginInteraction,
    clickToInteract
  };
}
