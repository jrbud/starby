// System time (read-only). Emits the current part of the day on start and when it changes.
const CHECK_MS = 60 * 1000;

function partOfDay(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function start(emit) {
  let last = null;
  const check = () => {
    const hour = new Date().getHours();
    const part = partOfDay(hour);
    if (part !== last) {
      last = part;
      emit('time-of-day', { hour, part });
    }
  };
  check();
  setInterval(check, CHECK_MS);
}

module.exports = { start };
