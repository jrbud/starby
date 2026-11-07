// User idle time via powerMonitor (read-only). Emits 'idle' once you've been away a while,
// and 'idle-return' when you come back.
const { powerMonitor } = require('electron');

const IDLE_AFTER_SEC = 120;
const POLL_MS = 5000;

function start(emit) {
  let isIdle = false;
  setInterval(() => {
    const seconds = powerMonitor.getSystemIdleTime();
    if (!isIdle && seconds >= IDLE_AFTER_SEC) {
      isIdle = true;
      emit('idle', { seconds });
    } else if (isIdle && seconds < IDLE_AFTER_SEC) {
      isIdle = false;
      emit('idle-return', {});
    }
  }, POLL_MS);
}

module.exports = { start };
