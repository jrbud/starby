// Polls clipboard text (read-only) and emits when it changes.
// Electron has no clipboard-change event, so we poll.
const { clipboard } = require('electron');

const POLL_MS = 1500;

function start(emit) {
  let last = clipboard.readText();
  setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== last) {
      last = text;
      // Only send a short preview: the pet just needs enough to react to.
      emit('clipboard', { length: text.length, preview: text.slice(0, 40) });
    }
  }, POLL_MS);
}

module.exports = { start };
