// Window icon: every window (pet, shop, settings, admin, and any added later) shows classic
// Starby (assets/sprite/sunny/idle-1.png, the team's art) in its title bar, the taskbar and
// Alt+Tab, instead of Electron's default atom.
//
// One hook here instead of an `icon:` option in each window file, so window files owned by
// different people don't all need touching. Call applyWindowIcons() BEFORE any window is
// created (main.js does), since it only catches windows created after it runs.
//
// WINDOWS QUIRK: the window icon is used at several sizes (16px title bar, 32px taskbar,
// 48/256px Alt+Tab and large taskbar). The art is 2048px, so we give Windows ready-shrunk copies
// (the file itself is never changed); otherwise it downsamples on the fly and the outline gets
// crunchy. In a packaged .exe the taskbar uses the .exe's own icon instead, which the packaging
// config should set to the same art.
const path = require('path');
const { app, nativeImage } = require('electron');

const ICON_ART = path.join(__dirname, '..', '..', 'assets', 'sprite', 'sunny', 'idle-1.png');

let icon = null;

function buildIcon() {
  const art = nativeImage.createFromPath(ICON_ART);
  if (art.isEmpty()) return null; // art missing: keep Electron's default rather than crash
  // 256px is plenty for every size Windows asks for; it scales down from there smoothly.
  return art.resize({ width: 256, height: 256, quality: 'best' });
}

function applyWindowIcons() {
  app.on('browser-window-created', (_event, win) => {
    if (icon === null) icon = buildIcon();
    if (icon) win.setIcon(icon);
  });
}

module.exports = { applyWindowIcons };
