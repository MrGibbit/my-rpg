(() => {
  // ---------- Utilities ----------
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const now = () => performance.now();

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
  const TILE = 32;
  const W = 60;
  const H = 40;
  const WORLD_W = W * TILE;
  const WORLD_H = H * TILE;

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  // Zoom
  let zoom = 0.85;
  const ZOOM_MIN = 0.65;
  const ZOOM_MAX = 1.20;

  function setZoom(z) {
    zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const step = 0.06;
    setZoom(zoom + (delta > 0 ? -step : step));
  }, { passive: false });

  // Camera (top-left) in world pixels
  const camera = { x: 0, y: 0 };
  function viewWorldW(){ return VIEW_W / zoom; }
  function viewWorldH(){ return VIEW_H / zoom; }

  // ---------- Map ----------
  // 0 grass (walkable), 1 water (blocked), 2 cliff (blocked), 3 stone floor (walkable), 4 wall (blocked), 5 path/bridge (walkable)
  const map = Array.from({length: H}, () => Array.from({length: W}, () => 0));
  const RIVER_Y = 22;

  for (let y=0; y<H; y++) for (let x=0; x<W; x++) map[y][x]=0;

  for (let x=2; x<W-2; x++) { map[RIVER_Y][x]=1; map[RIVER_Y+1][x]=1; }
  for (const bx of [7, 8, 42, 43]) { map[RIVER_Y][bx]=5; map[RIVER_Y+1][bx]=5; }

  for (let y=4; y<14; y++) { map[y][18]=2; map[y][19]=2; }
  for (let y=26; y<37; y++) { map[y][10]=2; map[y][11]=2; }
  for (let x=28; x<36; x++) { map[30][x]=2; map[31][x]=2; }

  function stampCastle(x0, y0, w, h) {
    for (let y=y0; y<y0+h; y++) {
      for (let x=x0; x<x0+w; x++) {
        const edge = (x===x0 || x===x0+w-1 || y===y0 || y===y0+h-1);
        map[y][x] = edge ? 4 : 3;
      }
    }
    const gateX = x0 + Math.floor(w/2);
    const gateY = y0 + h - 1;
    map[gateY][gateX] = 5;
    map[gateY+1][gateX] = 5;
    map[gateY+2][gateX] = 5;
    return { gateX, gateY, x0, y0, w, h };
  }

  const startCastle = stampCastle(2, 2, 12, 8);
  for (let y=startCastle.gateY; y<=RIVER_Y+1; y++) { map[y][startCastle.gateX]=5; map[y][startCastle.gateX-1]=5; }
  for (let x=Math.min(startCastle.gateX-1, 7); x<=Math.max(startCastle.gateX, 8); x++) map[RIVER_Y-1][x]=5;
  for (let y=RIVER_Y+2; y<H-2; y++) { map[y][8]=5; if (y%3===0) map[y][9]=5; }
  for (let x=8; x<=42; x++) map[RIVER_Y-3][x]=5;
  for (let y=RIVER_Y-3; y<=RIVER_Y+1; y++) map[y][42]=5;

  const southKeep = stampCastle(44, 30, 12, 8);
  for (let y=RIVER_Y+2; y<=southKeep.gateY+2; y++) map[y][42]=5;
  for (let x=42; x<=southKeep.gateX; x++) map[southKeep.gateY+2][x]=5;

  function inBounds(x,y){ return x>=0 && y>=0 && x<W && y<H; }
  function isWalkable(x,y){
    if (!inBounds(x,y)) return false;
    return map[y][x]===0 || map[y][x]===3 || map[y][x]===5;
  }

  // ---------- A* pathfinding ----------
  function astar(sx, sy, gx, gy) {
    sx|=0; sy|=0; gx|=0; gy|=0;
    if (!isWalkable(gx,gy) || !isWalkable(sx,sy)) return null;
    if (sx===gx && sy===gy) return [];
    const key = (x,y)=> (y*W+x);
    const open = new Map();
    const came = new Map();
    const g = new Map();
    const f = new Map();
    const h = (x,y)=> Math.abs(x-gx)+Math.abs(y-gy);

    const sk = key(sx,sy);
    g.set(sk,0); f.set(sk,h(sx,sy)); open.set(sk,{x:sx,y:sy});
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    while (open.size){
      let bestK=null, bestN=null, bestF=Infinity;
      for (const [k,n] of open.entries()){
        const fs = f.get(k) ?? Infinity;
        if (fs<bestF){ bestF=fs; bestK=k; bestN=n; }
      }
      if (!bestN) break;
      if (bestN.x===gx && bestN.y===gy){
        const path=[];
        let ck=bestK;
        while (came.has(ck)){
          const prev=came.get(ck);
          const cy=Math.floor(ck/W), cx=ck-cy*W;
          path.push({x:cx,y:cy});
          ck=prev;
        }
        path.reverse();
        return path;
      }
      open.delete(bestK);

      for (const [dx,dy] of dirs){
        const nx=bestN.x+dx, ny=bestN.y+dy;
        if (!isWalkable(nx,ny)) continue;
        const nk=key(nx,ny);
        const tentative=(g.get(bestK)??Infinity)+1;
        if (tentative < (g.get(nk)??Infinity)){
          came.set(nk,bestK);
          g.set(nk,tentative);
          f.set(nk,tentative+h(nx,ny));
          if (!open.has(nk)) open.set(nk,{x:nx,y:ny});
        }
      }
    }
    return null;
  }

  // ---------- Skills ----------
  function levelFromXP(xp){ let lvl=1; while (xp>=xpForLevel(lvl+1)) lvl++; return lvl; }
  function xpForLevel(lvl){ if (lvl<=1) return 0; return 25*(lvl-1)*(lvl-1); }
  function xpToNext(xp){
    const lvl=levelFromXP(xp);
    const cur=xpForLevel(lvl), next=xpForLevel(lvl+1);
    return { lvl, cur, next, pct: (xp-cur)/(next-cur) };
  }

  const Skills = {
    accuracy:{ name:"Accuracy", xp:0 },
    power:{ name:"Power", xp:0 },
    defense:{ name:"Defense", xp:0 },
    ranged:{ name:"Ranged", xp:0 },
    sorcery:{ name:"Sorcery", xp:0 },
    health:{ name:"Health", xp:0 },
    fletching:{ name:"Fletching", xp:0 },
    woodcutting:{ name:"Woodcut", xp:0 },
    mining:{ name:"Mining", xp:0 },
  };

  const lastSkillLevel = Object.create(null);

  // HP progression constants
  const BASE_HP = 30;
  const HP_PER_LEVEL = 2;

  // ---------- Items ----------
  const MAX_INV = 28;
  const MAX_BANK = 56;

  const Items = {
    axe:  { id:"axe",  name:"Crude Axe",  stack:false, icon:"🪓" },
    pick: { id:"pick", name:"Crude Pick", stack:false, icon:"⛏️" },
    knife:{ id:"knife",name:"Knife",      stack:false, icon:"🔪" },

    sword: { id:"sword", name:"Sword", stack:false, icon:"🗡️", equipSlot:"weapon" },
    shield:{ id:"shield",name:"Shield",stack:false, icon:"🛡️", equipSlot:"offhand" },
    bow:   { id:"bow",   name:"Bow",   stack:false, icon:"🏹", equipSlot:"weapon" },

    wooden_arrow:{ id:"wooden_arrow", name:"Wooden Arrow", stack:true, ammo:true, icon:"➶" },
    bronze_arrow:{ id:"bronze_arrow", name:"Bronze Arrow", stack:true, ammo:true, icon:"➶" },

    staff: { id:"staff", name:"Wooden Staff", stack:false, icon:"🪄", equipSlot:"weapon" },

    log:  { id:"log",  name:"Log",  stack:true, icon:"🪵" },
    ore:  { id:"ore",  name:"Ore",  stack:true, icon:"🪨" },
    bone: { id:"bone", name:"Bone", stack:true, icon:"🦴" },
  };

  const inv = Array.from({length: MAX_INV}, () => null);
  const bank = Array.from({length: MAX_BANK}, () => null);

  // ---------- Quiver (arrows do not take inventory slots) ----------
  const quiver = {
    wooden_arrow: 0
  };
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
  const groundLoot = new Map();

  function lootKey(x,y){ return `${x},${y}`; }
  function addGroundLoot(x,y,id,qty=1){
    const item = Items[id];
    if (!item) return;
    qty = Math.max(1, qty|0);
    const k = lootKey(x,y);
    if (!groundLoot.has(k)) groundLoot.set(k, new Map());
    const pile = groundLoot.get(k);
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

  // auto-loot throttling for "Inventory full: <ItemName>" messages
  let lastInvFullMsgAt = 0;
  let lastInvFullMsgItem = null;

  // ---------- Inventory stacking behavior ----------
  // Inventory: ONLY ammo stacks (but arrows are moved to quiver, so ammo in inv is legacy)
  function addToInventory(id, qty=1){
    const item = Items[id];
    if (!item || qty<=0) return 0;
    qty = Math.max(1, qty|0);

    // arrows/ammo: route to quiver (no inventory slots)
    if (item.ammo){
      return addToQuiver(id, qty);
    }

    let added=0;
    for (let i=0;i<qty;i++){
      const empty=inv.findIndex(s=>!s);
      if (empty<0) break;
      inv[empty] = { id, qty:1 };
      added++;
    }
    if (added>0) renderInv();
    return added;
  }

  function hasItem(id){ return inv.some(s=>s && s.id===id); }

  function removeItemsFromInventory(id, qty=1){
    const item = Items[id]; if (!item) return false;
    qty = Math.max(1, qty|0);

    // ammo should not exist in inventory, but handle safely
    if (item.ammo){
      return consumeFromQuiver(id, qty);
    }

    let remaining = qty;
    for (let i=0;i<inv.length && remaining>0;i++){
      if (inv[i] && inv[i].id===id){
        inv[i]=null;
        remaining--;
      }
    }
    if (remaining !== qty) renderInv();
    return remaining === 0;
  }

  // ---------- Bank stacking behavior ----------
  function addToBank(arr, id, qty=1){
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
  const equipment = {
    weapon: null,
    offhand: null
  };

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
  let meleeTraining = "accuracy";

  function loadMeleeTraining(){
    const v = localStorage.getItem(MELEE_TRAIN_KEY);
    if (v === "accuracy" || v === "power" || v === "defense") meleeTraining = v;
    else meleeTraining = "accuracy";
  }
  function saveMeleeTraining(){ localStorage.setItem(MELEE_TRAIN_KEY, meleeTraining); }

  // ---------- HP / HUD ----------
  const hudNameEl = document.getElementById("hudName");
  const hudClassEl = document.getElementById("hudClass");
  const hudHPTextEl = document.getElementById("hudHPText");
  const hudHPBarEl = document.getElementById("hudHPBar");
  const hudQuiverTextEl = document.getElementById("hudQuiverText");

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
    hudQuiverTextEl.textContent = `Quiver: ${getQuiverCount()}`;
  }

  function renderQuiver(){
    document.getElementById("invQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
    document.getElementById("eqQuiverPill").textContent = `Quiver: ${getQuiverCount()}`;
    renderHPHUD();
  }

  function addXP(skillKey, amount){
    const s = Skills[skillKey];
    if (!s || !Number.isFinite(amount) || amount <= 0) return;
    const before = levelFromXP(s.xp);
    s.xp += Math.floor(amount);
    const after = levelFromXP(s.xp);

    if ((lastSkillLevel[skillKey] ?? before) < after){
      chatLine(`<span class="good">${s.name} leveled up to ${after}!</span>`);
    }
    lastSkillLevel[skillKey] = after;

    // Health affects max HP
    if (skillKey === "health"){
      recalcMaxHPFromHealth();
    }

    renderSkills();
  }

  // ---------- Entities ----------
  const resources = [];
  const mobs = [];
  const interactables = [];

  function placeResource(type,x,y){ resources.push({type,x,y,alive:true,respawnAt:0}); }
  function placeMob(type,x,y){ mobs.push({type,x,y,hp:12,maxHp:12,alive:true,respawnAt:0}); }
  function placeInteractable(type,x,y){ interactables.push({type,x,y}); }

  function seedResources(){
    resources.length=0;
    [[26,8],[27,9],[28,10],[29,11],[32,7],[33,8],[34,9],[38,10],[39,11],[40,12]]
      .forEach(([x,y])=> isWalkable(x,y) && placeResource("tree",x,y));
    [[4,32],[5,33],[6,34],[8,35],[9,36],[14,33],[15,34],[16,35]]
      .forEach(([x,y])=> isWalkable(x,y) && placeResource("tree",x,y));
    [[20,16],[21,16],[22,17],[19,20],[20,21],[30,28],[31,28],[32,29],[48,26],[49,26],[50,27]]
      .forEach(([x,y])=> isWalkable(x,y) && placeResource("rock",x,y));
  }
  function seedMobs(){
    mobs.length=0;
    [[16,15],[28,14],[36,12],[12,34],[46,34]]
      .forEach(([x,y])=> isWalkable(x,y) && placeMob("rat",x,y));
  }
  function seedInteractables(){
    interactables.length=0;
    const bx = startCastle.x0 + 4;
    const by = startCastle.y0 + 3;
    placeInteractable("bank", bx, by);
  }

  // ---------- Character / class ----------
  const SAVE_KEY="classic_inspired_rpg_save_v10_quiver_loot_health_windows";
  const CHAR_KEY = "classic_char_v3";
  const CHAT_UI_KEY = "classic_chat_ui_v1";
  const WINDOWS_UI_KEY = "classic_windows_ui_v2_multi_open";

  const CLASS_DEFS = {
    Warrior: { color: "#ef4444" },
    Ranger:  { color: "#facc15" },
    Mage:    { color: "#22d3ee" },
  };

  // ---------- Player ----------
  const player = {
    name: "Adventurer",
    class: "Warrior",
    color: CLASS_DEFS.Warrior.color,

    hp: BASE_HP,
    maxHp: BASE_HP,

    x: startCastle.x0 + 6,
    y: startCastle.y0 + 4,
    px: 0, py: 0,

    speed: 140,
    path: [],
    target: null, // {kind:"res"|"mob"|"bank", index}

    action: { type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null },
    attackCooldownUntil: 0,
    facing: { x: 0, y: 1 },

    _sparked: false,
    _lastRangeMsgAt: 0
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
  const winSettings  = document.getElementById("winSettings");

  const iconInv  = document.getElementById("iconInv");
  const iconEqp  = document.getElementById("iconEqp");
  const iconSki  = document.getElementById("iconSki");
  const iconBank = document.getElementById("iconBank");
  const iconSet  = document.getElementById("iconSet");

  let bankAvailable = false;

  // Open state: inventory + equipment can be open simultaneously.
  const windowsOpen = {
    inventory: false,
    equipment: false,
    skills: false,
    bank: false,
    settings: false
  };

  function applyWindowVis(){
    winInventory.classList.toggle("hidden", !windowsOpen.inventory);
    winEquipment.classList.toggle("hidden", !windowsOpen.equipment);
    winSkills.classList.toggle("hidden", !windowsOpen.skills);
    winBank.classList.toggle("hidden", !windowsOpen.bank);
    winSettings.classList.toggle("hidden", !windowsOpen.settings);

    iconInv.classList.toggle("active", windowsOpen.inventory);
    iconEqp.classList.toggle("active", windowsOpen.equipment);
    iconSki.classList.toggle("active", windowsOpen.skills);
    iconSet.classList.toggle("active", windowsOpen.settings);
    iconBank.classList.toggle("active", windowsOpen.bank);
  }

  function closeExclusive(exceptName){
    // Skills / Bank / Settings are exclusive *between themselves*, but do not close inventory/equipment.
    for (const k of ["skills","bank","settings"]){
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
    if (name === "bank" && !bankAvailable) return;

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

  function updateBankIcon(){
    if (bankAvailable){
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

  function saveWindowsUI(){
    const data = {
      windowsOpen: { ...windowsOpen },
      inventory: getWindowRect(winInventory),
      equipment: getWindowRect(winEquipment),
      skills: getWindowRect(winSkills),
      bank: getWindowRect(winBank),
      settings: getWindowRect(winSettings)
    };
    localStorage.setItem(WINDOWS_UI_KEY, JSON.stringify(data));
  }

  function loadWindowsUI(){
    const raw = localStorage.getItem(WINDOWS_UI_KEY);
    if (!raw) return;
    try{
      const d = JSON.parse(raw);
      applyWindowRect(winInventory, d.inventory);
      applyWindowRect(winEquipment, d.equipment);
      applyWindowRect(winSkills, d.skills);
      applyWindowRect(winBank, d.bank);
      applyWindowRect(winSettings, d.settings);

      if (d.windowsOpen){
        for (const k of Object.keys(windowsOpen)){
          if (typeof d.windowsOpen[k] === "boolean") windowsOpen[k] = d.windowsOpen[k];
        }
      }
    }catch{}
  }

  window.addEventListener("mouseup", () => saveWindowsUI());

  // ---------- Rendering UI: inventory/skills/equipment/bank ----------
  const invGrid = document.getElementById("invGrid");
  const invCountEl = document.getElementById("invCount");
  const invUseStateEl = document.getElementById("invUseState");

  const skillsGrid = document.getElementById("skillsGrid");

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
        slot.innerHTML = `<div class="icon">·</div><div class="name">Empty</div>`;
      } else {
        const item=Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.icon ?? "❔"}</div>
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
    const order = ["health","accuracy","power","defense","ranged","sorcery","fletching","woodcutting","mining"];
    for (const k of order){
      const s=Skills[k];
      const {lvl,next,pct}=xpToNext(s.xp);
      const div=document.createElement("div");
      div.className="stat";
      div.innerHTML=`
        <div class="k">${s.name}</div>
        <div class="v">Lv ${lvl}</div>
        <div class="small">${s.xp} XP</div>
        <div class="bar"><div style="width:${clamp(pct,0,1)*100}%"></div></div>
        <div class="small">${Math.max(0,next-s.xp)} XP to next</div>
      `;
      skillsGrid.appendChild(div);
    }
  }

  function renderEquipment(){
    const w = equipment.weapon;
    const o = equipment.offhand;

    if (w){
      eqWeaponIcon.textContent = Items[w]?.icon ?? "❔";
      eqWeaponName.textContent = Items[w]?.name ?? w;
    } else {
      eqWeaponIcon.textContent = "—";
      eqWeaponName.textContent = "Empty";
    }

    if (o){
      eqOffhandIcon.textContent = Items[o]?.icon ?? "❔";
      eqOffhandName.textContent = Items[o]?.name ?? o;
    } else {
      eqOffhandIcon.textContent = "—";
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
        slot.innerHTML = `<div class="icon">·</div><div class="name">Empty</div>`;
      } else {
        const item=Items[s.id];
        const qty = (s.qty|0) || 1;
        slot.innerHTML = `
          <div class="icon">${item?.icon ?? "❔"}</div>
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
      btn.classList.toggle("active", btn.dataset.melee === meleeTraining);
    }
  }
  meleeTrainingSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".segBtn");
    if (!btn) return;
    const v = btn.dataset.melee;
    if (v === "accuracy" || v === "power" || v === "defense"){
      meleeTraining = v;
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

  let chatUI = { left: 12, top: null, width: 420, height: 320, collapsed: false };

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

    if (!bankAvailable){
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
    if (!bankAvailable){
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
    if (!bankAvailable) return chatLine(`<span class="warn">You must be at a bank chest.</span>`);
    for (let i=0;i<MAX_INV;i++){
      const s=inv[i]; if (!s) continue;
      const ok = addToBank(bank, s.id, 1);
      if (!ok) break;
      inv[i]=null;
    }
    renderInv(); renderBank();
  });

  document.getElementById("bankWithdrawAll").addEventListener("click", () => {
    if (!bankAvailable) return chatLine(`<span class="warn">You must be at a bank chest.</span>`);
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
  let activeUseItemId = null;
  function setUseState(id){
    activeUseItemId = id;
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

    opts.push({ label: "Drop", onClick: ()=>{
      // drop to ground pile at player tile (no deletion)
      inv[idx]=null;
      addGroundLoot(player.x, player.y, s.id, 1);
      renderInv();
      chatLine(`<span class="muted">You drop the ${item?.name ?? s.id}.</span>`);
    }});

    opts.push({ label: "Drop X…", onClick: ()=>{
      const v=prompt("Drop how many?", "10");
      const n=Math.max(1, parseInt(v||"",10) || 0);
      if (!n) return;

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

    if (windowsOpen.bank){
      depositFromInv(idx, null);
      return;
    }

    if (activeUseItemId){
      const toolId = activeUseItemId;
      const targetId = inv[idx].id;

      if (toolId === targetId){
        chatLine(`<span class="muted">Nothing interesting happens.</span>`);
        setUseState(null);
        return;
      }
      tryItemOnItem(toolId, targetId, idx);
      setUseState(null);
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

  let selectedClass = "Warrior";

  function setSelectedClass(cls){
    if (!CLASS_DEFS[cls]) cls = "Warrior";
    selectedClass = cls;
    for (const btn of classPick.querySelectorAll("button[data-class]")){
      btn.classList.toggle("active", btn.dataset.class === selectedClass);
    }
    charColorPill.textContent = CLASS_DEFS[selectedClass].color;
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
      selectedClass = player.class;
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
    quiver.wooden_arrow = 0;

    addToInventory("axe", 1);
    addToInventory("pick", 1);
    addToInventory("knife", 1);

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
    equipment.weapon = null;
    equipment.offhand = null;

    groundLoot.clear();

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

    for (const k of Object.keys(Skills)) Skills[k].xp = 0;

    clearSlots(bank);
    quiver.wooden_arrow = 0;
    groundLoot.clear();

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
    player._lastRangeMsgAt = 0;

    setZoom(0.85);

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
    player.class = selectedClass;
    player.color = CLASS_DEFS[selectedClass].color;

    saveCharacterPrefs();
    charOverlay.style.display="none";

    startNewGame();
    chatLine(`<span class="good">Welcome, ${player.name} the ${player.class}.</span>`);
  };

  // ---------- Entity lookup ----------
  function getEntityAt(tileX,tileY){
    const interIndex = interactables.findIndex(it => it.x===tileX && it.y===tileY);
    if (interIndex>=0){
      const it = interactables[interIndex];
      if (it.type==="bank") return { kind:"bank", index: interIndex, label:"Bank Chest" };
    }

    const mobIndex = mobs.findIndex(m => m.alive && m.x===tileX && m.y===tileY);
    if (mobIndex>=0) return { kind:"mob", index: mobIndex, label:"Rat" };

    const resIndex = resources.findIndex(r => r.alive && r.x===tileX && r.y===tileY);
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
  }

  function beginInteraction(ent){
    closeCtxMenu();
    player.action = { type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null };
    player.target = { kind: ent.kind, index: ent.index };
    ensureWalkIntoRangeAndAct();
  }

  // ---------- Interaction helpers ----------
  function clickToInteract(tileX,tileY){
    const ent=getEntityAt(tileX,tileY);
    if (ent){ beginInteraction(ent); return; }
    player.target=null;
    player.action={type:"idle", endsAt:0, total:0, label:"Idle", onComplete:null};
    setPathTo(tileX,tileY);
  }

  // ---------- Combat + actions ----------
  const gatherParticles = [];
  const combatFX = []; // {kind:"slash"|"arrow"|"bolt", x0,y0,x1,y1, born, life}

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

    if (t.kind==="bank"){
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
      if (player.action.type!=="idle") return;

      chatLine(`<span class="muted">You open the bank chest.</span>`);
      bankAvailable = true;
      updateBankIcon();

      // Bank opens + auto-open inventory
      openWindow("bank");

      stopAction();
      return;
    }

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

    if (t.kind==="mob"){
      const m=mobs[t.index];
      if (!m || !m.alive) return stopAction("That creature is gone.");

      const style = getCombatStyle();
      const maxRangeTiles = (style === "melee") ? 1.15 : 5.0;
      const dTiles = tilesFromPlayerToTile(m.x, m.y);

      if (dTiles > maxRangeTiles){
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

        const adj = [[1,0],[-1,0],[0,1],[0,-1]]
          .map(([dx,dy])=>({x:m.x+dx,y:m.y+dy}))
          .filter(p=>isWalkable(p.x,p.y));
        if (!adj.length) return stopAction("No path to target.");
        adj.sort((a,c)=> (Math.abs(a.x-player.x)+Math.abs(a.y-player.y)) - (Math.abs(c.x-player.x)+Math.abs(c.y-player.y)));
        setPathTo(adj[0].x, adj[0].y);
        return;
      }

      player.facing.x = clamp(m.x - player.x, -1, 1);
      player.facing.y = clamp(m.y - player.y, -1, 1);

      const tNow=now();
      if (tNow < player.attackCooldownUntil) return;
      player.attackCooldownUntil = tNow + 900;

      // Bow ammo rules (quiver)
      if (style === "ranged"){
        if (!consumeFromQuiver("wooden_arrow", 1)){
          chatLine(`<span class="warn">No arrows.</span>`);
          return stopAction();
        }
      }

      // Do damage
      const dmg = 1 + Math.floor(Math.random()*4);
      m.hp -= dmg;

      // Combat animation
      if (style === "melee") spawnCombatFX("slash", m.x, m.y);
      if (style === "ranged") spawnCombatFX("arrow", m.x, m.y);
      if (style === "magic") spawnCombatFX("bolt", m.x, m.y);

      // Health XP always from dealt damage (all styles)
      addXP("health", dmg);

      // Melee training: XP to selected ONLY (no other defense sources exist right now)
      if (style === "melee"){
        addXP(meleeTraining, dmg);
      } else if (style === "ranged"){
        addXP("ranged", dmg);
        addXP("power", dmg);
      } else {
        addXP("sorcery", dmg);
      }

      if (style === "magic"){
        chatLine(`You cast <b>Air Bolt</b> at the rat for <b>${dmg}</b>.`);
      } else if (style === "ranged"){
        chatLine(`You shoot the rat for <b>${dmg}</b>.`);
      } else {
        chatLine(`You hit the rat for <b>${dmg}</b>.`);
      }

      if (m.hp <= 0){
        m.alive=false; m.respawnAt=now()+12000; m.hp=0;
        chatLine(`<span class="good">You defeat the rat.</span>`);

        if (Math.random() < 0.75){
          // auto-loot attempt; if full, it stays on ground
          const got = addToInventory("bone", 1);
          if (got === 1){
            chatLine(`<span class="good">The rat drops a bone.</span>`);
          } else {
            addGroundLoot(m.x, m.y, "bone", 1);
            chatLine(`<span class="warn">Inventory full: ${Items.bone.name}</span>`);
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
      if (!pile || pile.size===0) continue;
      const [sx,sy] = k.split(",").map(n=>parseInt(n,10));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      const d = tilesFromPlayerToTile(sx, sy);
      if (d > range) continue;

      // in range: try to pick up each item
      for (const [id, qty0] of Array.from(pile.entries())){
        let qty = qty0|0;
        if (qty<=0){ pile.delete(id); continue; }

        const item = Items[id];
        if (!item){ pile.delete(id); continue; }

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
          if ((tNow - lastInvFullMsgAt) > 700 || lastInvFullMsgItem !== id){
            chatLine(`<span class="warn">Inventory full: ${item.name}</span>`);
            lastInvFullMsgAt = tNow;
            lastInvFullMsgItem = id;
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
            ctx.fillStyle="#3a2f22";
            ctx.fillRect(px,py,TILE,TILE);
            ctx.fillStyle="rgba(255,255,255,.10)";
            if (n===1 || n===6) ctx.fillRect(px+10,py+12,3,3);
            if (n===3 || n===8) ctx.fillRect(px+20,py+20,2,2);
            ctx.fillStyle="rgba(0,0,0,.18)";
            ctx.fillRect(px,py,TILE,2);
            ctx.fillRect(px,py+TILE-2,TILE,2);
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
    const cx=m.x*TILE+TILE/2;
    const cy=m.y*TILE+TILE/2;

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
    ctx.fillRect(m.x*TILE+6, m.y*TILE+4, TILE-12, 5);
    ctx.fillStyle="#fb7185";
    const w = clamp((m.hp/m.maxHp)*(TILE-12), 0, TILE-12);
    ctx.fillRect(m.x*TILE+6, m.y*TILE+4, w, 5);
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

  function drawInteractables(){
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const it of interactables){
      if (it.x<startX-1 || it.x>endX+1 || it.y<startY-1 || it.y>endY+1) continue;
      if (it.type==="bank") drawBankChest(it.x,it.y);
    }
  }

  function drawLootMarkers(){
    // subtle marker on tiles that have loot
    const {startX,startY,endX,endY}=visibleTileBounds();
    for (const [k,pile] of groundLoot.entries()){
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

  function drawPlayer(){
    ctx.fillStyle="rgba(0,0,0,.25)";
    ctx.beginPath();
    ctx.ellipse(player.px, player.py+10, 10, 5, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle=player.color;
    ctx.beginPath();
    ctx.arc(player.px, player.py, 10, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle="rgba(255,255,255,.12)";
    ctx.beginPath();
    ctx.arc(player.px-3, player.py-4, 4, 0, Math.PI*2);
    ctx.fill();

    if (player.path && player.path.length){
      ctx.fillStyle="rgba(94,234,212,.25)";
      for (const n of player.path) ctx.fillRect(n.x*TILE+10, n.y*TILE+10, 12, 12);
    }

    const a=player.action;
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

    ctx.strokeStyle="rgba(94,234,212,.6)";
    ctx.lineWidth=2;
    ctx.strokeRect(tx*TILE+1, ty*TILE+1, TILE-2, TILE-2);
    ctx.lineWidth=1;

    const ent=getEntityAt(tx,ty);
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
        ctx.fillStyle="rgba(230,238,247,.95)";
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
  let mouseX=0, mouseY=0;
  canvas.addEventListener("mousemove",(e)=>{
    const rect=canvas.getBoundingClientRect();
    const sx=(e.clientX-rect.left)/rect.width;
    const sy=(e.clientY-rect.top)/rect.height;
    mouseX=sx*VIEW_W;
    mouseY=sy*VIEW_H;
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
      opts.push({label:"Attack Rat", onClick:()=>beginInteraction(ent)});
      opts.push({label:"Examine Rat", onClick:()=>examineEntity(ent)});
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
    } else {
      if (isWalkable(tx,ty)) opts.push({label:"Walk here", onClick:walkHere});
      else opts.push({label:"Nothing interesting", onClick:()=>chatLine(`<span class="muted">You can't walk there.</span>`)});
    }
    openCtxMenu(e.clientX,e.clientY,opts);
  });

  // ---------- Saving / Loading (with migration) ----------
  function serialize(){
    return JSON.stringify({
      player:{ x:player.x, y:player.y, name:player.name, class: player.class, color:player.color, hp:player.hp, maxHp:player.maxHp },
      skills:Object.fromEntries(Object.entries(Skills).map(([k,v])=>[k,v.xp])),
      inv,
      bank,
      zoom,
      equipment: { ...equipment },
      quiver: { ...quiver },
      groundLoot: Array.from(groundLoot.entries()).map(([k,p])=>[k, Array.from(p.entries())])
    });
  }

  function deserialize(str){
    const data=JSON.parse(str);

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

    if (Array.isArray(data?.inv)){
      clearSlots(inv);
      for (const s of data.inv){
        if (!s) continue;
        const rawId = s.id;
        const id = (rawId === "bronze_arrow") ? "wooden_arrow" : rawId;
        const item = Items[id];
        if (!item) continue;

        const qty = Math.max(1, (s.qty|0) || 1);

        // route ammo to quiver
        if (item.ammo){
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
        bank[i] = { id, qty };
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
    if (Array.isArray(data?.groundLoot)){
      for (const [k, entries] of data.groundLoot){
        if (!k || !Array.isArray(entries)) continue;
        const pile = new Map();
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

  // ---------- Loop ----------
  let last=now();

  function update(dt){
    const t=now();

    // respawns
    for (const r of resources){
      if (!r.alive && r.respawnAt && t>=r.respawnAt){ r.alive=true; r.respawnAt=0; }
    }
    for (const m of mobs){
      if (!m.alive && m.respawnAt && t>=m.respawnAt){ m.alive=true; m.respawnAt=0; m.hp=m.maxHp; }
    }

    // bank availability
    const bankIt = interactables.find(it=>it.type==="bank");
    if (bankIt){
      bankAvailable = inRangeOfTile(bankIt.x, bankIt.y, 1.1);
    } else {
      bankAvailable = false;
    }
    updateBankIcon();

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
        player.path.shift();
        const dx = next.x - player.x;
        const dy = next.y - player.y;
        if (dx || dy){ player.facing.x=clamp(dx,-1,1); player.facing.y=clamp(dy,-1,1); }
        player.x=next.x; player.y=next.y;
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

    // auto-loot ground piles when in range
    attemptAutoLoot();

    updateFX();
    updateCamera();
    renderHPHUD();
  }

  function render(){
    const mouseWorldX = (mouseX/VIEW_W)*viewWorldW() + camera.x;
    const mouseWorldY = (mouseY/VIEW_H)*viewWorldH() + camera.y;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,VIEW_W,VIEW_H);

    ctx.setTransform(zoom,0,0,zoom, -camera.x*zoom, -camera.y*zoom);

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
      } else if (player.target.kind==="bank"){
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

    drawHover(mouseWorldX, mouseWorldY, mouseX, mouseY);

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

    seedResources();
    seedMobs();
    seedInteractables();

    startNewGame();

    // If bank is open in UI state, ensure it's closed until you are in range
    if (windowsOpen.bank && !bankAvailable) windowsOpen.bank = false;
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