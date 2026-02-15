export function createCombatRolls(deps) {
  const { levelFromXP, Skills, clamp, MOB_DEFS, Items, equipment } = deps;

  function lvlOf(skillKey) {
    return levelFromXP(Skills[skillKey]?.xp ?? 0);
  }

  function mobLvl(mob, key) {
    return (mob?.levels?.[key] ?? 1) | 0;
  }

  function calcHitChance(att, def) {
    const a = Math.max(1, att | 0);
    const d = Math.max(1, def | 0);
    return clamp(a / (a + d), 0.1, 0.9);
  }

  function rollHit(att, def) {
    return Math.random() < calcHitChance(att, def);
  }

  function maxHitFromOffense(off) {
    const o = Math.max(1, off | 0);
    return Math.max(1, 1 + Math.floor((o + 2) / 3));
  }

  function rollDamageUpTo(maxHit) {
    const mh = Math.max(1, maxHit | 0);
    return 1 + Math.floor(Math.random() * mh);
  }

  function equippedItemIds() {
    if (!equipment || typeof equipment !== "object") return [];
    return Object.values(equipment).filter((id) => typeof id === "string" && id.length > 0);
  }

  function hasWardensBrandEquipped() {
    return equipment?.offhand === "wardens_brand";
  }

  function isUndeadMob(mob) {
    const mobType = String(mob?.type || "");
    return mobType === "skeleton" || mobType === "skeleton_warden";
  }

  // Gear stats:
  // - style: "melee" | "ranged" | "magic" | "any" (default "any")
  // - att: attack/hit chance bonus
  // - dmg: damage/max-hit bonus
  // - def: defense bonus
  function getGearBonuses(style) {
    const wantedStyle = style || "any";
    let att = 0;
    let dmg = 0;
    let def = 0;

    for (const id of equippedItemIds()) {
      const c = Items?.[id]?.combat;
      if (!c || typeof c !== "object") continue;

      def += (c.def | 0);

      const itemStyle = c.style || "any";
      const styleMatch = (itemStyle === "any" || wantedStyle === "any" || itemStyle === wantedStyle);
      if (styleMatch) {
        att += (c.att | 0);
        dmg += (c.dmg | 0);
      }
    }

    return { att, dmg, def };
  }

  function rollPlayerAttack(style, mob) {
    const mobDef = mobLvl(mob, "defense");

    // Melee uses Accuracy for hit chance and Power for damage.
    // Ranged/Magic use their own style skill for both hit chance and damage.
    let att = lvlOf("accuracy");
    let off = lvlOf("power");

    if (style === "ranged") {
      att = lvlOf("ranged");
      off = lvlOf("ranged");
    } else if (style === "magic") {
      att = lvlOf("sorcery");
      off = lvlOf("sorcery");
    }

    const gear = getGearBonuses(style);
    att += gear.att;
    off += gear.dmg;
    const brandEligible = hasWardensBrandEquipped() && isUndeadMob(mob);
    if (brandEligible) {
      att += 2;
      off += 2;
    }

    const maxHit = maxHitFromOffense(off);
    const hit = rollHit(att, mobDef);
    const dmg = hit ? rollDamageUpTo(maxHit) : 0;
    return { hit, dmg, maxHit, brandProc: brandEligible };
  }

  function rollMobAttack(mob) {
    const def = MOB_DEFS[mob.type] ?? {};
    const att = mobLvl(mob, "accuracy");
    const off = mobLvl(mob, "power");
    const playerDef = lvlOf("defense") + getGearBonuses("any").def;

    const hit = rollHit(att, playerDef);
    const maxHit = Math.max(1, def.maxHit ?? maxHitFromOffense(off));
    let dmg = hit ? rollDamageUpTo(maxHit) : 0;
    let brandProc = false;
    if (dmg > 0 && hasWardensBrandEquipped() && isUndeadMob(mob)) {
      dmg = Math.max(0, dmg - 1);
      brandProc = true;
    }
    return { hit, dmg, maxHit, brandProc };
  }

  return {
    rollPlayerAttack,
    rollMobAttack
  };
}
