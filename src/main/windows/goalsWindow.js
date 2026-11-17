// The goals checklist window ("Let's set goals!" in the focus-mode menu): frameless, transparent,
// the same size as the shop / settings windows (the checklist art, assets/backgrounds/checklist.png,
// has the same 2324×2596 shape and inner panel). The page draws everything, including its own
// minimize and close icons (src/renderer/goals/). Only one at a time.
//
// THE GOALS FILE: what you write is kept as Markdown in goals.md, in Electron's per-app data
// folder (app.getPath('userData'), next to state.json / settings.json). That folder belongs to
// this app only; nothing is written anywhere else. Written via a temp file + rename, so a crash
// mid-write can't corrupt it.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { bringToFront } = require('./bringToFront');
const { MENU_SCALE } = require('./menuSize');
const { menuWindowSize, trackMenuWindow } = require('./menuScale');

const MAX_CHARS = 200000; // plenty for a checklist; keeps a runaway paste from writing huge files

let goalsWindow = null;

const goalsPath = () => path.join(app.getPath('userData'), 'goals.md');

function loadGoals() {
  try {
    return fs.readFileSync(goalsPath(), 'utf8');
  } catch {
    return ''; // no goals yet
  }
}

function saveGoals(markdown) {
  if (typeof markdown !== 'string') return;
  const file = goalsPath();
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, markdown.slice(0, MAX_CHARS));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn('[goals] could not save goals.md:', err.message);
  }
}

function openGoalsWindow() {
  if (goalsWindow) {
    bringToFront(goalsWindow, { stayOnTop: true });
    return goalsWindow;
  }
  goalsWindow = new BrowserWindow({
    ...menuWindowSize(),
    useContentSize: true,
    title: 'sprite.exe — checklist',
    frame: false,
    transparent: true, // the art's corners are see-through
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false, // shown once painted, in front (bringToFront.js)
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: MENU_SCALE, // page laid out for 584×652, shown smaller (menuSize.js)
    },
  });
  trackMenuWindow(goalsWindow); // follows Settings → UI → Menu size, live
  goalsWindow.once('ready-to-show', () => bringToFront(goalsWindow, { stayOnTop: true }));
  goalsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'goals', 'index.html'));
  goalsWindow.on('closed', () => { goalsWindow = null; });
  return goalsWindow;
}

const minimizeGoals = () => goalsWindow?.minimize();
const closeGoals = () => goalsWindow?.close();

module.exports = { openGoalsWindow, minimizeGoals, closeGoals, loadGoals, saveGoals };
