// The shop window: frameless, fixed size, with its own title bar (Shop  _  ✕) drawn in the page.
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
//   - Frameless windows are moved by the page's `-webkit-app-region: drag` title bar. 'move'
//     fires continuously while dragging on Windows, so the star follows the box live.
//   - Coordinates: BrowserWindow bounds and the pet page's CSS px are both DIPs, so at 125% /
//     150% scaling no extra conversion is needed.
const { BrowserWindow } = require('electron');
const path = require('path');
const { getPetWindow } = require('./petWindow');
const { bringToFront } = require('./bringToFront');

// Content size (the page draws its own title bar + border inside this).
const WIDTH = 524;
const HEIGHT = 570;

let shopWindow = null;
let displayRect = null; // { x, y, width, height } of the display box, in shop-page CSS px

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
  sendToPet({
    type: 'shop-park',
    x: content.x - petBounds.x + displayRect.x + displayRect.width / 2,
    y: content.y - petBounds.y + displayRect.y + displayRect.height / 2,
  });
}

const releasePet = () => sendToPet({ type: 'shop-release' });

function openShopWindow() {
  if (shopWindow) {
    bringToFront(shopWindow);
    parkPet();
    return shopWindow;
  }

  shopWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    title: 'sprite.exe — shop',
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#010021',
    // Shown once the page has painted (no blank window), and in front (see bringToFront.js).
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  shopWindow.once('ready-to-show', () => bringToFront(shopWindow));
  shopWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'shop', 'index.html'));
  shopWindow.on('move', parkPet);
  shopWindow.on('restore', parkPet);
  shopWindow.on('show', parkPet);
  shopWindow.on('minimize', releasePet);
  shopWindow.on('hide', releasePet);
  shopWindow.on('closed', () => {
    shopWindow = null;
    displayRect = null;
    releasePet();
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

const minimizeShop = () => shopWindow?.minimize();
const closeShop = () => shopWindow?.close();

module.exports = { openShopWindow, setDisplayRect, petSay, minimizeShop, closeShop };
