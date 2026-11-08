// Power and session state (read-only), from Electron's powerMonitor:
//   emit('power', { onBattery, initial? })   plugged in vs on battery (initial: the state at startup)
//   emit('lock', {})                          the PC was locked (Win+L, lid, screen timeout lock...)
//   emit('unlock', { lockedFor })             unlocked again; lockedFor = seconds it was locked
//   emit('sleep', {}) / emit('wake', { sleptFor })   the PC went to sleep / woke up (seconds)
// Battery *percentage* isn't exposed in the main process; the renderer reads it with
// navigator.getBattery() (see renderer/pet/behaviors/systemReactions.js).
// WINDOWS: lock-screen / unlock-screen are supported on Windows and macOS (not Linux).
const { powerMonitor } = require('electron');

function start(emit) {
  // `initial` marks the state at startup, so reactions can tell "this is how it is" from
  // "this just changed" (the pet only comments on changes).
  emit('power', { onBattery: powerMonitor.isOnBatteryPower(), initial: true });
  powerMonitor.on('on-battery', () => emit('power', { onBattery: true }));
  powerMonitor.on('on-ac', () => emit('power', { onBattery: false }));

  let lockedAt = null;
  powerMonitor.on('lock-screen', () => {
    lockedAt = Date.now();
    emit('lock', {});
  });
  powerMonitor.on('unlock-screen', () => {
    const lockedFor = lockedAt ? Math.round((Date.now() - lockedAt) / 1000) : null;
    lockedAt = null;
    emit('unlock', { lockedFor });
  });

  let sleptAt = null;
  powerMonitor.on('suspend', () => {
    sleptAt = Date.now();
    emit('sleep', {});
  });
  powerMonitor.on('resume', () => {
    const sleptFor = sleptAt ? Math.round((Date.now() - sleptAt) / 1000) : null;
    sleptAt = null;
    emit('wake', { sleptFor });
  });
}

module.exports = { start };
