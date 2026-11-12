// The Developer window (tray → "Developer…"): a plain, framed window with two tabs. Actions: buttons that trigger
// Starby's debug helpers (window.starby.* in the pet window), start events, open the pet's
// DevTools, etc. Admin Settings: the starbits tuning sliders (was its own window; adminSettingsStore.js).
// Not styled on purpose; it's for the team, not players. Only one at a time.
// The page: src/renderer/devtools/. Its buttons call window.sprite.devCommand(cmd) → ipc.js
// 'dev:command' → handleDevCommand below, which only listens to THIS window.
const { BrowserWindow } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');
const { getPetWindow } = require('./petWindow');

let devWindow = null;

/** tab: 'actions' | 'admin' (omit = the last one used). */
function openDevToolsWindow(tab) {
  if (devWindow) {
    if (tab) devWindow.webContents.executeJavaScript(`window.showTab?.(${JSON.stringify(tab)})`).catch(() => {});
    bringToFront(devWindow);
    return devWindow;
  }
  devWindow = new BrowserWindow({
    width: 560,
    height: 820,
    title: 'Starby Developer',
    autoHideMenuBar: true,
    resizable: true,
    show: false, // shown once painted, in front of your current app (bringToFront.js)
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  devWindow.once('ready-to-show', () => bringToFront(devWindow));
  devWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'devtools', 'index.html'), tab ? { query: { tab } } : undefined);
  devWindow.on('closed', () => { devWindow = null; });
  return devWindow;
}

const NAME = /^[A-Za-z][\w-]{0,40}$/;
const okArg = (a) => ['string', 'number', 'boolean'].includes(typeof a) && String(a).length <= 40;

/** ipc.js 'dev:command'. Ignores anything not sent by the Developer window. */
function handleDevCommand(sender, cmd) {
  if (!devWindow || devWindow.isDestroyed() || sender !== devWindow.webContents || !cmd) return;
  const pet = getPetWindow();
  const toPet = (c) => { if (pet && !pet.isDestroyed()) pet.webContents.send('pet:command', c); };
  switch (cmd.type) {
    case 'pet-devtools':
      pet?.webContents.openDevTools({ mode: 'detach' });
      break;
    case 'starby': // window.starby[fn](...args) in the pet window (pet.js onPetCommand)
      if (NAME.test(cmd.fn || '')) {
        const args = Array.isArray(cmd.args) ? cmd.args.filter(okArg).slice(0, 4) : [];
        toPet({ type: 'starby', fn: cmd.fn, args });
      }
      break;
    case 'start-event':
      if (NAME.test(cmd.name || '')) toPet({ type: 'start-event', name: cmd.name });
      break;
    default:
  }
}

module.exports = { openDevToolsWindow, handleDevCommand };
