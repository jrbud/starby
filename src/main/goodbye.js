// GOODBYE ON QUIT: whenever sprite.exe quits (tray menu "Quit sprite.exe", the dialogue's Quit,
// Windows closing it...), Starby says goodbye first: a fun line, then he bursts into star clouds
// and shrinks away (src/renderer/pet/behaviors/goodbye.js), THEN the app quits.
//
// Every quit path goes through app.quit(), which fires 'before-quit': we hold that quit once, ask
// the pet window to say goodbye (pet:command → window.starby.goodbye()), and quit for real when it
// reports back ('app:goodbye-done'), or after GOODBYE_MAX_MS no matter what, so a stuck renderer
// can never keep the app open. No pet window (already closed) → just quit.
const { app, ipcMain } = require('electron');
const { getPetWindow } = require('./windows/petWindow');

const GOODBYE_MAX_MS = 3500; // the goodbye takes ~2s; never wait longer than this

let done = false; // goodbye finished (or skipped): let the next quit through
let leaving = false; // goodbye in progress
let timer = null;

function finish() {
  if (done) return;
  done = true;
  clearTimeout(timer);
  app.quit();
}

function setupGoodbye() {
  ipcMain.on('app:goodbye-done', finish);
  app.on('before-quit', (e) => {
    if (done) return;
    const win = getPetWindow();
    if (!win || win.isDestroyed()) { done = true; return; } // nobody to say goodbye
    e.preventDefault();
    if (leaving) return; // already saying goodbye (quit clicked twice)
    leaving = true;
    win.webContents.send('pet:command', { type: 'starby', fn: 'goodbye' });
    timer = setTimeout(finish, GOODBYE_MAX_MS);
  });
}

module.exports = { setupGoodbye };
