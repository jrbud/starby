// The pet window. SHARED/CORE FILE (window config) — flag changes before editing.
//
// Design: ONE frameless, transparent, always-on-top window covering the whole primary
// display. The sprite, speech bubble and stardust are all DOM elements moved around
// inside it. That way walking/dragging/dropping stardust never has to move OS windows.
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
      // WINDOWS QUIRK: Chromium decides a full-screen transparent overlay is "hidden" or
      // occluded once the user clicks other windows, and then pauses its timers and
      // requestAnimationFrame. The pet freezes and stops tracking the cursor, so
      // click-through gets stuck. The pet must always run, so never throttle it.
      backgroundThrottling: false,
    },
  });

  // WINDOWS QUIRK: plain alwaysOnTop sits *below* the taskbar. The 'screen-saver'
  // level puts us above it so the sprite stays visible when walking along the taskbar.
  petWindow.setAlwaysOnTop(true, 'screen-saver');

  // CLICK-THROUGH: start fully click-through. `forward: true` still delivers mousemove
  // events to the renderer, which is how we (a) detect hovering over the sprite and
  // flip click-through off (see renderer/pet/clickThrough.js), (b) do cursor-awareness,
  // and (c) collect stardust by hover. `forward` only works on Windows/macOS.
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  petWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'pet', 'index.html'));

  // WINDOWS QUIRK: mousemove forwarding (above) stops working after the sprite has been
  // dragged once, leaving the renderer blind to the cursor and click-through stuck.
  // So we poll the cursor ourselves (read-only) and send it to the renderer, which
  // hit-tests with it (renderer/pet/clickThrough.js). Both values are in DIPs, so this
  // is correct at any display scaling.
  let lastX = null;
  let lastY = null;
  const cursorTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const x = pt.x - bounds.x;
    const y = pt.y - bounds.y;
    if (x === lastX && y === lastY) return; // only send on change
    lastX = x;
    lastY = y;
    petWindow.webContents.send('pet:cursor', { x, y });
  }, 16);

  // ---- TEMP P2-1 debug (main-process stdout is reliable; the renderer console log isn't) ----
  const t = () => new Date().toISOString().slice(11, 23);
  const origIgnore = petWindow.setIgnoreMouseEvents.bind(petWindow);
  petWindow.setIgnoreMouseEvents = (ignore, _opts) => {
    console.log(t(), '[MAIN-DEBUG] setIgnoreMouseEvents', ignore, '(forward forced OFF for test)');
    return origIgnore(ignore); // TEST: no `forward`, to see if forwarding stalls the main process
  };
  origIgnore(true); // replace the forward:true call made above
  setInterval(() => console.log(t(), '[MAIN-DEBUG] heartbeat'), 1000);
  // TEST: time every clipboard read and idle-time read (suspected of blocking the main thread).
  const { clipboard, powerMonitor } = require('electron');
  const wrapTimed = (obj, name) => {
    const orig = obj[name].bind(obj);
    try {
      obj[name] = (...args) => {
        const s = Date.now();
        const r = orig(...args);
        console.log(t(), `[MAIN-DEBUG] ${name} took ${Date.now() - s}ms`);
        return r;
      };
    } catch (err) {
      console.log(t(), `[MAIN-DEBUG] could not wrap ${name}:`, err.message);
    }
  };
  wrapTimed(clipboard, 'readText');
  wrapTimed(powerMonitor, 'getSystemIdleTime');
  petWindow.on('focus', () => console.log(t(), '[MAIN-DEBUG] pet window FOCUS'));
  petWindow.on('blur', () => console.log(t(), '[MAIN-DEBUG] pet window BLUR'));
  petWindow.webContents.on('console-message', (_e, _lvl, msg) => {
    if (msg.includes('CT-DEBUG')) console.log(t(), msg);
  });
  // ---- end TEMP debug ----

  petWindow.on('closed', () => {
    clearInterval(cursorTimer);
    petWindow = null;
  });
  return petWindow;
}

function getPetWindow() {
  return petWindow;
}

module.exports = { createPetWindow, getPetWindow };
