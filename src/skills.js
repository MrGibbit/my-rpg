export function xpForLevel(lvl) {
  if (lvl <= 1) return 0;
  return 25 * (lvl - 1) * (lvl - 1);
}

export function levelFromXP(xp) {
  let lvl = 1;
  while (xp >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export function xpToNext(xp) {
  const lvl = levelFromXP(xp);
  const cur = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  return { lvl, cur, next, pct: (xp - cur) / (next - cur) };
}

export function getSkillLevel(skills, key) {
  const s = skills[key];
  return levelFromXP(s ? s.xp : 0);
}

export function calcCombatLevelFromLevels(lv) {
  const def = lv.defense | 0;
  const hp = lv.health | 0;
  const atk = lv.accuracy | 0;
  const str = lv.power | 0;
  const rng = lv.ranged | 0;
  const mag = lv.sorcery | 0;

  const base = (def + hp) / 4;
  const melee = (atk + str) / 2;
  const range = (rng * 3) / 2;
  const mage = (mag * 3) / 2;

  return Math.floor(base + Math.max(melee, range, mage));
}

export function getPlayerCombatLevel(skills) {
  return calcCombatLevelFromLevels({
    accuracy: getSkillLevel(skills, "accuracy"),
    power: getSkillLevel(skills, "power"),
    defense: getSkillLevel(skills, "defense"),
    ranged: getSkillLevel(skills, "ranged"),
    sorcery: getSkillLevel(skills, "sorcery"),
    health: getSkillLevel(skills, "health"),
  });
}
