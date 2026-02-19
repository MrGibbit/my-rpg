export function createEntityLookup(deps) {
  const { interactables, getDecorAt, mobs, resources } = deps;

  return function getEntityAt(tx, ty) {
    const idx = interactables.findIndex((it) => it.x === tx && it.y === ty);
    if (idx !== -1) {
      const it = interactables[idx];
      if (it.type === "fire") return { kind: "fire", index: idx, label: "Campfire", x: it.x, y: it.y };
      if (it.type === "cauldron") return { kind: "cauldron", index: idx, label: "Cauldron", x: it.x, y: it.y };
      if (it.type === "bank") return { kind: "bank", index: idx, label: "Bank Chest", x: it.x, y: it.y };
      if (it.type === "vendor") return { kind: "vendor", index: idx, label: "Vendor", x: it.x, y: it.y };
      if (it.type === "quest_npc") {
        return {
          kind: "quest_npc",
          index: idx,
          label: it.name || "Quartermaster",
          npcId: String(it.npcId || ""),
          x: it.x,
          y: it.y
        };
      }
      if (it.type === "project_npc") {
        return {
          kind: "project_npc",
          index: idx,
          label: it.name || "NPC",
          npcId: String(it.npcId || ""),
          x: it.x,
          y: it.y
        };
      }
      if (it.type === "sealed_gate") return { kind: "sealed_gate", index: idx, label: (it.open ? "Unsealed Gate" : "Sealed Gate"), x: it.x, y: it.y, open: !!it.open };
      if (it.type === "brazier") return { kind: "brazier", index: idx, label: (it.lit ? "Lit Brazier" : "Dead Brazier"), x: it.x, y: it.y, lit: !!it.lit };
      if (it.type === "fish" || it.type === "fish_dock") return { kind: "fish", index: idx, label: "Fishing Spot", x: it.x, y: it.y };
      if (it.type === "furnace") return { kind: "furnace", index: idx, label: "Furnace", x: it.x, y: it.y };
      if (it.type === "anvil") return { kind: "anvil", index: idx, label: "Anvil", x: it.x, y: it.y };
      if (it.type === "ladder_down") return { kind: "ladder_down", index: idx, label: "Ladder Down", x: it.x, y: it.y };
      if (it.type === "ladder_up") return { kind: "ladder_up", index: idx, label: "Ladder Up", x: it.x, y: it.y };
    }

    const decor = getDecorAt(tx, ty);
    if (decor) {
      return { kind: "decor", label: decor.label, decorId: decor.id, x: tx, y: ty };
    }

    const mobIndex = mobs.findIndex((m) => m.alive && m.x === tx && m.y === ty);
    if (mobIndex >= 0) {
      const mob = mobs[mobIndex];
      const name = mob?.name ?? "Rat";
      const lvl = mob?.combatLevel ?? 1;
      return { kind: "mob", index: mobIndex, label: `${name} (Lvl ${lvl})`, level: lvl };
    }

    const resIndex = resources.findIndex((r) => r.alive && r.x === tx && r.y === ty);
    if (resIndex >= 0) {
      const res = resources[resIndex];
      if (res.type === "tree") return { kind: "res", index: resIndex, label: "Tree" };
      if (res.type === "iron_rock") return { kind: "res", index: resIndex, label: "Iron Rock" };
      if (res.type === "rock") return { kind: "res", index: resIndex, label: "Rock" };
      return { kind: "res", index: resIndex, label: "Resource" };
    }

    return null;
  };
}
