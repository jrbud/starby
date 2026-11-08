// The Admin Settings window: a small normal (framed, opaque) window for tuning starbits
// (drop rate, burst size, value, lifetime, magnet). Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');

let adminWindow = null;

function openAdminSettingsWindow() {
  if (adminWindow) {
    bringToFront(adminWindow);
    return adminWindow;
  }

  adminWindow = new BrowserWindow({
    width: 440,
    height: 720,
    title: 'Admin Settings',
    autoHideMenuBar: true,
    resizable: true,
    // Shown once the page has painted, and brought in front of your current app (see
    // bringToFront.js). Without this it opened blank or behind other windows and only showed
    // its contents after being clicked (same fix as the shop and settings windows).
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // pages can't reach the file system or Node, even if tricked (Electron's default, made explicit)
    },
  });

  adminWindow.once('ready-to-show', () => bringToFront(adminWindow));
  adminWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'admin', 'index.html'));
  adminWindow.on('closed', () => { adminWindow = null; });
  return adminWindow;
}

module.exports = { openAdminSettingsWindow };
