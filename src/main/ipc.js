// All ipcMain handlers. Channel names must match src/preload/preload.js.
// Adding a new handler here is fine; renaming/removing existing ones affects everyone.
const { ipcMain, BrowserWindow, Menu, app } = require('electron');
const store = require('./store');
const { SHOP_ITEMS, getItem } = require('../shared/shopCatalog');
const { openShopWindow } = require('./windows/shopWindow');
const { openSettingsWindow } = require('./windows/settingsWindow');
const settingsStore = require('./settingsStore');

function registerIpc() {
  // ---- State ----
  ipcMain.handle('state:get', () => store.get());

  // ---- Starbits ----
  ipcMain.handle('starbits:collect', (_e, amount = 1) => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    return store.update((s) => { s.starbits += n; });
  });

  // ---- Shop ----
  ipcMain.handle('shop:catalog', () => SHOP_ITEMS);

  ipcMain.handle('shop:buy', (_e, itemId) => {
    const item = getItem(itemId);
    const s = store.get();
    if (!item) return { ok: false, reason: 'unknown item' };
    if (s.owned.includes(item.id)) return { ok: false, reason: 'already owned' };
    if (s.starbits < item.price) return { ok: false, reason: 'not enough starbits' };
    const state = store.update((st) => {
      st.starbits -= item.price;
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

  // ---- Settings (sliders) ----
  ipcMain.handle('settings:get', () => settingsStore.get());
  ipcMain.handle('settings:set', (_e, patch) => settingsStore.set(patch));
  ipcMain.handle('settings:reset', () => settingsStore.reset());
  ipcMain.on('settings:open', () => openSettingsWindow());

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
      { label: 'Settings…', click: () => openSettingsWindow() },
      { type: 'separator' },
      // Scripted events run in the pet renderer (src/renderer/pet/events/).
      { label: 'Play tag', click: () => e.sender.send('pet:command', { type: 'start-event', name: 'tag' }) },
      { label: 'Play pong', click: () => e.sender.send('pet:command', { type: 'start-event', name: 'pong' }) },
      { type: 'separator' },
      { label: 'Quit sprite.exe', click: () => app.quit() },
    ]).popup({ window: win });
  });
}

module.exports = { registerIpc };
