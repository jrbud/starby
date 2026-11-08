// Rectangles of the open windows (read-only), for hide and seek: Starby hides just inside the edge
// of a real window (renderer/pet/events/hideSeek.js asks for this list when he goes to hide).
//
//   listOpenWindows() → [{ x, y, width, height }, ...]   front-most first, screen coords in DIPs
//
// PRIVACY: only rectangles leave this file. No titles, no app names, no process info.
// READ-ONLY: get-windows only reads the window list; nothing is moved, focused or changed.
//
// Filtered to windows worth hiding behind: not ours, at least MIN_W × MIN_H, mostly on the primary
// display (which the pet window covers), and not covering (nearly) the whole display (fullscreen
// apps, the desktop). Thin bars like the taskbar are dropped by the minimum size.
//
// PLATFORM: on Windows get-windows needs no permission (its native part must be installed; see
// "allowScripts" in package.json). On macOS it needs the Screen Recording permission; without it
// this returns [] and Starby hides behind the taskbar / screen edges instead.
const { screen } = require('electron');
const { toDip, isOwnProcess } = require('./activeWindow');

const MIN_W = 220;
const MIN_H = 160;
const MAX_COVER = 0.9; // a window covering ≥ 90% of the display (both ways) is fullscreen / desktop
const MIN_ON_SCREEN = 0.5; // at least half of the window must be on the primary display

let getWindows = null; // the loaded module (ESM, so loaded with import())
let warned = false;

async function load() {
  if (!getWindows) getWindows = await import('get-windows');
  return getWindows;
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// get-windows results → the rectangles worth hiding behind (keeps front-to-back order).
// Pure (apart from the DIP conversion), so it can be tested with made-up window lists.
function filterWindows(wins, display) {
  const out = [];
  for (const w of wins || []) {
    if (!w || !w.bounds || (w.owner && isOwnProcess(w.owner))) continue;
    const b = toDip(w.bounds);
    if (!b || b.width < MIN_W || b.height < MIN_H) continue;
    if (b.width >= display.width * MAX_COVER && b.height >= display.height * MAX_COVER) continue;
    if (overlapArea(b, display) < b.width * b.height * MIN_ON_SCREEN) continue;
    out.push({ x: b.x, y: b.y, width: b.width, height: b.height });
  }
  return out;
}

async function listOpenWindows() {
  try {
    const gw = await load();
    return filterWindows(await gw.openWindows(), screen.getPrimaryDisplay().bounds);
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn('[openWindows] window list unavailable; hide and seek uses the taskbar / screen edges:', err.message);
    }
    return [];
  }
}

module.exports = { listOpenWindows, filterWindows };
