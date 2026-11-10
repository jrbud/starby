// User settings (sliders etc.), kept separate from the game state in store.js so settings
// changes never touch the persisted-state schema.
//
// Saved as settings.json in Electron's per-app data folder (next to state.json). That folder
// belongs to this app only; nothing is written anywhere else.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  showWelcome: 1, // the welcome window at launch (windows/welcomeWindow.js); 0 = "Don't show this again"
  flingPower: 50, // 0–100: how hard throws fly and how bouncy the walls are (50 = original feel)
  starbySize: 100, // Starby's size on screen in px (Settings slider, 50–150; pet.js applies it live)
  // Settings → UI (sliders, 75–150 %; 100 = as designed):
  menuScale: 100, // shop/settings windows (windows/menuScale.js) + the right-click/event menus' answer boxes
  chatScale: 100, // speech + thought bubbles (incl. his line in the right-click menu)
  fontScale: 100, // text in the bubbles and menu boxes (the bubbles grow to fit)
  // (pet-window side of all three: renderer/pet/uiScale.js)
  // Starbit colors switched ON in Settings (names from renderer/shared/starbitArt.js).
  // Default: every color except white. Must match DEFAULT_STARBIT_COLORS in starbitArt.js.
  starbitColors: ['blue', 'green', 'pink', 'red', 'teal', 'yellow'],
  starbitSize: 20, // px on screen (the Settings slider allows 10–48)
  // Starbits on/off switches (1 = on, 0 = off):
  starbitSpawning: 1, // drop starbits at all (timed, wall hits, tag rewards)
  starbitVisible: 1, // show starbits on screen (off = hidden, still collectable)
  starbitShootAnimation: 1, // collected starbits zip to the count card (off = just fade)
  starbitShowCount: 1, // the count card slides in at the top right on collect (off = no card)
  // Sound effects (assets/sounds/, played via renderer/shared/sfx.js):
  sfxVolume: 70, // master "All sounds", 0–150 % (100 = as recorded)
  sfxMuted: 0, // 1 = muted (keeps sfxVolume for when you unmute)
  // Per-category sound controls (categories: SOUND_CATEGORIES in renderer/shared/sfx.js).
  // Volume 0–200 % on top of sfxVolume (100 = no change); On 1/0 switches the category on/off.
  sfxVoiceVolume: 100, // chat + prompt
  sfxVoiceOn: 1,
  sfxStarbitsVolume: 100, // collecting starbits
  sfxStarbitsOn: 1,
  sfxActionVolume: 100, // throw, sling, explode
  sfxActionOn: 1,
  sfxAppVolume: 100, // startup + exit
  sfxAppOn: 1,
};

// Number settings are kept within 0–100 unless listed here as [min, max].
const RANGES = {
  starbySize: [50, 150], // keep in sync with SIZE_MIN / SIZE_MAX in src/renderer/pet/pet.js
  // UI sliders: keep in sync with renderer/settings/index.html and renderer/pet/uiScale.js
  menuScale: [75, 150],
  chatScale: [75, 150],
  fontScale: [75, 150],
  // Sound sliders go up to 200 % (shared/sfx.js boosts past full volume). Keep in sync with the
  // sliders' max in renderer/settings (index.html master, settings.js categories).
  sfxVolume: [0, 150], // master; the categories below go to 200
  sfxVoiceVolume: [0, 200],
  sfxStarbitsVolume: [0, 200],
  sfxActionVolume: [0, 200],
  sfxAppVolume: [0, 200],
};

// List settings: arrays of short lowercase names (e.g. color names), nothing else.
const LIST_ITEM = /^[a-z][a-z0-9-]{0,23}$/;
const LIST_MAX = 32;

let settings = null;
let filePath = null;
let saveTimer = null;
const listeners = []; // main-process code that reacts to changes (onChange)

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
    const [min, max] = RANGES[key] || [0, 100];
    if (Number.isFinite(value)) settings[key] = Math.max(min, Math.min(max, value));
  }
  scheduleSave();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings);
  }
  for (const fn of listeners) fn(settings);
  return settings;
}

/** Main-process listener for settings changes (renderers use 'settings:changed'). */
function onChange(fn) {
  listeners.push(fn);
}

function reset() {
  return set({ ...DEFAULTS, starbitColors: [...DEFAULTS.starbitColors] });
}

module.exports = { get, set, reset, onChange, DEFAULTS };
