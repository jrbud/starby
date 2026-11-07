// Harmless, READ-ONLY system reads that feed cute reactions in the pet renderer.
// Each reader gets an `emit(type, payload)` that forwards a 'system:event' to the pet window.
// Rule: nothing in this folder may write, modify, or elevate. Read only.
const clipboard = require('./clipboard');
const idle = require('./idle');
const power = require('./power');
const timeOfDay = require('./timeOfDay');
const activeWindow = require('./activeWindow');

const READERS = [clipboard, idle, power, timeOfDay, activeWindow];

function startSystemReads(petWindow) {
  const emit = (type, payload = {}) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('system:event', { type, ...payload });
    }
  };

  // Wait for the renderer to be ready so early events (e.g. time of day) aren't dropped.
  petWindow.webContents.once('did-finish-load', () => {
    for (const reader of READERS) reader.start(emit);
  });
}

module.exports = { startSystemReads };
