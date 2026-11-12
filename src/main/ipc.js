// All ipcMain handlers. Channel names must match src/preload/preload.js.
// Adding a new handler here is fine; renaming/removing existing ones affects everyone.
const { ipcMain, BrowserWindow, app } = require('electron');
const store = require('./store');
const { SHOP_ITEMS, getItem } = require('../shared/shopCatalog');
const { openShopWindow, setDisplayRect, petSay, setPreview, setPreviewColor, minimizeShop, closeShop } = require('./windows/shopWindow');
const { openSettingsWindow } = require('./windows/settingsWindow');
const settingsStore = require('./settingsStore');
const { openDevToolsWindow, handleDevCommand } = require('./windows/devToolsWindow');
const adminSettingsStore = require('./adminSettingsStore');
const statsStore = require('./statsStore');
const startup = require('./startup');
const { buildPetMenu } = require('./tray');
const { createDefaultState } = require('../shared/stateSchema');
const { getPetWindow } = require('./windows/petWindow');

function registerIpc() {
  // ---- State ----
  ipcMain.handle('state:get', () => store.get());

  // Settings → "Reset progress" (after its confirm steps): starbits to 0, own only the free
  // starters (Sunny + no accessory), wear them. Saved like any other change, and every window
  // gets 'state:changed'. Then Starby reacts (events/shop.js handles 'progress-reset').
  ipcMain.handle('state:reset-progress', () => {
    const fresh = createDefaultState();
    const state = store.update((s) => {
      s.starbits = 0;
      s.owned = [...fresh.owned];
      s.equipped = structuredClone(fresh.equipped);
    });
    const pet = getPetWindow();
    if (pet && !pet.isDestroyed()) pet.webContents.send('pet:command', { type: 'progress-reset' });
    return state;
  });

  // ---- Starbits ----
  ipcMain.handle('starbits:collect', (_e, amount = 1) => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    statsStore.add({ starbitsCollected: n }); // lifetime stats (statsStore.js)
    return store.update((s) => { s.starbits += n; });
  });

  // ---- Lifetime stats (statsStore.js; shown in Settings → Stats) ----
  statsStore.get(); // load now: counts today in "days visited" (and sets "first met" once)
  ipcMain.handle('stats:get', () => statsStore.get());
  ipcMain.handle('stats:add', (_e, patch) => statsStore.add(patch)); // e.g. { throws: 1 }
  ipcMain.handle('stats:game', (_e, name, outcome) => statsStore.game(name, outcome)); // 'start' | 'won' | 'lost'
  ipcMain.handle('stats:time', (_e, seconds) => statsStore.time(seconds));

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
    statsStore.add({ starbitsSpent: item.price, itemsBought: 1 }); // lifetime stats
    return { ok: true, state };
  });

  ipcMain.handle('shop:equip', (_e, itemId) => {
    const item = getItem(itemId);
    const s = store.get();
    if (!item) return { ok: false, reason: 'unknown item' };
    if (!s.owned.includes(item.id)) return { ok: false, reason: 'not owned' };
    const state = store.update((st) => {
      if (item.slot === 'color') st.equipped.color = item.id;
      // Accessories: one per shop category, so this replaces what's worn in its category.
      // "None" (no category) takes everything off.
      else if (!item.category) st.equipped.accessories = {};
      else st.equipped.accessories = { ...st.equipped.accessories, [item.category]: item.id };
    });
    return { ok: true, state };
  });

  // Take one accessory off (its category is then empty). Colors can't be taken off.
  ipcMain.handle('shop:unequip', (_e, itemId) => {
    const item = getItem(itemId);
    const s = store.get();
    if (!item || item.slot !== 'accessory') return { ok: false, reason: 'not an accessory' };
    if (s.equipped.accessories?.[item.category] !== item.id) return { ok: false, reason: 'not worn' };
    const state = store.update((st) => {
      const { [item.category]: _off, ...rest } = st.equipped.accessories;
      st.equipped.accessories = rest;
    });
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

  // ---- Welcome window + run when Windows starts (windows/welcomeWindow.js, startup.js) ----
  ipcMain.handle('startup:get', () => startup.get()); // { available, enabled }
  ipcMain.handle('startup:set', (_e, on) => startup.set(Boolean(on)));
  // "Let's go!": start Starby (main.js), then the welcome window closes.
  ipcMain.on('welcome:done', (e) => BrowserWindow.fromWebContents(e.sender)?.finish?.());

  // ---- Admin Settings (starbits tuning overrides; see renderer/shared/starbitsTuning.js) ----
  ipcMain.handle('admin:get', () => adminSettingsStore.get());
  ipcMain.handle('admin:set', (_e, patch) => adminSettingsStore.set(patch));
  ipcMain.handle('admin:reset', () => adminSettingsStore.reset());
  ipcMain.on('admin:open', () => openDevToolsWindow('admin')); // the Developer window's Admin Settings tab
  // Developer window buttons (only accepted from that window: windows/devToolsWindow.js).
  ipcMain.on('dev:command', (e, cmd) => handleDevCommand(e.sender, cmd));

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

  // From the dialogue box: Settings → bye starby! (quit). (pet:devtools: the dialogue's "devtools" action, unused by the tree now.)
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('pet:devtools', (e) => e.sender.openDevTools({ mode: 'detach' }));
}

module.exports = { registerIpc };
