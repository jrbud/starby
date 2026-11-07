// Polls clipboard text (read-only) and emits when it changes.
// Electron has no clipboard-change event, so we poll.
//
// PRIVACY: the clipboard text itself never leaves this file. We only send what *kind* of text
// it was ('url' | 'number' | 'long' | 'text') and its length, so nothing the user copied ends
// up in the renderer, the session event log, or DevTools. `last` is held in memory only, to
// spot changes; it is never sent, logged or saved.
const { clipboard } = require('electron');

const POLL_MS = 1500;
const LONG_TEXT = 200; // characters

function classify(text) {
  const t = text.trim();
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return 'url';
  if (t.length <= 40 && /^[-+]?[$€£¥]?\d[\d,.\s]*%?$/.test(t)) return 'number';
  if (text.length > LONG_TEXT) return 'long';
  return 'text';
}

function start(emit) {
  let last = clipboard.readText();
  setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== last) {
      last = text;
      emit('clipboard', { length: text.length, kind: classify(text) });
    }
  }, POLL_MS);
}

module.exports = { start, classify };
