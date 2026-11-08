// Main process entry. SHARED/CORE FILE — flag changes to the team before editing.
// Keep this file thin: it only wires together windows, IPC, persistence, and system reads.
const { app } = require('electron');
const store = require('./store');
const { createPetWindow } = require('./windows/petWindow');
const { registerIpc } = require('./ipc');
const { startSystemReads } = require('./systemReads');
const { createTray } = require('./tray');
const { applyWindowIcons } = require('./windowIcon');

// Only one pet at a time — a second launch just exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    store.load();
    applyWindowIcons(); // classic Starby on every window's title bar / taskbar (before any window opens)
    registerIpc();
    const petWindow = createPetWindow();
    startSystemReads(petWindow);
    createTray(); // tray icon; its right-click menu = the old right-click menu (tray.js)
  });

  app.on('window-all-closed', () => app.quit());
}
