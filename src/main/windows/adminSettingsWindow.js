// The Admin Settings window: a small normal (framed, opaque) window for tuning starbits
// (drop rate, burst size, value, lifetime, magnet). Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');

let adminWindow = null;

function openAdminSettingsWindow() {
  if (adminWindow) {
    adminWindow.show();
    adminWindow.focus();
    return adminWindow;
  }

  adminWindow = new BrowserWindow({
    width: 440,
    height: 720,
    title: 'Admin Settings',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  adminWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'admin', 'index.html'));
  adminWindow.on('closed', () => { adminWindow = null; });
  return adminWindow;
}

module.exports = { openAdminSettingsWindow };
