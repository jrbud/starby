// Tray icon (the Windows notification area, "hidden icons" ^ next to the clock).
// Right-clicking it shows the old right-click menu: shop, settings, games, Developer, Quit.
// (Right-clicking Starby himself opens his dialogue box instead: src/renderer/pet/dialogue/.)
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
const { openAdminSettingsWindow } = require('./windows/adminSettingsWindow');
const { getPetWindow } = require('./windows/petWindow');

const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'sprite', 'sunny', 'idle-1.png');

let tray = null;

/** The menu (also used by the old 'pet:context-menu' IPC channel in ipc.js). */
function buildPetMenu() {
  // Scripted events and debug helpers run in the pet renderer (src/renderer/pet/events/).
  // 'starby' commands call window.starby.<fn>(...args) there (pet.js onPetCommand).
  const send = (cmd) => {
    const win = getPetWindow();
    if (win && !win.isDestroyed()) win.webContents.send('pet:command', cmd);
  };
  const play = (name) => send({ type: 'start-event', name });
  const dev = (fn, ...args) => send({ type: 'starby', fn, args });
  return Menu.buildFromTemplate([
    { label: 'Open shop', click: () => openShopWindow() },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { label: 'Admin Settings…', click: () => openAdminSettingsWindow() },
    { type: 'separator' },
    { label: 'Play tag', click: () => play('tag') },
    { label: 'Play pong', click: () => play('pong') },
    { label: 'Play hide & seek', click: () => play('hide-seek') },
    { label: 'Play catch', click: () => play('catch') },
    { label: 'Play constellation quiz', click: () => play('constellation') },
    { label: 'Play starby says', click: () => play('starby-says') },
    { label: 'Play hoop shot', click: () => play('hoop-shot') },
    { label: 'Play memory', click: () => play('memory') },
    { label: 'Play asteroid shuffle', click: () => play('shuffle') },
    { type: 'separator' },
    {
      label: 'Developer',
      submenu: [
        { label: 'Open pet DevTools', click: () => getPetWindow()?.webContents.openDevTools({ mode: 'detach' }) },
        { type: 'separator' },
        { label: 'Start star shower now', click: () => dev('happening', 'star-shower') },
        { label: 'Start shooting star now', click: () => dev('happening', 'shooting-star') },
        { label: 'Start copycat now', click: () => play('copycat') },
        { label: 'Starby invites you to a game', click: () => dev('invite') },
        { label: 'Open dialogue box', click: () => dev('dialogue') },
        { label: 'Skip game rest', click: () => dev('skipRest') },
        { label: 'Stop current event', click: () => dev('stopEvent') },
      ],
    },
    { type: 'separator' },
    { label: 'bye starby!', click: () => app.quit() }, // quits (he says goodbye first: goodbye.js)
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
