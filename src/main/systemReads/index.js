// Harmless, READ-ONLY system reads that feed cute reactions in the pet renderer.
// Each reader gets an `emit(type, payload)` that forwards a 'system:event' to the pet window.
// Rule: nothing in this folder may write, modify, or elevate. Read only.
const clipboard = require('./clipboard');
const idle = require('./idle');
const power = require('./power');
const timeOfDay = require('./timeOfDay');
const activeWindow = require('./activeWindow');
const music = require('./music'); // is a song playing in Spotify? (playing true/false only)

const READERS = [clipboard, idle, power, timeOfDay, activeWindow, music];
const START_DELAY_MS = 2000;

function startSystemReads(petWindow) {
  const emit = (type, payload = {}) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('system:event', { type, ...payload });
    }
  };

  // Wait for the renderer to be ready so early events (e.g. time of day) aren't dropped.
  // 'did-finish-load' alone isn't enough: pet.js only subscribes to system events after its
  // async boot() (two IPC round-trips), and ipcRenderer silently drops messages nobody is
  // listening for yet. A short delay covers that, and the greeting lands after the star appears.
  petWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      for (const reader of READERS) reader.start(emit);
    }, START_DELAY_MS);
  });
}

module.exports = { startSystemReads };
