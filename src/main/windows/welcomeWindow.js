// The WELCOME window: shown at launch BEFORE Starby loads (main.js waits for it), every launch until
// the user ticks "Don't show this again" (settingsStore.showWelcome = 0; Settings → App turns it back
// on). It explains what Starby is, what he can see, and how to play with him, and offers
// "Start Starby when Windows starts" (../startup.js). The page: src/renderer/welcome/.
//
// Frameless + transparent like the shop/settings windows: the page draws the team's white square art
// as its frame. hasShadow stays false and the page uses no CSS shadows: on a transparent window a
// shadow shows as a dark haze around it. It's a normal focusable window with a taskbar button (it's
// the only window at that point).
// "Let's go!" (ipc 'welcome:done') → main.js starts Starby, then this window closes.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { bringToFront } = require('./bringToFront');

const WIDTH = 560;
const HEIGHT = 760; // the middle of the page scrolls if it doesn't fit (or the screen is smaller)

/** Open it; `onDone` runs once when the user clicks "Let's go!". Returns the window. */
function openWelcomeWindow(onDone) {
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    width: Math.min(WIDTH, area.width - 40),
    height: Math.min(HEIGHT, area.height - 40),
    useContentSize: true,
    center: true,
    title: "hi! i'm starby!",
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false, // shown once painted (no blank window)
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  let done = false;
  win.finish = () => { // called by ipc.js on 'welcome:done'
    if (done) return;
    done = true;
    onDone();
    if (!win.isDestroyed()) win.close(); // after Starby's window exists, so the app doesn't quit
  };
  win.once('ready-to-show', () => bringToFront(win));
  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'welcome', 'index.html'));
  return win;
}

module.exports = { openWelcomeWindow };
