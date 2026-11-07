// Main process entry. SHARED/CORE FILE — flag changes to the team before editing.
// Keep this file thin: it only wires together windows, IPC, persistence, and system reads.
const { app } = require('electron');
const store = require('./store');
const { createPetWindow } = require('./windows/petWindow');
const { registerIpc } = require('./ipc');
const { startSystemReads } = require('./systemReads');

// Only one pet at a time — a second launch just exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    store.load();
    registerIpc();
    const petWindow = createPetWindow();
    startSystemReads(petWindow);
  });

  app.on('window-all-closed', () => app.quit());
}
