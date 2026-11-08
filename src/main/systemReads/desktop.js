// Desktop state (read-only), for a few more reactions:
//   emit('theme', { dark })                        Windows switched between dark and light mode
//   emit('display', { count, change })             a monitor was plugged in ('added') / unplugged ('removed')
//   emit('cpu', { busy })                          the CPU has been working hard for a while (busy: true),
//                                                  then calmed down again (busy: false)
// nativeTheme / screen are Electron's own read-only views; CPU load is worked out from os.cpus()
// time counters (how much of the last few seconds the processors were busy). Nothing is changed.
const os = require('os');
const { nativeTheme, screen } = require('electron');

const CPU_EVERY_MS = 5000;
const BUSY_LOAD = 0.85; // share of CPU time busy...
const BUSY_SAMPLES = 3; // ...for this many samples in a row (15s) counts as "working hard"
const CALM_LOAD = 0.5; // back below this = calmed down

function cpuTimes() {
  return os.cpus().reduce((sum, c) => {
    const t = c.times;
    sum.idle += t.idle;
    sum.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return sum;
  }, { idle: 0, total: 0 });
}

function start(emit) {
  let dark = nativeTheme.shouldUseDarkColors;
  nativeTheme.on('updated', () => {
    const now = nativeTheme.shouldUseDarkColors;
    if (now !== dark) {
      dark = now;
      emit('theme', { dark });
    }
  });

  screen.on('display-added', () => emit('display', { count: screen.getAllDisplays().length, change: 'added' }));
  screen.on('display-removed', () => emit('display', { count: screen.getAllDisplays().length, change: 'removed' }));

  let prev = cpuTimes();
  let hot = 0;
  let busy = false;
  setInterval(() => {
    const now = cpuTimes();
    const load = 1 - (now.idle - prev.idle) / Math.max(1, now.total - prev.total);
    prev = now;
    hot = load >= BUSY_LOAD ? hot + 1 : 0;
    if (!busy && hot >= BUSY_SAMPLES) {
      busy = true;
      emit('cpu', { busy: true });
    } else if (busy && load < CALM_LOAD) {
      busy = false;
      emit('cpu', { busy: false });
    }
  }, CPU_EVERY_MS);
}

module.exports = { start };
