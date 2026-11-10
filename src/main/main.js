// Main process entry. SHARED/CORE FILE — flag changes to the team before editing.
// Keep this file thin: it only wires together windows, IPC, persistence, and system reads.
const { app } = require('electron');
const store = require('./store');
const { createPetWindow } = require('./windows/petWindow');
const { registerIpc } = require('./ipc');
const { startSystemReads } = require('./systemReads');
const { createTray } = require('./tray');
const { applyWindowIcons } = require('./windowIcon');
const { setupGoodbye } = require('./goodbye');
const settingsStore = require('./settingsStore');
const { openWelcomeWindow } = require('./windows/welcomeWindow');

// Starby himself: the pet window, system reads, tray, goodbye. Runs right away, or after the
// welcome window's "Let's go!" (windows/welcomeWindow.js) while that's still switched on.
let started = false;
function startStarby() {
  if (started) return;
  started = true;
  const petWindow = createPetWindow();
  startSystemReads(petWindow);
  createTray(); // tray icon; its right-click menu = the old right-click menu (tray.js)
  setupGoodbye(); // quitting: Starby says bye + bursts into stars first (goodbye.js)
}

// Only one pet at a time — a second launch just exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    store.load();
    applyWindowIcons(); // classic Starby on every window's title bar / taskbar (before any window opens)
    registerIpc();
    // WELCOME first, before anything of Starby loads, until "Don't show this again" (showWelcome = 0).
    // `npm start -- --welcome` shows it anyway (for working on the welcome window).
    const forceWelcome = process.argv.includes('--welcome');
    if (forceWelcome || Number(settingsStore.get().showWelcome) !== 0) openWelcomeWindow(startStarby);
    else startStarby();
  });

  app.on('window-all-closed', () => app.quit());
}
