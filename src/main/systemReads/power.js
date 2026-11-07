// Power source (read-only): plugged in vs on battery.
// Battery *percentage* isn't exposed in the main process; the renderer can read it with
// navigator.getBattery() if a behavior wants it (see renderer/pet/behaviors/systemReactions.js).
const { powerMonitor } = require('electron');

function start(emit) {
  // `initial` marks the state at startup, so reactions can tell "this is how it is" from
  // "this just changed" (the pet only comments on changes).
  emit('power', { onBattery: powerMonitor.isOnBatteryPower(), initial: true });
  powerMonitor.on('on-battery', () => emit('power', { onBattery: true }));
  powerMonitor.on('on-ac', () => emit('power', { onBattery: false }));
}

module.exports = { start };
