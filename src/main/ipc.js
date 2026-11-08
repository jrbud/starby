// All ipcMain handlers. Channel names must match src/preload/preload.js.
// Adding a new handler here is fine; renaming/removing existing ones affects everyone.
const { ipcMain, BrowserWindow, app } = require('electron');
const store = require('./store');
const { SHOP_ITEMS, getItem } = require('../shared/shopCatalog');
const { openShopWindow, setDisplayRect, petSay, setPreview, setPreviewColor, minimizeShop, closeShop } = require('./windows/shopWindow');
const { openSettingsWindow } = require('./windows/settingsWindow');
const settingsStore = require('./settingsStore');
const { openAdminSettingsWindow } = require('./windows/adminSettingsWindow');
const adminSettingsStore = require('./adminSettingsStore');
const { buildPetMenu } = require('./tray');

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
  // Shop window (frameless): its own title-bar buttons, and parking Starby in the display box.
  ipcMain.on('shop:minimize', () => minimizeShop());
  ipcMain.on('shop:close', () => closeShop());
  ipcMain.on('shop:display-rect', (_e, rect) => setDisplayRect(rect));
  ipcMain.on('shop:say', (_e, text) => petSay(text));
  ipcMain.on('shop:preview', (_e, accessory) => setPreview(accessory)); // try-on, never saved
  // Color/skin try-on: only real color items from the catalog, never saved.
  ipcMain.on('shop:preview-color', (_e, id) => setPreviewColor(getItem(id)?.slot === 'color' ? id : null));

  // ---- Settings (sliders) ----
  ipcMain.handle('settings:get', () => settingsStore.get());
  ipcMain.handle('settings:set', (_e, patch) => settingsStore.set(patch));
  ipcMain.handle('settings:reset', () => settingsStore.reset());
  ipcMain.on('settings:open', () => openSettingsWindow());

  // ---- Admin Settings (starbits tuning overrides; see renderer/shared/starbitsTuning.js) ----
  ipcMain.handle('admin:get', () => adminSettingsStore.get());
  ipcMain.handle('admin:set', (_e, patch) => adminSettingsStore.set(patch));
  ipcMain.handle('admin:reset', () => adminSettingsStore.reset());
  ipcMain.on('admin:open', () => openAdminSettingsWindow());

  // ---- Pet window ----
  // Renderer toggles click-through depending on whether the cursor is over the sprite.
  ipcMain.on('pet:set-ignore-mouse', (e, ignore) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    // `forward: true` must be passed every time we re-enable ignoring, otherwise
    // mousemove forwarding stops and the pet goes "blind" to the cursor.
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });

  // The old right-click menu. Starby's right-click is now his dialogue box
  // (src/renderer/pet/dialogue/) and this menu lives on the tray icon (src/main/tray.js);
  // the channel stays so nothing that still sends it breaks.
  ipcMain.on('pet:context-menu', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    buildPetMenu().popup({ window: win });
  });

  // From the dialogue box: Settings → bye starby! (quit) / Developer stuff → Open pet DevTools.
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('pet:devtools', (e) => e.sender.openDevTools({ mode: 'detach' }));
}

module.exports = { registerIpc };
