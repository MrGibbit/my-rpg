export function createFXRenderer(deps) {
  const { now, gatherParticles, combatFX, clamp, ctx } = deps;

  function updateFX() {
    const t = now();
    for (let i = gatherParticles.length - 1; i >= 0; i--) {
      const p = gatherParticles[i];
      if ((t - p.born) >= p.life) {
        gatherParticles.splice(i, 1);
        continue;
      }
      const dt = 1 / 60;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }

    for (let i = combatFX.length - 1; i >= 0; i--) {
      const fx = combatFX[i];
      if ((t - fx.born) >= fx.life) {
        combatFX.splice(i, 1);
      }
    }
  }

  function drawFX() {
    const t = now();

    for (const p of gatherParticles) {
      const age = (t - p.born) / p.life;
      const a = clamp(1 - age, 0, 1);
      if (p.kind === "wood") ctx.fillStyle = `rgba(253, 230, 138, ${0.55 * a})`;
      else ctx.fillStyle = `rgba(226, 232, 240, ${0.55 * a})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    for (const fx of combatFX) {
      const age = clamp((t - fx.born) / fx.life, 0, 1);
      const a = clamp(1 - age, 0, 1);

      if (fx.kind === "slash") {
        const mx = (fx.x0 + fx.x1) / 2;
        const my = (fx.y0 + fx.y1) / 2;
        const dx = fx.x1 - fx.x0;
        const dy = fx.y1 - fx.y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const bend = 14 * Math.sin(age * Math.PI);

        ctx.strokeStyle = `rgba(251, 191, 36, ${0.70 * a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fx.x0, fx.y0);
        ctx.quadraticCurveTo(mx + nx * bend, my + ny * bend, fx.x1, fx.y1);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      if (fx.kind === "arrow" || fx.kind === "bolt") {
        const p = age;
        const x = fx.x0 + (fx.x1 - fx.x0) * p;
        const y = fx.y0 + (fx.y1 - fx.y0) * p;

        const dx = fx.x1 - fx.x0;
        const dy = fx.y1 - fx.y0;
        const ang = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);

        if (fx.kind === "arrow") {
          ctx.strokeStyle = `rgba(226, 232, 240, ${0.85 * a})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(8, 0);
          ctx.stroke();
          ctx.fillStyle = `rgba(148, 163, 184, ${0.85 * a})`;
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(3, -3);
          ctx.lineTo(3, 3);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = `rgba(34, 211, 238, ${0.85 * a})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-10, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();

          ctx.strokeStyle = `rgba(255,255,255, ${0.60 * a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-8, -3);
          ctx.lineTo(6, -3);
          ctx.moveTo(-8, 3);
          ctx.lineTo(6, 3);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.restore();
      }
    }
  }

  return { updateFX, drawFX };
}
