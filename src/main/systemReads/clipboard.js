// Polls the clipboard (read-only) and emits when it changes.
// Electron has no clipboard-change event, so we poll.
//
//   emit('clipboard', { kind, length })
//   kind: 'url' | 'email' | 'color' | 'number' | 'path' | 'emoji' | 'code' | 'long' | 'text'
//         (copied text)  | 'image' (a picture)  | 'files' (files copied in Explorer)
//         | 'screenshot' (a picture that's a screenshot: exactly a display's size, i.e. Print
//           Screen, or copied while/just after a snipping tool window was open: Win+Shift+S)
//
// PRIVACY: what you copied never leaves this file. We only send what *kind* of thing it was
// (and a text length), so nothing ends up in the renderer, the session event log, or DevTools.
// `last` is a fingerprint held in memory only, to spot changes; it is never sent, logged or saved.
// Images: only their size goes into the fingerprint. Files: only "some files were copied".
const { clipboard } = require('electron');
const path = require('path');

const POLL_MS = 1500;
const LONG_TEXT = 200; // characters

// ---- Screenshots ----
// Windows' screenshot tools (Win+Shift+S overlay, Snipping Tool, older Snip & Sketch).
const SNIP_TOOLS = ['screenclippinghost', 'snippingtool', 'screensketch'];
const SNIP_RECENT_MS = 8000; // a picture this soon after a snip tool was on screen = a screenshot
let windowsApi = null; // get-windows, loaded lazily (read-only window list)
import('get-windows').then((m) => { windowsApi = m; }).catch(() => {});
let snipSeenAt = -Infinity;
const exeOf = (owner) => path.win32.basename((owner && (owner.path || owner.name)) || '').toLowerCase().replace(/\.exe$/, '');

// Called every poll: remember when a snipping tool window was last open (its overlay closes the
// moment you finish the snip, often before the picture shows up on the clipboard).
async function noteSnipTool() {
  if (!windowsApi) return;
  try {
    const wins = await windowsApi.openWindows();
    if (wins.some((w) => SNIP_TOOLS.includes(exeOf(w.owner)))) snipSeenAt = Date.now();
  } catch {
    // window list unavailable this poll
  }
}

// A picture is a screenshot if it's exactly the size of one of the displays (Print Screen), or
// it arrived right after a snipping tool was on screen.
function isScreenshot(width, height) {
  if (Date.now() - snipSeenAt < SNIP_RECENT_MS) return true;
  try {
    return require('electron').screen.getAllDisplays().some((d) => {
      const w = Math.round(d.size.width * d.scaleFactor);
      const h = Math.round(d.size.height * d.scaleFactor);
      return (w === width && h === height) || (d.size.width === width && d.size.height === height);
    });
  } catch {
    return false;
  }
}

// ---- What kind of text is it? (first match wins) ----
const RULES = [
  ['url', (t) => /^(https?:\/\/|www\.)\S+$/i.test(t)],
  ['email', (t) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)],
  ['color', (t) => /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)
    || /^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/]+\)$/i.test(t)],
  ['number', (t) => t.length <= 40 && /^[-+]?[$€£¥]?\d[\d,.\s]*%?$/.test(t)],
  ['path', (t) => !/\n/.test(t) && (/^[a-z]:\\/i.test(t) || /^\\\\[^\\]+\\/.test(t) || /^~?\/[\w.-]+\/[\w./-]*$/.test(t))],
  ['emoji', (t) => t.length <= 24 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && /\p{Extended_Pictographic}/u.test(t)],
  ['code', (t) => looksLikeCode(t)],
];

// Code: enough typical code signals (keywords, brackets with semicolons, arrows, tags...).
function looksLikeCode(t) {
  let score = 0;
  if (/\b(function|const|let|var|return|import|export|class|def|elif|lambda|public|private|static|void|#include|console\.log|print\(|SELECT\s.+\sFROM)\b/.test(t)) score += 2;
  if (/[{}]/.test(t) && /;\s*$/m.test(t)) score += 2;
  if (/=>|===|!==|\+\+|::|->|<\/\w+>/.test(t)) score += 1;
  if (/^\s{2,}\S/m.test(t) && /\n/.test(t)) score += 1; // indented lines
  if (/\w+\([^)]*\)\s*[{;]/.test(t)) score += 1; // call(...) { / call(...);
  return score >= 3;
}

function classify(text) {
  const t = text.trim();
  for (const [kind, test] of RULES) if (test(t)) return kind;
  return text.length > LONG_TEXT ? 'long' : 'text';
}

// PLATFORM QUIRK: on macOS (Electron 45 here), clipboard reads can return a Promise, not a
// value; on Windows they return the value. Awaiting handles both. Without this, a Promise
// (truthy, and a new object every poll) looked like "the clipboard changed" every 1.5s.
async function safe(read, fallback) {
  try {
    const v = await read();
    return v ?? fallback;
  } catch {
    return fallback; // can't read it right now (e.g. OS privacy prompt): just skip this poll
  }
}

// What's on the clipboard right now: { kind, length, fingerprint } or null if empty.
async function snapshot() {
  const text = await safe(() => clipboard.readText(), '');
  if (typeof text === 'string' && text) return { kind: classify(text), length: text.length, fingerprint: `t:${text}` };
  const formats = await safe(() => clipboard.availableFormats(), []);
  if (Array.isArray(formats) && formats.some((f) => /^image\//.test(f))) {
    const img = await safe(() => clipboard.readImage(), null);
    if (img && !img.isEmpty()) {
      const { width, height } = img.getSize();
      const kind = isScreenshot(width, height) ? 'screenshot' : 'image';
      return { kind, length: 0, fingerprint: `i:${width}x${height}:${formats.join(',')}` };
    }
  }
  // WINDOWS: files copied in Explorer show up as the "FileNameW" clipboard format.
  if (process.platform === 'win32') {
    const names = await safe(() => clipboard.readBuffer('FileNameW'), null);
    if (names && names.length) return { kind: 'files', length: 0, fingerprint: `f:${names.toString('hex').slice(0, 64)}` };
  }
  return null;
}

async function start(emit) {
  let last = (await snapshot())?.fingerprint ?? null;
  let busy = false; // don't start a new read while the last one is still pending
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await noteSnipTool();
      const now = await snapshot();
      if (now && now.fingerprint !== last) {
        last = now.fingerprint;
        emit('clipboard', { kind: now.kind, length: now.length });
      }
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

module.exports = { start, classify, isScreenshot };
