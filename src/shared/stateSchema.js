// Persisted state schema. SHARED/CORE FILE — flag changes before editing.
// If you add a field: add it to createDefaultState() and make sure migrate() fills it in
// for old save files (spreading the defaults usually handles it).

const SCHEMA_VERSION = 1;

function createDefaultState() {
  return {
    version: SCHEMA_VERSION,
    stardust: 0,
    // Item ids from shopCatalog.js. The free starter items are always owned.
    owned: ['color-sunny', 'shape-star4', 'accessory-none'],
    equipped: {
      color: 'color-sunny',
      shape: 'shape-star4',
      accessory: 'accessory-none',
    },
  };
}

function migrate(raw) {
  const defaults = createDefaultState();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    ...defaults,
    ...raw,
    version: SCHEMA_VERSION,
    stardust: Number.isFinite(raw.stardust) ? raw.stardust : 0,
    owned: Array.from(new Set([...defaults.owned, ...(Array.isArray(raw.owned) ? raw.owned : [])])),
    equipped: { ...defaults.equipped, ...(raw.equipped || {}) },
  };
}

module.exports = { SCHEMA_VERSION, createDefaultState, migrate };
