// User settings (sliders etc.), kept separate from the game state in store.js so settings
// changes never touch the persisted-state schema.
//
// Saved as settings.json in Electron's per-app data folder (next to state.json). That folder
// belongs to this app only; nothing is written anywhere else.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  flingPower: 50, // 0–100: how hard throws fly and how bouncy the walls are (50 = original feel)
  // Starbit colors switched ON in Settings (names from renderer/shared/starbitArt.js).
  // Default: yellow only. Must match DEFAULT_STARBIT_COLORS in starbitArt.js.
  starbitColors: ['yellow'],
  starbitSize: 20, // px on screen (the Settings slider allows 10–48)
  // Starbits on/off switches (1 = on, 0 = off):
  starbitSpawning: 1, // drop starbits at all (timed, wall hits, tag rewards)
  starbitVisible: 1, // show starbits on screen (off = hidden, still collectable)
  starbitShootAnimation: 1, // collected starbits zip to the count card (off = just fade)
};

// List settings: arrays of short lowercase names (e.g. color names), nothing else.
const LIST_ITEM = /^[a-z][a-z0-9-]{0,23}$/;
const LIST_MAX = 32;

let settings = null;
let filePath = null;
let saveTimer = null;

function load() {
  filePath = path.join(app.getPath('userData'), 'settings.json');
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch {
    settings = { ...DEFAULTS }; // missing or corrupt file → defaults
  }
}

function get() {
  if (!settings) load(); // loaded lazily, so main.js doesn't need to know about this file
  return settings;
}

// Sliders send many updates per second while dragging: apply and broadcast right away,
// but only write the file once things settle.
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, filePath);
  }, 300);
}

function set(patch) {
  get();
  for (const key of Object.keys(patch || {})) {
    if (!(key in DEFAULTS)) continue; // ignore unknown keys
    if (Array.isArray(DEFAULTS[key])) {
      // List setting: keep only valid, unique names.
      if (Array.isArray(patch[key])) {
        settings[key] = [...new Set(patch[key].filter((v) => typeof v === 'string' && LIST_ITEM.test(v)))]
          .slice(0, LIST_MAX);
      }
      continue;
    }
    const value = Number(patch[key]);
    if (Number.isFinite(value)) settings[key] = Math.max(0, Math.min(100, value));
  }
  scheduleSave();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings);
  }
  return settings;
}

function reset() {
  return set({ ...DEFAULTS, starbitColors: [...DEFAULTS.starbitColors] });
}

module.exports = { get, set, reset, DEFAULTS };
