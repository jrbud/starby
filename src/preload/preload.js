// The only bridge between renderers and the main process. Exposed as `window.sprite`.
// Keep channel names in sync with src/main/ipc.js and src/main/systemReads/index.js.
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('sprite', {
  // State / persistence
  getState: () => ipcRenderer.invoke('state:get'),
  onStateChanged: (cb) => subscribe('state:changed', cb),
  // Settings → "Reset progress": starbits to 0, only the free starter items. Returns the new state.
  resetProgress: () => ipcRenderer.invoke('state:reset-progress'),

  // Starbits
  collectStarbits: (amount = 1) => ipcRenderer.invoke('starbits:collect', amount),

  // Shop
  getCatalog: () => ipcRenderer.invoke('shop:catalog'),
  buy: (itemId) => ipcRenderer.invoke('shop:buy', itemId),
  equip: (itemId) => ipcRenderer.invoke('shop:equip', itemId),
  unequip: (itemId) => ipcRenderer.invoke('shop:unequip', itemId), // take one accessory off
  openShop: () => ipcRenderer.send('shop:open'),
  // Shop window only: title-bar buttons, where the display box is, and lines for Starby to say.
  minimizeShop: () => ipcRenderer.send('shop:minimize'),
  closeShop: () => ipcRenderer.send('shop:close'),
  setShopDisplayRect: (rect) => ipcRenderer.send('shop:display-rect', rect),
  shopSay: (text) => ipcRenderer.send('shop:say', text),
  // Try-on: show this accessory value on Starby while browsing (null = what he really wears).
  previewAccessory: (value) => ipcRenderer.send('shop:preview', value),
  // Try-on for colors/skins: show this color item id on Starby while browsing (null = equipped).
  previewColor: (id) => ipcRenderer.send('shop:preview-color', id),

  // Settings (sliders): { flingPower: 0–100 }
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  onSettingsChanged: (cb) => subscribe('settings:changed', cb),
  openSettings: () => ipcRenderer.send('settings:open'),

  // Admin Settings (starbits tuning overrides; defaults/ranges in renderer/shared/starbitsTuning.js)
  getAdminSettings: () => ipcRenderer.invoke('admin:get'),
  setAdminSettings: (patch) => ipcRenderer.invoke('admin:set', patch),
  resetAdminSettings: () => ipcRenderer.invoke('admin:reset'),
  onAdminSettingsChanged: (cb) => subscribe('admin:changed', cb),
  openAdminSettings: () => ipcRenderer.send('admin:open'),

  // Pet window
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  showContextMenu: () => ipcRenderer.send('pet:context-menu'), // old native menu (now on the tray)
  // Dialogue box (right-click Starby): Settings → Quit; the hidden developer menu (3 Shift+right-clicks).
  quitApp: () => ipcRenderer.send('app:quit'),
  openPetDevTools: () => ipcRenderer.send('pet:devtools'),
  // Quitting: the pet's goodbye animation is done, the app can close (src/main/goodbye.js).
  goodbyeDone: () => ipcRenderer.send('app:goodbye-done'),
  // Commands from the main process, e.g. { type: 'start-event', name: 'tag' } from the menu
  onPetCommand: (cb) => subscribe('pet:command', cb),

  // Read-only system events: { type, ...payload }
  onSystemEvent: (cb) => subscribe('system:event', cb),
});
