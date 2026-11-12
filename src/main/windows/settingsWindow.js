// The settings window: frameless, transparent, fixed size, same as the shop window. The page
// draws everything: the team's background art (with "SETTINGS" on it) and an image close
// button. No minimize / maximize / fullscreen buttons. Content scrolls inside the art's panel.
// Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');
const { getPetWindow } = require('./petWindow');
// Window size + page zoom, shared with the shop window (see menuSize.js).
const { MENU_SCALE } = require('./menuSize');
// ...times the "UI size" setting (menuScale.js).
const { menuWindowSize, trackMenuWindow } = require('./menuScale');

let settingsWindow = null;

// Settings stays in front of other windows until it's closed (always-on-top), like the shop.
// WINDOWS QUIRK: always-on-top windows are ordered by which was raised last, so raising/clicking
// Settings would put it ABOVE the pet window and hide Starby. Every time it's raised, move the
// pet window back on top (moveTop doesn't take focus). Same as shopWindow.js.
function keepPetAbove() {
  const pet = getPetWindow();
  if (pet && !pet.isDestroyed()) pet.moveTop();
}

function raiseSettings() {
  bringToFront(settingsWindow, { stayOnTop: true });
  keepPetAbove();
}

function openSettingsWindow() {
  if (settingsWindow) {
    raiseSettings();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    // Same size as the shop: the background art's aspect ratio (2324×2596). The page scrolls.
    ...menuWindowSize(),
    useContentSize: true,
    title: 'sprite.exe — settings',
    frame: false,
    // Transparent: the art's corners (outside its hand-drawn border) are see-through.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // Shown once the page has painted (no blank window), and in front (see bringToFront.js).
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // pages can't reach the file system or Node, even if tricked (Electron's default, made explicit)
      zoomFactor: MENU_SCALE, // page laid out for 584×652, shown smaller (menuSize.js)
    },
  });

  trackMenuWindow(settingsWindow); // resizes live with the UI size slider
  settingsWindow.once('ready-to-show', raiseSettings);
  settingsWindow.on('focus', keepPetAbove); // clicking Settings raises it: keep Starby above it
  settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

module.exports = { openSettingsWindow };
