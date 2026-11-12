// Tray icon (the Windows notification area, "hidden icons" ^ next to the clock).
// Right-clicking it shows a short menu: Settings, Shop, Info (the welcome window again),
// Hide/Show Starby, Find Starby, Start with Windows, Quit.
// (Right-clicking Starby himself opens his dialogue box instead: src/renderer/pet/dialogue/. Games,
// Admin Settings and the dev helpers are in the Developer window: windows/devToolsWindow.js.)
//
// ICON: uses the team's existing Starby art (assets/sprite/sunny/idle-1.png), shrunk at runtime.
// A dedicated small tray icon drawn by the team would read better at 16px; swap TRAY_ICON when
// there is one (packaging will want an .ico too).
//
// WINDOWS QUIRK: the Tray object must stay referenced (module-level `tray` below) or it gets
// garbage-collected and the icon silently disappears from the tray.
const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');
const { openShopWindow } = require('./windows/shopWindow');
const { openSettingsWindow } = require('./windows/settingsWindow');
const { openWelcomeWindow } = require('./windows/welcomeWindow');
const { bringToFront } = require('./windows/bringToFront');
const { getPetWindow } = require('./windows/petWindow');
const { openDevToolsWindow } = require('./windows/devToolsWindow');
const startup = require('./startup');

const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'sprite', 'sunny', 'idle-1.png');

let tray = null;
let infoWindow = null; // the welcome window opened from "Info" (one at a time)

// "Info": the welcome window from launch. Starby is already running, so its "Let's go!" just
// closes it (onDone does nothing).
function openInfo() {
  if (infoWindow && !infoWindow.isDestroyed()) {
    bringToFront(infoWindow);
    return;
  }
  infoWindow = openWelcomeWindow(() => {});
  infoWindow.on('closed', () => { infoWindow = null; });
}

const sendToPet = (cmd) => {
  const pet = getPetWindow();
  if (pet && !pet.isDestroyed()) pet.webContents.send('pet:command', cmd);
};

// "Hide Starby" / "Show Starby": hides the whole pet window (him, his bubble, starbits). Whatever
// he was doing (a game, an invite) is stopped first so nothing waits on you while he's away.
// WINDOWS QUIRK: showInactive, not show: the pet window is focusable:false and must never take
// keyboard focus from the app you're in (petWindow.js).
function toggleStarby() {
  const pet = getPetWindow();
  if (!pet || pet.isDestroyed()) return;
  if (pet.isVisible()) {
    sendToPet({ type: 'starby', fn: 'stopEvent' });
    pet.hide();
  } else {
    pet.showInactive();
  }
}

// "Find Starby": shows him if hidden, then he pops into the middle of the screen
// (renderer/pet/behaviors/find.js).
function findStarby() {
  const pet = getPetWindow();
  if (!pet || pet.isDestroyed()) return;
  if (!pet.isVisible()) pet.showInactive();
  sendToPet({ type: 'starby', fn: 'find' });
}

/** The menu (also used by the old 'pet:context-menu' IPC channel in ipc.js). */
function buildPetMenu() {
  const pet = getPetWindow();
  const hidden = Boolean(pet && !pet.isDestroyed() && !pet.isVisible());
  // Same switch as Settings → App (startup.js). Greyed out when running from source (npm start).
  const runAtStartup = startup.get();
  return Menu.buildFromTemplate([
    { label: 'Settings', click: () => openSettingsWindow() },
    { label: 'Shop', click: () => openShopWindow() },
    { label: 'Info', click: openInfo },
    { type: 'separator' },
    { label: hidden ? 'Show Starby' : 'Hide Starby', click: toggleStarby },
    { label: 'Find Starby', click: findStarby },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: runAtStartup.enabled,
      enabled: runAtStartup.available,
      click: (item) => startup.set(item.checked),
    },
    { type: 'separator' },
    { label: 'Developer…', click: () => openDevToolsWindow() }, // all debug buttons, in their own window
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }, // he still says goodbye first (goodbye.js)
  ]);
}

function createTray() {
  if (tray) return tray;
  const art = nativeImage.createFromPath(TRAY_ICON);
  const icon = nativeImage.createEmpty();
  if (!art.isEmpty()) {
    // 16px at 100% scaling, 32px for 200% displays.
    icon.addRepresentation({ scaleFactor: 1, buffer: art.resize({ width: 16, height: 16, quality: 'best' }).toPNG() });
    icon.addRepresentation({ scaleFactor: 2, buffer: art.resize({ width: 32, height: 32, quality: 'best' }).toPNG() });
  }
  tray = new Tray(icon);
  tray.setToolTip('sprite.exe');
  // Built fresh on every right-click (Windows shows a context menu set via setContextMenu on
  // right-click; rebuilding keeps it in sync if items change).
  tray.on('right-click', () => tray.popUpContextMenu(buildPetMenu()));
  return tray;
}

module.exports = { createTray, buildPetMenu };
