// Persisted state (stardust, owned items, equipped items) as a small JSON file.
// Schema lives in src/shared/stateSchema.js.
//
// Location: Electron's per-app data folder (app.getPath('userData'),
// i.e. %APPDATA%\sprite-exe\state.json on Windows). That folder belongs to this app only.
// We never write anywhere else.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createDefaultState, migrate } = require('../shared/stateSchema');

let state = null;
let filePath = null;

function load() {
  filePath = path.join(app.getPath('userData'), 'state.json');
  try {
    state = migrate(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    // Missing or corrupt file → start fresh.
    state = createDefaultState();
  }
  return state;
}

function save() {
  // Write to a temp file then rename, so a crash mid-write can't corrupt the save.
  const tmp = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
}

function get() {
  return state;
}

// Mutate state via a callback, persist it, and tell every window about the change.
function update(mutator) {
  mutator(state);
  save();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('state:changed', state);
  }
  return state;
}

module.exports = { load, get, update };
