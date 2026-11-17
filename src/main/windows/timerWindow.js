// The study timer window ("Start a timer" in the focus-mode menu): a frameless, transparent
// window shaped like the team's alarm-clock art (assets/menuIcons/clock/). The page draws
// everything, including its own rewind / minimize / close icons (src/renderer/timer/).
// Only one at a time. Closing it throws the timer away: opening it again starts fresh (00:00).
//
// SIZE: the page is designed at DESIGN_WIDTH × DESIGN_HEIGHT CSS px (the clock as drawn in the
// team's mockups) and zooms itself to fill the window (timer.js), like the shop/settings pages.
// The window follows Settings → UI → "Menu size" (75–150 %), live, and never gets bigger than the
// screen.
//
// WINDOWS QUIRKS:
//   - Stays in front of other windows until closed (always-on-top, like the shop and Settings);
//     petWindow.js puts Starby back above it whenever it's raised or dragged.
//   - Shows in the taskbar (not skipTaskbar), so a minimized timer can be brought back.
//   - Transparent: Windows lets clicks on its see-through corners go to whatever is behind.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const settingsStore = require('../settingsStore');
const { bringToFront } = require('./bringToFront');

const DESIGN_WIDTH = 308; // keep in sync with src/renderer/timer/timer.js and timer.css
const DESIGN_HEIGHT = 307;
const SIZE_SLACK = 2; // px: Windows rounds to physical pixels at 125 % / 150 % scaling

let timerWindow = null;
let lastMenuScale = null;

function workAreaOf(win) {
  return (win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).workArea;
}

/** { width, height } at the current Menu size (and never bigger than the screen). */
function timerSize(win = null) {
  const pct = Number(settingsStore.get().menuScale) || 100;
  const area = workAreaOf(win);
  const fit = Math.min(area.width / DESIGN_WIDTH, area.height / DESIGN_HEIGHT);
  const s = Math.max(0.5, Math.min(pct / 100, fit, 1.5));
  return { width: Math.round(DESIGN_WIDTH * s), height: Math.round(DESIGN_HEIGHT * s) };
}

// Menu size changed: resize around the window's center, kept on screen.
function applySize() {
  const win = timerWindow;
  if (!win || win.isDestroyed()) return;
  const { width, height } = timerSize(win);
  const b = win.getBounds();
  if (Math.abs(b.width - width) <= SIZE_SLACK && Math.abs(b.height - height) <= SIZE_SLACK) return;
  const area = workAreaOf(win);
  const x = Math.max(area.x, Math.min(area.x + area.width - width, Math.round(b.x + (b.width - width) / 2)));
  const y = Math.max(area.y, Math.min(area.y + area.height - height, Math.round(b.y + (b.height - height) / 2)));
  win.setBounds({ x, y, width, height });
}
settingsStore.onChange((s) => {
  if (s.menuScale === lastMenuScale) return; // only Menu size (other sliders save many times a second)
  lastMenuScale = s.menuScale;
  applySize();
});

function openTimerWindow() {
  if (timerWindow) {
    bringToFront(timerWindow, { stayOnTop: true });
    return timerWindow;
  }
  lastMenuScale = settingsStore.get().menuScale;
  timerWindow = new BrowserWindow({
    ...timerSize(),
    useContentSize: true,
    title: 'sprite.exe — timer',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false, // shown once painted, in front (bringToFront.js)
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep counting at full speed while minimized / behind other windows (the page also
      // counts from a fixed end time, so a slowed-down timer would still end on time).
      backgroundThrottling: false,
    },
  });
  timerWindow.once('ready-to-show', () => bringToFront(timerWindow, { stayOnTop: true }));
  timerWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'timer', 'index.html'));
  timerWindow.on('closed', () => { timerWindow = null; });
  return timerWindow;
}

const minimizeTimer = () => timerWindow?.minimize();
const closeTimer = () => timerWindow?.close();

module.exports = { openTimerWindow, minimizeTimer, closeTimer };
