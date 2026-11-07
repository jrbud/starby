// Power source (read-only): plugged in vs on battery.
// Battery *percentage* isn't exposed in the main process; the renderer can read it with
// navigator.getBattery() if a behavior wants it (see renderer/pet/behaviors/systemReactions.js).
const { powerMonitor } = require('electron');

function start(emit) {
  emit('power', { onBattery: powerMonitor.isOnBatteryPower() });
  powerMonitor.on('on-battery', () => emit('power', { onBattery: true }));
  powerMonitor.on('on-ac', () => emit('power', { onBattery: false }));
}

module.exports = { start };
