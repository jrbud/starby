// The settings window: frameless, transparent, fixed size, same as the shop window. The page
// draws everything: the team's background art (with "SETTINGS" on it) and an image close
// button. No minimize / maximize / fullscreen buttons. Content scrolls inside the art's panel.
// Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');
// Window size + page zoom, shared with the shop window (see menuSize.js).
const { MENU_SCALE, MENU_WIDTH, MENU_HEIGHT } = require('./menuSize');

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow) {
    bringToFront(settingsWindow);
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    // Same size as the shop: the background art's aspect ratio (2324×2596). The page scrolls.
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
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
      zoomFactor: MENU_SCALE, // page laid out for 584×652, shown smaller (menuSize.js)
    },
  });

  settingsWindow.once('ready-to-show', () => bringToFront(settingsWindow));
  settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

module.exports = { openSettingsWindow };
