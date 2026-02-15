export function createEntityLookup(deps) {
  const { interactables, getDecorAt, mobs, resources } = deps;

  return function getEntityAt(tx, ty) {
    const idx = interactables.findIndex((it) => it.x === tx && it.y === ty);
    if (idx !== -1) {
      const it = interactables[idx];
      if (it.type === "fire") return { kind: "fire", index: idx, label: "Campfire", x: it.x, y: it.y };
      if (it.type === "bank") return { kind: "bank", index: idx, label: "Bank Chest", x: it.x, y: it.y };
      if (it.type === "vendor") return { kind: "vendor", index: idx, label: "Vendor", x: it.x, y: it.y };
      if (it.type === "fish") return { kind: "fish", index: idx, label: "Fishing Spot", x: it.x, y: it.y };
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
      return { kind: "res", index: resIndex, label: res.type === "tree" ? "Tree" : "Rock" };
    }

    return null;
  };
}
