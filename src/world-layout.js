export const VENDOR_TILE = { x: 20, y: 4 };

export const DECOR_EXAMINE_TEXT = {
  castle_torch: "A wall-mounted torch keeps the hall warmly lit.",
  castle_weapon_rack: "A tidy rack of training weapons.",
  castle_table: "A command table covered with simple field notes.",
  castle_bench: "A heavy stone bench for weary travelers.",
  castle_bookshelf: "Shelves packed with old manuals and records.",
  castle_armor_stand: "A ceremonial suit of armor stands on display.",
  castle_candle: "A brass candle stand with a steady little flame.",
  castle_crest: "The castle crest, polished and proudly displayed.",
  castle_rug: "A royal runner rug leading through the hall.",

  shop_shelf: "Shelves stacked with mixed supplies for travelers.",
  shop_counter: "A sturdy counter for haggling and trade.",
  shop_crate: "A crate of dry goods and spare tools.",
  shop_barrel: "A barrel sealed tight against weather and pests.",
  shop_sign: "A signpost marking the local trading shop.",
  shop_lantern: "A lantern that helps customers find the door at night.",
  shop_bush: "A neatly trimmed bush that brightens the storefront.",
  shop_flower: "A patch of hardy flowers planted by the path.",
  shop_rug: "A woven runner that guides customers to the counter."
};

function buildCastleDecorDefs(startCastle) {
  const x0 = startCastle.x0 | 0;
  const y0 = startCastle.y0 | 0;
  const x1 = x0 + (startCastle.w | 0) - 1;
  const y1 = y0 + (startCastle.h | 0) - 1;
  const gateX = (startCastle.gateX ?? (x0 + Math.floor((startCastle.w | 0) / 2))) | 0;
  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;

  const defs = [
    { id: "castle_torch", label: "Wall Torch", x: ix0 + 2, y: iy0 },
    { id: "castle_torch", label: "Wall Torch", x: ix1 - 2, y: iy0 },
    { id: "castle_weapon_rack", label: "Weapon Rack", x: ix0, y: iy0 + 2 },
    { id: "castle_table", label: "Command Table", x: gateX, y: iy0 + 1 },
    { id: "castle_bench", label: "Stone Bench", x: gateX - 2, y: y1 + 1 },
    { id: "castle_torch", label: "Wall Torch", x: gateX - 1, y: y1 },
    { id: "castle_torch", label: "Wall Torch", x: gateX + 1, y: y1 },
    { id: "castle_bookshelf", label: "Bookshelf", x: ix1 - 1, y: iy0 + 1 }
  ];

  for (let y = iy0 + 1; y <= iy1; y++) {
    defs.push({ id: "castle_rug", label: "Royal Rug", x: gateX, y });
  }
  return defs;
}

function buildShopDecorDefs(vendorShop) {
  const x0 = vendorShop.x0 | 0;
  const y0 = vendorShop.y0 | 0;
  const x1 = x0 + (vendorShop.w | 0) - 1;
  const y1 = y0 + (vendorShop.h | 0) - 1;
  const gateX = x0 + Math.floor((vendorShop.w | 0) / 2);
  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;

  const defs = [
    { id: "shop_shelf", label: "Supply Shelf", x: ix1 - 1, y: iy0 },
    { id: "shop_counter", label: "Trade Counter", x: ix1, y: iy0 + 2 },
    { id: "shop_barrel", label: "Storage Barrel", x: ix1, y: iy1 },
    { id: "shop_crate", label: "Storage Crate", x: x1 + 1, y: y1 },
    { id: "shop_barrel", label: "Storage Barrel", x: x0 - 1, y: y1 },
    { id: "shop_sign", label: "Shop Signpost", x: gateX + 1, y: y1 + 2 },
    { id: "shop_lantern", label: "Door Lantern", x: gateX + 1, y: y1 },
    { id: "shop_bush", label: "Trimmed Bush", x: x0 - 1, y: y1 - 1 },
    { id: "shop_bush", label: "Trimmed Bush", x: x1 + 1, y: y0 + 1 },
    { id: "shop_flower", label: "Flower Patch", x: x1 + 2, y: y0 + 2 }
  ];
  for (let y = iy0 + 1; y <= iy1; y++) {
    defs.push({ id: "shop_rug", label: "Shop Runner", x: gateX, y });
  }
  return defs;
}

function mapInBounds(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function paintPathTile(map, width, height, x, y) {
  if (!mapInBounds(x, y, width, height)) return;
  const t = map[y][x];
  if (t === 0 || t === 5) map[y][x] = 5;
}

function carveManhattanPath(map, width, height, x0, y0, x1, y1) {
  let x = x0 | 0;
  let y = y0 | 0;
  paintPathTile(map, width, height, x, y);
  while (x !== x1) {
    x += Math.sign(x1 - x);
    paintPathTile(map, width, height, x, y);
  }
  while (y !== y1) {
    y += Math.sign(y1 - y);
    paintPathTile(map, width, height, x, y);
  }
}

export function createDecorLookup(startCastle, vendorShop) {
  const defs = [...buildCastleDecorDefs(startCastle), ...buildShopDecorDefs(vendorShop)];
  const lookup = new Map();
  for (const d of defs) {
    const key = `${d.x},${d.y}`;
    if (!lookup.has(key)) lookup.set(key, d);
  }
  return function getDecorAt(tx, ty) {
    return lookup.get(`${tx},${ty}`) ?? null;
  };
}

export function stampVendorShopLayout({ map, width, height, startCastle, vendorShop }) {
  const x0 = vendorShop.x0 | 0;
  const y0 = vendorShop.y0 | 0;
  const w = vendorShop.w | 0;
  const h = vendorShop.h | 0;
  if (w < 3 || h < 3) return;

  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (!mapInBounds(x, y, width, height)) continue;
      const edge = (x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1);
      map[y][x] = edge ? 4 : 3;
    }
  }

  const gateX = x0 + Math.floor(w / 2);
  const gateY = y0 + h - 1;
  if (mapInBounds(gateX, gateY, width, height)) map[gateY][gateX] = 5;
  if (mapInBounds(gateX, gateY + 1, width, height)) map[gateY + 1][gateX] = 5;
  if (mapInBounds(gateX, gateY + 2, width, height)) map[gateY + 2][gateX] = 5;

  const fromX = (startCastle.gateX ?? (startCastle.x0 + Math.floor(startCastle.w / 2))) | 0;
  const fromY = ((startCastle.gateY ?? (startCastle.y0 + startCastle.h - 1)) + 1) | 0;
  const toX = gateX;
  const toY = gateY + 2;
  carveManhattanPath(map, width, height, fromX, fromY, toX, toY);
}
