// The shop window: a normal (framed, opaque) window. Only one at a time.
const { BrowserWindow } = require('electron');
const path = require('path');

let shopWindow = null;

function openShopWindow() {
  if (shopWindow) {
    shopWindow.show();
    shopWindow.focus();
    return shopWindow;
  }

  shopWindow = new BrowserWindow({
    width: 440,
    height: 560,
    title: 'sprite.exe — shop',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shopWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'shop', 'index.html'));
  shopWindow.on('closed', () => { shopWindow = null; });
  return shopWindow;
}

module.exports = { openShopWindow };
