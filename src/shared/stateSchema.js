// Persisted state schema. SHARED/CORE FILE — flag changes before editing.
// If you add a field: add it to createDefaultState() and make sure migrate() fills it in
// for old save files (spreading the defaults usually handles it).

const { getItem } = require('./shopCatalog');

// v2: removed the 'shape' slot (the star has one shape). migrate() drops old shape items.
// v3: currency renamed `stardust` -> `starbits`. migrate() carries old `stardust` counts over.
const SCHEMA_VERSION = 3;

function createDefaultState() {
  return {
    version: SCHEMA_VERSION,
    starbits: 0,
    // Item ids from shopCatalog.js. The free starter items are always owned.
    owned: ['color-sunny', 'accessory-none'],
    equipped: {
      color: 'color-sunny',
      accessory: 'accessory-none',
    },
  };
}

function migrate(raw) {
  const defaults = createDefaultState();
  if (!raw || typeof raw !== 'object') return defaults;
  // Keep only items that still exist in the catalog (drops removed items, e.g. old shapes).
  const owned = Array.from(new Set([...defaults.owned, ...(Array.isArray(raw.owned) ? raw.owned : [])]))
    .filter((id) => getItem(id));
  // Keep only known slots, each holding an owned item of that slot; otherwise use the default.
  const equipped = { ...defaults.equipped };
  for (const slot of Object.keys(equipped)) {
    const id = raw.equipped?.[slot];
    if (owned.includes(id) && getItem(id).slot === slot) equipped[slot] = id;
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
