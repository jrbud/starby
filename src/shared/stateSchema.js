// Persisted state schema. SHARED/CORE FILE — flag changes before editing.
// If you add a field: add it to createDefaultState() and make sure migrate() fills it in
// for old save files (spreading the defaults usually handles it).

const { getItem } = require('./shopCatalog');

// v2: removed the 'shape' slot (the star has one shape). migrate() drops old shape items.
// v3: currency renamed `stardust` -> `starbits`. migrate() carries old `stardust` counts over.
// v4: accessories cost starbits again. v3 builds handed every accessory out for free, so a v3
//     save lists them all as owned; migrate() takes those back, except the one he's wearing
//     (so nobody's star suddenly loses its hat).
// v5: several accessories at once, one per shop category. `equipped.accessory` (one id) became
//     `equipped.accessories` ({ head: id, hand: id, ... }; a missing category = nothing worn
//     there). migrate() moves the old single accessory into its category.
const SCHEMA_VERSION = 5;

function createDefaultState() {
  return {
    version: SCHEMA_VERSION,
    starbits: 0,
    // Item ids from shopCatalog.js. The free starter items are always owned.
    owned: ['color-sunny', 'accessory-none'],
    equipped: {
      color: 'color-sunny',
      accessories: {}, // category (shopCatalog.js `category`) → accessory item id
    },
  };
}

/** Is this an accessory id that can be worn in `category` (owned, real, right category)? */
function wearable(owned, id, category) {
  const item = getItem(id);
  return Boolean(item && owned.includes(id) && item.slot === 'accessory' && item.category && item.category === category);
}

function migrate(raw) {
  const defaults = createDefaultState();
  if (!raw || typeof raw !== 'object') return defaults;
  // Keep only items that still exist in the catalog (drops removed items, e.g. old shapes).
  let owned = Array.from(new Set([...defaults.owned, ...(Array.isArray(raw.owned) ? raw.owned : [])]))
    .filter((id) => getItem(id));
  // Saves from before v4 got every accessory for free: take them back, keeping the worn one.
  if (!(raw.version >= 4)) {
    const worn = raw.equipped?.accessory;
    owned = owned.filter((id) => getItem(id).slot !== 'accessory' || defaults.owned.includes(id) || id === worn);
  }
  // Color: an owned color item, otherwise the default.
  const equipped = { color: defaults.equipped.color, accessories: {} };
  const color = raw.equipped?.color;
  if (owned.includes(color) && getItem(color).slot === 'color') equipped.color = color;
  // Accessories: at most one per category, each owned and in the right category.
  const rawAcc = raw.equipped?.accessories;
  if (rawAcc && typeof rawAcc === 'object') {
    for (const [category, id] of Object.entries(rawAcc)) {
      if (wearable(owned, id, category)) equipped.accessories[category] = id;
    }
  } else {
    // Before v5: one accessory (`equipped.accessory`): wear it in its category.
    const old = getItem(raw.equipped?.accessory);
    if (old && wearable(owned, old.id, old.category)) equipped.accessories[old.category] = old.id;
  }
  // v2 saves stored the currency as `stardust`; drop that key so it isn't saved again.
  const { stardust: oldStardust, ...rest } = raw;
  let starbits = 0;
  if (Number.isFinite(raw.starbits)) starbits = raw.starbits;
  else if (Number.isFinite(oldStardust)) starbits = oldStardust;
  return {
    ...defaults,
    ...rest,
    version: SCHEMA_VERSION,
    starbits,
    owned,
    equipped,
  };
}

module.exports = { SCHEMA_VERSION, createDefaultState, migrate };
