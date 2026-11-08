// In-memory log of what happened since the app opened. Session only: it is NOT saved
// to disk and starts empty on every launch.
//
//   ctx.log('jump', { double: true });          // record something
//   ctx.events.last('say')                       // most recent entry of a type (or null)
//   ctx.events.since(5 * 60)                     // entries from the last 5 minutes
//   ctx.events.count('click', 60)                // how many clicks in the last minute
//   ctx.events.total('click')                    // how many clicks since the app opened
//   ctx.events.all()                             // everything still kept
//   ctx.events.onEntry((entry) => { ... })       // get told about new entries
//
// Each entry: { tick, t, at, type, data }
//   tick = session tick, t = seconds since app opened, at = wall-clock ms (Date.now())

// Oldest entries are dropped past this (roughly an hour or two of normal activity).
// Per-type totals (events.total) are kept for the whole session regardless.
const MAX_ENTRIES = 2000;

export function createEventLog(clock) {
  const entries = [];
  const totals = new Map(); // type → count since app opened
  const listeners = new Set();

  function log(type, data = {}) {
    const entry = { tick: clock.tick, t: clock.seconds, at: Date.now(), type, data };
    entries.push(entry);
    totals.set(type, (totals.get(type) || 0) + 1);
    if (entries.length > MAX_ENTRIES) entries.shift();
    for (const fn of listeners) fn(entry);
    return entry;
  }

  const since = (seconds) => {
    const from = clock.seconds - seconds;
    return entries.filter((e) => e.t >= from);
  };

  const events = {
    all: () => entries.slice(),
    since,
    last(type) {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i].type === type) return entries[i];
      return null;
    },
    count: (type, withinSeconds = Infinity) =>
      (withinSeconds === Infinity ? entries : since(withinSeconds)).filter((e) => e.type === type).length,
    total: (type) => totals.get(type) || 0,
    onEntry(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  return { log, events };
}
