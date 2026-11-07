// All ipcMain handlers. Channel names must match src/preload/preload.js.
// Adding a new handler here is fine; renaming/removing existing ones affects everyone.
const { ipcMain, BrowserWindow, Menu, app } = require('electron');
const store = require('./store');
const { SHOP_ITEMS, getItem } = require('../shared/shopCatalog');
const { openShopWindow } = require('./windows/shopWindow');

function registerIpc() {
  // ---- State ----
  ipcMain.handle('state:get', () => store.get());

  // ---- Stardust ----
  ipcMain.handle('stardust:collect', (_e, amount = 1) => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    return store.update((s) => { s.stardust += n; });
  });

  // ---- Shop ----
  ipcMain.handle('shop:catalog', () => SHOP_ITEMS);

  ipcMain.handle('shop:buy', (_e, itemId) => {
    const item = getItem(itemId);
    const s = store.get();
    if (!item) return { ok: false, reason: 'unknown item' };
    if (s.owned.includes(item.id)) return { ok: false, reason: 'already owned' };
    if (s.stardust < item.price) return { ok: false, reason: 'not enough stardust' };
    const state = store.update((st) => {
      st.stardust -= item.price;
      st.owned.push(item.id);
    });
    return { ok: true, state };
  });

  ipcMain.handle('shop:equip', (_e, itemId) => {
    const item = getItem(itemId);
    const s = store.get();
    if (!item) return { ok: false, reason: 'unknown item' };
    if (!s.owned.includes(item.id)) return { ok: false, reason: 'not owned' };
    const state = store.update((st) => { st.equipped[item.slot] = item.id; });
    return { ok: true, state };
  });

  ipcMain.on('shop:open', () => openShopWindow());

  // ---- Pet window ----
  // Renderer toggles click-through depending on whether the cursor is over the sprite.
  ipcMain.on('pet:set-ignore-mouse', (e, ignore) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    // `forward: true` must be passed every time we re-enable ignoring, otherwise
    // mousemove forwarding stops and the pet goes "blind" to the cursor.
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });

  // Right-click menu on the pet. Plain text menu, no icons (placeholder-asset rule).
  ipcMain.on('pet:context-menu', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    Menu.buildFromTemplate([
      { label: 'Open shop', click: () => openShopWindow() },
      { type: 'separator' },
      { label: 'Quit sprite.exe', click: () => app.quit() },
    ]).popup({ window: win });
  });
}

module.exports = { registerIpc };
