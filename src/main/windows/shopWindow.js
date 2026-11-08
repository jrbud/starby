// The shop window: frameless, transparent, fixed size. The page draws everything: the team's
// background art (with "SHOP" on it) and an image close button. No minimize button (the
// taskbar can still minimize it, which releases Starby as before).
// Only one at a time.
//
// PARKING THE STAR: while the shop is open, Starby runs into the shop's display box (the square
// above the Buy button) and stays there. The shop page reports where the box sits inside its
// window (setDisplayRect); this file turns that into pet-window coordinates and tells the pet
// renderer via 'pet:command' { type: 'shop-park', x, y } (box center). The pet side is
// src/renderer/pet/events/shop.js. Closing or minimizing the shop sends { type: 'shop-release' }.
//
// WINDOWS QUIRKS:
//   - The pet window is always-on-top ('screen-saver' level), so the star draws ON TOP of this
//     window; the shop itself stays a normal window.
//   - Frameless windows are moved by the page's `-webkit-app-region: drag` title band. 'move'
//     fires continuously while dragging on Windows, so the star follows the box live.
//   - Coordinates: BrowserWindow bounds and the pet page's CSS px are both DIPs, so at 125% /
//     150% scaling no extra conversion is needed.
const { BrowserWindow } = require('electron');
const path = require('path');
const { getPetWindow } = require('./petWindow');
const { bringToFront } = require('./bringToFront');
// Window size + page zoom, shared with the settings window (see menuSize.js).
const { MENU_SCALE, MENU_WIDTH, MENU_HEIGHT } = require('./menuSize');

let shopWindow = null;
let displayRect = null; // { x, y, width, height } of the display box, in shop-page CSS px
// Try-on: the accessory value selected in the shop but not bought/equipped yet (null = none).
// The pet takes it off on close/minimize ('shop-release'); after a restore it goes back on,
// since the shop still has that item selected.
let preview = null;
// Same for colors/skins: the color item id selected but not equipped yet (null = none).
let previewColor = null;

function sendToPet(cmd) {
  const pet = getPetWindow();
  if (pet && !pet.isDestroyed()) pet.webContents.send('pet:command', cmd);
}

function parkPet() {
  if (!shopWindow || shopWindow.isDestroyed() || !displayRect) return;
  if (shopWindow.isMinimized() || !shopWindow.isVisible()) return;
  const pet = getPetWindow();
  if (!pet || pet.isDestroyed()) return;
  const content = shopWindow.getContentBounds();
  const petBounds = pet.getBounds();
  // displayRect is in the shop page's CSS px; the page is zoomed (menuSize.js), so × zoom = DIPs.
  const zoom = shopWindow.webContents.getZoomFactor() || MENU_SCALE;
  sendToPet({
    type: 'shop-park',
    x: content.x - petBounds.x + (displayRect.x + displayRect.width / 2) * zoom,
    y: content.y - petBounds.y + (displayRect.y + displayRect.height / 2) * zoom,
  });
}

const releasePet = () => sendToPet({ type: 'shop-release' });

// The shop stays in front of other windows until it's closed (always-on-top). WINDOWS QUIRK:
// always-on-top windows are ordered by which was raised last, so focusing/clicking the shop would
// put it ABOVE the pet window and hide Starby standing in its display box. Every time the shop
// is raised, move the pet window back on top (moveTop doesn't take focus).
function keepPetAbove() {
  const pet = getPetWindow();
  if (pet && !pet.isDestroyed()) pet.moveTop();
}

function raiseShop() {
  bringToFront(shopWindow, { stayOnTop: true });
  keepPetAbove();
}

// Shop is back on screen: park him again and put the try-on back on.
function returnPet() {
  keepPetAbove();
  parkPet();
  if (preview) sendToPet({ type: 'shop-preview', accessory: preview });
  if (previewColor) sendToPet({ type: 'shop-preview-color', color: previewColor });
}

function openShopWindow() {
  if (shopWindow) {
    raiseShop();
    returnPet();
    return shopWindow;
  }

  shopWindow = new BrowserWindow({
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
    useContentSize: true,
    title: 'sprite.exe — shop',
    frame: false,
    // Transparent: the art's corners (outside its hand-drawn border) are see-through.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    // Shown once the page has painted (no blank window), and in front (see bringToFront.js).
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // pages can't reach the file system or Node, even if tricked (Electron's default, made explicit)
      zoomFactor: MENU_SCALE, // page laid out for 584×652, shown smaller (menuSize.js)
    },
  });

  shopWindow.once('ready-to-show', raiseShop);
  shopWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'shop', 'index.html'));
  shopWindow.on('focus', keepPetAbove); // clicking the shop raises it: keep Starby above it
  shopWindow.on('move', parkPet);
  shopWindow.on('restore', returnPet);
  shopWindow.on('show', returnPet);
  shopWindow.on('minimize', releasePet);
  shopWindow.on('hide', releasePet);
  shopWindow.on('closed', () => {
    shopWindow = null;
    displayRect = null;
    preview = null;
    previewColor = null;
    releasePet(); // also takes off the try-on (accessory and color)
  });
  return shopWindow;
}

// ---- Called from ipc.js (the shop page) ----

function setDisplayRect(rect) {
  if (!rect) return;
  displayRect = {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width: Number(rect.width) || 0,
    height: Number(rect.height) || 0,
  };
  parkPet();
}

// The shop wants Starby to say something (e.g. "we need 5 more starbits!").
function petSay(text) {
  if (typeof text === 'string' && text) sendToPet({ type: 'shop-say', text: text.slice(0, 120) });
}

// Try-on from the shop page: an accessory value, or null to show what he really wears.
function setPreview(value) {
  preview = typeof value === 'string' && value ? value : null;
  sendToPet({ type: 'shop-preview', accessory: preview });
}

// Color/skin try-on (ipc.js only passes real color item ids, or null).
function setPreviewColor(id) {
  previewColor = typeof id === 'string' && id ? id : null;
  sendToPet({ type: 'shop-preview-color', color: previewColor });
}

const minimizeShop = () => shopWindow?.minimize();
const closeShop = () => shopWindow?.close();

module.exports = { openShopWindow, setDisplayRect, petSay, setPreview, setPreviewColor, minimizeShop, closeShop };
