export const MAX_SKILL_LEVEL = 99;
export const MAX_SKILL_XP = xpForLevel(MAX_SKILL_LEVEL + 1) - 1;
export const MAX_COMBAT_LEVEL = 138;

export function xpForLevel(lvl) {
  if (lvl <= 1) return 0;
  return 25 * (lvl - 1) * (lvl - 1);
}

export function levelFromXP(xp) {
  const xpSafe = Math.max(0, xp | 0);
  let lvl = 1;
  while (lvl < MAX_SKILL_LEVEL && xpSafe >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export function xpToNext(xp) {
  const lvl = levelFromXP(xp);
  const cur = xpForLevel(lvl);
  if (lvl >= MAX_SKILL_LEVEL) {
    return { lvl, cur, next: cur, pct: 1 };
  }
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

  // RuneScape-style scaling:
  // floor((def + hp + max(1.3*(atk+str), 1.3*floor(1.5*rng), 1.3*floor(1.5*mag))) / 4)
  const base = def + hp;
  const melee = 1.3 * (atk + str);
  const range = 1.3 * Math.floor(rng * 1.5);
  const mage = 1.3 * Math.floor(mag * 1.5);
  const raw = Math.floor((base + Math.max(melee, range, mage)) / 4);
  return Math.min(MAX_COMBAT_LEVEL, Math.max(1, raw));
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
