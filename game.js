import { clamp, dist, now } from "./src/utils.js";
import {
  TILE, W, H, WORLD_W, WORLD_H, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, RIVER_Y
} from "./src/config.js";
import {
  levelFromXP, xpToNext, calcCombatLevelFromLevels, getPlayerCombatLevel
} from "./src/skills.js";
import { createNavigation } from "./src/navigation.js";
import {
  camera, view, map, startCastle, southKeep, Skills, lastSkillLevel, lastSkillXPMsgAt,
  BASE_HP, HP_PER_LEVEL, wallet, MAX_INV, MAX_BANK, inv, bank, quiver, groundLoot,
  manualDropLocks, lootUi, equipment, meleeState, resources, mobs, interactables,
  worldState, availability, windowsOpen, useState, characterState, chatUI,
  gatherParticles, combatFX, mouse, player
} from "./src/state.js";



(() => {


  // ---------- Chat ----------
  const CHAT_LIMIT = 20;
  const chatLogEl = document.getElementById("chatLog");

  function chatLine(html) {
    const nearBottom = (chatLogEl.scrollTop + chatLogEl.clientHeight) >= (chatLogEl.scrollHeight - 24);

    const p = document.createElement("p");
    p.innerHTML = html;
    chatLogEl.appendChild(p);

    while (chatLogEl.childElementCount > CHAT_LIMIT) {
      chatLogEl.removeChild(chatLogEl.firstElementChild);
    }

    if (nearBottom) {
      chatLogEl.scrollTop = chatLogEl.scrollHeight;
    }
  }

  // ---------- Game constants ----------

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  // Zoom
  function setZoom(z) {
    view.zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const step = 0.06;
    setZoom(view.zoom + (delta > 0 ? -step : step));
  }, { passive: false });

  // Camera (top-left) in world pixels
  function viewWorldW(){ return VIEW_W / view.zoom; }
  function viewWorldH(){ return VIEW_H / view.zoom; }

  // ---------- Map / pathfinding ----------
  const { inBounds, isWalkable, isIndoors, astar } = createNavigation(map, W, H);

  function iconTile(body, top, mid, edge = "#26180f"){
    return `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="${edge}"/>
      <rect x="2" y="2" width="12" height="12" rx="1" fill="${mid}"/>
      <rect x="2" y="2" width="12" height="4" fill="${top}" opacity=".95"/>
      <rect x="2" y="9" width="12" height="5" fill="rgba(0,0,0,.24)"/>
      <rect x="3" y="3" width="1" height="1" fill="rgba(255,255,255,.25)"/>
      <rect x="12" y="3" width="1" height="1" fill="rgba(255,255,255,.18)"/>
      ${body}
    </svg>`;
  }

  const GLYPHS = {
    unknown: `
      <rect x="6" y="4" width="4" height="1" fill="#f8fafc"/>
      <rect x="9" y="5" width="1" height="2" fill="#f8fafc"/>
      <rect x="8" y="7" width="1" height="1" fill="#f8fafc"/>
      <rect x="7" y="8" width="1" height="1" fill="#f8fafc"/>
      <rect x="7" y="10" width="2" height="2" fill="#f8fafc"/>
    `,
    sword: `
      <rect x="7" y="2" width="2" height="8" fill="#dbe6f3"/>
      <rect x="6" y="4" width="4" height="1" fill="#f8fafc"/>
      <rect x="6" y="9" width="4" height="1" fill="#8b5a2b"/>
      <rect x="7" y="10" width="2" height="3" fill="#b7793e"/>
      <rect x="7" y="12" width="2" height="1" fill="#5b3a1d"/>
    `,
    shield: `
      <path d="M8 2 L12 4 L11 10 L8 13 L5 10 L4 4 Z" fill="#94a3b8"/>
      <path d="M8 3.1 L11 4.5 L10.3 9.5 L8 11.8 L5.7 9.5 L5 4.5 Z" fill="#cbd5e1"/>
      <rect x="7.5" y="4" width="1" height="7" fill="#475569"/>
    `,
    bow: `
      <path d="M11.7 2.7 C9.8 4.3 9 6.1 9 8 C9 9.9 9.8 11.7 11.7 13.3" fill="none" stroke="#d6a96a" stroke-width="1.6" stroke-linecap="round"/>
      <line x1="10.1" y1="3.2" x2="10.1" y2="12.8" stroke="#f1f5f9" stroke-width="1"/>
      <rect x="4" y="7.5" width="5" height="1" fill="#94a3b8"/>
      <path d="M3 8 L5 7 L5 9 Z" fill="#f8fafc"/>
      <rect x="8.5" y="7" width="2" height="2" fill="#7c2d12"/>
    `,
    arrow: `
      <rect x="3" y="7" width="8" height="2" fill="#dbeafe"/>
      <path d="M2 8 L4 6.8 L4 9.2 Z" fill="#f8fafc"/>
      <path d="M12 8 L10.8 6.7 L10.8 9.3 Z" fill="#9a3412"/>
      <path d="M11.2 8 L9.8 6.8 L9.8 9.2 Z" fill="#ea580c"/>
    `,
    staff: `
      <rect x="7" y="3" width="2" height="10" fill="#9a6b3b"/>
      <rect x="6" y="2" width="4" height="2" fill="#c4b5fd"/>
      <rect x="7" y="1" width="2" height="1" fill="#f5f3ff"/>
      <rect x="6" y="5" width="1" height="1" fill="#fef3c7"/>
      <rect x="9" y="8" width="1" height="1" fill="#fde68a"/>
    `,
    axe: `
      <rect x="7" y="3" width="2" height="10" fill="#8b5a2b"/>
      <path d="M9 4 L13 5.5 L13 8 L9 8 Z" fill="#cbd5e1"/>
      <path d="M6.5 5 L9 4.5 L9 8.5 L6.5 9 Z" fill="#94a3b8"/>
      <rect x="7" y="11" width="2" height="1" fill="#5b3a1d"/>
    `,
    pick: `
      <rect x="7" y="3" width="2" height="10" fill="#8b5a2b"/>
      <path d="M4 5 C6 3.5 10 3.5 12 5" fill="none" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M5 6.5 C6.5 7.2 9.5 7.2 11 6.5" fill="none" stroke="#94a3b8" stroke-width="1"/>
    `,
    knife: `
      <path d="M4 9 L10.5 4.3 L12 5.8 L5.4 10.4 Z" fill="#e2e8f0"/>
      <path d="M10.4 4.3 L12.8 3.4 L12 5.8 Z" fill="#f8fafc"/>
      <rect x="3.2" y="9.2" width="3" height="2" fill="#7c2d12"/>
      <rect x="3.8" y="9.8" width="1" height="1" fill="#fbbf24"/>
    `,
    coin: `
      <circle cx="8" cy="8" r="4.2" fill="#facc15"/>
      <circle cx="8" cy="8" r="3.2" fill="#fde047"/>
      <circle cx="8" cy="8" r="1.2" fill="#ca8a04"/>
      <rect x="6.8" y="4.2" width="2.4" height="1" fill="rgba(255,255,255,.35)"/>
    `,
    flint: `
      <path d="M4 10 L8 4 L11 5 L9 11 L5 12 Z" fill="#64748b"/>
      <path d="M8.8 6.7 L11.7 3.8 L12.4 4.5 L9.5 7.4 Z" fill="#f1f5f9"/>
      <rect x="11.6" y="2.8" width="1" height="1" fill="#fde68a"/>
      <rect x="12.5" y="3.6" width="1" height="1" fill="#fb923c"/>
      <rect x="10.9" y="3.5" width="1" height="1" fill="#fbbf24"/>
    `,
    log: `
      <rect x="3" y="6" width="10" height="4" rx="1" fill="#8b5a2b"/>
      <rect x="4" y="7" width="8" height="2" fill="#a16207"/>
      <circle cx="4" cy="8" r="1.1" fill="#d6a96a"/>
      <circle cx="12" cy="8" r="1.1" fill="#d6a96a"/>
      <circle cx="4" cy="8" r=".5" fill="#8b5a2b"/>
      <circle cx="12" cy="8" r=".5" fill="#8b5a2b"/>
    `,
    ore: `
      <path d="M8 3 L12 5 L11 10 L7 12 L4 9 L5 5 Z" fill="#94a3b8"/>
      <path d="M8 4.3 L10.8 5.8 L10.1 9.2 L7.2 10.8 L5.5 8.8 L6.1 5.9 Z" fill="#cbd5e1"/>
      <rect x="7" y="6" width="1.2" height="1.2" fill="#f8fafc"/>
      <rect x="8.8" y="8.3" width="1" height="1" fill="#f8fafc"/>
    `,
    bone: `
      <circle cx="4.8" cy="6.2" r="1.7" fill="#f1f5f9"/>
      <circle cx="11.2" cy="9.8" r="1.7" fill="#f1f5f9"/>
      <rect x="5.2" y="6.4" width="6" height="3.2" rx="1.2" fill="#e2e8f0"/>
      <circle cx="4.2" cy="7.8" r="1.2" fill="#e2e8f0"/>
      <circle cx="11.8" cy="8.2" r="1.2" fill="#e2e8f0"/>
    `,
    heart: `
      <path d="M8 12 L3.8 8.3 C2.5 7.1 2.6 5 4.2 4.1 C5.3 3.5 6.7 3.8 7.5 4.8 L8 5.4 L8.5 4.8 C9.3 3.8 10.7 3.5 11.8 4.1 C13.4 5 13.5 7.1 12.2 8.3 Z" fill="#ef4444"/>
      <path d="M8 10.8 L4.7 7.9 C3.8 7.1 3.8 5.8 4.8 5.2 C5.6 4.7 6.5 4.9 7 5.6 L8 6.8 L9 5.6 C9.5 4.9 10.4 4.7 11.2 5.2 C12.2 5.8 12.2 7.1 11.3 7.9 Z" fill="#f87171"/>
    `,
    target: `
      <circle cx="8" cy="8" r="4.2" fill="none" stroke="#f1f5f9" stroke-width="1.2"/>
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="#f8fafc" stroke-width="1.2"/>
      <circle cx="8" cy="8" r="1.1" fill="#f8fafc"/>
      <rect x="7.7" y="2.3" width=".6" height="2.1" fill="#f8fafc"/>
      <rect x="7.7" y="11.6" width=".6" height="2.1" fill="#f8fafc"/>
      <rect x="2.3" y="7.7" width="2.1" height=".6" fill="#f8fafc"/>
      <rect x="11.6" y="7.7" width="2.1" height=".6" fill="#f8fafc"/>
    `,
    gauntlet: `
      <rect x="4" y="8" width="8" height="4" rx="1" fill="#d6a96a"/>
      <rect x="5" y="6.5" width="2" height="2.2" fill="#f3cf9e"/>
      <rect x="7" y="6" width="2" height="2.4" fill="#f3cf9e"/>
      <rect x="9" y="6.3" width="2" height="2.2" fill="#f3cf9e"/>
      <rect x="4.2" y="9" width="1.5" height="2" fill="#8b5a2b"/>
      <rect x="10.8" y="9" width="1.2" height="2" fill="#8b5a2b"/>
    `,
    spark: `
      <path d="M8 2.5 L9.3 6.7 L13.5 8 L9.3 9.3 L8 13.5 L6.7 9.3 L2.5 8 L6.7 6.7 Z" fill="#e9d5ff"/>
      <circle cx="8" cy="8" r="1.2" fill="#f5f3ff"/>
    `,
    wizard_hat: `
      <path d="M8 2.8 L11.8 10.7 H4.2 Z" fill="#7c3aed"/>
      <path d="M8 4.4 L10.3 9.2 H5.7 Z" fill="#a78bfa"/>
      <rect x="3.2" y="10.5" width="9.6" height="1.7" rx=".8" fill="#5b21b6"/>
      <rect x="5.9" y="10.7" width="4.2" height=".8" fill="#facc15"/>
      <rect x="7.2" y="6.1" width=".9" height=".9" fill="#f8fafc"/>
      <rect x="9.2" y="8.1" width=".8" height=".8" fill="#f8fafc"/>
    `,
    feather: `
      <path d="M12 3.5 C8.5 3.5 5 6.2 4 10 L7.5 12 C10.8 10.7 12.8 7.6 12 3.5 Z" fill="#f3f4f6"/>
      <path d="M5 10.6 L11 4.8" stroke="#9ca3af" stroke-width="1" stroke-linecap="round"/>
      <path d="M5.8 9.2 L8 10.6 M7.2 7.8 L9.2 9.2 M8.7 6.5 L10.2 7.6" stroke="#cbd5e1" stroke-width=".7" stroke-linecap="round"/>
    `,
    tree: `
      <rect x="7" y="8.5" width="2" height="4.5" fill="#8b5a2b"/>
      <circle cx="8" cy="6" r="3.5" fill="#16a34a"/>
      <circle cx="6.3" cy="6.8" r="2.1" fill="#22c55e"/>
      <circle cx="9.7" cy="6.8" r="2.1" fill="#15803d"/>
    `,
    fish: `
      <ellipse cx="8.3" cy="8" rx="3.8" ry="2.4" fill="#93c5fd"/>
      <path d="M4.7 8 L2.8 6.6 L2.8 9.4 Z" fill="#bfdbfe"/>
      <circle cx="9.4" cy="7.5" r=".5" fill="#0f172a"/>
      <path d="M7.4 8.9 C8 9.3 8.8 9.3 9.4 8.9" stroke="#1d4ed8" stroke-width=".7" fill="none"/>
    `,
    fire: `
      <path d="M8 3.2 C9.3 4.5 9.8 5.8 9.7 7.2 C10.8 7.8 11.5 9 11.2 10.4 C10.9 11.8 9.7 12.8 8 12.8 C6.3 12.8 5.1 11.8 4.8 10.4 C4.5 9 5.2 7.8 6.3 7.2 C6.2 5.8 6.7 4.5 8 3.2 Z" fill="#f97316"/>
      <path d="M8 5.3 C8.8 6.1 9 6.9 8.9 7.8 C9.6 8.2 10 9 9.8 9.9 C9.6 10.9 8.9 11.5 8 11.5 C7.1 11.5 6.4 10.9 6.2 9.9 C6 9 6.4 8.2 7.1 7.8 C7 6.9 7.2 6.1 8 5.3 Z" fill="#fdba74"/>
    `,
    pot: `
      <rect x="4" y="5.8" width="8" height="5.8" rx="1" fill="#9ca3af"/>
      <rect x="5" y="6.8" width="6" height="3.8" fill="#cbd5e1"/>
      <rect x="6.2" y="4.2" width="3.6" height="1.2" rx=".5" fill="#e2e8f0"/>
      <rect x="3.4" y="7.2" width="1.2" height="2.2" fill="#94a3b8"/>
      <rect x="11.4" y="7.2" width="1.2" height="2.2" fill="#94a3b8"/>
      <rect x="6.1" y="3.3" width=".9" height="1" fill="#f8fafc"/>
      <rect x="8.9" y="3.3" width=".9" height="1" fill="#f8fafc"/>
    `
  };

  const icon = (glyph, top, mid, edge) => iconTile(GLYPHS[glyph] ?? GLYPHS.unknown, top, mid, edge);
  const flatIcon = (glyph) => `<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">${GLYPHS[glyph] ?? GLYPHS.unknown}</svg>`;

  const UNKNOWN_ICON = icon("unknown", "#5b6d8a", "#2d3748", "#141b2d");
  const SKILL_FALLBACK_ICON = flatIcon("unknown");

  const SKILL_ICONS = {
    health: flatIcon("heart"),
    accuracy: flatIcon("target"),
    power: flatIcon("gauntlet"),
    defense: flatIcon("shield"),
    ranged: flatIcon("bow"),
    sorcery: flatIcon("wizard_hat"),
    fletching: flatIcon("feather"),
    woodcutting: flatIcon("tree"),
    mining: flatIcon("pick"),
    fishing: flatIcon("fish"),
    firemaking: flatIcon("fire"),
    cooking: flatIcon("pot")
  };

  const SKILL_NAMES = {
    health: "Health",
    accuracy: "Accuracy",
    power: "Power",
    defense: "Defense",
    ranged: "Ranged",
    sorcery: "Sorcery",
    fletching: "Fletching",
    woodcutting: "Woodcutting",
    mining: "Mining",
    fishing: "Fishing",
    firemaking: "Firemaking",
    cooking: "Cooking"
  };

  function getSkillName(skillKey){
    return SKILL_NAMES[skillKey] ?? Skills[skillKey]?.name ?? skillKey;
  }

  for (const [k, name] of Object.entries(SKILL_NAMES)){
    if (Skills[k]) Skills[k].name = name;
  }
// used to tint "Attack X" in the right-click menu
function ctxLevelClass(playerLvl, enemyLvl){
  const d = (enemyLvl|0) - (playerLvl|0);
  if (d >= 5) return "lvlBad";
  if (d <= -5) return "lvlGood";
  return "lvlWarn";
}
function levelTextForCls(cls){
  if (cls === "lvlGood") return "rgba(94,234,212,.95)";
  if (cls === "lvlBad")  return "rgba(251,113,133,.95)";
  return "rgba(251,191,36,.95)";
}
function levelStrokeForCls(cls){
  if (cls === "lvlGood") return "rgba(94,234,212,.75)";
  if (cls === "lvlBad")  return "rgba(251,113,133,.75)";
  return "rgba(251,191,36,.75)";
}
  // ---------- Items ----------
  const GOLD_ITEM_ID = "gold"; // <-- if your gold item's id differs, change this string



  // ---------- Wallet (gold does not take inventory slots) ----------
  const getGold = () => (wallet.gold | 0);

  function addGold(qty){
    qty = Math.max(0, qty|0);
    if (!qty) return 0;
    wallet.gold = (wallet.gold|0) + qty;
    renderGold();
    return qty;
  }

  function spendGold(qty){
    qty = Math.max(0, qty|0);
    if (!qty) return true;
    const have = wallet.gold|0;
    if (have < qty) return false;
    wallet.gold = have - qty;
    renderGold();
    return true;
  }

  const Items = {
    axe:  { id:"axe",  name:"Crude Axe",  stack:false, icon:icon("axe", "#8f6a3b", "#4a321d", "#24160d") },
    pick: { id:"pick", name:"Crude Pick", stack:false, icon:icon("pick", "#6e7f93", "#3a4558", "#1d2430") },
    knife:{ id:"knife",name:"Knife",      stack:false, icon:icon("knife", "#7a7b7d", "#3b3c3f", "#1c1d1f") },
    gold: { id:"gold", name:"Coins", stack:true, currency:true, icon:icon("coin", "#aa7a18", "#5a3f0c", "#2d1f06") },
    flint_steel:{ id:"flint_steel", name:"Flint & Steel", stack:false, icon:icon("flint", "#4d6b74", "#283b40", "#141f22") },

    sword: { id:"sword", name:"Sword", stack:false, icon:icon("sword", "#748198", "#3b4455", "#1d222b"), equipSlot:"weapon" },
    shield:{ id:"shield",name:"Shield",stack:false, icon:icon("shield", "#3f7267", "#22423b", "#11221e"), equipSlot:"offhand" },
    bow:   { id:"bow",   name:"Bow",   stack:false, icon:icon("bow", "#89673c", "#4b341f", "#251a0f"), equipSlot:"weapon" },

    wooden_arrow:{ id:"wooden_arrow", name:"Wooden Arrow", stack:true, ammo:true, icon:icon("arrow", "#8a653a", "#4b341f", "#261a10") },
    bronze_arrow:{ id:"bronze_arrow", name:"Bronze Arrow", stack:true, ammo:true, icon:icon("arrow", "#a76f2f", "#5f3a16", "#311d0a") },

    staff: { id:"staff", name:"Wooden Staff", stack:false, icon:icon("staff", "#6b4ba3", "#3a2758", "#1f1430"), equipSlot:"weapon" },

    log:  { id:"log",  name:"Log",  stack:true, icon:icon("log", "#876239", "#4a321d", "#24160d") },
    ore:  { id:"ore",  name:"Ore",  stack:true, icon:icon("ore", "#6f7f90", "#3a4454", "#1e2430") },
    bone: { id:"bone", name:"Bone", stack:true, icon:icon("bone", "#7d868e", "#4c545c", "#24292e") },
    rat_meat: {
      id:"rat_meat",
      name:"Raw Rat Meat",
      heal: 2,

      stack:true,
      icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
        <rect x="4" y="4" width="8" height="1" fill="rgb(54,24,29)"/>
        <rect x="3" y="5" width="1" height="6" fill="rgb(54,24,29)"/>
        <rect x="12" y="5" width="1" height="6" fill="rgb(54,24,29)"/>
        <rect x="4" y="11" width="8" height="1" fill="rgb(54,24,29)"/>

        <rect x="4" y="5" width="8" height="6" fill="rgb(176,56,72)"/>
        <rect x="5" y="6" width="6" height="4" fill="rgb(206,88,96)"/>

        <rect x="6" y="7" width="1" height="1" fill="rgb(245,214,219)"/>
        <rect x="7" y="8" width="2" height="1" fill="rgb(245,214,219)"/>
        <rect x="9" y="6" width="1" height="1" fill="rgb(245,214,219)"/>

        <rect x="5" y="10" width="2" height="1" fill="rgb(122,34,48)"/>
        <rect x="8" y="5" width="2" height="1" fill="rgb(122,34,48)"/>
      </svg>`
    },
    cooked_rat_meat: {
      id:"cooked_rat_meat",
      name:"Cooked Rat Meat",
      heal: 8,

      stack:true,
      icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false" style="display:block">
        <!-- outline -->
        <rect x="4" y="4" width="8" height="1" fill="rgb(40,22,16)"/>
        <rect x="3" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
        <rect x="12" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
        <rect x="4" y="11" width="8" height="1" fill="rgb(40,22,16)"/>

        <!-- cooked base -->
        <rect x="4" y="5" width="8" height="6" fill="rgb(140,72,34)"/>
        <rect x="5" y="6" width="6" height="4" fill="rgb(176,96,44)"/>

        <!-- grill marks -->
        <rect x="6" y="6" width="1" height="4" fill="rgb(84,42,20)"/>
        <rect x="8" y="6" width="1" height="4" fill="rgb(84,42,20)"/>
        <rect x="10" y="6" width="1" height="4" fill="rgb(84,42,20)"/>

        <!-- tiny steam pips -->
        <rect x="6" y="3" width="1" height="1" fill="rgb(226,232,240)"/>
        <rect x="9" y="3" width="1" height="1" fill="rgb(226,232,240)"/>
      </svg>`
    },
goldfish: {
  id:"goldfish",
  name:"Gold Fish",
  heal: 2,          // same as raw rat meat
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="6" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="11" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="4" y="9" width="7" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="7" width="7" height="2" fill="rgb(250,204,21)"/>
    <rect x="5" y="7" width="5" height="2" fill="rgb(253,230,138)"/>
    <rect x="2" y="7" width="1" height="2" fill="rgb(40,22,16)"/>
    <rect x="3" y="7" width="1" height="1" fill="rgb(250,204,21)"/>
    <rect x="3" y="8" width="1" height="1" fill="rgb(253,230,138)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="6" y="9" width="2" height="1" fill="rgb(186,111,33)"/>
  </svg>`
},

goldfish_cracker: {
  id:"goldfish_cracker",
  name:"Gold Fish Cracker",
  heal: 8,          // same as cooked rat meat
  stack:true,
  icon:`<svg width="20" height="20" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block">
    <rect x="4" y="4" width="8" height="1" fill="rgb(40,22,16)"/>
    <rect x="4" y="11" width="8" height="1" fill="rgb(40,22,16)"/>
    <rect x="3" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
    <rect x="12" y="5" width="1" height="6" fill="rgb(40,22,16)"/>
    <rect x="4" y="5" width="8" height="6" fill="rgb(245,158,11)"/>
    <rect x="5" y="6" width="6" height="4" fill="rgb(251,191,36)"/>
    <rect x="6" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="9" y="7" width="1" height="1" fill="rgb(40,22,16)"/>
    <rect x="7" y="9" width="1" height="1" fill="rgb(40,22,16)"/>
  </svg>`
},



  };
// ---------- Cooking recipes ----------
// Used by the campfire interaction (and respects the current "Use:" item if it matches).
const COOK_RECIPES = {
  rat_meat: { out: "cooked_rat_meat", xp: 12, verb: "cook some meat" },
  goldfish: { out: "goldfish_cracker", xp: 12, verb: "cook a gold fish cracker" },
};

  // ---------- Quiver (arrows do not take inventory slots) ----------
  function addToQuiver(id, qty){
    const item = Items[id];
    if (!item || !item.ammo || qty<=0) return 0;
    qty = Math.max(1, qty|0);
    if (id === "bronze_arrow") id = "wooden_arrow";
    quiver[id] = (quiver[id] | 0) + qty;
    renderQuiver();
    return qty;
  }
  function consumeFromQuiver(id, qty){
    if (id === "bronze_arrow") id = "wooden_arrow";
    qty = Math.max(1, qty|0);
    const have = quiver[id] | 0;
    if (have < qty) return false;
    quiver[id] = have - qty;
    renderQuiver();
    return true;
  }
  function getQuiverCount(){
    return (quiver.wooden_arrow | 0);
  }




  function clearSlots(arr){ for (let i=0;i<arr.length;i++) arr[i]=null; }
  function countSlots(arr){ return arr.reduce((a,s)=>a+(s?1:0),0); }
  function emptyInvSlots(){
    let n=0;
    for (const s of inv) if (!s) n++;
    return n;
  }

  // ---------- Ground loot piles ----------
  // key "x,y" -> Map(itemId -> qty)
const GROUND_LOOT_DESPAWN_MS = 60_000; // 60 seconds


  function lootKey(x,y){ return `${x},${y}`; }
  // Manual drops: prevent the auto-loot system from instantly picking the item back up.
  // Keyed by tile ("x,y"). The lock clears once you walk out of auto-loot range of that tile.
  function lockManualDropAt(x,y){
    manualDropLocks.set(lootKey(x,y), true);
  }

  function addGroundLoot(x,y,id,qty=1){
  const item = Items[id];
  if (!item) return;

  qty = Math.max(1, qty|0);
  const k = lootKey(x,y);
  const t = now();

  if (!groundLoot.has(k)){
    const pile = new Map();
    pile.createdAt = t;
    pile.expiresAt = t + GROUND_LOOT_DESPAWN_MS;
    groundLoot.set(k, pile);
  }

  const pile = groundLoot.get(k);

  // refresh despawn timer whenever something is added to this tile
  if (!Number.isFinite(pile.createdAt)) pile.createdAt = t;
  pile.expiresAt = t + GROUND_LOOT_DESPAWN_MS;
  pile.set(id, (pile.get(id)|0) + qty);
}

  function getLootPileAt(x,y){
    const pile = groundLoot.get(lootKey(x,y));
    if (!pile || pile.size === 0) return null;
    return pile;
  }
  function cleanupLootPileAt(x,y){
    const k=lootKey(x,y);
    const pile=groundLoot.get(k);
    if (!pile) return;
    for (const [id,qty] of pile.entries()){
      if ((qty|0) <= 0) pile.delete(id);
    }
    if (pile.size === 0) groundLoot.delete(k);
  }
function pruneExpiredGroundLoot(){
  const t = now();
  for (const [k, pile] of groundLoot.entries()){
    if (!pile) { groundLoot.delete(k); continue; }
    if (Number.isFinite(pile.expiresAt) && t >= pile.expiresAt){
      groundLoot.delete(k);
    }
  }
}
    // ---------- Inventory behavior ----------
  // Inventory: one-per-slot (no stacking). Ammo routes to quiver.
  function addToInventory(id, qty=1){
    const item = Items[id];
    if (!item) return 0;

    qty = Math.max(1, qty|0);
    // gold never takes inventory slots
    if (id === GOLD_ITEM_ID){
      addGold(qty);
      return qty;
    }

    // ammo: route to quiver (no inventory slots)
    if (item.ammo){
      return addToQuiver(id, qty);
    }


    // everything else: one-per-slot (no stacking in inventory)
    let added = 0;
    for (let i=0; i<qty; i++){
      const empty = inv.findIndex(s => !s);
      if (empty < 0) break;
      inv[empty] = { id, qty:1 };
      added++;
    }
    if (added > 0) renderInv();
    return added;
  }

  function hasItem(id){ return inv.some(s=>s && s.id===id); }

  function removeItemsFromInventory(id, qty=1){
  const item = Items[id];
  if (!item) return false;

  qty = Math.max(1, Math.floor(qty || 1));

  // ammo comes from quiver
  if (item.ammo) return consumeFromQuiver(id, qty);

  // stackables: decrement qty across stacks
  if (item.stack){
    let remaining = qty;
    for (let i=0; i<inv.length && remaining>0; i++){
      const s = inv[i];
      if (!s || s.id !== id) continue;

      const have = Math.max(1, s.qty|0);
      const take = Math.min(remaining, have);
      const left = have - take;

      inv[i] = left > 0 ? { id, qty: left } : null;
      remaining -= take;
    }
    if (remaining !== qty) renderInv();
    return remaining === 0;
  }

  // non-stack items: remove one-per-slot
  let remaining = qty;
  for (let i=0; i<inv.length && remaining>0; i++){
    if (inv[i] && inv[i].id === id){
      inv[i] = null;
      remaining--;
    }
  }
  if (remaining !== qty) renderInv();
  return remaining === 0;
}

function consumeFoodFromInv(invIndex){
  const s = inv[invIndex];
  if (!s) return false;

  const item = Items[s.id];
  const heal = (item && Number.isFinite(item.heal)) ? (item.heal|0) : 0;
  if (heal <= 0) return false;

  if (player.hp >= player.maxHp){
    chatLine(`<span class="muted">You're already at full health.</span>`);
    return true;
  }

  // consume 1 (respect stacks)
  if (item.stack && (s.qty|0) > 1){
    inv[invIndex] = { id: s.id, qty: (s.qty|0) - 1 };
  } else {
    inv[invIndex] = null;
  }
  renderInv();

  const before = player.hp;
  player.hp = clamp(player.hp + heal, 0, player.maxHp);
  renderHPHUD();

  const gained = player.hp - before;
  chatLine(`<span class="good">You eat the ${item?.name ?? s.id} and heal <b>${gained}</b> HP.</span>`);
  return true;
}




  // ---------- Bank stacking behavior ----------
  function addToBank(arr, id, qty=1){
    if (id === GOLD_ITEM_ID){
      addGold(qty);
      return true;
    }

    const item=Items[id]; if (!item) return false;
    if (id === "bronze_arrow") id = "wooden_arrow";
    qty = Math.max(1, qty|0);

    if (item.stack){
      const si = arr.findIndex(s => s && s.id===id);
      if (si>=0){ arr[si].qty += qty; return true; }
      const empty = arr.findIndex(s=>!s);
      if (empty>=0){ arr[empty]={id, qty}; return true; }
      return false;
    } else {
      for (let i=0;i<qty;i++){
        const empty = arr.findIndex(s=>!s);
        if (empty<0) return (i>0);
        arr[empty]={id, qty:1};
      }
      return true;
    }
  }

  // ---------- Equipment ----------
  function canEquip(id){
    const it = Items[id];
    if (!it) return null;
    return it.equipSlot || null;
  }

  function equipFromInv(invIndex){
    const s = inv[invIndex];
    if (!s) return;
    const id = s.id;
    const slot = canEquip(id);
    if (!slot){
      chatLine(`<span class="muted">You can't equip that.</span>`);
      return;
    }
    if (Items[id]?.ammo){
      chatLine(`<span class="muted">You can't equip ammo.</span>`);
      return;
    }

    const existing = equipment[slot];
    if (existing){
      if (emptyInvSlots() <= 0){
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      equipment[slot] = null;
      addToInventory(existing, 1);
      chatLine(`<span class="muted">You unequip the ${Items[existing]?.name ?? existing}.</span>`);
    }

    inv[invIndex] = null;
    equipment[slot] = id;
    chatLine(`<span class="good">You equip the ${Items[id]?.name ?? id}.</span>`);
    renderInv();
    renderEquipment();
  }

  function unequipSlot(slot){
    const id = equipment[slot];
    if (!id) return;
    if (emptyInvSlots() <= 0){
      chatLine(`<span class="warn">Inventory full.</span>`);
      return;
    }
    equipment[slot] = null;
    addToInventory(id, 1);
    chatLine(`<span class="muted">You unequip the ${Items[id]?.name ?? id}.</span>`);
    renderInv();
    renderEquipment();
  }

  // ---------- Melee Training selector ----------
  const MELEE_TRAIN_KEY = "classic_melee_training_v1";

  function loadMeleeTraining(){
    const v = localStorage.getItem(MELEE_TRAIN_KEY);
    if (v === "accuracy" || v === "power" || v === "defense") meleeState.selected = v;
    else meleeState.selected = "accuracy";
  }
  function saveMeleeTraining(){ localStorage.setItem(MELEE_TRAIN_KEY, meleeState.selected); }

  // ---------- HP / HUD ----------
  const hudNameEl = document.getElementById("hudName");
  const hudClassEl = document.getElementById("hudClass");
  const hudHPTextEl = document.getElementById("hudHPText");
  const hudHPBarEl = document.getElementById("hudHPBar");
  const hudQuiverTextEl = document.getElementById("hudQuiverText");
  const hudGoldTextEl = document.getElementById("hudGoldText");
const hudCombatTextEl = document.getElementById("hudCombatText");

  const coordPlayerEl = document.getElementById("coordPlayer");
  const coordMouseEl  = document.getElementById("coordMouse");



  function recalcMaxHPFromHealth(){
    const healthLvl = levelFromXP(Skills.health.xp);
    const newMax = BASE_HP + (healthLvl - 1) * HP_PER_LEVEL;
    if (player.maxHp !== newMax){
      player.maxHp = newMax;
      player.hp = clamp(player.hp, 0, player.maxHp);
    }
    renderHPHUD();
  }

  function renderHPHUD(){
    hudNameEl.textContent = player.name;
    hudClassEl.textContent = player.class;
    hudHPTextEl.textContent = `HP ${player.hp} / ${player.maxHp}`;
    hudHPBarEl.style.width = `${(player.maxHp>0 ? (player.hp/player.maxHp) : 0) * 100}%`;
    if (hudGoldTextEl) hudGoldTextEl.textContent = `Gold: ${getGold()}`;
    hudQuiverTextEl.textContent = `Quiver: ${getQuiverCount()}`;
if (hudCombatTextEl) hudCombatTextEl.textContent = `Combat: ${getPlayerCombatLevel(Skills)}`;

  }
  function updateCoordsHUD(){
    if (!coordPlayerEl && !coordMouseEl) return;

    if (coordPlayerEl){
      const p = `${player.x}, ${player.y}`;
      if (coordPlayerEl.textContent !== p) coordPlayerEl.textContent = p;
    }

    if (!mouse.seen){
      if (coordMouseEl && coordMouseEl.textContent !== "—") coordMouseEl.textContent = "—";
      return;
    }

    const worldX = (mouse.x/VIEW_W)*viewWorldW() + camera.x;
    const worldY = (mouse.y/VIEW_H)*viewWorldH() + camera.y;
    const tx = Math.floor(worldX / TILE);
    const ty = Math.floor(worldY / TILE);

    const m = inBounds(tx,ty) ? `${tx}, ${ty}` : "—";
    if (coordMouseEl && coordMouseEl.textContent !== m) coordMouseEl.textContent = m;
  }

  function renderGold(){
    const g = getGold();
    if (hudGoldTextEl) hudGoldTextEl.textContent = `Gold: ${g}`;
    const invGoldPill = document.getElementById("invGoldPill");
    if (invGoldPill) invGoldPill.textContent = `Gold: ${g}`;
  }

  function renderQuiver(){
    document.getElementById("invQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
    document.getElementById("eqQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
        renderGold();
    renderHPHUD();

  }

  function addXP(skillKey, amount){
    const s = Skills[skillKey];
    if (!s || !Number.isFinite(amount) || amount <= 0) return;
    const skillName = getSkillName(skillKey);
    const before = levelFromXP(s.xp);
    s.xp += Math.floor(amount);
    // show XP gain (throttled per skill so it doesn't spam)
    const t = now();
    if ((t - (lastSkillXPMsgAt[skillKey] ?? 0)) > 900){
      chatLine(`<span class="muted">+${Math.floor(amount)} ${skillName} XP</span>`);
      lastSkillXPMsgAt[skillKey] = t;
    }

    const after = levelFromXP(s.xp);

    if ((lastSkillLevel[skillKey] ?? before) < after){
      chatLine(`<span class="good">${skillName} leveled up to ${after}!</span>`);
    }
    lastSkillLevel[skillKey] = after;

    // Health affects max HP
    if (skillKey === "health"){
      recalcMaxHPFromHealth();
    }

    renderSkills();
  }

  // ---------- Entities ----------
const MOB_DEFS = {
rat: {
  name: "Rat",
  hp: 8, // was 12

  levels: { accuracy:1, power:1, defense:1, ranged:1, sorcery:1, health:1 },

  aggroOnSight: false,
  moveSpeed: 140,

  aggroRange: 4.0,
  leash: 7.0,
  attackRange: 1.15,
  attackSpeedMs: 1600, // slower attacks
  maxHit: 1            // rats shouldn’t chunk you
},

};



// ---------- Persistent world seed ----------
const WORLD_SEED_KEY = "classic_world_seed_v1";

function initWorldSeed(){
  try{
    const raw = localStorage.getItem(WORLD_SEED_KEY);
    const n = raw == null ? NaN : parseInt(raw, 10);

    if (Number.isFinite(n) && n > 0){
      worldState.seed = (n >>> 0);
      return;
    }

    // First run (or invalid): lock in the default seed above
    worldState.seed = (worldState.seed >>> 0);
    localStorage.setItem(WORLD_SEED_KEY, String(worldState.seed));
  }catch{
    // If localStorage is blocked, we still keep a stable default seed
    worldState.seed = (worldState.seed >>> 0);
  }
}
// ---------- Seeded RNG + placement helpers ----------
function makeRng(seed){
  let t = (seed >>> 0) || 0x12345678;
  return function(){
    // xorshift32
    t ^= (t << 13); t >>>= 0;
    t ^= (t >>> 17); t >>>= 0;
    t ^= (t << 5);  t >>>= 0;
    return (t >>> 0) / 4294967296;
  };
}
function randInt(rng, a, b){ return a + Math.floor(rng() * (b - a + 1)); }
function keyXY(x,y){ return `${x},${y}`; }

function inRectMargin(x,y, rect, margin){
  return (
    x >= rect.x0 - margin && x <= (rect.x0 + rect.w - 1) + margin &&
    y >= rect.y0 - margin && y <= (rect.y0 + rect.h - 1) + margin
  );
}
function nearTileType(x,y, tileVal, radius){
  for (let dy=-radius; dy<=radius; dy++){
    for (let dx=-radius; dx<=radius; dx++){
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx,ny)) continue;
      if (map[ny][nx] === tileVal) return true;
    }
  }
  return false;
}


const VENDOR_SELL_MULT = 0.5;

const DEFAULT_VENDOR_STOCK = [
  { id: "wooden_arrow", price: 1, bulk: [1, 10, 50] },
  { id: "log", price: 2, bulk: [1, 5] },
  { id: "ore", price: 3, bulk: [1, 5] },
  { id: "bone", price: 1, bulk: [1, 5] },
  { id: "axe", price: 25, bulk: [1] },
  { id: "pick", price: 25, bulk: [1] },
  { id: "staff", price: 45, bulk: [1] },
  { id: "sword", price: 60, bulk: [1] },
  { id: "shield", price: 60, bulk: [1] },
  { id: "bow", price: 75, bulk: [1] },

];
const DEFAULT_MOB_LEVELS = {
  accuracy: 1,
  power: 1,
  defense: 1,
  ranged: 1,
  sorcery: 1,
  health: 1
};


  function placeResource(type,x,y){ resources.push({type,x,y,alive:true,respawnAt:0}); }
  function placeMob(type,x,y){
  const def = MOB_DEFS[type] ?? { name: type, hp: 12, levels: {} };
  const lvls = { ...DEFAULT_MOB_LEVELS, ...(def.levels || {}) };
  const combatLevel = calcCombatLevelFromLevels(lvls);
  const maxHp = Math.max(1, def.hp|0 || 12);

 mobs.push({
  type,
  name: def.name || type,
  x, y,
  homeX: x, homeY: y,

  hp: maxHp,
  maxHp,
  alive: true,
  respawnAt: 0,

  // combat AI state
  target: null,            // "player" | null
  provokedUntil: 0,        // passive mobs engage only after being hit
  aggroUntil: 0,
  attackCooldownUntil: 0,
  moveCooldownUntil: 0,

  levels: lvls,
  combatLevel
});

}

  function placeInteractable(type,x,y){ interactables.push({type,x,y}); }

 function seedResources(){
  resources.length = 0;

  // Deterministic per world seed (persistent world)
  const rng = makeRng(worldState.seed ^ 0xA53C9E27);
  const used = new Set();

  // Tiles to keep clear (because interactables are placed after resources)
  const reserved = new Set([
    keyXY(startCastle.x0 + 4, startCastle.y0 + 3),     // bank
    keyXY(startCastle.x0 + 6, startCastle.y0 + 3),     // vendor in castle
                                          // vendor near starter area
    keyXY(startCastle.x0 + 6, startCastle.y0 + 4),     // player spawn-ish
  ]);

  function tileOkForResource(x,y){
    if (!inBounds(x,y)) return false;

    // Resources only on grass
    if (map[y][x] !== 0) return false;

    // Keep paths readable (no hugging paths)
    if (nearTileType(x,y, 5, 1)) return false;

    // Keep castles/keeps clean
    if (inRectMargin(x,y, startCastle, 2)) return false;
    if (inRectMargin(x,y, southKeep,  2)) return false;

    // Avoid reserved tiles and stacking
    if (reserved.has(keyXY(x,y))) return false;
    if (used.has(keyXY(x,y))) return false;

    return true;
  }

  function placeRes(type,x,y){
    used.add(keyXY(x,y));
    placeResource(type, x, y);
  }

  function tooCloseToSameType(type, x,y, minDistTiles){
    for (const r of resources){
      if (!r.alive || r.type !== type) continue;
      if (Math.hypot(r.x - x, r.y - y) < minDistTiles) return true;
    }
    return false;
  }

  // Zones to nudge trees into "real" looking regions (not symmetric, not centered)
  const TREE_ZONES = [
    { x1: 16, y1: 5,  x2: 57, y2: 18, w: 1.00 }, // north / northeast
    { x1: 3,  y1: 25, x2: 25, y2: 38, w: 1.00 }, // south west
    { x1: 30, y1: 24, x2: 58, y2: 38, w: 0.85 }, // south east
    { x1: 0,  y1: 12, x2: 14, y2: 38, w: 0.55 }, // west band
    { x1: 18, y1: 18, x2: 40, y2: 26, w: 0.60 }, // mid band
  ];

  const ROCK_ZONES = [
    { x1: 12, y1: 3,  x2: 26, y2: 16, w: 1.00 }, // near north cliff
    { x1: 4,  y1: 24, x2: 18, y2: 38, w: 1.00 }, // near south cliff
    { x1: 22, y1: 26, x2: 40, y2: 36, w: 0.85 }, // near mid cliff
    { x1: 42, y1: 24, x2: 58, y2: 38, w: 0.70 }, // south/east
  ];

  function pickZone(zones){
    const total = zones.reduce((a,z)=>a+z.w,0);
    let r = rng() * total;
    for (const z of zones){
      r -= z.w;
      if (r <= 0) return z;
    }
    return zones[zones.length-1];
  }
  function sampleInZone(z){
    return { x: randInt(rng, z.x1, z.x2), y: randInt(rng, z.y1, z.y2) };
  }

  // ---------- Trees: groves + scatter ----------
  const TREE_TOTAL = 30;
  const GROVE_COUNT = 4;
  const groveCenters = [];
  const groveCenterMinDist = 10;

  function findGroveCenter(){
    for (let a=0; a<2500; a++){
      const z = pickZone(TREE_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForResource(p.x,p.y)) continue;
      // keep grove centers apart
      let ok = true;
      for (const c of groveCenters){
        if (Math.hypot(c.x - p.x, c.y - p.y) < groveCenterMinDist){ ok = false; break; }
      }
      if (!ok) continue;
      return p;
    }
    return null;
  }

  for (let i=0; i<GROVE_COUNT; i++){
    const c = findGroveCenter();
    if (c) groveCenters.push(c);
  }

  function fillGrove(cx,cy, want){
    let placed = 0;
    for (let a=0; a<want*45 && placed<want; a++){
      const ang = rng() * Math.PI * 2;
      // center-weighted radius for natural falloff
      const rr = (1.0 + rng()*4.0) * (rng()**0.55);
      const x = Math.round(cx + Math.cos(ang) * rr);
      const y = Math.round(cy + Math.sin(ang) * rr);

      if (!tileOkForResource(x,y)) continue;
      // allow some adjacency, but avoid “solid blobs”
      if (tooCloseToSameType("tree", x,y, 1.35)) continue;

      placeRes("tree", x,y);
      placed++;
    }
    return placed;
  }

  for (const c of groveCenters){
    const groveSize = randInt(rng, 6, 9);
    fillGrove(c.x, c.y, groveSize);
  }

  // scatter singles to reach TREE_TOTAL
  for (let a=0; a<12000 && resources.filter(r=>r.type==="tree").length < TREE_TOTAL; a++){
    const z = pickZone(TREE_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForResource(p.x,p.y)) continue;
    if (tooCloseToSameType("tree", p.x,p.y, 1.05)) continue;
    placeRes("tree", p.x,p.y);
  }

  // ---------- Rocks: prefer near cliffs, clustered ----------
  const ROCK_TOTAL = 12;
  const ROCK_CLUSTER_COUNT = 3;

  function tileOkForRock(x,y){
    if (!tileOkForResource(x,y)) return false;
    return true;
  }

  function findRockCenter(preferCliff){
    for (let a=0; a<2500; a++){
      const z = pickZone(ROCK_ZONES);
      const p = sampleInZone(z);
      if (!tileOkForRock(p.x,p.y)) continue;

      if (preferCliff && !nearTileType(p.x,p.y, 2, 1)) continue; // near cliff
      return p;
    }
    return null;
  }

  let rocksPlaced = 0;

  function fillRockCluster(cx,cy, want){
    let placed = 0;
    for (let a=0; a<want*35 && placed<want; a++){
      const x = cx + randInt(rng, -2, 2);
      const y = cy + randInt(rng, -2, 2);
      if (!tileOkForRock(x,y)) continue;
      if (tooCloseToSameType("rock", x,y, 1.15)) continue;
      placeRes("rock", x,y);
      placed++;
    }
    return placed;
  }

  for (let i=0; i<ROCK_CLUSTER_COUNT && rocksPlaced < ROCK_TOTAL; i++){
    const c = findRockCenter(true) || findRockCenter(false);
    if (!c) break;
    const sz = randInt(rng, 3, 5);
    rocksPlaced += fillRockCluster(c.x, c.y, Math.min(sz, ROCK_TOTAL - rocksPlaced));
  }

  // top-off any remaining rocks in rock zones
  for (let a=0; a<8000 && rocksPlaced < ROCK_TOTAL; a++){
    const z = pickZone(ROCK_ZONES);
    const p = sampleInZone(z);
    if (!tileOkForRock(p.x,p.y)) continue;
    if (tooCloseToSameType("rock", p.x,p.y, 1.05)) continue;
    placeRes("rock", p.x,p.y);
    rocksPlaced++;
  }
}

  function seedMobs(){
  mobs.length = 0;

  const rng = makeRng(worldState.seed ^ 0x51C3A2B9);
  const used = new Set();

  // Build a reachable set so rats never spawn in sealed-off areas
  const reachable = new Set();
  (function buildReachable(){
    const q = [{x: player.x, y: player.y}];
    reachable.add(keyXY(player.x, player.y));
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (q.length){
      const cur = q.shift();
      for (const [dx,dy] of dirs){
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!isWalkable(nx,ny)) continue;
        const k = keyXY(nx,ny);
        if (reachable.has(k)) continue;
        reachable.add(k);
        q.push({x:nx,y:ny});
      }
    }
  })();

  // Keep clear of starter safety area + paths
  function tileOkForRat(x,y){
    if (!inBounds(x,y)) return false;

    // Rats on grass only (not inside castles/paths)
    if (map[y][x] !== 0) return false;

    // Must be reachable from the player start region
    if (!reachable.has(keyXY(x,y))) return false;

    // Don’t sit on resources
    if (resources.some(r => r.alive && r.x===x && r.y===y)) return false;

    // Avoid interactable tiles (known)
    if ((x===startCastle.x0+4 && y===startCastle.y0+3) || (x===startCastle.x0+6 && y===startCastle.y0+3) || (x===9 && y===13)) return false;

    // Avoid castles/keeps + a buffer so early game feels safe
    if (inRectMargin(x,y, startCastle, 6)) return false;
    if (inRectMargin(x,y, southKeep,  6)) return false;

    // Avoid the main path tile itself (looks goofy)
    if (map[y][x] === 5) return false;
    if (nearTileType(x,y, 5, 0)) return false;

    // Avoid stacking rats
    if (used.has(keyXY(x,y))) return false;

    return true;
  }

  function treeDensity(x,y, radius){
    let c = 0;
    for (const r of resources){
      if (!r.alive || r.type !== "tree") continue;
      if (Math.hypot(r.x - x, r.y - y) <= radius) c++;
    }
    return c;
  }

  function tooCloseToExistingRat(x,y, minDist){
    for (const m of mobs){
      if (!m.alive) continue;
      if (Math.hypot(m.x - x, m.y - y) < minDist) return true;
    }
    return false;
  }

  function spawnRat(x,y){
    used.add(keyXY(x,y));
    placeMob("rat", x, y);
  }

  function findNestTile(kind){
    for (let a=0; a<5000; a++){
      const x = randInt(rng, 0, W-1);
      const y = randInt(rng, 0, H-1);
      if (!tileOkForRat(x,y)) continue;

      if (kind === "river"){
        // next to water tiles (riverbanks), not on bridges/path
        if (!nearTileType(x,y, 1, 1)) continue;
        if (nearTileType(x,y, 5, 1)) continue; // keep off bridges
      } else if (kind === "woods"){
        if (treeDensity(x,y, 4.0) < 4) continue;
      }

      return {x,y};
    }
    return null;
  }

  function spawnAround(cx,cy, count){
    let placed = 0;
    for (let a=0; a<count*60 && placed<count; a++){
      const x = cx + randInt(rng, -3, 3);
      const y = cy + randInt(rng, -3, 3);
      if (!tileOkForRat(x,y)) continue;
      if (tooCloseToExistingRat(x,y, 3.0)) continue;
      spawnRat(x,y);
      placed++;
    }
    return placed;
  }

  // 3 nests: 2 riverbank nests, 1 woodland nest
  const nests = [
    { kind:"river", count: 2 },
    { kind:"river", count: 2 },
    { kind:"woods", count: 3 },
  ];

  for (const n of nests){
    const c = findNestTile(n.kind);
    if (!c) continue;
    spawnAround(c.x, c.y, n.count);
  }

  // Top off if constraints were tight
  const TARGET_RATS = 7;
  for (let a=0; a<9000 && mobs.length < TARGET_RATS; a++){
    const x = randInt(rng, 0, W-1);
    const y = randInt(rng, 0, H-1);
    if (!tileOkForRat(x,y)) continue;
    if (tooCloseToExistingRat(x,y, 3.0)) continue;
    spawnRat(x,y);
  }
  // --- Manual tweak: move specific rat ---
  (function(){
    const fromX=7,  fromY=27;
    const toX=13,   toY=32;

    const fromKey = keyXY(fromX, fromY);
    const toKey   = keyXY(toX, toY);

    const fromRat = mobs.find(m => m.alive && m.type==="rat" && m.x===fromX && m.y===fromY);
    if (!fromRat) return;

    // If a rat already exists at the destination, remove it so we can place this one there
    const toIdx = mobs.findIndex(m => m.alive && m.type==="rat" && m.x===toX && m.y===toY);
    if (toIdx >= 0){
      mobs.splice(toIdx, 1);
      used.delete(toKey);
    }

    // Free the old spot in the "used" set
    used.delete(fromKey);

    // Only move if the destination is valid under current spawn rules
    if (tileOkForRat(toX, toY)){
      fromRat.x = toX;
      fromRat.y = toY;
      used.add(toKey);
    } else {
      // Put it back (and restore used) if destination isn't valid
      used.add(fromKey);
    }
  })();

}

  function seedInteractables(){
    interactables.length=0;
    const bx = startCastle.x0 + 4;
    const by = startCastle.y0 + 3;
    placeInteractable("bank", bx, by);
placeInteractable("vendor", bx + 2, by);
// Fishing spots on the river near the starter castle
placeInteractable("fish", 6, RIVER_Y);
placeInteractable("fish", 10, RIVER_Y + 1);
// Smithing props in the south keep (bottom-right building)
const sx = southKeep.x0 + 4;
const sy = southKeep.y0 + 3;
placeInteractable("furnace", sx, sy);
placeInteractable("anvil", sx + 2, sy);





  }

  // ---------- Character / class ----------
  const SAVE_KEY="classic_inspired_rpg_save_v10_quiver_loot_health_windows";
  const CHAR_KEY = "classic_char_v3";
  const CHAT_UI_KEY = "classic_chat_ui_v1";
  const WINDOWS_UI_KEY = "classic_windows_ui_v2_multi_open";
const BGM_KEY = "classic_bgm_v1";


  const CLASS_DEFS = {
    Warrior: { color: "#ef4444" },
    Ranger:  { color: "#facc15" },
    Mage:    { color: "#22d3ee" },
  };

  function tileCenter(x,y){ return {cx:x*TILE+TILE/2, cy:y*TILE+TILE/2}; }
  function syncPlayerPix(){ const {cx,cy}=tileCenter(player.x,player.y); player.px=cx; player.py=cy; }
  syncPlayerPix();

  function updateCamera(){
    const vw = viewWorldW();
    const vh = viewWorldH();
    const maxX = Math.max(0, WORLD_W - vw);
    const maxY = Math.max(0, WORLD_H - vh);
    camera.x = clamp(player.px - vw/2, 0, maxX);
    camera.y = clamp(player.py - vh/2, 0, maxY);
  }

  function setPathTo(tx,ty){
    const p=astar(player.x,player.y,tx,ty);
    if (!p) return false;
    player.path=p;
    return true;
  }

  function stopAction(msg){
    player.action={type:"idle",endsAt:0,total:0,label:"Idle",onComplete:null};
    player.target=null;
    if (msg) chatLine(`<span class="muted">${msg}</span>`);
  }

  function startTimedAction(type, ms, label, onComplete){
    player.action={ type, endsAt: now()+ms, total: ms, label, onComplete };
  }

  function inRangeOfTile(tx,ty,rangeTiles=1.1){
    const a=tileCenter(player.x,player.y);
    const b=tileCenter(tx,ty);
    return dist(a.cx,a.cy,b.cx,b.cy) <= rangeTiles*TILE;
  }

  function actionProgress(){
    const a=player.action;
    if (a.type==="idle" || !a.total) return 0;
    const rem=a.endsAt-now();
    return clamp(1 - rem/a.total, 0, 1);
  }

  function tilesBetweenTiles(ax, ay, bx, by){
    const a = tileCenter(ax, ay);
    const b = tileCenter(bx, by);
    return dist(a.cx, a.cy, b.cx, b.cy) / TILE;
  }
  function tilesFromPlayerToTile(tx, ty){
    const b = tileCenter(tx, ty);
    return dist(player.px, player.py, b.cx, b.cy) / TILE;
  }

  function getCombatStyle(){
    if (equipment.weapon === "bow" || (player.class === "Ranger" && (hasItem("bow") || equipment.weapon === "bow"))) return "ranged";
    if (equipment.weapon === "staff" || (player.class === "Mage" && (hasItem("staff") || equipment.weapon === "staff"))) return "magic";
    return "melee";
  }

  function findBestTileWithinRange(tx, ty, rangeTiles){
    const r = Math.ceil(rangeTiles);
    const candidates = [];

    for (let dy=-r; dy<=r; dy++){
      for (let dx=-r; dx<=r; dx++){
        const cx = tx + dx, cy = ty + dy;
        if (!isWalkable(cx, cy)) continue;
        if (tilesBetweenTiles(cx, cy, tx, ty) > rangeTiles) continue;
        const h = Math.abs(cx - player.x) + Math.abs(cy - player.y);
        candidates.push({x:cx, y:cy, h});
      }
    }

    candidates.sort((a,b)=>a.h-b.h);

    for (const c of candidates.slice(0, 24)){
      const p = astar(player.x, player.y, c.x, c.y);
      if (p) return {x:c.x, y:c.y, path:p};
    }
    return null;
  }

  // ---------- UI: windows + toolbar ----------
  const winInventory = document.getElementById("winInventory");
  const winEquipment = document.getElementById("winEquipment");
  const winSkills    = document.getElementById("winSkills");
  const winBank      = document.getElementById("winBank");
const winVendor  = document.getElementById("winVendor");

  const winSettings  = document.getElementById("winSettings");

  const iconInv  = document.getElementById("iconInv");
  const iconEqp  = document.getElementById("iconEqp");
  const iconSki  = document.getElementById("iconSki");
  const iconBank = document.getElementById("iconBank");
const iconVendor = document.getElementById("iconVendor");

  const iconSet  = document.getElementById("iconSet");
// ---------- Vendor UI ----------
const vendorGoldPill = document.getElementById("vendorGoldPill");
const vendorListEl = document.getElementById("vendorList");
const vendorTabBuyBtn = document.getElementById("vendorTabBuyBtn");
const vendorTabSellBtn = document.getElementById("vendorTabSellBtn");

function vendorBuyPrice(id){
  const row = DEFAULT_VENDOR_STOCK.find(x => x.id === id);
  return row ? (row.price|0) : null;
}
function vendorSellPrice(id){
  const p = vendorBuyPrice(id);
  if (p == null) return null;
  return Math.max(1, Math.floor(p * VENDOR_SELL_MULT));
}

function renderVendorUI(){
  if (!vendorListEl) return;

  if (vendorGoldPill) vendorGoldPill.textContent = `Gold: ${getGold()}`;

  // tab button styles
  if (vendorTabBuyBtn) vendorTabBuyBtn.classList.toggle("active", availability.vendorTab === "buy");
  if (vendorTabSellBtn) vendorTabSellBtn.classList.toggle("active", availability.vendorTab === "sell");

  vendorListEl.innerHTML = "";

  if (availability.vendorTab === "buy"){
    for (const row of DEFAULT_VENDOR_STOCK){
      const it = Items[row.id];
      if (!it) continue;

      const line = document.createElement("div");
      line.className = "shopRow";
      line.innerHTML = `
        <div class="shopLeft">
          <div class="shopIcon">${it.icon ?? UNKNOWN_ICON}</div>
          <div class="shopMeta">
            <div class="shopName">${it.name ?? row.id}</div>
            <div class="shopSub">Price: ${row.price} gold</div>
          </div>
        </div>
        <div class="shopActions"></div>
      `;

      const actions = line.querySelector(".shopActions");
      const bulks = Array.isArray(row.bulk) && row.bulk.length ? row.bulk : [1];

      for (const qty of bulks){
        const btn = document.createElement("button");
        btn.className = "shopBtn";
        btn.textContent = `Buy x${qty}`;
        btn.onclick = () => {
          const cost = (row.price|0) * (qty|0);
          if (!spendGold(cost)){
            chatLine(`<span class="warn">Not enough gold.</span>`);
            return;
          }

          // ammo routes to quiver; others go to inventory
          const added = addToInventory(row.id, qty);
          if (added <= 0){
            // refund if nothing could be added
            addGold(cost);
            chatLine(`<span class="warn">Inventory full.</span>`);
            return;
          }

          chatLine(`<span class="good">Bought ${qty}x ${it.name}.</span>`);
          renderVendorUI();
          renderInv();
          renderQuiver();
        };
        actions.appendChild(btn);
      }

      vendorListEl.appendChild(line);
    }
    return;
  }

  // SELL tab: show unique sellable items currently in inventory (one-per-slot items can be sold per click)
  const seen = new Map(); // id -> count
  for (const s of inv){
    if (!s) continue;
    const id = s.id;
    if (!Items[id]) continue;
    seen.set(id, (seen.get(id)|0) + 1);
  }

  for (const [id, count] of seen.entries()){
    const it = Items[id];
    const price = vendorSellPrice(id);
    if (price == null) continue; // vendor doesn't buy it

    const line = document.createElement("div");
    line.className = "shopRow";
    line.innerHTML = `
      <div class="shopLeft">
        <div class="shopIcon">${it.icon ?? UNKNOWN_ICON}</div>
        <div class="shopMeta">
          <div class="shopName">${it.name ?? id} ${count>1 ? `x${count}` : ""}</div>
          <div class="shopSub">Sell: ${price} gold</div>
        </div>
      </div>
      <div class="shopActions"></div>
    `;

    const actions = line.querySelector(".shopActions");

    const btn1 = document.createElement("button");
    btn1.className = "shopBtn";
    btn1.textContent = "Sell x1";
    btn1.onclick = () => {
      if (!removeItemsFromInventory(id, 1)){
        chatLine(`<span class="warn">You don't have that.</span>`);
        return;
      }
      addGold(price);
      chatLine(`<span class="good">Sold 1x ${it.name}.</span>`);
      renderVendorUI();
      renderInv();
      renderQuiver();
    };
    actions.appendChild(btn1);

    if (count > 1){
      const btnAll = document.createElement("button");
      btnAll.className = "shopBtn";
      btnAll.textContent = "Sell all";
      btnAll.onclick = () => {
        let sold = 0;
        for (let i=0; i<count; i++){
          if (!removeItemsFromInventory(id, 1)) break;
          sold++;
        }
        if (sold){
          addGold(price * sold);
          chatLine(`<span class="good">Sold ${sold}x ${it.name}.</span>`);
        }
        renderVendorUI();
        renderInv();
        renderQuiver();
      };
      actions.appendChild(btnAll);
    }

    vendorListEl.appendChild(line);
  }

  if (!vendorListEl.childElementCount){
    vendorListEl.innerHTML = `<div class="hint">You have nothing the vendor will buy.</div>`;
  }
}

if (vendorTabBuyBtn) vendorTabBuyBtn.addEventListener("click", ()=>{ availability.vendorTab = "buy"; renderVendorUI(); });
if (vendorTabSellBtn) vendorTabSellBtn.addEventListener("click", ()=>{ availability.vendorTab = "sell"; renderVendorUI(); });

  // Open state: inventory + equipment can be open simultaneously.

  function applyWindowVis(){
    winInventory.classList.toggle("hidden", !windowsOpen.inventory);
    winEquipment.classList.toggle("hidden", !windowsOpen.equipment);
    winSkills.classList.toggle("hidden", !windowsOpen.skills);
    winBank.classList.toggle("hidden", !windowsOpen.bank);
    winVendor.classList.toggle("hidden", !windowsOpen.vendor);

    winSettings.classList.toggle("hidden", !windowsOpen.settings);

    iconInv.classList.toggle("active", windowsOpen.inventory);
    iconEqp.classList.toggle("active", windowsOpen.equipment);
    iconSki.classList.toggle("active", windowsOpen.skills);
    iconSet.classList.toggle("active", windowsOpen.settings);
    iconBank.classList.toggle("active", windowsOpen.bank);
if (iconVendor) iconVendor.classList.toggle("active", windowsOpen.vendor);
if (winVendor) winVendor.classList.toggle("hidden", !windowsOpen.vendor);


  }

  function closeExclusive(exceptName){
    // Skills / Bank / Settings are exclusive *between themselves*, but do not close inventory/equipment.
    for (const k of ["skills","bank","vendor","settings"]){
      if (k !== exceptName) windowsOpen[k] = false;
    }
  }

  function openWindow(name){
    if (name === "inventory" || name === "equipment"){
      windowsOpen[name] = true;
    } else {
      closeExclusive(name);
      windowsOpen[name] = true;
    }

    // Bank access should auto-open inventory
    if (name === "bank"){
      windowsOpen.inventory = true;
    }

    applyWindowVis();
    saveWindowsUI();
  }

  function closeWindow(name){
    windowsOpen[name] = false;
    applyWindowVis();
    saveWindowsUI();
  }

  function toggleWindow(name){
    if (name === "bank" && !availability.bank) return;
  if (name === "vendor" && !availability.vendor) {
    chatLine(`<span class="muted">You need to be next to a vendor to trade.</span>`);
    return;
  }



    const isOpen = !!windowsOpen[name];
    if (isOpen){
      closeWindow(name);
      return;
    }
    openWindow(name);
  }

  iconInv.addEventListener("click", () => toggleWindow("inventory"));
  iconEqp.addEventListener("click", () => toggleWindow("equipment"));
  iconSki.addEventListener("click", () => toggleWindow("skills"));
  iconSet.addEventListener("click", () => toggleWindow("settings"));
  iconBank.addEventListener("click", () => toggleWindow("bank"));
iconVendor.addEventListener("click", () => toggleWindow("vendor"));


  function updateBankIcon(){
    if (availability.bank){
      iconBank.classList.remove("disabled");
      iconBank.style.display = "";
    } else {
      iconBank.classList.add("disabled");
      iconBank.style.display = "none";
      if (windowsOpen.bank){
        windowsOpen.bank = false; // close bank window if you walk away
        applyWindowVis();
        saveWindowsUI();
      }
    }
  }
function updateVendorIcon(){
  if (availability.vendor){
    iconVendor.classList.remove("disabled");
    iconVendor.style.display = "";
  } else {
    iconVendor.classList.add("disabled");
    iconVendor.style.display = "none";
    if (windowsOpen.vendor){
      windowsOpen.vendor = false;
      applyWindowVis();
      saveWindowsUI();
    }
  }
}

  // Close buttons
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button.winClose");
    if (!btn) return;
    const name = btn.dataset.close;
    if (!name) return;
    closeWindow(name);
  });

  // Draggable windows
  function makeWindowDraggable(winEl, headerEl){
    let drag = null;

    headerEl.addEventListener("mousedown", (e) => {
      if (e.target.closest(".winClose")) return;
      e.preventDefault();
      const r = winEl.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top };
    });

    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      const gameArea = document.getElementById("gameArea").getBoundingClientRect();
      const w = winEl.offsetWidth;
      const h = winEl.offsetHeight;

      let nl = drag.left + dx - gameArea.left;
      let nt = drag.top + dy - gameArea.top;

      nl = clamp(nl, 8, Math.max(8, gameArea.width - w - 8));
      nt = clamp(nt, 8, Math.max(8, gameArea.height - h - 8));

      winEl.style.left = nl + "px";
      winEl.style.top = nt + "px";
    });

    window.addEventListener("mouseup", () => {
      if (!drag) return;
      drag = null;
      saveWindowsUI();
    });
  }

  makeWindowDraggable(winInventory, document.getElementById("hdrInventory"));
  makeWindowDraggable(winEquipment, document.getElementById("hdrEquipment"));
  makeWindowDraggable(winSkills, document.getElementById("hdrSkills"));
  makeWindowDraggable(winBank, document.getElementById("hdrBank"));
  makeWindowDraggable(winSettings, document.getElementById("hdrSettings"));
makeWindowDraggable(winVendor, document.getElementById("hdrVendor"));


  function getWindowRect(winEl){
    return {
      left: parseFloat(winEl.style.left || "18"),
      top:  parseFloat(winEl.style.top  || "70"),
      width: winEl.offsetWidth,
      height: winEl.offsetHeight
    };
  }

  function applyWindowRect(winEl, rect){
    if (!rect) return;
    if (typeof rect.left === "number") winEl.style.left = rect.left + "px";
    if (typeof rect.top === "number") winEl.style.top = rect.top + "px";
    if (typeof rect.width === "number") winEl.style.width = rect.width + "px";
    if (typeof rect.height === "number") winEl.style.height = rect.height + "px";
  }
function clampWindowToGameArea(winEl){
  if (!winEl) return;
  const gameArea = document.getElementById("gameArea").getBoundingClientRect();
  const w = winEl.offsetWidth || parseFloat(winEl.style.width) || 0;
  const h = winEl.offsetHeight || parseFloat(winEl.style.height) || 0;


  let nl = parseFloat(winEl.style.left || "18");
  let nt = parseFloat(winEl.style.top  || "70");

  nl = clamp(nl, 8, Math.max(8, gameArea.width  - w - 8));
  nt = clamp(nt, 8, Math.max(8, gameArea.height - h - 8));

  winEl.style.left = nl + "px";
  winEl.style.top  = nt + "px";
}


  function saveWindowsUI(){
    const data = {
      windowsOpen: { ...windowsOpen },
      inventory: getWindowRect(winInventory),
      equipment: getWindowRect(winEquipment),
      skills: getWindowRect(winSkills),
      bank: getWindowRect(winBank),
      settings: getWindowRect(winSettings),
vendor: getWindowRect(winVendor)

    };
    localStorage.setItem(WINDOWS_UI_KEY, JSON.stringify(data));
  }

  function loadWindowsUI(){
  try{
    const d = JSON.parse(localStorage.getItem("ui_windows") || "{}");

    applyWindowRect(winInventory, d.inventory);
    applyWindowRect(winEquipment, d.equipment);
    applyWindowRect(winSkills, d.skills);
    applyWindowRect(winBank, d.bank);
    applyWindowRect(winSettings, d.settings);

    // ADD THIS:
    applyWindowRect(winVendor, d.vendor);

    // ADD THIS:
    clampWindowToGameArea(winInventory);
    clampWindowToGameArea(winEquipment);
    clampWindowToGameArea(winSkills);
    clampWindowToGameArea(winBank);
    clampWindowToGameArea(winVendor);
    clampWindowToGameArea(winSettings);

  }catch(e){}
}


  window.addEventListener("mouseup", () => saveWindowsUI());

  // ---------- Rendering UI: inventory/skills/equipment/bank ----------
  const invGrid = document.getElementById("invGrid");
  const invCountEl = document.getElementById("invCount");
  const invUseStateEl = document.getElementById("invUseState");

  const skillsGrid = document.getElementById("skillsGrid");
const skillsCombatPillEl = document.getElementById("skillsCombatPill");


  const eqWeaponIcon = document.getElementById("eqWeaponIcon");
  const eqWeaponName = document.getElementById("eqWeaponName");
  const eqOffhandIcon = document.getElementById("eqOffhandIcon");
  const eqOffhandName = document.getElementById("eqOffhandName");

  const bankGrid = document.getElementById("bankGrid");
  const bankCountEl = document.getElementById("bankCount");

  function renderInv(){
    invGrid.innerHTML="";
    invCountEl.textContent = `${countSlots(inv)}/${MAX_INV}`;
    for (let i=0;i<MAX_INV;i++){
      const s=inv[i];
      const slot=document.createElement("div");
      slot.className="slot"+(s?"":" empty");
      slot.dataset.index=String(i);

      if (!s){
        slot.innerHTML = `<div class="icon">.</div><div class="name">Empty</div>`;
      } else {
        const item=Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.icon ?? UNKNOWN_ICON}</div>
          <div class="name">${item?.name ?? s.id}</div>
          ${qty > 1 ? `<div class="qty">${qty}</div>` : ``}
        `;
        slot.title = `${item?.name ?? s.id}${qty>1 ? ` x${qty}` : ""}`;
      }
      invGrid.appendChild(slot);
    }
  }

    function renderSkills(){
    skillsGrid.innerHTML="";
if (skillsCombatPillEl) skillsCombatPillEl.textContent = `Combat: ${getPlayerCombatLevel(Skills)}`;

    const order = ["health","accuracy","power","defense","ranged","sorcery","fletching","woodcutting","mining","fishing","firemaking","cooking"];


    for (const k of order){
      const s = Skills[k];
      const skillName = getSkillName(k);
      const {lvl,next,pct} = xpToNext(s.xp);
      const toNext = Math.max(0, next - s.xp);
      const icon = SKILL_ICONS[k] ?? SKILL_FALLBACK_ICON;

      const div = document.createElement("div");
      div.className = "stat";
      div.title = `${skillName}\nXP: ${s.xp}\nXP to next: ${toNext}`;
      div.innerHTML = `
        <div class="k"><span class="ico">${icon}</span> ${skillName}</div>
        <div class="v">Lv ${lvl}</div>
        <div class="small">${s.xp} XP</div>
        <div class="bar"><div style="width:${clamp(pct,0,1)*100}%"></div></div>
        <div class="small">${toNext} XP to next</div>
      `;
      skillsGrid.appendChild(div);
    }
  }


  function renderEquipment(){
    const w = equipment.weapon;
    const o = equipment.offhand;

    if (w){
      eqWeaponIcon.innerHTML = Items[w]?.icon ?? UNKNOWN_ICON;
      eqWeaponName.textContent = Items[w]?.name ?? w;
    } else {
      eqWeaponIcon.textContent = "-";
      eqWeaponName.textContent = "Empty";
    }

    if (o){
      eqOffhandIcon.innerHTML = Items[o]?.icon ?? UNKNOWN_ICON;
      eqOffhandName.textContent = Items[o]?.name ?? o;
    } else {
      eqOffhandIcon.textContent = "-";
      eqOffhandName.textContent = "Empty";
    }

    renderQuiver();
  }

  function renderBank(){
    bankGrid.innerHTML="";
    bankCountEl.textContent = `${countSlots(bank)}/${MAX_BANK}`;
    for (let i=0;i<MAX_BANK;i++){
      const s=bank[i];
      const slot=document.createElement("div");
      slot.className="slot"+(s?"":" empty");
      slot.dataset.index=String(i);
      if (!s){
        slot.innerHTML = `<div class="icon">.</div><div class="name">Empty</div>`;
      } else {
        const item=Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.icon ?? UNKNOWN_ICON}</div>
          <div class="name">${item?.name ?? s.id}</div>
          ${(item?.stack && qty>1) ? `<div class="qty">${qty}</div>` : ``}
        `;
      }
      bankGrid.appendChild(slot);
    }
  }

  // ---------- Melee training UI binding ----------
  const meleeTrainingSeg = document.getElementById("meleeTrainingSeg");
  function renderMeleeTrainingUI(){
    for (const btn of meleeTrainingSeg.querySelectorAll(".segBtn")){
      btn.classList.toggle("active", btn.dataset.melee === meleeState.selected);
    }
  }
  meleeTrainingSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    const v = btn.dataset.melee;
    if (v === "accuracy" || v === "power" || v === "defense"){
      meleeState.selected = v;
      saveMeleeTraining();
      renderMeleeTrainingUI();
      chatLine(`<span class="muted">Melee Training set to <b>${Skills[v].name}</b>.</span>`);
    }
  });

  // ---------- Chat input ----------
  const chatInput=document.getElementById("chatInput");
  const chatSend=document.getElementById("chatSend");
  function sendChat(){
    const t=(chatInput.value||"").trim();
    if (!t) return;
    chatLine(`<span style="color:${player.color}; font-weight:900;">${player.name}:</span> ${t}`);
    chatInput.value="";
  }
  chatSend.onclick = sendChat;
  chatInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter") sendChat(); });

  // ---------- Chat UI: draggable + resizable + collapsible ----------
  const gameAreaEl = document.getElementById("gameArea");
  const hudChat = document.getElementById("hudChat");
  const hudChatHeader = document.getElementById("hudChatHeader");
  const hudChatMin = document.getElementById("hudChatMin");
  const hudChatResize = document.getElementById("hudChatResize");
  const hudChatTab = document.getElementById("hudChatTab");

  function loadChatUI(){
    const raw = localStorage.getItem(CHAT_UI_KEY);
    if (!raw) return;
    try{
      const d = JSON.parse(raw);
      if (typeof d.left === "number") chatUI.left = d.left;
      if (typeof d.top === "number") chatUI.top = d.top;
      if (typeof d.width === "number") chatUI.width = d.width;
      if (typeof d.height === "number") chatUI.height = d.height;
      if (typeof d.collapsed === "boolean") chatUI.collapsed = d.collapsed;
    }catch{}
  }
  function saveChatUI(){ localStorage.setItem(CHAT_UI_KEY, JSON.stringify(chatUI)); }

  function clampChatToBounds(){
    const areaW = gameAreaEl.clientWidth;
    const areaH = gameAreaEl.clientHeight;

    const minW = 260, minH = 220;
    chatUI.width = clamp(chatUI.width, minW, Math.max(minW, areaW - 12));
    chatUI.height = clamp(chatUI.height, minH, Math.max(minH, areaH - 12));

    if (chatUI.top == null){
      chatUI.top = Math.max(12, areaH - chatUI.height - 12);
    }

    const w = chatUI.collapsed ? 90 : chatUI.width;
    const h = chatUI.collapsed ? 40 : chatUI.height;

    chatUI.left = clamp(chatUI.left, 12, Math.max(12, areaW - w - 12));
    chatUI.top  = clamp(chatUI.top,  12, Math.max(12, areaH - h - 12));
  }

  function applyChatUI(){
    clampChatToBounds();
    hudChat.classList.toggle("collapsed", chatUI.collapsed);
    hudChat.style.left = `${chatUI.left}px`;
    hudChat.style.top = `${chatUI.top}px`;
    hudChat.style.bottom = "";

    if (chatUI.collapsed){
      hudChat.style.width = "auto";
      hudChat.style.height = "auto";
    } else {
      hudChat.style.width = `${chatUI.width}px`;
      hudChat.style.height = `${chatUI.height}px`;
    }
  }

  function setChatCollapsed(v){
    chatUI.collapsed = !!v;
    applyChatUI();
    saveChatUI();
  }

  hudChatMin.addEventListener("click", (e)=>{ e.stopPropagation(); setChatCollapsed(true); });
  hudChatTab.addEventListener("click", ()=> setChatCollapsed(false));

  let dragMode = null;
  let dragStart = null;

  hudChatHeader.addEventListener("mousedown", (e)=>{
    if (e.target === hudChatMin) return;
    e.preventDefault();
    dragMode = "move";
    dragStart = { x: e.clientX, y: e.clientY, left: chatUI.left, top: chatUI.top };
  });

  hudChatResize.addEventListener("mousedown", (e)=>{
    e.preventDefault();
    dragMode = "resize";
    dragStart = { x: e.clientX, y: e.clientY, w: chatUI.width, h: chatUI.height };
  });

  window.addEventListener("mousemove", (e)=>{
    if (!dragMode || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragMode === "move"){
      chatUI.left = dragStart.left + dx;
      chatUI.top  = dragStart.top + dy;
      applyChatUI();
    } else if (dragMode === "resize"){
      chatUI.width  = dragStart.w + dx;
      chatUI.height = dragStart.h + dy;
      applyChatUI();
    }
  });

  window.addEventListener("mouseup", ()=>{
    if (!dragMode) return;
    dragMode = null;
    dragStart = null;
    saveChatUI();
  });

  window.addEventListener("resize", ()=>{
    applyChatUI();
    saveChatUI();
    updateBankIcon();
updateVendorIcon();

  });

  // ---------- Context menu ----------
  const ctxMenu=document.createElement("div");
  ctxMenu.className="ctxmenu hidden";
  document.body.appendChild(ctxMenu);

  function closeCtxMenu(){ ctxMenu.classList.add("hidden"); ctxMenu.innerHTML=""; }
  function openCtxMenu(clientX, clientY, options){
    ctxMenu.innerHTML="";
    for (const opt of options){
      if (opt.type==="sep"){
        const sep=document.createElement("div"); sep.className="sep"; ctxMenu.appendChild(sep); continue;
      }
      const b=document.createElement("button");
if (opt.className) b.classList.add(opt.className);

      b.textContent=opt.label;
      b.onclick=()=>{ closeCtxMenu(); opt.onClick(); };
      ctxMenu.appendChild(b);
    }
    ctxMenu.classList.remove("hidden");
    const rect=ctxMenu.getBoundingClientRect();
    const pad=8;
    ctxMenu.style.left = clamp(clientX,pad,window.innerWidth-rect.width-pad)+"px";
    ctxMenu.style.top  = clamp(clientY,pad,window.innerHeight-rect.height-pad)+"px";
  }
  document.addEventListener("mousedown",(e)=>{ if (!ctxMenu.classList.contains("hidden") && !ctxMenu.contains(e.target)) closeCtxMenu(); });
  document.addEventListener("keydown",(e)=>{ if (e.key==="Escape") closeCtxMenu(); });
  window.addEventListener("blur", closeCtxMenu);

  // ---------- Bank interactions ----------
  function depositFromInv(invIndex, qty=null){
    const s=inv[invIndex]; if (!s) return;
    const id = s.id;
    const item = Items[id];
    if (!item) return;

    if (!availability.bank){
      chatLine(`<span class="warn">You must be at a bank chest to bank items.</span>`);
      return;
    }

    const want = qty==null ? 1 : Math.max(1, qty|0);
    let moved = 0;
    for (let i=0;i<want;i++){
      const idx = inv.findIndex(x => x && x.id===id);
      if (idx<0) break;
      const ok = addToBank(bank, id, 1);
      if (!ok){ chatLine(`<span class="warn">Bank is full.</span>`); break; }
      inv[idx]=null;
      moved++;
    }
    if (moved>0){ renderInv(); renderBank(); }
  }

  function withdrawFromBank(bankIndex, qty=null){
    if (!availability.bank){
      chatLine(`<span class="warn">You must be at a bank chest to withdraw.</span>`);
      return;
    }

    const s=bank[bankIndex]; if (!s) return;
    const item=Items[s.id];
    if (!item) return;

    if (item.ammo){
      const have = s.qty|0;
      const want = qty==null ? have : Math.min(Math.max(1, qty|0), have);
      addToQuiver(s.id, want);
      s.qty -= want;
      if (s.qty<=0) bank[bankIndex]=null;
      renderBank();
      chatLine(`<span class="muted">You add ${want}x ${Items.wooden_arrow.name} to your quiver.</span>`);
      return;
    }

    if (item.stack){
      const have = s.qty|0;
      const want = qty==null ? have : Math.min(Math.max(1, qty|0), have);
      const can = Math.min(want, emptyInvSlots());
      if (can <= 0){ chatLine(`<span class="warn">Inventory full.</span>`); return; }
      const added = addToInventory(s.id, can);
      s.qty -= added;
      if (s.qty<=0) bank[bankIndex]=null;
      renderBank();
      return;
    }

    if (emptyInvSlots() <= 0){ chatLine(`<span class="warn">Inventory full.</span>`); return; }
    const added = addToInventory(s.id, 1);
    if (added !== 1){ chatLine(`<span class="warn">Inventory full.</span>`); return; }
    bank[bankIndex]=null;
    renderBank();
  }

  document.getElementById("bankDepositAll").addEventListener("click", () => {
    if (!availability.bank) return chatLine(`<span class="warn">You must be at a bank chest.</span>`);
    for (let i=0;i<MAX_INV;i++){
      const s=inv[i]; if (!s) continue;
      const ok = addToBank(bank, s.id, 1);
      if (!ok) break;
      inv[i]=null;
    }
    renderInv(); renderBank();
  });

  document.getElementById("bankWithdrawAll").addEventListener("click", () => {
    if (!availability.bank) return chatLine(`<span class="warn">You must be at a bank chest.</span>`);
    for (let i=0;i<MAX_BANK;i++){
      const s=bank[i]; if (!s) continue;
      const item=Items[s.id];
      if (!item) continue;

      if (item.ammo){
        addToQuiver(s.id, s.qty|0);
        bank[i]=null;
        continue;
      }

      if (item.stack){
        while (s && s.qty>0 && emptyInvSlots()>0){
          if (addToInventory(s.id,1)!==1) break;
          s.qty -= 1;
          if (s.qty<=0) bank[i]=null;
        }
      } else {
        if (emptyInvSlots()<=0) break;
        if (addToInventory(s.id,1)===1) bank[i]=null;
      }
    }
    renderInv(); renderBank();
  });

  // ---------- Inventory use state + fletching ----------
  function setUseState(id){
    useState.activeItemId = id;
    if (!id){ invUseStateEl.textContent = "Use: none"; return; }
    const item = Items[id];
    invUseStateEl.textContent = `Use: ${item ? item.name : id}`;
  }

  function tryItemOnItem(toolId, targetId, targetIndex){
    if (toolId === "knife" && targetId === "log"){
      const lvl = levelFromXP(Skills.fletching.xp);
      if (lvl < 1){
        chatLine(`<span class="warn">Your Fletching level is too low.</span>`);
        return true;
      }

      inv[targetIndex] = null;

      addToQuiver("wooden_arrow", 25);
      chatLine(`You fletch 25 wooden arrows.`);
      addXP("fletching", 10);

      renderInv();
      return true;
    }
// Flint and steel + log => light fire under player, step south
// Flint and steel + log => light fire under player, then step south (RS-style)
if (toolId === "flint_steel" && targetId === "log") {
  if (player.action.type !== "idle"){
    chatLine(`<span class="warn">You're busy.</span>`);
    return true;
  }
  // Don't allow lighting fires indoors
  if (isIndoors(player.x, player.y)){
    chatLine(`<span class="warn">You can't light a fire indoors.</span>`);
    return true;
  }


  // Must be standing on an empty tile (no bank/vendor/mob/resource/fire)
  if (getEntityAt(player.x, player.y)){
    chatLine(`<span class="warn">That space is occupied.</span>`);
    return true;
  }

  // lock player in place while lighting
  player.path = [];
  syncPlayerPix();

  startTimedAction("firemake", 1.2, "Lighting fire…", () => {
    // Re-check tile (something could have spawned / moved here)
    if (getEntityAt(player.x, player.y)){
      chatLine(`<span class="warn">That space is occupied.</span>`);
      return;
    }
    if (isIndoors(player.x, player.y)){
      chatLine(`<span class="warn">You can't light a fire indoors.</span>`);
      return;
    }



    // consume 1 log
    if (!removeItemsFromInventory("log", 1)) {
      chatLine(`<span class="warn">You need a log.</span>`);
      return;
    }

    const born = now();
    interactables.push({
      type: "fire",
      x: player.x,
      y: player.y,
      createdAt: born,
      expiresAt: born + 60000
    });

    addXP("firemaking", 10);
    chatLine(`<span class="good">You light a fire.</span>`);

    // step south (y+1) if possible
    const sx = player.x;
    const sy = player.y + 1;
    if (isWalkable(sx, sy) && !getEntityAt(sx, sy)) {
      setPathTo(sx, sy);
    }
  });

  return true;
}

    chatLine(`<span class="muted">Nothing interesting happens.</span>`);
    return false;
  }

  // ---------- Right-click on inventory items: Equip / Use / Drop ----------
  invGrid.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index,10);
    const s = inv[idx];
    if (!s) return;

    const item=Items[s.id];

    const opts=[];
    if (item?.heal > 0){
      opts.push({ label: "Eat", onClick: ()=> consumeFoodFromInv(idx) });
    }


    if (windowsOpen.bank){
      opts.push({ label: "Deposit", onClick: ()=> depositFromInv(idx, null) });
      opts.push({ label: "Deposit X…", onClick: ()=>{
        const v = prompt("Deposit how many?", "10");
        const n = Math.max(1, parseInt(v||"",10) || 0);
        if (n>0) depositFromInv(idx, n);
      }});
      openCtxMenu(e.clientX, e.clientY, opts);
      return;
    }

    const slotName = canEquip(s.id);
    if (slotName){
      opts.push({ label: "Equip", onClick: ()=> equipFromInv(idx) });
    }

    opts.push({ label: "Use", onClick: ()=>{
      setUseState(s.id);
      chatLine(`<span class="muted">You select the ${item?.name ?? s.id}.</span>`);
    }});

    opts.push({ type:"sep" });

              opts.push({ type:"sep" });

    opts.push({ label: "Drop", onClick: ()=>{
      // drop to ground pile at player tile (no deletion)
      
      inv[idx]=null;
	lockManualDropAt(player.x, player.y);
      addGroundLoot(player.x, player.y, s.id, 1);
      renderInv();
      chatLine(`<span class="muted">You drop the ${item?.name ?? s.id}.</span>`);
    }});


    opts.push({ label: "Drop X…", onClick: ()=>{
      const v=prompt("Drop how many?", "10");
      const n=Math.max(1, parseInt(v||"",10) || 0);
      if (!n) return;

      lockManualDropAt(player.x, player.y);
      let remaining = n;
      for (let i=0; i<inv.length && remaining>0; i++){

        if (inv[i] && inv[i].id === s.id){
          inv[i] = null;
          addGroundLoot(player.x, player.y, s.id, 1);
          remaining--;
        }
      }
      renderInv();
      chatLine(`<span class="muted">You drop ${n-remaining}x ${item?.name ?? s.id}.</span>`);
    }});

    openCtxMenu(e.clientX, e.clientY, opts);
  });

  invGrid.addEventListener("mousedown", (e) => {

    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index,10);
    if (!inv[idx]) return;
    if (e.button !== 0) return; // only left-click


    if (windowsOpen.bank){
      depositFromInv(idx, null);
      return;
    }
    // Left-click food to eat
    if (consumeFoodFromInv(idx)) return;



    if (useState.activeItemId){
      const toolId = useState.activeItemId;
      const targetId = inv[idx].id;

      if (toolId === targetId){
        chatLine(`<span class="muted">Nothing interesting happens.</span>`);
        setUseState(null);
        return;
      }
      const handled = tryItemOnItem(toolId, targetId, idx);

// QoL: keep certain tools "sticky" so you can repeat actions (e.g., light multiple logs)
const sticky = (toolId === "flint_steel" || toolId === "knife");
if (!handled || !sticky) setUseState(null);

return;

    }
  });

  // Bank: click withdraw; right-click withdraw X
  bankGrid.addEventListener("mousedown", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index,10);
    if (!bank[idx]) return;
    withdrawFromBank(idx, null);
  });

  bankGrid.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index,10);
    const s = bank[idx];
    if (!s) return;
    const item=Items[s.id];

    const opts=[];
    if (item?.ammo){
      opts.push({ label: "Withdraw to Quiver", onClick: ()=> withdrawFromBank(idx, null) });
      opts.push({ label: "Withdraw X…", onClick: ()=>{
        const v = prompt("Withdraw how many?", "10");
        const n = Math.max(1, parseInt(v||"",10) || 0);
        if (n>0) withdrawFromBank(idx, n);
      }});
    } else {
      opts.push({ label: `Withdraw ${item?.stack ? "All" : ""}`.trim(), onClick: ()=> withdrawFromBank(idx, null) });
      if (item?.stack){
        opts.push({ label: "Withdraw X…", onClick: ()=>{
          const v = prompt("Withdraw how many?", "10");
          const n = Math.max(1, parseInt(v||"",10) || 0);
          if (n>0) withdrawFromBank(idx, n);
        }});
      }
    }
    openCtxMenu(e.clientX, e.clientY, opts);
  });

  // Equipment: click-to-unequip + right-click menu
  function equipSlotContextMenu(e, slotName){
    e.preventDefault();
    const id = equipment[slotName];
    if (!id) return;
    const opts = [
      { label: "Unequip", onClick: ()=> unequipSlot(slotName) }
    ];
    openCtxMenu(e.clientX, e.clientY, opts);
  }

  document.getElementById("eqWeapon").addEventListener("contextmenu", (e)=> equipSlotContextMenu(e, "weapon"));
  document.getElementById("eqOffhand").addEventListener("contextmenu", (e)=> equipSlotContextMenu(e, "offhand"));

  document.getElementById("eqWeapon").addEventListener("mousedown", (e)=>{
    if (e.button !== 0) return;
    if (!equipment.weapon) return;
    if (emptyInvSlots() <= 0){
      chatLine(`<span class="warn">Inventory full.</span>`);
      return;
    }
    unequipSlot("weapon");
  });
  document.getElementById("eqOffhand").addEventListener("mousedown", (e)=>{
    if (e.button !== 0) return;
    if (!equipment.offhand) return;
    if (emptyInvSlots() <= 0){
      chatLine(`<span class="warn">Inventory full.</span>`);
      return;
    }
    unequipSlot("offhand");
  });

  // ---------- Character creation ----------
  const charOverlay=document.getElementById("charOverlay");
  const charName=document.getElementById("charName");
  const charColorPill=document.getElementById("charColorPill");
  const charStart=document.getElementById("charStart");
  const classPick=document.getElementById("classPick");

  function setSelectedClass(cls){
    if (!CLASS_DEFS[cls]) cls = "Warrior";
    characterState.selectedClass = cls;
    for (const btn of classPick.querySelectorAll("button[data-class]")){
      btn.classList.toggle("active", btn.dataset.class === characterState.selectedClass);
    }
    charColorPill.textContent = CLASS_DEFS[characterState.selectedClass].color;
  }

  function loadCharacterPrefs(){
    const raw = localStorage.getItem(CHAR_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveCharacterPrefs(){
    localStorage.setItem(CHAR_KEY, JSON.stringify({
      name: player.name,
      class: player.class,
      color: player.color
    }));
  }

  function openCharCreate(force=false){
    const saved = loadCharacterPrefs();

    if (saved?.name) player.name = String(saved.name).slice(0,14);
    if (saved?.class && CLASS_DEFS[saved.class]) player.class = saved.class;
    if (saved?.color) player.color = saved.color;

    if (!force && saved?.class && saved?.name){
      player.color = CLASS_DEFS[player.class]?.color ?? player.color;
      characterState.selectedClass = player.class;
      return false;
    }

    charName.value = player.name || "Adventurer";
    setSelectedClass(player.class || "Warrior");
    charOverlay.style.display="flex";
    return true;
  }

  classPick.addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-class]");
    if (!btn) return;
    setSelectedClass(btn.dataset.class);
  });

  // ---------- Starting inventory + equipment ----------
  function applyStartingInventory(){
    clearSlots(inv);
    equipment.weapon = null;
    equipment.offhand = null;

    // reset quiver
    // keep a dedicated coins stack in inventory
    addToInventory("gold", 0);
    quiver.wooden_arrow = 0;
    wallet.gold = 0;


    addToInventory("axe", 1);
    addToInventory("pick", 1);
    addToInventory("knife", 1);
    addToInventory("flint_steel", 1);


    if (player.class === "Warrior"){
      addToInventory("sword", 1);
      addToInventory("shield", 1);
      const swordIdx = inv.findIndex(s=>s && s.id==="sword");
      const shieldIdx = inv.findIndex(s=>s && s.id==="shield");
      if (swordIdx>=0) equipFromInv(swordIdx);
      if (shieldIdx>=0) equipFromInv(shieldIdx);
    } else if (player.class === "Ranger"){
      addToInventory("bow", 1);
      addToQuiver("wooden_arrow", 50);
      const bowIdx = inv.findIndex(s=>s && s.id==="bow");
      if (bowIdx>=0) equipFromInv(bowIdx);
    } else {
      addToInventory("staff", 1);
      const staffIdx = inv.findIndex(s=>s && s.id==="staff");
      if (staffIdx>=0) equipFromInv(staffIdx);
    }

    renderQuiver();
  }

  // ---------- Delete character ----------
  const deleteCharBtn = document.getElementById("deleteCharBtn");
  const newCharBtn = document.getElementById("newCharBtn");

  const deleteCharOverlay = document.getElementById("deleteCharOverlay");
  const deleteCharCancel = document.getElementById("deleteCharCancel");
  const deleteCharConfirm = document.getElementById("deleteCharConfirm");

  function openDeleteConfirm(){ deleteCharOverlay.style.display="flex"; }
  function closeDeleteConfirm(){ deleteCharOverlay.style.display="none"; }

  function resetCharacter(){
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(CHAR_KEY);

    for (const k of Object.keys(Skills)) Skills[k].xp = 0;
    clearSlots(inv);
    clearSlots(bank);
    quiver.wooden_arrow = 0;
    wallet.gold = 0;

    equipment.weapon = null;
    equipment.offhand = null;

    groundLoot.clear();
manualDropLocks.clear();


    player.path = [];
    player.target = null;
    player.action = {type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    player.hp = BASE_HP;
    player.maxHp = BASE_HP;

    closeCtxMenu();
    setUseState(null);

    for (const k of Object.keys(windowsOpen)) windowsOpen[k] = false;
    applyWindowVis();

    renderSkills();
    renderInv();
    renderBank();
    renderEquipment();
    renderQuiver();
    renderHPHUD();
    updateCamera();

    openCharCreate(true);
  }

  deleteCharBtn.onclick = openDeleteConfirm;
  deleteCharCancel.onclick = closeDeleteConfirm;
  deleteCharOverlay.addEventListener("mousedown",(e)=>{ if (e.target === deleteCharOverlay) closeDeleteConfirm(); });
  deleteCharConfirm.onclick = () => {
    closeDeleteConfirm();
    resetCharacter();
    chatLine(`<span class="warn">Character deleted.</span>`);
  };

  newCharBtn.onclick = () => {
    openCharCreate(true);
  };

  // ---------- World + flow ----------
  function startNewGame(){

    closeCtxMenu();
    setUseState(null);

initWorldSeed();


    for (const k of Object.keys(Skills)) Skills[k].xp = 0;

    clearSlots(bank);
    quiver.wooden_arrow = 0;
    wallet.gold = 0;
    groundLoot.clear();
manualDropLocks.clear();



    recalcMaxHPFromHealth();
    player.hp = player.maxHp;

    applyStartingInventory();

    seedResources();
    seedMobs();
    seedInteractables();

    player.x = startCastle.x0 + 6;
    player.y = startCastle.y0 + 4;
    syncPlayerPix();
    player.path = [];
    player.target = null;
    player.action = {type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    player.attackCooldownUntil = 0;
player.invulnUntil = now() + 1200;

    player._lastRangeMsgAt = 0;

    setZoom(ZOOM_DEFAULT);

    renderSkills();
    renderInv();
    renderBank();
    renderEquipment();
    renderQuiver();
    renderHPHUD();
    updateCamera();
  }

  charStart.onclick = () => {
    player.name = (charName.value || "Adventurer").trim().slice(0,14) || "Adventurer";
    player.class = characterState.selectedClass;
    player.color = CLASS_DEFS[characterState.selectedClass].color;

    saveCharacterPrefs();
    charOverlay.style.display="none";

    startNewGame();
    chatLine(`<span class="good">Welcome, ${player.name} the ${player.class}.</span>`);
  };

  // ---------- Entity lookup ----------
 function getEntityAt(tx, ty){
  // Interactables
  const idx = interactables.findIndex(it => it.x===tx && it.y===ty);
  if (idx !== -1){
    const it = interactables[idx];
    if (it.type === "fire")   return { kind:"fire", index: idx, label:"Campfire", x:it.x, y:it.y };
    if (it.type === "bank")   return { kind:"bank", index: idx, label:"Bank Chest", x:it.x, y:it.y };
    if (it.type === "vendor") return { kind:"vendor", index: idx, label:"Vendor", x:it.x, y:it.y };
    if (it.type === "fish") return { kind:"fish", index: idx, label:"Fishing Spot", x:it.x, y:it.y };
if (it.type === "furnace") return { kind:"furnace", index: idx, label:"Furnace", x:it.x, y:it.y };
if (it.type === "anvil")   return { kind:"anvil", index: idx, label:"Anvil", x:it.x, y:it.y };


  }

  // Mobs
  const mobIndex = mobs.findIndex(m => m.alive && m.x===tx && m.y===ty);
  if (mobIndex>=0){
  const m = mobs[mobIndex];
  const name = m?.name ?? "Rat";
  const lvl  = m?.combatLevel ?? 1;
  return { kind:"mob", index: mobIndex, label:`${name} (Lvl ${lvl})`, level:lvl };
}


  // Resources
  const resIndex = resources.findIndex(r => r.alive && r.x===tx && r.y===ty);
  if (resIndex>=0){
    const r=resources[resIndex];
    return { kind:"res", index: resIndex, label: r.type==="tree" ? "Tree" : "Rock" };
  }

  return null;
}

  function examineEntity(ent){
    if (!ent) return;
    if (ent.kind==="mob") chatLine(`<span class="muted">It's a small, scrappy rat.</span>`);
    if (ent.kind==="res" && ent.label==="Tree") chatLine(`<span class="muted">A sturdy tree. Looks good for logs.</span>`);
    if (ent.kind==="res" && ent.label==="Rock") chatLine(`<span class="muted">A mineral rock. Might contain ore.</span>`);
    if (ent.kind==="bank") chatLine(`<span class="muted">A secure bank chest.</span>`);
    if (ent.kind==="vendor") chatLine(`<span class="muted">A traveling vendor. Buys and sells goods.</span>`);
    if (ent.kind==="fire") chatLine(`<span class="muted">A warm campfire. Great for cooking.</span>`);
if (ent.kind==="fish") chatLine(`<span class="muted">A bubbling fishing spot in the river.</span>`);
if (ent.kind==="furnace") chatLine(`<span class="muted">A sturdy furnace. Smithing is coming soon.</span>`);
if (ent.kind==="anvil")   chatLine(`<span class="muted">A heavy anvil. You'll use it to forge gear later.</span>`);



    

  }

  function beginInteraction(ent){
    closeCtxMenu();
    player.action = { type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null };
    player.target = { kind: ent.kind, index: ent.index };
    ensureWalkIntoRangeAndAct();
  }

   // ---------- Interaction helpers ----------
  function clickToInteract(tileX,tileY){
    // RS-style: Firemaking is inventory-driven (Use Flint & Steel on a Log in inventory).
    // World clicks do not place fires directly.

    const ent = getEntityAt(tileX,tileY);
    if (ent){ beginInteraction(ent); return; }

    player.target = null;
    player.action = {type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    setPathTo(tileX,tileY);
  }


  // ---------- Combat + actions ----------
  function spawnGatherParticles(kind, tx, ty){
    const center = tileCenter(tx,ty);
    for (let i=0;i<6;i++){
      gatherParticles.push({
        kind,
        x:center.cx + (Math.random()*10-5),
        y:center.cy + (Math.random()*10-5),
        vx:(Math.random()*60-30),
        vy:(Math.random()*60-30),
        born: now(),
        life: 350 + Math.random()*250
      });

    }
  }

  function spawnCombatFX(kind, tx, ty){
    const a = { x: player.px, y: player.py };
    const b = tileCenter(tx,ty);
    if (kind === "slash"){
      combatFX.push({
        kind,
        x0:a.x, y0:a.y,
        x1:b.cx, y1:b.cy,
        born: now(),
        life: 220
      });
    } else if (kind === "arrow"){
      combatFX.push({
        kind,
        x0:a.x, y0:a.y,
        x1:b.cx, y1:b.cy,
        born: now(),
        life: 320
      });
    } else if (kind === "bolt"){
      combatFX.push({
        kind,
        x0:a.x, y0:a.y,
        x1:b.cx, y1:b.cy,
        born: now(),
        life: 300
      });
    }
  }
// ---------- Combat math / rolls ----------
function lvlOf(skillKey){ return levelFromXP(Skills[skillKey]?.xp ?? 0); }
function mobLvl(m, key){ return (m?.levels?.[key] ?? 1) | 0; }

// simple “RS-like” feel: accuracy vs defense, clamped so nothing is 100%
function calcHitChance(att, def){
  const a = Math.max(1, att|0);
  const d = Math.max(1, def|0);
  return clamp(a / (a + d), 0.10, 0.90);
}
function rollHit(att, def){ return Math.random() < calcHitChance(att, def); }

function maxHitFromOffense(off){
  const o = Math.max(1, off|0);
  return Math.max(1, 1 + Math.floor((o + 2) / 3)); // lvl 1–2 can hit 2
}
function rollDamageUpTo(maxHit){
  const mh = Math.max(1, maxHit|0);
  return 1 + Math.floor(Math.random() * mh); // 1..maxHit
}



function rollPlayerAttack(style, mob){
  const mobDef = mobLvl(mob, "defense");

  let att = lvlOf("accuracy");
  let off = lvlOf("power");

  if (style === "ranged"){
    att = lvlOf("ranged");
    off = att;
  } else if (style === "magic"){
    att = lvlOf("sorcery");
    off = att;
  }

  const maxHit = maxHitFromOffense(off);
  const hit = rollHit(att, mobDef);
  const dmg = hit ? rollDamageUpTo(maxHit) : 0;

  return { hit, dmg, maxHit };
}

function rollMobAttack(mob){
  const def = (MOB_DEFS[mob.type] ?? {});
  const att = mobLvl(mob, "accuracy");
  const off = mobLvl(mob, "power");
  const playerDef = lvlOf("defense");

  const hit = rollHit(att, playerDef);
  const maxHit = Math.max(1, (def.maxHit ?? maxHitFromOffense(off)));
  const dmg = hit ? rollDamageUpTo(maxHit) : 0;
  return { hit, dmg, maxHit };
}

function mobTileWalkable(nx, ny){
  if (!isWalkable(nx, ny)) return false;
  // don’t stand on solid interactables/resources
  if (resources.some(r => r.alive && r.x===nx && r.y===ny)) return false;
  if (interactables.some(it => it.x===nx && it.y===ny && it.type!=="fire")) return false;
  return true;
}

function mobStepToward(mob, tx, ty){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const curH = Math.abs(tx - mob.x) + Math.abs(ty - mob.y);
  let best = null;
  let bestH = curH;

  for (const [dx,dy] of dirs){
    const nx = mob.x + dx, ny = mob.y + dy;
    if (!mobTileWalkable(nx, ny)) continue;
    if (nx===player.x && ny===player.y) continue;
    if (mobs.some(o => o !== mob && o.alive && o.x===nx && o.y===ny)) continue;

    const h = Math.abs(tx - nx) + Math.abs(ty - ny);
    if (h < bestH){
      bestH = h;
      best = {x:nx, y:ny};
    }
  }

  if (best){
    mob.x = best.x;
    mob.y = best.y;
    return true;
  }
  return false;
}

function findBestMeleeEngagePath(mob){
  const adj = [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => ({ x: mob.x + dx, y: mob.y + dy }))
    .filter(p => isWalkable(p.x, p.y));

  if (!adj.length) return null;

  let best = null;
  for (const p of adj){
    const path = astar(player.x, player.y, p.x, p.y);
    if (!path) continue;
    if (path.some(n => n.x === mob.x && n.y === mob.y)) continue;
    if (!best || path.length < best.path.length){
      best = { x: p.x, y: p.y, path };
    }
  }
  return best;
}

function pushMobOffPlayerTile(mob){
  if (!mob || !mob.alive) return false;
  if (player.x !== mob.x || player.y !== mob.y) return false;
  const dirs4 = [[1,0],[-1,0],[0,1],[0,-1]];
  const dirs8 = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const candidates = dirs4.concat(dirs8);

  for (const [dx, dy] of candidates){
    const nx = mob.x + dx, ny = mob.y + dy;
    if (!mobTileWalkable(nx, ny)) continue;
    if (nx === player.x && ny === player.y) continue;
    if (mobs.some(o => o !== mob && o.alive && o.x===nx && o.y===ny)) continue;
    mob.x = nx; mob.y = ny;
    const c = tileCenter(nx, ny);
    mob.px = c.cx; mob.py = c.cy;
    return true;
  }

  // Fallback: if surrounded by mobs, still move off player even if it stacks with another mob.
  for (const [dx, dy] of candidates){
    const nx = mob.x + dx, ny = mob.y + dy;
    if (!mobTileWalkable(nx, ny)) continue;
    if (nx === player.x && ny === player.y) continue;
    mob.x = nx; mob.y = ny;
    const c = tileCenter(nx, ny);
    mob.px = c.cx; mob.py = c.cy;
    return true;
  }

  // Final fallback for boxed-in edge cases: snap back to home tile.
  if (Number.isFinite(mob.homeX) && Number.isFinite(mob.homeY)){
    const hx = mob.homeX|0, hy = mob.homeY|0;
    if (mobTileWalkable(hx, hy) && !(hx === player.x && hy === player.y)){
      mob.x = hx; mob.y = hy;
      const c = tileCenter(hx, hy);
      mob.px = c.cx; mob.py = c.cy;
      return true;
    }
  }
  return false;
}

function resolveMeleeTileOverlap(mob){
  if (!mob || !mob.alive) return false;
  if (player.x !== mob.x || player.y !== mob.y) return false;
  if (pushMobOffPlayerTile(mob)) return true;

  stopAction();
  return true;
}

// death penalty + respawn (tweak as you like)
function handlePlayerDeath(){
  const dx = player.x, dy = player.y;

  // drop 25% gold at death tile
  const lost = Math.max(0, Math.floor(getGold() * 0.25));
  if (lost > 0){
    wallet.gold = Math.max(0, (wallet.gold|0) - lost);
    renderGold();
    addGroundLoot(dx, dy, GOLD_ITEM_ID, lost);
  }

  chatLine(`<span class="warn">You have died.</span>`);

  player.hp = player.maxHp;
  player.x = startCastle.x0 + 6;
  player.y = startCastle.y0 + 4;
  player.path = [];
  player.target = null;
  player.action = {type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};

  player.attackCooldownUntil = now() + 800;
  player.invulnUntil = now() + 2500; // spawn protection
  syncPlayerPix();
}

function updateMobsAI(dt){
  const t = now();
  if (t < (player.invulnUntil || 0)) return;

  // safe zone around starter castle
  const playerSafe = inRectMargin(player.x, player.y, startCastle, 1);

  for (let i=0; i<mobs.length; i++){
    const m = mobs[i];
    if (!m.alive) continue;

    // backfill older saves
    if (!Number.isFinite(m.homeX) || !Number.isFinite(m.homeY)){
      m.homeX = m.x; m.homeY = m.y;
    }
    if (!Number.isFinite(m.provokedUntil)) m.provokedUntil = 0;
    if (!Number.isFinite(m.aggroUntil)) m.aggroUntil = 0;
    if (!Number.isFinite(m.attackCooldownUntil)) m.attackCooldownUntil = 0;
    if (!Number.isFinite(m.moveCooldownUntil)) m.moveCooldownUntil = 0;

    // pixel smoothing state
    if (!Number.isFinite(m.px) || !Number.isFinite(m.py)){
      const c = tileCenter(m.x, m.y);
      m.px = c.cx; m.py = c.cy;
    }

    const def = MOB_DEFS[m.type] ?? {};
    const typeKey = String(m.type || "").toLowerCase();
    const aggroRange  = Number.isFinite(def.aggroRange) ? def.aggroRange : 4.0;
    const leash       = Number.isFinite(def.leash) ? def.leash : 7.0;
    const attackRange = Number.isFinite(def.attackRange) ? def.attackRange : 1.15;
    const atkSpeed    = Number.isFinite(def.attackSpeedMs) ? def.attackSpeedMs : 1300;

    // key change: passive mobs won’t aggro unless hit
    const aggroOnSight = (typeKey === "rat") ? false : (def.aggroOnSight !== false);

    // smooth motion toward current tile center
    const moveSpeed = Number.isFinite(def.moveSpeed) ? def.moveSpeed : 140; // px/sec
    const c2 = tileCenter(m.x, m.y);
    const mcx = c2.cx, mcy = c2.cy;
    const dPix = dist(m.px, m.py, mcx, mcy);
    if (dPix > 0.5){
      const step = moveSpeed * dt;
      m.px += ((mcx - m.px) / dPix) * Math.min(step, dPix);
      m.py += ((mcy - m.py) / dPix) * Math.min(step, dPix);
    } else {
      m.px = mcx; m.py = mcy;
    }

    const dToPlayer      = tilesBetweenTiles(m.x, m.y, player.x, player.y);
    const dFromHome      = tilesBetweenTiles(m.x, m.y, m.homeX, m.homeY);
    const dPlayerFromHome= tilesBetweenTiles(player.x, player.y, m.homeX, m.homeY);

    const provoked = (t < m.provokedUntil);
    const engaged = (m.target === "player" && t < m.aggroUntil && (aggroOnSight || provoked));
    const playerTargetingThis = (player.target?.kind === "mob" && player.target.index === i);

    // Only resolve overlap while this mob is actually in combat with the player.
    if (m.x === player.x && m.y === player.y){
      if (m.target === "player" || playerTargetingThis){
        pushMobOffPlayerTile(m);
        if (m.x === player.x && m.y === player.y){
          m.target = null;
          m.aggroUntil = 0;
        }
      }
      continue;
    }

    // Acquire aggro from sight (aggressive mobs) or recent provocation (passive mobs).
    if (!engaged){
      if ((aggroOnSight || provoked) && !playerSafe && dToPlayer <= aggroRange){
        m.target = "player";
        m.aggroUntil = t + 12000;
      } else if (dFromHome > 0.05){
        // drift home if displaced
        if (t >= m.moveCooldownUntil){
          m.moveCooldownUntil = t + 420;
          mobStepToward(m, m.homeX, m.homeY);
        }
      }
           continue;
    }

    // leash / safe-zone break
    if (playerSafe || dFromHome > leash || dPlayerFromHome > leash){
      m.target = null;
      m.provokedUntil = 0;
      m.aggroUntil = 0;
      continue;
    }

    // keep aggro alive while nearby
    if (dToPlayer <= aggroRange + 1.0){
      m.aggroUntil = t + 12000;
      if (!aggroOnSight) m.provokedUntil = t + 12000;
    }

    const tileAdjacent = (Math.abs(player.x - m.x) <= 1 && Math.abs(player.y - m.y) <= 1);

    // Move into range
    if (dToPlayer > attackRange && !tileAdjacent){
      if (t >= m.moveCooldownUntil){
        m.moveCooldownUntil = t + 420;
        mobStepToward(m, player.x, player.y);
      }
      continue;
    }

    // Attack
    if (t < m.attackCooldownUntil) continue;
    m.attackCooldownUntil = t + atkSpeed;
    // Brief post-swing pause so mobs don't immediately step again after attacking.
    m.moveCooldownUntil = Math.max(m.moveCooldownUntil, t + Math.max(420, Math.floor(atkSpeed * 0.55)));

    const roll = rollMobAttack(m);
    if (roll.dmg <= 0){
      chatLine(`<span class="muted">${m.name} misses you.</span>`);
      continue;
    }

    player.hp = clamp(player.hp - roll.dmg, 0, player.maxHp);
    chatLine(`<span class="warn">${m.name} hits you for <b>${roll.dmg}</b>.</span>`);

    // Do not auto-set a combat target here; it can cause involuntary movement.
  }
}


  function updateFX(){
    const t=now();
    // gather
    for (let i=gatherParticles.length-1;i>=0;i--){
      const p=gatherParticles[i];
      if ((t - p.born) >= p.life){ gatherParticles.splice(i,1); continue; }
      const dt = 1/60;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += 80*dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    // combat
    for (let i=combatFX.length-1;i>=0;i--){
      const fx=combatFX[i];
      if ((t - fx.born) >= fx.life){ combatFX.splice(i,1); }
    }
  }

  function drawFX(){
    const t=now();

    // gather particles
    for (const p of gatherParticles){
      const age=(t-p.born)/p.life;
      const a = clamp(1-age,0,1);
      if (p.kind==="wood") ctx.fillStyle=`rgba(253, 230, 138, ${0.55*a})`;
      else ctx.fillStyle=`rgba(226, 232, 240, ${0.55*a})`;
      ctx.fillRect(p.x-1.5, p.y-1.5, 3, 3);
    }

    // combat FX
    for (const fx of combatFX){
      const age = clamp((t - fx.born) / fx.life, 0, 1);
      const a = clamp(1 - age, 0, 1);

      if (fx.kind === "slash"){
        const mx = (fx.x0 + fx.x1)/2;
        const my = (fx.y0 + fx.y1)/2;
        const dx = fx.x1 - fx.x0;
        const dy = fx.y1 - fx.y0;
        const len = Math.hypot(dx,dy) || 1;
        const nx = -dy/len;
        const ny = dx/len;
        const bend = 14 * Math.sin(age * Math.PI);

        ctx.strokeStyle = `rgba(251, 191, 36, ${0.70*a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(fx.x0, fx.y0);
        ctx.quadraticCurveTo(mx + nx*bend, my + ny*bend, fx.x1, fx.y1);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      if (fx.kind === "arrow" || fx.kind === "bolt"){
        const p = age;
        const x = fx.x0 + (fx.x1 - fx.x0) * p;
        const y = fx.y0 + (fx.y1 - fx.y0) * p;

        const dx = fx.x1 - fx.x0;
        const dy = fx.y1 - fx.y0;
        const ang = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);

        if (fx.kind === "arrow"){
          ctx.strokeStyle = `rgba(226, 232, 240, ${0.85*a})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-10,0); ctx.lineTo(8,0);
          ctx.stroke();
          ctx.fillStyle = `rgba(148, 163, 184, ${0.85*a})`;
          ctx.beginPath();
          ctx.moveTo(8,0); ctx.lineTo(3,-3); ctx.lineTo(3,3); ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = `rgba(34, 211, 238, ${0.85*a})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-10,0); ctx.lineTo(10,0);
          ctx.stroke();

          ctx.strokeStyle = `rgba(255,255,255, ${0.60*a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-8,-3); ctx.lineTo(6,-3);
          ctx.moveTo(-8,3); ctx.lineTo(6,3);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.restore();
      }
    }
  }

function ensureWalkIntoRangeAndAct(){
  const t = player.target;
  if (!t) return;

  // ---------- BANK ----------
  if (t.kind === "bank"){
    const b = interactables[t.index];
    if (!b) return stopAction();

    if (!inRangeOfTile(b.x, b.y, 1.1)){
      const adj = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx,dy])=>({x:b.x+dx,y:b.y+dy}))
        .filter(p=>isWalkable(p.x,p.y));
      if (!adj.length) return stopAction("No path to bank.");
      adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
      setPathTo(adj[0].x, adj[0].y);
      return;
    }

    if (player.action.type !== "idle") return;

    chatLine(`<span class="muted">You open the bank chest.</span>`);
    availability.bank = true;
    updateBankIcon();

    openWindow("bank");
    stopAction();
    return;
  }
   // ---------- VENDOR (TRADE) ----------
  if (t.kind === "vendor"){

    const v = interactables[t.index];
    if (!v) return stopAction();

    if (!inRangeOfTile(v.x, v.y, 1.1)){
      const adj = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx,dy])=>({x:v.x+dx,y:v.y+dy}))
        .filter(p=>isWalkable(p.x,p.y));
      if (!adj.length) return stopAction(`No path to vendor.`);
      adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
      setPathTo(adj[0].x, adj[0].y);
      return;
    }

    if (player.action.type !== "idle") return;

    chatLine(`<span class="muted">You start trading.</span>`);
    openWindow("vendor");
    renderVendorUI();

    stopAction();
    return;
  }
  

// ---------- FURNACE ----------
if (t.kind === "furnace"){
  const fz = interactables[t.index];
  if (!fz) return stopAction();

  if (!inRangeOfTile(fz.x, fz.y, 1.1)){
    const adj = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({x:fz.x+dx,y:fz.y+dy}))
      .filter(p=>isWalkable(p.x,p.y));
    if (!adj.length) return stopAction("No path to furnace.");
    adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
    setPathTo(adj[0].x, adj[0].y);
    return;
  }

  player.facing.x = clamp(fz.x - player.x, -1, 1);
  player.facing.y = clamp(fz.y - player.y, -1, 1);

  if (player.action.type !== "idle") return;

  chatLine(`<span class="muted">The furnace is cold. (Smithing coming soon.)</span>`);
  stopAction();
  return;
}

// ---------- ANVIL ----------
if (t.kind === "anvil"){
  const av = interactables[t.index];
  if (!av) return stopAction();

  if (!inRangeOfTile(av.x, av.y, 1.1)){
    const adj = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({x:av.x+dx,y:av.y+dy}))
      .filter(p=>isWalkable(p.x,p.y));
    if (!adj.length) return stopAction("No path to anvil.");
    adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
    setPathTo(adj[0].x, adj[0].y);
    return;
  }

  player.facing.x = clamp(av.x - player.x, -1, 1);
  player.facing.y = clamp(av.y - player.y, -1, 1);

  if (player.action.type !== "idle") return;

  chatLine(`<span class="muted">You inspect the anvil. (Smithing coming soon.)</span>`);
  stopAction();
  return;
}

// ---------- CAMPFIRE ----------
  if (t.kind === "fire"){
    const f = interactables[t.index];
    if (!f) return stopAction();

    if (!inRangeOfTile(f.x, f.y, 1.1)){
      const adj = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx,dy])=>({x:f.x+dx,y:f.y+dy}))
        .filter(p=>isWalkable(p.x,p.y));
      if (!adj.length) return stopAction("No path to fire.");
      adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
      setPathTo(adj[0].x, adj[0].y);
      return;
    }

    player.facing.x = clamp(f.x - player.x, -1, 1);
    player.facing.y = clamp(f.y - player.y, -1, 1);

    if (player.action.type !== "idle") return;

   // Prefer the currently selected "Use:" item if it's cookable.
const useCookable = (useState.activeItemId && COOK_RECIPES[useState.activeItemId] && hasItem(useState.activeItemId))
  ? useState.activeItemId
  : null;

// Fallback: cook *something* if you have it
const cookId =
  useCookable ||
  (hasItem("rat_meat") ? "rat_meat" :
  (hasItem("goldfish") ? "goldfish" : null));

if (!cookId){
  chatLine(`<span class="muted">The fire crackles.</span>`);
  stopAction();
  return;
}

const rec = COOK_RECIPES[cookId];
chatLine(`You cook over the fire...`);
startTimedAction("cook", 1400, "Cooking...", () => {
  // consume 1 raw item
  if (!removeItemsFromInventory(cookId, 1)){
    chatLine(`<span class="warn">You need ${Items[cookId]?.name ?? cookId}.</span>`);
    return;
  }

  // if you used the "Use:" state to pick this item, clear it after the cook
  if (useState.activeItemId === cookId) setUseState(null);

  const got = addToInventory(rec.out, 1);
  if (got === 1){
    addXP("cooking", rec.xp);
    chatLine(`<span class="good">You ${rec.verb}.</span> (+${rec.xp} XP)`);
  } else {
    // drop on *your* tile (not in the river / unreachable)
    addGroundLoot(player.x, player.y, rec.out, 1);
    addXP("cooking", rec.xp);
    chatLine(`<span class="warn">Inventory full: ${Items[rec.out].name}</span> (+${rec.xp} XP)`);
  }
});


    return;
  }
// ---------- FISHING ----------
if (t.kind === "fish"){
  const spot = interactables[t.index];
  if (!spot) return stopAction();

  if (!inRangeOfTile(spot.x, spot.y, 1.25)){
    const adj = [[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({x:spot.x+dx,y:spot.y+dy}))
      .filter(p=>isWalkable(p.x,p.y));
    if (!adj.length) return stopAction("No path to fishing spot.");
    adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
    setPathTo(adj[0].x, adj[0].y);
    return;
  }

  player.facing.x = clamp(spot.x - player.x, -1, 1);
  player.facing.y = clamp(spot.y - player.y, -1, 1);

  if (player.action.type !== "idle") return;

  const lvl = levelFromXP(Skills.fishing.xp);
  if (lvl < 1){
    stopAction("Your Fishing level is too low.");
    return;
  }

  // Goldfish stack; allow fishing if you already have a stack even when inv is full.
  if (!hasItem("goldfish") && emptyInvSlots() <= 0){
    stopAction("Inventory full.");
    return;
  }

  startTimedAction("fish", 1600, "Fishing...", () => {
    const lvlNow = levelFromXP(Skills.fishing.xp);

    // simple RS-like catch chance
    const chance = clamp(0.35 + lvlNow * 0.05, 0.35, 0.90);
    if (Math.random() > chance){
      chatLine(`<span class="muted">You fail to catch anything.</span>`);
      return;
    }

    const got = addToInventory("goldfish", 1);
    if (got === 1){
      addXP("fishing", 18);
      chatLine(`<span class="good">You catch a gold fish.</span> (+18 XP)`);
    } else {
      addGroundLoot(player.x, player.y, "goldfish", 1);
      addXP("fishing", 18);
      chatLine(`<span class="warn">Inventory full: ${Items.goldfish.name}</span> (+18 XP)`);
    }
  });

  return;
}

  // ---------- RESOURCES ----------
  if (t.kind==="res"){
    const r = resources[t.index];
    if (!r || !r.alive) return stopAction("That resource is gone.");
    if (r.type==="tree" && !hasItem("axe")) return stopAction("You need an axe.");
    if (r.type==="rock" && !hasItem("pick")) return stopAction("You need a pick.");

    if (!inRangeOfTile(r.x, r.y, 1.1)){
      const adj = [[1,0],[-1,0],[0,1],[0,-1]]
        .map(([dx,dy])=>({x:r.x+dx,y:r.y+dy}))
        .filter(p=>isWalkable(p.x,p.y));
      if (!adj.length) return stopAction("No path to target.");
      adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
      setPathTo(adj[0].x, adj[0].y);
      return;
    }

    player.facing.x = clamp(r.x - player.x, -1, 1);
    player.facing.y = clamp(r.y - player.y, -1, 1);

    if (player.action.type !== "idle") return;

    if (r.type==="tree"){
      chatLine(`You swing your axe at the tree...`);
      startTimedAction("woodcut", 1400, "Chopping...", () => {
        r.alive=false; r.respawnAt=now()+9000;

        const got = addToInventory("log", 1);
        if (got === 1){
          addXP("woodcutting", 35);
          chatLine(`<span class="good">You get a log.</span> (+35 XP)`);
        } else {
          addGroundLoot(r.x, r.y, "log", 1);
          chatLine(`<span class="warn">Inventory full: ${Items.log.name}</span>`);
        }
      });
    } else {
      chatLine(`You chip away at the rock...`);
      startTimedAction("mine", 1600, "Mining...", () => {
        r.alive=false; r.respawnAt=now()+11000;

        const got = addToInventory("ore", 1);
        if (got === 1){
          addXP("mining", 40);
          chatLine(`<span class="good">You get some ore.</span> (+40 XP)`);
        } else {
          addGroundLoot(r.x, r.y, "ore", 1);
          chatLine(`<span class="warn">Inventory full: ${Items.ore.name}</span>`);
        }
      });
    }
    return;
  }

  // ---------- MOBS ----------
  if (t.kind==="mob"){
    const m=mobs[t.index];
    if (!m || !m.alive) return stopAction("That creature is gone.");

    const tNow = now();
const style = getCombatStyle();
if (style === "melee" && resolveMeleeTileOverlap(m)) return;
const maxRangeTiles = (style === "melee") ? 1.15 : 5.0;
const dTiles = tilesFromPlayerToTile(m.x, m.y);


    if (dTiles > maxRangeTiles){
  // Prevent “freeze” from pathfinding spam when unreachable
  if (tNow < (player._pathTryUntil || 0)) return;
  player._pathTryUntil = tNow + 200; // ms throttle

      if (style !== "melee"){
        const tNow = now();
        if (!player._lastRangeMsgAt || (tNow - player._lastRangeMsgAt) > 900){
          chatLine(`<span class="warn">Out of range (max 5).</span>`);
          player._lastRangeMsgAt = tNow;
        }
        const best = findBestTileWithinRange(m.x, m.y, 5.0);
        if (!best) return stopAction("No path to target.");
        player.path = best.path;
        return;
      }

      const best = findBestMeleeEngagePath(m);
      if (!best) return stopAction("No path to target.");
      player.path = best.path;
return;

    }

    if (style === "melee" && resolveMeleeTileOverlap(m)) return;

    player.facing.x = clamp(m.x - player.x, -1, 1);
    player.facing.y = clamp(m.y - player.y, -1, 1);

    
    if (tNow < player.attackCooldownUntil) return;
    player.attackCooldownUntil = tNow + 900;

    if (style === "ranged"){
      if (!consumeFromQuiver("wooden_arrow", 1)){
        chatLine(`<span class="warn">No arrows.</span>`);
        return stopAction();
      }
    }

// engage mob so it can retaliate (safe even if you haven’t added AI yet)
m.target = "player";
m.provokedUntil = tNow + 15000;
m.aggroUntil = tNow + 15000;

const roll = rollPlayerAttack(style, m);

if (style === "melee") spawnCombatFX("slash", m.x, m.y);
if (style === "ranged") spawnCombatFX("arrow", m.x, m.y);
if (style === "magic") spawnCombatFX("bolt", m.x, m.y);

const mobName = (m.name || "creature").toLowerCase();

if (!roll.hit || roll.dmg <= 0){
  if (style === "magic"){
    chatLine(`Your <b>Air Bolt</b> splashes harmlessly on the ${mobName}.`);
  } else if (style === "ranged"){
    chatLine(`You shoot and miss the ${mobName}.`);
  } else {
    chatLine(`You swing and miss the ${mobName}.`);
  }
  return;
}

const dmg = roll.dmg;
m.hp = Math.max(0, m.hp - dmg);

addXP("health", dmg);

if (style === "melee"){
  addXP(meleeState.selected, dmg);
} else if (style === "ranged"){
  addXP("ranged", dmg);
} else {
  addXP("sorcery", dmg);
}

if (style === "magic"){
  chatLine(`You cast <b>Air Bolt</b> at the ${mobName} for <b>${dmg}</b>.`);
} else if (style === "ranged"){
  chatLine(`You shoot the ${mobName} for <b>${dmg}</b>.`);
} else {
  chatLine(`You hit the ${mobName} for <b>${dmg}</b>.`);
}

    if (m.hp <= 0){
      m.alive=false; m.respawnAt=now()+12000; m.hp=0;
      m.target = null;
      m.provokedUntil = 0;
      m.aggroUntil = 0;
      m.attackCooldownUntil = 0;
      m.moveCooldownUntil = 0;
      chatLine(`<span class="good">You defeat the rat.</span>`);
      // Extra drop: raw rat meat
      if (Math.random() < 0.55){
        const got = addToInventory("rat_meat", 1);
        if (got === 1){
          chatLine(`<span class="good">The rat drops raw meat.</span>`);
        } else {
          addGroundLoot(m.x, m.y, "rat_meat", 1);
          chatLine(`<span class="warn">Inventory full: ${Items.rat_meat.name}</span>`);
        }
      }


      if (Math.random() < 0.75){
        const got = addToInventory("bone", 1);
        if (got === 1){
          chatLine(`<span class="good">The rat drops a bone.</span>`);
        } else {
          addGroundLoot(m.x, m.y, "bone", 1);
          chatLine(`<span class="warn">Inventory full: ${Items.bone.name}</span>`);
        }
        if (Math.random() < 0.65){
  const g = 1 + Math.floor(Math.random()*8);
  addGold(g);
  chatLine(`<span class="good">You gain ${g} gold.</span>`);
}

      }

      stopAction();
    }
  }
}


  function inRangeOfCurrentTarget(){
    const t=player.target;
    if (!t) return false;
    if (t.kind==="res"){
      const r=resources[t.index];
      if (!r || !r.alive) return false;
      return inRangeOfTile(r.x,r.y,1.1);
    }
    if (t.kind==="mob"){
      const m=mobs[t.index];
      if (!m || !m.alive) return false;
      const style = getCombatStyle();
      const maxRange = (style === "melee") ? 1.15 : 5.0;
      return tilesFromPlayerToTile(m.x, m.y) <= maxRange;
    }
    if (t.kind==="bank"){
      const b=interactables[t.index];
      if (!b) return false;
      return inRangeOfTile(b.x,b.y,1.1);
    }
    return false;
  }

  // ---------- Auto-loot nearby ground piles ----------
  function attemptAutoLoot(){
    // try to loot any pile within 1.25 tiles
    const range = 1.25;
    const px = player.x, py = player.y;

// To avoid iterating entire map, iterate piles and early cull
    for (const [k, pile] of groundLoot.entries()){

// skip/remove expired piles (extra safety)
const tNow = now();
if (Number.isFinite(pile.expiresAt) && tNow >= pile.expiresAt){
  groundLoot.delete(k);
  continue;
}

      if (!pile || pile.size===0) continue;
      const [sx,sy] = k.split(",").map(n=>parseInt(n,10));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      const d = tilesFromPlayerToTile(sx, sy);

// If this tile was created via a manual "Drop" action, don't auto-loot it until
// the player walks out of range (prevents instant re-pickup).
if (manualDropLocks.has(k)){
  if (d > range) manualDropLocks.delete(k);
  else continue;
}


      if (d > range) continue;


      // in range: try to pick up each item
      for (const [id, qty0] of Array.from(pile.entries())){
        let qty = qty0|0;
        if (qty<=0){ pile.delete(id); continue; }

       const item = Items[id];
if (!item){ pile.delete(id); continue; }

// gold goes to wallet (does not take inventory slots)
if (id === GOLD_ITEM_ID){
  addGold(qty);
  pile.delete(id);
  continue;
}

if (item.ammo){
  // quiver always accepts
  addToQuiver(id, qty);
  pile.delete(id);
  continue;
}


        // addToInventory adds one-per-slot for non-ammo; returns how many added
        const added = addToInventory(id, qty);
        if (added > 0){
          qty -= added;
          if (qty <= 0) pile.delete(id);
          else pile.set(id, qty);
        }

        if (qty > 0){
          // still leftover => inventory full
          const tNow = now();
          if ((tNow - lootUi.lastInvFullMsgAt) > 700 || lootUi.lastInvFullMsgItem !== id){
            chatLine(`<span class="warn">Inventory full: ${item.name}</span>`);
            lootUi.lastInvFullMsgAt = tNow;
            lootUi.lastInvFullMsgItem = id;
          }
          // stop trying further items this tick if full
          break;
        }
      }
      cleanupLootPileAt(sx, sy);
    }
  }

  // ---------- Rendering helpers ----------
  function visibleTileBounds(){
    const vw=viewWorldW(), vh=viewWorldH();
    const startX = clamp(Math.floor(camera.x / TILE) - 1, 0, W-1);
    const startY = clamp(Math.floor(camera.y / TILE) - 1, 0, H-1);
    const endX   = clamp(Math.ceil((camera.x + vw) / TILE) + 1, 0, W);
    const endY   = clamp(Math.ceil((camera.y + vh) / TILE) + 1, 0, H);
    return { startX, startY, endX, endY };
  }

  function drawMap(){
    const tAnim = Math.floor(performance.now()/350);
    const {startX,startY,endX,endY}=visibleTileBounds();

    for (let y=startY; y<endY; y++){
      for (let x=startX; x<endX; x++){
        const t=map[y][x];
        const px=x*TILE, py=y*TILE;
        const n=(x*17+y*31+((x+y)*7))%10;

        if (t===0){
          const base=((x+y)%2===0) ? "#12301e" : "#102b1b";
          ctx.fillStyle=base;
          ctx.fillRect(px,py,TILE,TILE);
          if (n===0 || n===7){
            ctx.fillStyle="rgba(255,255,255,.04)";
            ctx.fillRect(px+6,py+10,2,2);
            ctx.fillRect(px+18,py+20,2,2);
          }
        } else if (t===1){
          ctx.fillStyle="#0d2a3d";
          ctx.fillRect(px,py,TILE,TILE);
          const wave=(x+tAnim+y)%4;
          if (wave===0){
            ctx.fillStyle="rgba(255,255,255,.06)";
            ctx.fillRect(px,py+8,TILE,2);
          } else if (wave===2){
            ctx.fillStyle="rgba(255,255,255,.04)";
            ctx.fillRect(px,py+18,TILE,2);
          }
        } else if (t===2){
          ctx.fillStyle="#2a2f3a";
          ctx.fillRect(px,py,TILE,TILE);
          ctx.fillStyle="rgba(255,255,255,.06)";
          if (n%3===0) ctx.fillRect(px+6,py+7,3,2);
          if (n%4===0) ctx.fillRect(px+18,py+19,4,2);
        } else if (t===3){
          const base=((x+y)%2===0) ? "#4b5563" : "#46505d";
          ctx.fillStyle=base;
          ctx.fillRect(px,py,TILE,TILE);
          if (n===2){
            ctx.strokeStyle="rgba(0,0,0,.25)";
            ctx.beginPath();
            ctx.moveTo(px+6,py+20);
            ctx.lineTo(px+14,py+12);
            ctx.lineTo(px+22,py+16);
            ctx.stroke();
          }
        } else if (t===4){
          ctx.fillStyle="#374151";
          ctx.fillRect(px,py,TILE,TILE);
          ctx.strokeStyle="rgba(0,0,0,.30)";
          ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);

          ctx.strokeStyle="rgba(255,255,255,.07)";
          ctx.beginPath();
          ctx.moveTo(px+2,py+10); ctx.lineTo(px+TILE-2,py+10);
          ctx.moveTo(px+2,py+22); ctx.lineTo(px+TILE-2,py+22);
          ctx.stroke();

          if (y%2===0){
            ctx.beginPath();
            ctx.moveTo(px+16,py+2); ctx.lineTo(px+16,py+10);
            ctx.moveTo(px+8,py+10); ctx.lineTo(px+8,py+22);
            ctx.moveTo(px+24,py+10); ctx.lineTo(px+24,py+22);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(px+8,py+2); ctx.lineTo(px+8,py+10);
            ctx.moveTo(px+24,py+2); ctx.lineTo(px+24,py+10);
            ctx.moveTo(px+16,py+10); ctx.lineTo(px+16,py+22);
            ctx.stroke();
          }
        } else if (t===5){
          const isBridge=(y===RIVER_Y || y===RIVER_Y+1);
          if (isBridge){
            ctx.fillStyle="#3b2f22";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle="rgba(240,220,120,.18)";
            for (let i=0;i<4;i++) ctx.fillRect(px+2,py+4+i*7,TILE-4,2);
            ctx.fillStyle="rgba(0,0,0,.25)";
            ctx.fillRect(px+2,py+2,2,TILE-4);
            ctx.fillRect(px+TILE-4,py+2,2,TILE-4);
          } else {
            const upT = (y>0) ? map[y-1][x] : -1;
            const dnT = (y<H-1) ? map[y+1][x] : -1;
            const lfT = (x>0) ? map[y][x-1] : -1;
            const rtT = (x<W-1) ? map[y][x+1] : -1;
            const up = upT===5, dn = dnT===5, lf = lfT===5, rt = rtT===5;
            const vertical = up || dn;
            const horizontal = lf || rt;

            const base = ((x+y)%2===0) ? "#4b3928" : "#463523";
            ctx.fillStyle=base;
            ctx.fillRect(px,py,TILE,TILE);

            // Static soil grain (no time-based animation to avoid strobing).
            if ((n%2)===0){
              ctx.fillStyle="rgba(0,0,0,.07)";
              ctx.fillRect(px+6,py+7,2,2);
              ctx.fillRect(px+22,py+18,2,2);
            }
            if ((n%3)===1){
              ctx.fillStyle="rgba(240,216,160,.09)";
              ctx.fillRect(px+13,py+10,2,1);
              ctx.fillRect(px+18,py+22,1,1);
            }

            // Soft boundary where grass starts so roads do not look grid-cut.
            if (!up){
              ctx.fillStyle = (upT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
              ctx.fillRect(px,py,TILE,2);
            }
            if (!dn){
              ctx.fillStyle = (dnT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
              ctx.fillRect(px,py+TILE-2,TILE,2);
            }
            if (!lf){
              ctx.fillStyle = (lfT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
              ctx.fillRect(px,py,2,TILE);
            }
            if (!rt){
              ctx.fillStyle = (rtT===0) ? "rgba(18,48,30,.18)" : "rgba(0,0,0,.14)";
              ctx.fillRect(px+TILE-2,py,2,TILE);
            }

            // Ruts make directionality feel less blocky.
            ctx.fillStyle="rgba(23,15,10,.18)";
            if (vertical && !horizontal){
              ctx.fillRect(px+11,py+4,2,TILE-8);
              ctx.fillRect(px+19,py+4,2,TILE-8);
            } else if (horizontal && !vertical){
              ctx.fillRect(px+4,py+11,TILE-8,2);
              ctx.fillRect(px+4,py+19,TILE-8,2);
            } else {
              ctx.fillRect(px+11,py+11,2,2);
              ctx.fillRect(px+19,py+19,2,2);
            }
          }
        }

        ctx.strokeStyle="rgba(255,255,255,.03)";
        ctx.strokeRect(px,py,TILE,TILE);
      }
    }
  }

  function drawResources(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const r of resources){
      if (!r.alive) continue;
      if (r.x<startX-1 || r.x>endX+1 || r.y<startY-1 || r.y>endY+1) continue;

      if (r.type==="tree"){
        ctx.fillStyle="#1f6f3e";
        ctx.beginPath();
        ctx.arc(r.x*TILE+TILE/2, r.y*TILE+TILE/2, 12, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle="#6b3f2a";
        ctx.fillRect(r.x*TILE+TILE/2-3, r.y*TILE+TILE/2+6, 6, 10);
      } else {
        ctx.fillStyle="#7a8191";
        ctx.beginPath();
        ctx.moveTo(r.x*TILE+10, r.y*TILE+22);
        ctx.lineTo(r.x*TILE+16, r.y*TILE+10);
        ctx.lineTo(r.x*TILE+24, r.y*TILE+16);
        ctx.lineTo(r.x*TILE+22, r.y*TILE+26);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRat(m){
     const cx = (Number.isFinite(m.px) ? m.px : (m.x*TILE+TILE/2));
    const cy = (Number.isFinite(m.py) ? m.py : (m.y*TILE+TILE/2));
    const px = cx - TILE/2;
    const py = cy - TILE/2;


    ctx.strokeStyle="rgba(250, 204, 211, .9)";
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(cx-10, cy+6);
    ctx.quadraticCurveTo(cx-18, cy+14, cx-24, cy+18);
    ctx.stroke();
    ctx.lineWidth=1;

    ctx.fillStyle="#d1d5db";
    ctx.beginPath();
    ctx.ellipse(cx, cy+2, 12, 8, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx+10, cy-2, 6, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#fda4af";
    ctx.beginPath();
    ctx.arc(cx+13, cy-7, 2.5, 0, Math.PI*2);
    ctx.arc(cx+8, cy-8, 2.2, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle="rgba(0,0,0,.6)";
    ctx.beginPath();
    ctx.arc(cx+12, cy-3, 1.2, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#fb7185";
    ctx.beginPath();
    ctx.arc(cx+16, cy-1, 1.3, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle="rgba(0,0,0,.5)";
     ctx.fillRect(px+6, py+4, TILE-12, 5);
    ctx.fillStyle="#fb7185";
    const w = clamp((m.hp/m.maxHp)*(TILE-12), 0, TILE-12);
    ctx.fillRect(px+6, py+4, w, 5);
  }

  function drawMobs(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const m of mobs){
      if (!m.alive) continue;
      if (m.x<startX-1 || m.x>endX+1 || m.y<startY-1 || m.y>endY+1) continue;
      if (m.type==="rat") drawRat(m);
    }
  }

  function drawBankChest(x,y){
    const px=x*TILE, py=y*TILE;
    ctx.fillStyle="#8b5a2b";
    ctx.fillRect(px+6, py+12, 20, 14);
    ctx.fillStyle="#a16207";
    ctx.fillRect(px+6, py+8, 20, 8);
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.fillRect(px+10, py+8, 3, 18);
    ctx.fillRect(px+19, py+8, 3, 18);
    ctx.fillStyle="#fbbf24";
    ctx.fillRect(px+15, py+16, 2, 6);
  }

 function drawFurnace(x,y){
  const px=x*TILE, py=y*TILE;
  const t = now();
  const flick = 0.75 + 0.25*Math.sin(t*0.012 + x*3.1 + y*2.7);

  // stone body
  ctx.fillStyle="#1f2937";
  ctx.fillRect(px+5, py+10, 22, 18);
  ctx.fillStyle="rgba(255,255,255,.06)";
  ctx.fillRect(px+6, py+11, 20, 2);

  // top cap
  ctx.fillStyle="#111827";
  ctx.fillRect(px+7, py+7, 18, 4);

  // chimney
  ctx.fillStyle="#0b1220";
  ctx.fillRect(px+11, py+4, 10, 4);

  // opening
  ctx.fillStyle="#0b0f14";
  ctx.fillRect(px+11, py+18, 10, 8);

  // glow (animated)
  ctx.fillStyle=`rgba(249,115,22,${0.65*flick})`;
  ctx.fillRect(px+12, py+19, 8, 6);
  ctx.fillStyle=`rgba(251,191,36,${0.55*flick})`;
  ctx.fillRect(px+13, py+20, 6, 4);

  // little sparks
  ctx.fillStyle=`rgba(253,230,138,${0.35*flick})`;
  ctx.fillRect(px+15, py+15, 1, 1);
  ctx.fillRect(px+18, py+14, 1, 1);
}

function drawAnvil(x,y){
  const px=x*TILE, py=y*TILE;

  // stump/base
  ctx.fillStyle="#7c4a24";
  ctx.fillRect(px+12, py+18, 8, 10);
  ctx.fillStyle="rgba(0,0,0,.18)";
  ctx.fillRect(px+12, py+18, 2, 10);

  // anvil body
  ctx.fillStyle="#9ca3af";
  ctx.fillRect(px+9, py+14, 14, 4);
  ctx.fillRect(px+11, py+11, 10, 4);

  // horn
  ctx.fillRect(px+22, py+13, 4, 3);
  ctx.fillStyle="#6b7280";
  ctx.fillRect(px+23, py+12, 3, 2);

  // highlight
  ctx.fillStyle="rgba(255,255,255,.10)";
  ctx.fillRect(px+11, py+12, 9, 1);

  // shadow
  ctx.fillStyle="rgba(0,0,0,.22)";
  ctx.fillRect(px+10, py+18, 12, 1);
}

 function drawInteractables(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const it of interactables){
      if (it.x<startX-1 || it.x>endX+1 || it.y<startY-1 || it.y>endY+1) continue;
      if (it.type==="bank") drawBankChest(it.x,it.y);
if (it.type==="furnace") drawFurnace(it.x,it.y);
if (it.type==="anvil")   drawAnvil(it.x,it.y);


      if (it.type==="fire"){
  const cx = it.x * TILE + TILE/2;
  const cy = it.y * TILE + TILE/2;

  const t = now();
  const born = (it.createdAt ?? (it.createdAt = t));
  const expires = (it.expiresAt ?? (it.expiresAt = born + 60000));
  const age = t - born;

  // fade out during the last ~4 seconds
  const fade = clamp((expires - t) / 4000, 0, 1);

  ctx.save();
  ctx.translate(cx, cy);

  // soft ground glow (animated)
  const flick = 0.90 + 0.10*Math.sin(age*0.018) + 0.06*Math.sin(age*0.041);
  const glowR = 10 + 5*flick;

  const g = ctx.createRadialGradient(0, 7, 1, 0, 7, glowR*2.3);
  g.addColorStop(0, `rgba(251,191,36,${0.55*fade})`);
  g.addColorStop(0.35, `rgba(249,115,22,${0.30*fade})`);
  g.addColorStop(1, `rgba(0,0,0,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 7, glowR*2.3, 0, Math.PI*2);
  ctx.fill();

  // ember base
  ctx.fillStyle = `rgba(17,24,39,${0.45*fade})`;
  ctx.beginPath();
  ctx.ellipse(0, 9, 11, 4, 0, 0, Math.PI*2);
  ctx.fill();

  // flame body (stacked blobs, flicker + sway)
  const sway = Math.sin(age*0.010) * 1.6;

  // outer flame
  ctx.fillStyle = `rgba(249,115,22,${0.85*fade})`;
  ctx.beginPath();
  ctx.ellipse(sway*0.7, 2, 7, 9, 0, 0, Math.PI*2);
  ctx.ellipse(sway*0.9, -4, 5.5, 7.5, 0, 0, Math.PI*2);
  ctx.ellipse(sway*1.2, -10, 4.0, 6.0, 0, 0, Math.PI*2);
  ctx.fill();

  // inner flame
  ctx.fillStyle = `rgba(251,191,36,${0.90*fade})`;
  ctx.beginPath();
  ctx.ellipse(sway*0.6, 1, 4.8, 6.8, 0, 0, Math.PI*2);
  ctx.ellipse(sway*0.8, -6, 3.6, 5.2, 0, 0, Math.PI*2);
  ctx.fill();

  // a couple tiny sparks
  for (let i=0; i<3; i++){
    const phase = age*0.006 + i*2.2;
    const px = Math.sin(phase) * 7;
    const py = -8 - ((age*0.03 + i*9) % 14);
    const a = fade * (0.35 + 0.25*Math.sin(phase*1.7));
    ctx.fillStyle = `rgba(253,230,138,${clamp(a,0,1)})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.2, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

if (it.type === "fish"){
  const cx = it.x * TILE + TILE/2;
  const cy = it.y * TILE + TILE/2;
  const t = now();
  const phase = (t/260) + (it.x*0.7 + it.y*1.1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.85;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(147,197,253,0.85)";
  for (let r=0; r<2; r++){
    const rr = 6 + r*4 + (Math.sin(phase + r)*1.5);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(248,250,252,0.9)";
  ctx.beginPath();
  ctx.arc(2, -2, 1.2, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}


if (it.type === "vendor"){
  // vendor marker (draw in WORLD coords; camera/zoom already handled by ctx transform)
  const cx = it.x * TILE + TILE/2;
  const cy = it.y * TILE + TILE/2;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI*2);
  ctx.fillStyle = "#7c3aed";
  ctx.fill();

  ctx.fillStyle = "rgba(17,24,39,.95)";
  ctx.strokeStyle = "rgba(17,24,39,.95)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(-4, -2);
  ctx.lineTo(4, -2);
  ctx.lineTo(3, 3);
  ctx.lineTo(-3, 3);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-2, 5, 1.5, 0, Math.PI*2);
  ctx.arc(2, 5, 1.5, 0, Math.PI*2);
  ctx.stroke();

  ctx.restore();
}

    }
  }

  function drawLootMarkers(){
    // subtle marker on tiles that have loot
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const [k,pile] of groundLoot.entries()){
const tNow = now();
if (Number.isFinite(pile.expiresAt) && tNow >= pile.expiresAt){
  groundLoot.delete(k);
  continue;
}

      if (!pile || pile.size===0) continue;
      const [x,y]=k.split(",").map(n=>parseInt(n,10));
      if (!inBounds(x,y)) continue;
      if (x<startX-1 || x>endX+1 || y<startY-1 || y>endY+1) continue;

      ctx.fillStyle="rgba(94,234,212,.20)";
      ctx.beginPath();
      ctx.arc(x*TILE+TILE/2, y*TILE+TILE/2, 6, 0, Math.PI*2);
      ctx.fill();
    }
  }
function drawPlayerWeapon(cx, cy, fx, fy){
  // position weapon slightly to the side you're "favoring"
  const side = (fx !== 0) ? fx : 1; // default right if facing up/down
  const wx = cx + side * 10;
  const wy = cy + 2;

  if (player.class === "Warrior"){
    // sword
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(wx-1, wy-10, 2, 12);          // blade
    ctx.fillStyle = "#a16207";
    ctx.fillRect(wx-3, wy+1, 6, 2);            // guard
    ctx.fillStyle = "#854d0e";
    ctx.fillRect(wx-1, wy+3, 2, 5);            // handle
    } else if (player.class === "Ranger"){
    // bow (flip when facing left)
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(side, 1); // side is -1 when facing left, +1 when facing right

    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-2, -2, 8, -0.9, 0.9);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.65)"; // string
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.lineTo(4, 6);
    ctx.stroke();

    ctx.restore();

  } else {
    // staff (Mage)
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.arc(wx, wy-10, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#a16207";
    ctx.fillRect(wx-1, wy-8, 2, 16);
  }
}

  function drawPlayer(){
  const t = now();
  const moving = !!(player.path && player.path.length);
  const bob = moving ? Math.sin(t*0.015)*1.2 : Math.sin(t*0.008)*0.35;
  const step = moving ? Math.sin(t*0.030) : 0;

  const cx = player.px;
  const cy = player.py + bob;

  const fx = player.facing.x || 0;
  const fy = player.facing.y || 1;

  // shadow
  ctx.fillStyle="rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy+14, 10 + Math.abs(step)*1.5, 5, 0, 0, Math.PI*2);
  ctx.fill();



  // boots (2-frame walk illusion)
  const footY = cy+12;
  const lift = moving ? (step>0 ? 1.5 : -1.5) : 0;
  ctx.fillStyle = "#111827";
  ctx.fillRect(cx-8, footY + lift, 6, 3);
  ctx.fillRect(cx+2, footY - lift, 6, 3);

  // torso
  ctx.fillStyle="rgba(17,24,39,.88)";
  ctx.beginPath();
  ctx.ellipse(cx, cy+6, 7.5, 9, 0, 0, Math.PI*2);
  ctx.fill();

  // torso outline
  ctx.strokeStyle="rgba(0,0,0,.45)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.ellipse(cx, cy+6, 7.5, 9, 0, 0, Math.PI*2);
  ctx.stroke();

  // head
  const headY = cy-6;
  ctx.fillStyle="#f2c9a0";
  ctx.beginPath();
  ctx.arc(cx, headY, 7, 0, Math.PI*2);
  ctx.fill();

  // head outline
  ctx.strokeStyle="rgba(0,0,0,.45)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.arc(cx, headY, 7, 0, Math.PI*2);
  ctx.stroke();

  // hood/hair tint (uses class color, but only on the top half)
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(cx, headY-1, 7.3, Math.PI, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // eyes: look in facing direction so it feels alive
  const lookX = clamp(fx, -1, 1) * 1.2;
  const lookY = clamp(fy, -1, 1) * 0.6;
  ctx.fillStyle="rgba(0,0,0,.65)";
  ctx.beginPath();
  ctx.arc(cx-2 + lookX, headY-1 + lookY, 1.1, 0, Math.PI*2);
  ctx.arc(cx+2 + lookX, headY-1 + lookY, 1.1, 0, Math.PI*2);
  ctx.fill();

  // belt accent
  ctx.strokeStyle="rgba(251,191,36,.85)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(cx-5, cy+7);
  ctx.lineTo(cx+5, cy+7);
  ctx.stroke();

  // weapon (don’t show if you’re already drawing an axe/pick swing)
  const a = player.action;
  const doingTool = (a.type==="woodcut" || a.type==="mine");
  if (!doingTool){
    drawPlayerWeapon(cx, cy+4, fx, fy);
  }

  // path preview (keep your existing behavior)
  if (player.path && player.path.length){
    ctx.fillStyle="rgba(94,234,212,.25)";
    for (const n of player.path) ctx.fillRect(n.x*TILE+10, n.y*TILE+10, 12, 12);
  }

  // keep your existing chop/mine swing drawing
  if (a.type==="woodcut" || a.type==="mine"){
    const pct = actionProgress();
    const swing = Math.sin(pct * Math.PI) * 1.0;
    const dx = player.facing.x || 0;
    const dy = player.facing.y || 1;

    const ox = player.px + dx*10;
    const oy = player.py + dy*10;

    ctx.save();
    ctx.translate(ox, oy);
    const baseAng = Math.atan2(dy, dx);
    const ang = baseAng + (-0.9 + swing*1.8);
    ctx.rotate(ang);

    ctx.fillStyle="rgba(0,0,0,.35)";
    ctx.fillRect(-2, -10, 4, 18);

    if (a.type==="woodcut"){
      ctx.fillStyle="#cbd5e1";
      ctx.fillRect(-8, -14, 14, 6);
    } else {
      ctx.fillStyle="#cbd5e1";
      ctx.fillRect(-6, -14, 12, 6);
      ctx.fillRect(-2, -18, 4, 10);
    }
    ctx.restore();
  }
}


  function drawHover(worldX, worldY, screenX, screenY){
    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
    if (!inBounds(tx,ty)) return;

    const ent=getEntityAt(tx,ty);

    let stroke="rgba(94,234,212,.6)";
    if (ent?.kind==="mob"){
      const cls = ctxLevelClass(getPlayerCombatLevel(Skills), ent.level ?? 1);
      stroke = levelStrokeForCls(cls);
    }

    ctx.strokeStyle=stroke;
    ctx.lineWidth=2;
    ctx.strokeRect(tx*TILE+1, ty*TILE+1, TILE-2, TILE-2);

    let label="";
    if (ent) label=ent.label;
    else{
      const t=map[ty][tx];
      if (t===0) label="Walk here";
      if (t===1) label="Water";
      if (t===2) label="Cliff";
      if (t===3) label="Stone floor";
      if (t===4) label="Castle wall";
      if (t===5) label="Path";
    }

    const pile = getLootPileAt(tx,ty);
    const lootLines = [];
    if (pile){
      for (const [id,qty] of pile.entries()){
        const it = Items[id];
        if (!it) continue;
        lootLines.push(`${it.name} x${qty|0}`);
      }
    }

    if (!label && lootLines.length===0) return;

    const px=screenX+14, py=screenY+18;

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.font="12px system-ui,-apple-system,Segoe UI,Roboto,Arial";

    const lines = [];
    if (label) lines.push(label);
    if (lootLines.length){
      lines.push("Loot:");
      for (const l of lootLines) lines.push("• " + l);
    }

    const maxW = Math.max(...lines.map(s => ctx.measureText(s).width));
    const w=maxW+14;
    const h=lines.length*16 + 10;

    ctx.fillStyle="rgba(0,0,0,.65)";
    ctx.fillRect(px, py-h+2, w, h);
    ctx.strokeStyle="rgba(255,255,255,.18)";
    ctx.strokeRect(px, py-h+2, w, h);

    let y = py - h + 18;
    for (let i=0;i<lines.length;i++){
            const text = lines[i];
      if (text==="Loot:"){
        ctx.fillStyle="rgba(251,191,36,.95)";
        ctx.fillText(text, px+7, y);
      } else if (text.startsWith("• ")){
        ctx.fillStyle="rgba(230,238,247,.92)";
        ctx.fillText(text, px+7, y);
      } else {
        // Tint the FIRST line (mob name) based on combat level
        if (i===0 && ent?.kind==="mob"){
          const cls = ctxLevelClass(getPlayerCombatLevel(Skills), ent.level ?? 1);
          ctx.fillStyle = levelTextForCls(cls);
        } else {
          ctx.fillStyle="rgba(230,238,247,.95)";
        }
        ctx.fillText(text, px+7, y);
      }


      y += 16;
    }

    ctx.restore();
  }

  // ---------- Minimap ----------
  const minimap=document.getElementById("minimap");
  const mctx=minimap.getContext("2d");

  function drawMinimap(){
    const mw=minimap.width, mh=minimap.height;
    mctx.clearRect(0,0,mw,mh);

    const sx = mw / W;
    const sy = mh / H;

    for (let y=0;y<H;y++){
      for (let x=0;x<W;x++){
        const t=map[y][x];
        if (t===0) mctx.fillStyle="#12301e";
        else if (t===1) mctx.fillStyle="#0d2a3d";
        else if (t===2) mctx.fillStyle="#2a2f3a";
        else if (t===3 || t===4) mctx.fillStyle="#46505d";
        else if (t===5) mctx.fillStyle="#3a2f22";
        mctx.fillRect(Math.floor(x*sx), Math.floor(y*sy), Math.ceil(sx), Math.ceil(sy));
      }
    }

    const bankIt = interactables.find(it=>it.type==="bank");
    if (bankIt){
      mctx.fillStyle="#fbbf24";
      mctx.fillRect(bankIt.x*sx-1, bankIt.y*sy-1, 3, 3);
    }

    mctx.fillStyle="#ffffff";
    mctx.fillRect(player.x*sx-1, player.y*sy-1, 3, 3);

    const vw=viewWorldW(), vh=viewWorldH();
    mctx.strokeStyle="rgba(255,255,255,.55)";
    mctx.strokeRect(camera.x/WORLD_W*mw, camera.y/WORLD_H*mh, vw/WORLD_W*mw, vh/WORLD_H*mh);
  }

  minimap.addEventListener("mousedown", (e)=>{
    const rect=minimap.getBoundingClientRect();
    const sx = (e.clientX-rect.left)/rect.width;
    const sy = (e.clientY-rect.top)/rect.height;
    const tx = clamp(Math.floor(sx*W), 0, W-1);
    const ty = clamp(Math.floor(sy*H), 0, H-1);

    let gx=tx, gy=ty;
    if (!isWalkable(gx,gy)){
      let found=null;
      for (let r=1;r<=6 && !found;r++){
        for (let oy=-r;oy<=r;oy++){
          for (let ox=-r;ox<=r;ox++){
            const nx=tx+ox, ny=ty+oy;
            if (!inBounds(nx,ny)) continue;
            if (isWalkable(nx,ny)){ found={x:nx,y:ny}; break; }
          }
          if (found) break;
        }
      }
      if (found){ gx=found.x; gy=found.y; } else return;
    }

    player.target=null;
    player.action={type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    setPathTo(gx,gy);
  });

  // ---------- Input / world-space mouse ----------
  canvas.addEventListener("mousemove",(e)=>{
    mouse.seen = true;

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    mouse.x = sx*VIEW_W;
    mouse.y = sy*VIEW_H;
  });

  canvas.addEventListener("mousedown",(e)=>{
    if (e.button!==0) return;
    closeCtxMenu();

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    const worldX = sx*viewWorldW() + camera.x;
    const worldY = sy*viewWorldH() + camera.y;

    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
        if (!inBounds(tx,ty)) return;

    if (e.shiftKey){
      chatLine(`<span class="muted">Tile: (${tx}, ${ty})</span>`);
      return;
    }

    clickToInteract(tx,ty);

  });

  canvas.addEventListener("contextmenu",(e)=>{
    e.preventDefault();
    closeCtxMenu();

    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    const worldX = sx*viewWorldW() + camera.x;
    const worldY = sy*viewWorldH() + camera.y;

    const tx=Math.floor(worldX/TILE);
    const ty=Math.floor(worldY/TILE);
    if (!inBounds(tx,ty)) return;

    const ent=getEntityAt(tx,ty);
    const opts=[];

    const walkHere=()=>{
      stopAction();
      const ok=setPathTo(tx,ty);
      if (!ok) chatLine(`<span class="muted">You can't walk there.</span>`);
    };

    if (ent?.kind==="mob"){
  const m = mobs[ent.index];
  const name = m?.name ?? "Rat";
  const lvl  = m?.combatLevel ?? 1;
  const cls  = ctxLevelClass(getPlayerCombatLevel(Skills), lvl);

  opts.push({label:`Attack ${name} (Lvl ${lvl})`, className: cls, onClick:()=>beginInteraction(ent)});
  opts.push({label:`Examine ${name}`, onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

    } else if (ent?.kind==="res" && ent.label==="Tree"){
      opts.push({label:"Chop Tree", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Tree", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="res" && ent.label==="Rock"){
      opts.push({label:"Mine Rock", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Rock", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="bank"){
      opts.push({label:"Bank", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Bank Chest", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
    } else if (ent?.kind==="fire"){
      opts.push({label:"Cook", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Campfire", onClick:()=>examineEntity(ent)});
      opts.push({type:"sep"});
      opts.push({label:"Walk here", onClick:walkHere});
} else if (ent?.kind==="fish"){
  opts.push({label:"Fish", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Fishing Spot", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});


} else if (ent?.kind==="vendor"){
  opts.push({label:"Trade", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Vendor", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="furnace"){
  opts.push({label:"Use Furnace", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Furnace", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else if (ent?.kind==="anvil"){
  opts.push({label:"Use Anvil", onClick:()=>beginInteraction(ent)});
  opts.push({label:"Examine Anvil", onClick:()=>examineEntity(ent)});
  opts.push({type:"sep"});
  opts.push({label:"Walk here", onClick:walkHere});

} else {

      if (isWalkable(tx,ty)) opts.push({label:"Walk here", onClick:walkHere});
    }
    openCtxMenu(e.clientX,e.clientY,opts);
  });

  // ---------- Saving / Loading (with migration) ----------
  function serialize(){
  const t = now();

  return JSON.stringify({
    v: 2,

    player:{ x:player.x, y:player.y, name:player.name, class: player.class, color:player.color, hp:player.hp, maxHp:player.maxHp },
    skills:Object.fromEntries(Object.entries(Skills).map(([k,v])=>[k,v.xp])),
    inv,
    bank,
    zoom: view.zoom,
    equipment: { ...equipment },
    quiver: { ...quiver },
    wallet: { ...wallet },

    groundLoot: Array.from(groundLoot.entries()).map(([k,p]) => {
  const expiresIn = Number.isFinite(p.expiresAt) ? Math.max(0, Math.floor(p.expiresAt - t)) : GROUND_LOOT_DESPAWN_MS;
  return [k, Array.from(p.entries()), expiresIn];
}),

    world: {
      resources: resources.map(r => ({
        type: r.type,
        x: r.x, y: r.y,
        alive: !!r.alive,
        respawnIn: (!r.alive && r.respawnAt) ? Math.max(0, Math.floor(r.respawnAt - t)) : 0
      })),
      mobs: mobs.map(m => ({
        type: m.type,
        name: m.name,
        x: m.x, y: m.y,
        homeX: (m.homeX ?? m.x),
        homeY: (m.homeY ?? m.y),
        hp: (m.hp|0),
        maxHp: (m.maxHp|0),
        alive: !!m.alive,
        respawnIn: (!m.alive && m.respawnAt) ? Math.max(0, Math.floor(m.respawnAt - t)) : 0,
        levels: m.levels ?? null
      })),
      fires: interactables
        .filter(it => it.type === "fire")
        .map(it => ({
          x: it.x, y: it.y,
          expiresIn: it.expiresAt ? Math.max(0, Math.floor(it.expiresAt - t)) : 0
        }))
    }
  });
}


  function deserialize(str){
    const data=JSON.parse(str);
    // --- World restore (prevents save/load dupes) ---
    function rebuildWorldFromSave(){
      const t0 = now();

      // wipe current world so we don't keep fires/mobs from the "future"
      resources.length = 0;
      mobs.length = 0;
      interactables.length = 0;

      // resources
      if (Array.isArray(data?.world?.resources)){
        for (const r of data.world.resources){
          if (!r) continue;
          resources.push({
            type: r.type,
            x: r.x|0,
            y: r.y|0,
            alive: !!r.alive,
            respawnAt: (!r.alive && (r.respawnIn|0) > 0) ? (t0 + (r.respawnIn|0)) : 0
          });
        }
      } else {
        seedResources();
      }

      // mobs
      if (Array.isArray(data?.world?.mobs)){
        for (const mm of data.world.mobs){
          if (!mm) continue;

          const def = MOB_DEFS[mm.type] ?? { name: mm.type, hp: 12, levels: {} };
          const lvls = { ...DEFAULT_MOB_LEVELS, ...(mm.levels || def.levels || {}) };
          const combatLevel = calcCombatLevelFromLevels(lvls);

          const x = mm.x|0, y = mm.y|0;
          const maxHp = Math.max(1, (mm.maxHp|0) || (def.hp|0) || 12);
          const hp = clamp((mm.hp|0) || maxHp, 0, maxHp);

          const mob = {
            type: mm.type,
            name: mm.name || def.name || mm.type,
            x, y,
            homeX: (mm.homeX ?? x)|0,
            homeY: (mm.homeY ?? y)|0,

            hp,
            maxHp,
            alive: !!mm.alive,
            respawnAt: (!mm.alive && (mm.respawnIn|0) > 0) ? (t0 + (mm.respawnIn|0)) : 0,

            // reset combat AI state on load
            target: null,
            provokedUntil: 0,
            aggroUntil: 0,
            attackCooldownUntil: 0,
            moveCooldownUntil: 0,

            levels: lvls,
            combatLevel
          };

          // smooth movement state
          const c = tileCenter(x, y);
          mob.px = c.cx; mob.py = c.cy;

          mobs.push(mob);
        }
      } else {
        seedMobs();
      }

      // always restore static interactables (bank/vendor)
      seedInteractables();

      // restore saved fires
      if (Array.isArray(data?.world?.fires)){
        for (const f of data.world.fires){
          if (!f) continue;
          const born = t0;
          const expiresIn = Math.max(0, f.expiresIn|0);
          interactables.push({
            type: "fire",
            x: f.x|0,
            y: f.y|0,
            createdAt: born,
            expiresAt: expiresIn ? (t0 + expiresIn) : (t0 + 60000)
          });
        }
      }
    }


    if (data?.player){
      player.x=data.player.x|0; player.y=data.player.y|0;
      player.name=String(data.player.name||player.name).slice(0,14);

      const cls = data.player.class;
      player.class = (cls && CLASS_DEFS[cls]) ? cls : (player.class || "Warrior");
      player.color = data.player.color || (CLASS_DEFS[player.class]?.color ?? player.color);

      player.maxHp = (data.player.maxHp|0) || player.maxHp;
      player.hp = (data.player.hp|0) || player.maxHp;

      syncPlayerPix();
      player.path=[];
      player.target=null;
      player.action={type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    rebuildWorldFromSave();

    }

    if (data?.skills){
      for (const k of Object.keys(Skills)){
        if (typeof data.skills[k]==="number") Skills[k].xp = data.skills[k]|0;
      }

      // Migrate old Combat XP → Accuracy/Power/Defense/Ranged (25% each)
      if (typeof data.skills.combat === "number"){
        const c = Math.max(0, data.skills.combat|0);
        const q = Math.floor(c/4);
        const rem = c - q*4;
        Skills.accuracy.xp += q;
        Skills.power.xp    += q + rem;
        Skills.defense.xp  += q;
        Skills.ranged.xp   += q;
      }
    }

    // Recalc max HP from health level (ignore saved maxHp if inconsistent)
    recalcMaxHPFromHealth();
    player.hp = clamp(player.hp, 0, player.maxHp);

    // Quiver
    quiver.wooden_arrow = 0;
    if (data?.quiver && typeof data.quiver.wooden_arrow === "number"){
      quiver.wooden_arrow = Math.max(0, data.quiver.wooden_arrow|0);
    }
    // Wallet
    wallet.gold = 0;
    if (data?.wallet && typeof data.wallet.gold === "number"){
      wallet.gold = Math.max(0, data.wallet.gold|0);
    }


    if (Array.isArray(data?.inv)){
      clearSlots(inv);
      for (const s of data.inv){
        if (!s) continue;
        const rawId = s.id;
        const id = (rawId === "bronze_arrow") ? "wooden_arrow" : rawId;
        const item = Items[id];
        if (!item) continue;

        const qty = Math.max(1, (s.qty|0) || 1);

               // route gold/ammo to wallet/quiver
        if (id === GOLD_ITEM_ID){
          addGold(qty);
        } else if (item.ammo){
          addToQuiver(id, qty);
        } else {
          addToInventory(id, qty);
        }

      }
    }

    if (Array.isArray(data?.bank)){
      clearSlots(bank);
      for (let i=0;i<Math.min(MAX_BANK, data.bank.length); i++){
        const s = data.bank[i];
        if (!s) { bank[i]=null; continue; }
        const id = (s.id === "bronze_arrow") ? "wooden_arrow" : s.id;
        const item = Items[id];
        if (!item) { bank[i]=null; continue; }
        const qty = Math.max(1, (s.qty|0) || 1);
                if (id === GOLD_ITEM_ID){
          addGold(qty);
          bank[i] = null;
        } else {
          bank[i] = { id, qty };
        }

      }
    }

    if (data?.equipment){
      equipment.weapon = data.equipment.weapon ?? null;
      equipment.offhand = data.equipment.offhand ?? null;

      if (equipment.weapon && (!Items[equipment.weapon] || Items[equipment.weapon].ammo)) equipment.weapon = null;
      if (equipment.offhand && (!Items[equipment.offhand] || Items[equipment.offhand].ammo)) equipment.offhand = null;
    }

    if (typeof data?.zoom==="number") setZoom(data.zoom);

    // Ground loot
    groundLoot.clear();
manualDropLocks.clear();

    if (Array.isArray(data?.groundLoot)){
      for (const row of data.groundLoot){
  if (!Array.isArray(row) || row.length < 2) continue;

  const k = row[0];
  const entries = row[1];
  const expiresIn = (row.length >= 3) ? (row[2]|0) : GROUND_LOOT_DESPAWN_MS;

  if (!k || !Array.isArray(entries)) continue;

  const pile = new Map();
  pile.createdAt = t0;
  pile.expiresAt = t0 + Math.max(0, expiresIn);

  for (const [id,qty] of entries){
    if (!Items[id]) continue;
    pile.set(id, Math.max(0, qty|0));
  }

  if (pile.size) groundLoot.set(k, pile);
}

    }

    renderSkills(); renderInv(); renderBank(); renderEquipment(); renderQuiver(); renderHPHUD(); updateCamera();
  }

  document.getElementById("saveBtn").onclick=()=>{
    localStorage.setItem(SAVE_KEY, serialize());
    chatLine(`<span class="good">Game saved.</span>`);
  };
  document.getElementById("loadBtn").onclick=()=>{
    const s=localStorage.getItem(SAVE_KEY);
    if (!s) return chatLine(`<span class="warn">No save found.</span>`);
    deserialize(s);
    chatLine(`<span class="good">Game loaded.</span>`);
  };
  document.getElementById("resetBtn").onclick=()=>{
    localStorage.removeItem(SAVE_KEY);
    chatLine(`<span class="warn">Save cleared. Choose a character to start fresh.</span>`);
    openCharCreate(true);
  };
  // ---------- Background Music ----------
  const bgm = document.getElementById("bgm");
  const musicToggle = document.getElementById("musicToggle");
  const musicVol = document.getElementById("musicVol");
  const musicVolLabel = document.getElementById("musicVolLabel");

  const bgmState = (() => {
    const d = { on:false, vol:0.25 };
    try{
      const raw = localStorage.getItem(BGM_KEY);
      if (!raw) return d;
      const s = JSON.parse(raw);
      if (typeof s.on === "boolean") d.on = s.on;
      if (typeof s.vol === "number") d.vol = clamp(s.vol, 0, 1);
    }catch{}
    return d;
  })();

  function saveBgmState(){
    try{ localStorage.setItem(BGM_KEY, JSON.stringify(bgmState)); }catch{}
  }

  function updateBgmUI(){
    if (musicToggle) musicToggle.checked = !!bgmState.on;
    if (musicVol) musicVol.value = String(Math.round(bgmState.vol * 100));
    if (musicVolLabel) musicVolLabel.textContent = `${Math.round(bgmState.vol * 100)}%`;
  }

  function tryPlayBgm(){
    if (!bgm || !bgmState.on) return;
    bgm.volume = clamp(bgmState.vol, 0, 1);
    const p = bgm.play();
    if (p && typeof p.catch === "function") p.catch(()=>{});
  }

  function applyBgm(){
    if (!bgm) return;
    bgm.volume = clamp(bgmState.vol, 0, 1);
    if (bgmState.on) tryPlayBgm();
    else bgm.pause();
  }

  updateBgmUI();
  applyBgm();

  if (musicToggle){
    musicToggle.addEventListener("change", () => {
      bgmState.on = musicToggle.checked;
      saveBgmState();
      applyBgm(); // the click counts as a user gesture (helps autoplay rules)
    });
  }

  if (musicVol){
    musicVol.addEventListener("input", () => {
      bgmState.vol = clamp((musicVol.value|0)/100, 0, 1);
      saveBgmState();
      if (musicVolLabel) musicVolLabel.textContent = `${Math.round(bgmState.vol * 100)}%`;
      if (bgm) bgm.volume = bgmState.vol;
      if (bgmState.on) tryPlayBgm();
    });
  }

  // If music was enabled previously, start it on the first user action (browser autoplay rules)
  function unlockBgmOnce(){ tryPlayBgm(); }
  window.addEventListener("pointerdown", unlockBgmOnce, { once:true });
  window.addEventListener("keydown", unlockBgmOnce, { once:true });

  // Optional: pause when tab is hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (!bgm) return;
    if (document.hidden) bgm.pause();
    else if (bgmState.on) tryPlayBgm();
  });

  // ---------- Loop ----------
  let last=now();

  function update(dt){
    const t=now();

    // respawns
    for (const r of resources){
      if (!r.alive && r.respawnAt && t>=r.respawnAt){ r.alive=true; r.respawnAt=0; }
    }
    for (const m of mobs){
      if (!m.alive && m.respawnAt && t>=m.respawnAt){
        m.alive = true;
        m.respawnAt = 0;
        m.hp = m.maxHp;
        m.target = null;
        m.provokedUntil = 0;
        m.aggroUntil = 0;
        m.attackCooldownUntil = 0;
        m.moveCooldownUntil = 0;
      }
    }

    // Keep player tile clear of mobs at tick start.
    for (let i=0; i<mobs.length; i++){
      const m = mobs[i];
      if (!m.alive) continue;
      const playerTargetingThis = (player.target?.kind === "mob" && player.target.index === i);
      const mobInCombat = (m.target === "player");
      if (m.x === player.x && m.y === player.y && (mobInCombat || playerTargetingThis)){
        pushMobOffPlayerTile(m);
      }
    }
    // expire campfires
    for (let i=interactables.length-1; i>=0; i--){
      const it = interactables[i];
      if (it.type==="fire" && it.expiresAt && t >= it.expiresAt){
        interactables.splice(i,1);
// expire ground loot
pruneExpiredGroundLoot();

      }

    }

    // bank availability
    const bankIt = interactables.find(it=>it.type==="bank");
    if (bankIt){
      availability.bank = inRangeOfTile(bankIt.x, bankIt.y, 1.1);
    } else {
      availability.bank = false;
    }
    updateBankIcon();
// vendor availability (vendor only)

availability.vendor = false;
availability.vendorInRangeIndex = -1;

for (let i=0; i<interactables.length; i++){
  const it = interactables[i];
  if (it.type !== "vendor") continue;

  if (inRangeOfTile(it.x, it.y, 1.1)){
    availability.vendor = true;
    availability.vendorInRangeIndex = i;
    break;
  }
}

updateVendorIcon();
if (windowsOpen.vendor && !availability.vendor){
  closeWindow("vendor");
}



    // action completion
    if (player.action.type!=="idle" && t>=player.action.endsAt){
      const done=player.action.onComplete;
      player.action={type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
      if (typeof done==="function") done();
      if (player.target) ensureWalkIntoRangeAndAct();
    }

    // particles during chop/mine
    if (player.target && (player.action.type==="woodcut" || player.action.type==="mine")){
      const pct=actionProgress();
      if (pct>0.45 && pct<0.55){
        const tt=player.target;
        if (tt.kind==="res"){
          const r=resources[tt.index];
          if (r?.alive){
            if (!player._sparked){
              player._sparked = true;
              spawnGatherParticles(player.action.type==="woodcut" ? "wood" : "rock", r.x, r.y);
            }
          }
        }
      }
      if (pct>0.60) player._sparked = false;
    } else {
      player._sparked = false;
    }

    // movement
    if (player.path && player.path.length){
      const next=player.path[0];
      const {cx,cy}=tileCenter(next.x,next.y);
      const d=dist(player.px,player.py,cx,cy);
      if (d<1){
        const meleeTarget = (
          player.target?.kind === "mob" &&
          getCombatStyle() === "melee"
        ) ? mobs[player.target.index] : null;

        if (meleeTarget?.alive && next.x === meleeTarget.x && next.y === meleeTarget.y){
          // Combat-only safety net: never step onto your active melee target tile.
          player.path = [];
        } else {
          player.path.shift();
          const dx = next.x - player.x;
          const dy = next.y - player.y;
          if (dx || dy){ player.facing.x=clamp(dx,-1,1); player.facing.y=clamp(dy,-1,1); }
          player.x=next.x; player.y=next.y;
        }
      } else {
        const vx=(cx-player.px)/d;
        const vy=(cy-player.py)/d;
        const step=player.speed*dt;
        player.px += vx*Math.min(step,d);
        player.py += vy*Math.min(step,d);
      }
      if (player.target && (!player.path.length || inRangeOfCurrentTarget())) ensureWalkIntoRangeAndAct();
    } else {
      syncPlayerPix();
      if (player.target) ensureWalkIntoRangeAndAct();
    }
// mobs: aggro + move + attack
updateMobsAI(dt);
if (player.hp <= 0) handlePlayerDeath();


    // auto-loot ground piles when in range
    attemptAutoLoot();

        updateFX(); 
    updateCamera();
    updateCoordsHUD();
    renderHPHUD();

  }

  function render(){
    const mouseWorldX = (mouse.x/VIEW_W)*viewWorldW() + camera.x;
    const mouseWorldY = (mouse.y/VIEW_H)*viewWorldH() + camera.y;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,VIEW_W,VIEW_H);

    ctx.setTransform(view.zoom,0,0,view.zoom, -camera.x*view.zoom, -camera.y*view.zoom);

    drawMap();
    drawResources();
    drawInteractables();
    drawMobs();
    drawLootMarkers();
    drawFX();
    drawPlayer();

    if (player.target){
      let tx,ty;
      if (player.target.kind==="res"){
        const r=resources[player.target.index];
        if (r?.alive){ tx=r.x; ty=r.y; }
      } else if (player.target.kind==="mob"){
        const m=mobs[player.target.index];
        if (m?.alive){ tx=m.x; ty=m.y; }
      } else if (player.target.kind==="bank" || player.target.kind==="vendor"){
        const b=interactables[player.target.index];
        if (b){ tx=b.x; ty=b.y; }
      }

      if (tx!==undefined){
        ctx.strokeStyle="rgba(251,191,36,.9)";
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(tx*TILE+TILE/2, ty*TILE+TILE/2, 14, 0, Math.PI*2);
        ctx.stroke();
        ctx.lineWidth=1;
      }
    }

    drawHover(mouseWorldX, mouseWorldY, mouse.x, mouse.y);

    ctx.setTransform(1,0,0,1,0,0);
    drawMinimap();
  }

  function loop(){
    const t=now();
    const dt=clamp((t-last)/1000, 0, 0.05);
    last=t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  function bootstrap(){
initWorldSeed();

    loadChatUI();
    applyChatUI();

    loadWindowsUI();
    applyWindowVis();

    loadMeleeTraining();
    renderMeleeTrainingUI();

    const savedChar = loadCharacterPrefs();
    if (savedChar?.class && CLASS_DEFS[savedChar.class]) player.class = savedChar.class;
    player.color = CLASS_DEFS[player.class]?.color ?? player.color;
    if (savedChar?.name) player.name = String(savedChar.name).slice(0,14);

    startNewGame();

    // If bank is open in UI state, ensure it's closed until you are in range
    if (windowsOpen.bank && !availability.bank) windowsOpen.bank = false;
    applyWindowVis();

    openCharCreate(!savedChar);

    renderEquipment();
    renderInv();
    renderSkills();
    renderBank();
    renderQuiver();
    renderHPHUD();

    chatLine(`<span class="muted">Tip:</span> Loot auto-picks up when you stand near it. If full, items stay on the ground.`);
    chatLine(`<span class="muted">Fletching:</span> Right-click <b>Knife</b> → Use, then click a <b>Log</b> to fletch arrows into your quiver.`);
  }

  // ---------- Bank icon initialization ----------
  updateBankIcon();

  bootstrap();
  loop();

})();
