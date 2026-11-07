// The settings window: a small normal (framed, opaque) window. Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');

let settingsWindow = null;

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 300,
    title: 'sprite.exe — settings',
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

module.exports = { openSettingsWindow };
