// The settings window: a small normal (framed, opaque) window. Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow) {
    bringToFront(settingsWindow);
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 300,
    title: 'sprite.exe — settings',
    autoHideMenuBar: true,
    resizable: false,
    // Shown once the page has painted (no blank window), and in front (see bringToFront.js).
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.once('ready-to-show', () => bringToFront(settingsWindow));
  settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

module.exports = { openSettingsWindow };
