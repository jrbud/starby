// MENU SIZE for the hand-drawn menu windows (shop, settings): the Settings → UI → "Menu size" slider
// (settingsStore.menuScale, 75–150 %) makes these windows bigger or smaller, live.
//
// This file only sizes the WINDOW (MENU_WIDTH × MENU_HEIGHT from menuSize.js, × the UI scale).
// The page then zooms its own content to fill the window (renderer/shared/menuZoom.js), so the
// layout looks exactly the same at any size.
//
// Never bigger than the screen: if the chosen scale wouldn't fit the work area (e.g. 150 % on a
// small laptop screen), it's capped so the whole window stays visible.
const { screen } = require('electron');
const settingsStore = require('../settingsStore');
const { MENU_WIDTH, MENU_HEIGHT } = require('./menuSize');

const windows = new Set(); // open menu windows that follow the setting

const workAreaOf = (win) =>
  (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).workArea;

/** { width, height } for a menu window at the current UI scale (fits `win`'s screen, or the primary). */
function menuWindowSize(win = null) {
  const pct = Number(settingsStore.get().menuScale) || 100;
  const area = workAreaOf(win);
  const fit = Math.min(area.width / MENU_WIDTH, area.height / MENU_HEIGHT);
  const s = Math.max(0.75, Math.min(pct / 100, fit, 1.5));
  return { width: Math.round(MENU_WIDTH * s), height: Math.round(MENU_HEIGHT * s) };
}

// Resize around the window's center, then nudge it back on screen if it now sticks out.
function apply(win) {
  if (!win || win.isDestroyed()) return;
  const { width, height } = menuWindowSize(win);
  const b = win.getBounds();
  if (b.width === width && b.height === height) return;
  const area = workAreaOf(win);
  let x = Math.round(b.x + (b.width - width) / 2);
  let y = Math.round(b.y + (b.height - height) / 2);
  x = Math.max(area.x, Math.min(area.x + area.width - width, x));
  y = Math.max(area.y, Math.min(area.y + area.height - height, y));
  // (Frameless, so window size = content size. setBounds works on non-resizable windows too.)
  win.setBounds({ x, y, width, height });
}

/** Call once per menu window after creating it: it then follows the UI scale setting. */
function trackMenuWindow(win) {
  windows.add(win);
  win.on('closed', () => windows.delete(win));
}

settingsStore.onChange(() => {
  for (const win of windows) apply(win);
});

module.exports = { menuWindowSize, trackMenuWindow };
