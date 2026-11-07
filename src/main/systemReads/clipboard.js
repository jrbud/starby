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

// PLATFORM QUIRK: on macOS (Electron 45 here), clipboard.readText() returns a Promise, not a
// string; on Windows it returns a string. Awaiting handles both. Without this, a Promise
// (truthy, and a new object every poll) looked like "the clipboard changed" every 1.5s and
// crashed the main process on text.slice/text.trim ("... is not a function").
async function readClipboardText() {
  try {
    const text = await clipboard.readText();
    return typeof text === 'string' ? text : '';
  } catch {
    return ''; // can't read it right now (e.g. OS privacy prompt): just skip this poll
  }
}

async function start(emit) {
  let last = await readClipboardText();
  let busy = false; // don't start a new read while the last one is still pending
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const text = await readClipboardText();
      if (text && text !== last) {
        last = text;
        emit('clipboard', { length: text.length, kind: classify(text) });
      }
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

module.exports = { start, classify };
