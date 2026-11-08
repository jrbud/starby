// Admin Settings: developer/demo tuning overrides (starbits drop rate, value, magnet, ...).
// Kept separate from settings.json (user settings) and state.json (game state), so it never
// touches the persisted-state schema.
//
// Only values someone changed are stored; the defaults, ranges and labels live in
// src/renderer/shared/starbitsTuning.js, and the pet clamps everything to those ranges.
// Here we only make sure what's saved is a small set of plain numbers.
//
// Saved as admin-settings.json in Electron's per-app data folder (next to settings.json).
// That folder belongs to this app only; nothing is written anywhere else.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_KEYS = 50;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

let overrides = null;
let filePath = null;
let saveTimer = null;

function clean(obj) {
  const out = {};
  for (const [key, raw] of Object.entries(obj || {})) {
    const value = Number(raw);
    if (KEY_PATTERN.test(key) && Number.isFinite(value) && Object.keys(out).length < MAX_KEYS) out[key] = value;
  }
  return out;
}

function load() {
  filePath = path.join(app.getPath('userData'), 'admin-settings.json');
  try {
    overrides = clean(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    overrides = {}; // missing or corrupt file → all defaults
  }
}

function get() {
  if (!overrides) load(); // loaded lazily, so main.js doesn't need to know about this file
  return overrides;
}

// Sliders send many updates per second while dragging: apply and broadcast right away,
// but only write the file once things settle.
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(overrides, null, 2));
    fs.renameSync(tmp, filePath);
  }, 300);
}

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('admin:changed', overrides);
  }
}

function set(patch) {
  get();
  overrides = { ...overrides, ...clean(patch) };
  scheduleSave();
  broadcast();
  return overrides;
}

function reset() {
  get();
  overrides = {};
  scheduleSave();
  broadcast();
  return overrides;
}

module.exports = { get, set, reset };
