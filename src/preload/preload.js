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

  // Stardust
  collectStardust: (amount = 1) => ipcRenderer.invoke('stardust:collect', amount),

  // Shop
  getCatalog: () => ipcRenderer.invoke('shop:catalog'),
  buy: (itemId) => ipcRenderer.invoke('shop:buy', itemId),
  equip: (itemId) => ipcRenderer.invoke('shop:equip', itemId),
  openShop: () => ipcRenderer.send('shop:open'),

  // Settings (sliders): { flingPower: 0–100 }
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  onSettingsChanged: (cb) => subscribe('settings:changed', cb),
  openSettings: () => ipcRenderer.send('settings:open'),

  // Pet window
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  showContextMenu: () => ipcRenderer.send('pet:context-menu'),

  // Read-only system events: { type, ...payload }
  onSystemEvent: (cb) => subscribe('system:event', cb),
});
