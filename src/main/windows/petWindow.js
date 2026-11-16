// The pet window. SHARED/CORE FILE (window config) — flag changes before editing.
//
// Design: ONE frameless, transparent, always-on-top window covering the whole primary
// display. The sprite, speech bubble and starbits are all DOM elements moved around
// inside it. That way walking/dragging/dropping starbits never has to move OS windows.
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let petWindow = null;

// Put the pet window back in front of everything. Off-then-on re-applies the z-order through a
// Windows call that never activates the window (see KEEP_ON_TOP_MS below for why not moveTop()).
function reassertOnTop() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setAlwaysOnTop(false);
  petWindow.setAlwaysOnTop(true, 'screen-saver');
}

// WINDOWS QUIRK: the shop / settings / other menu windows are always-on-top too (bringToFront.js),
// and Windows orders always-on-top windows by which was raised LAST: the window levels Electron
// takes ('floating' vs 'screen-saver') make no difference there. Focusing, showing or DRAGGING one
// of them (moving a window raises it) put it above Starby until the KEEP_ON_TOP_MS timer caught up,
// so he'd vanish behind the shop for a moment and pop back on top later. So whenever any of the
// app's other windows is raised, put him straight back on top:
//   - 'move' (fires continuously while dragging): moveTop(), cheap and with no gap, so he never
//     dips behind the window you're dragging. moveTop doesn't take focus.
//   - focus / show / 'moved' (drag finished): the full off-then-on re-assert as well.
// Done here once for every window (browser-window-created), so new menu windows get it for free.
function watchOtherWindow(win) {
  if (!win || win === petWindow) return;
  const raiseNow = () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.moveTop();
  };
  const raiseFully = () => {
    raiseNow();
    reassertOnTop();
  };
  win.on('move', raiseNow);
  win.on('moved', raiseFully);
  win.on('focus', raiseFully);
  win.on('show', raiseFully);
  win.on('restore', raiseFully);
}
app.on('browser-window-created', (_e, win) => {
  // The pet window itself is reported here too, before createPetWindow() has stored it: skip a
  // window that's the pet page (checked once it starts loading).
  win.webContents.once('did-start-loading', () => {
    if (win !== petWindow) watchOtherWindow(win);
  });
});

function createPetWindow() {
  // Use full `bounds` (not `workArea`) so the sprite can sit on top of the taskbar.
  // The renderer uses `screen.availHeight` to find the "ground" just above the taskbar.
  const { bounds } = screen.getPrimaryDisplay();

  petWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // WINDOWS QUIRK: a focusable overlay steals keyboard focus from whatever app the
    // user clicked away from, and would make itself the "active window" for system reads.
    // Mouse events (click/drag) still work with focusable:false on Windows.
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // pages can't reach the file system or Node, even if tricked (Electron's default, made explicit)
    },
  });

  // WINDOWS QUIRK: plain alwaysOnTop sits *below* the taskbar. The 'screen-saver'
  // level puts us above it so the sprite stays visible when walking along the taskbar.
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  // WINDOWS QUIRK: Windows can push an always-on-top window back down under normal windows
  // and leave it there: when an app goes fullscreen (videos, games), on Win+D / "Show desktop",
  // when Explorer restarts, after sleep/lock. The window still *says* it's on top but sits
  // behind everything. So we re-assert it every KEEP_ON_TOP_MS: Starby is always in front of
  // every window, fullscreen apps included (team decision).
  // Off-then-on (not moveTop()): setAlwaysOnTop always re-applies the z-order through a Windows
  // call that never activates the window, so it can't steal keyboard focus from what you're
  // typing in. Re-applying the same value alone may be skipped as "no change".
  const KEEP_ON_TOP_MS = 1500;
  const keepOnTop = setInterval(reassertOnTop, KEEP_ON_TOP_MS);

  // CLICK-THROUGH: start fully click-through. `forward: true` still delivers mousemove
  // events to the renderer, which is how we (a) detect hovering over the sprite and
  // flip click-through off (see renderer/pet/clickThrough.js), (b) do cursor-awareness,
  // and (c) collect starbits by hover. `forward` only works on Windows/macOS.
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  // WINDOWS QUIRK: CHROME STOPS PAINTING UNDER US. Chrome/Edge/Discord/VS Code (anything Chromium)
  // stop drawing a window they think is fully covered by another window. While click-through is
  // OFF (cursor on Starby, or a click/drag), this full-screen, always-on-top window became a plain
  // opaque window, so the browser underneath decided it was hidden: you could scroll, but the page
  // didn't redraw until you clicked it. Chromium ignores *layered* windows with alpha below 255,
  // and Electron keeps a window layered in both click-through states once it has an opacity. 0.99
  // (alpha 252) is invisible to the eye.
  petWindow.setOpacity(0.99);

  petWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'pet', 'index.html'));
  petWindow.on('closed', () => {
    clearInterval(keepOnTop);
    petWindow = null;
  });
  return petWindow;
}

function getPetWindow() {
  return petWindow;
}

module.exports = { createPetWindow, getPetWindow, reassertOnTop };
