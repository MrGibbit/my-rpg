export function createInteractionHelpers(deps) {
  const {
    chatLine,
    mobs,
    DECOR_EXAMINE_TEXT,
    closeCtxMenu,
    player,
    ensureWalkIntoRangeAndAct,
    setPathTo,
    getEntityAt,
    interactables
  } = deps;

  function examineEntity(ent) {
    if (!ent) return;
    if (ent.kind === "mob") {
      const mob = mobs[ent.index];
      if (mob?.type === "goblin") {
        chatLine(`<span class="muted">A mean little goblin with scavenged gear.</span>`);
      } else if (mob?.type === "skeleton_warden") {
        chatLine(`<span class="muted">An ancient skeletal commander bound to guard the sealed wing.</span>`);
      } else if (mob?.type === "skeleton") {
        chatLine(`<span class="muted">A rattling skeleton bound to this dungeon.</span>`);
      } else {
        chatLine(`<span class="muted">It's a small, scrappy rat.</span>`);
      }
    }
    if (ent.kind === "res" && ent.label === "Tree") chatLine(`<span class="muted">A sturdy tree. Looks good for logs.</span>`);
    if (ent.kind === "res" && ent.label === "Rock") chatLine(`<span class="muted">A mineral rock. Good for basic mining.</span>`);
    if (ent.kind === "res" && ent.label === "Iron Rock") chatLine(`<span class="muted">A dense iron rock. Requires Mining level 10.</span>`);
    if (ent.kind === "bank") chatLine(`<span class="muted">A secure bank chest.</span>`);
    if (ent.kind === "vendor") chatLine(`<span class="muted">A traveling vendor. Buys and sells goods.</span>`);
    if (ent.kind === "quest_npc") {
      const npcId = String(ent.npcId || "");
      if (npcId === "blacksmith_torren") {
        chatLine(`<span class="muted">A master blacksmith who can commission forge upgrades.</span>`);
      } else {
        chatLine(`<span class="muted">A veteran quartermaster keeping records and assignments.</span>`);
      }
    }
    if (ent.kind === "project_npc") {
      const npcId = String(ent.npcId || "");
      if (npcId === "blacksmith_torren") {
        chatLine(`<span class="muted">A master blacksmith overseeing Rivermoor's projects.</span>`);
      } else if (npcId === "dock_foreman") {
        chatLine(`<span class="muted">The dock foreman managing construction at the harbor.</span>`);
      } else if (npcId === "hearth_keeper") {
        chatLine(`<span class="muted">A caring guardian of the community hearth.</span>`);
      } else if (npcId === "mayor") {
        chatLine(`<span class="muted">The mayor overseeing all of Rivermoor's development.</span>`);
      } else {
        chatLine(`<span class="muted">A community leader dedicated to Rivermoor's progress.</span>`);
      }
    }
    if (ent.kind === "sealed_gate") chatLine(`<span class="muted">A rune-bound gate leading into the old boss wing.</span>`);
    if (ent.kind === "brazier") chatLine(`<span class="muted">An old brazier. It looks tied to the warding ritual in this hall.</span>`);
    if (ent.kind === "fire") chatLine(`<span class="muted">A warm campfire. Great for cooking.</span>`);
    if (ent.kind === "cauldron") chatLine(`<span class="muted">A sturdy cauldron ready for cooking.</span>`);
    if (ent.kind === "fish") {
      const spot = interactables[ent.index];
      const typeLabel = spot?.type === "fish_dock" ? "Advanced Fishing Spot" : "Fishing Spot";
      const typeDesc = spot?.type === "fish_dock" ? "larger fish" : "common fish";
      chatLine(`<span class="muted">A bubbling ${typeLabel} in the river, attracting ${typeDesc}.</span>`);
    }
    if (ent.kind === "furnace") chatLine(`<span class="muted">A sturdy furnace. You can smelt crude or iron ore into crude bars here.</span>`);
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
