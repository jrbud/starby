// The pet window. SHARED/CORE FILE (window config) — flag changes before editing.
//
// Design: ONE frameless, transparent, always-on-top window covering the whole primary
// display. The sprite, speech bubble and starbits are all DOM elements moved around
// inside it. That way walking/dragging/dropping starbits never has to move OS windows.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

let petWindow = null;

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
    },
  });

  // WINDOWS QUIRK: plain alwaysOnTop sits *below* the taskbar. The 'screen-saver'
  // level puts us above it so the sprite stays visible when walking along the taskbar.
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  // CLICK-THROUGH: start fully click-through. `forward: true` still delivers mousemove
  // events to the renderer, which is how we (a) detect hovering over the sprite and
  // flip click-through off (see renderer/pet/clickThrough.js), (b) do cursor-awareness,
  // and (c) collect starbits by hover. `forward` only works on Windows/macOS.
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  petWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'pet', 'index.html'));
  petWindow.on('closed', () => { petWindow = null; });
  return petWindow;
}

function getPetWindow() {
  return petWindow;
}

module.exports = { createPetWindow, getPetWindow };
