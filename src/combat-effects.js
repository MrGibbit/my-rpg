export function createCombatEffects(deps) {
  const {
    player,
    gatherParticles,
    combatFX,
    tileCenter,
    now
  } = deps;

  function spawnGatherParticles(kind, tx, ty) {
    const center = tileCenter(tx, ty);
    for (let i = 0; i < 6; i++) {
      gatherParticles.push({
        kind,
        x: center.cx + (Math.random() * 10 - 5),
        y: center.cy + (Math.random() * 10 - 5),
        vx: (Math.random() * 60 - 30),
        vy: (Math.random() * 60 - 30),
        born: now(),
        life: 350 + Math.random() * 250
      });
    }
  }

  function spawnCombatFX(kind, tx, ty, options = {}) {
    const a = { x: player.px, y: player.py };
    const b = tileCenter(tx, ty);
    if (kind === "slash") {
      combatFX.push({
        kind,
        x0: a.x, y0: a.y,
        x1: b.cx, y1: b.cy,
        born: now(),
        life: 220
      });
    } else if (kind === "arrow") {
      combatFX.push({
        kind,
        x0: a.x, y0: a.y,
        x1: b.cx, y1: b.cy,
        born: now(),
        life: 320
      });
    } else if (kind === "bolt") {
      const variant = (typeof options?.variant === "string") ? options.variant : "";
      combatFX.push({
        kind,
        variant,
        x0: a.x, y0: a.y,
        x1: b.cx, y1: b.cy,
        born: now(),
        life: 300
      });
    } else if (kind === "fire_bolt") {
      combatFX.push({
        kind,
        x0: a.x, y0: a.y,
        x1: b.cx, y1: b.cy,
        born: now(),
        life: 300
      });
    }
  }

  return {
    spawnGatherParticles,
    spawnCombatFX
  };
}
