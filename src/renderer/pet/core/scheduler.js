// Timed events on the session clock.
//
//   const id = ctx.after(10 * 60, () => ctx.say('10 minutes!'), 'milestone 10m');
//   const id = ctx.every(30, () => maybeDoSomething(), 'random event roll');
//   ctx.cancel(id);
//
// Times are in seconds and rounded to the nearest tick (0.1s). Callbacks run on a tick,
// before behaviors' onTick. A task that throws is logged to the console and, if repeating,
// keeps its schedule, so one broken event can't stop the others.
import { secondsToTicks, TICK_SECONDS } from './clock.js';

export function createScheduler(clock) {
  let nextId = 1;
  const tasks = new Map(); // id → { due, interval, fn, label }

  function add(seconds, fn, repeat, label) {
    const id = nextId++;
    const ticks = secondsToTicks(seconds);
    tasks.set(id, { due: clock.tick + ticks, interval: repeat ? ticks : 0, fn, label });
    return id;
  }

  return {
    after: (seconds, fn, label = '') => add(seconds, fn, false, label),
    every: (seconds, fn, label = '') => add(seconds, fn, true, label),
    cancel: (id) => { if (id != null) tasks.delete(id); },

    /** Called by pet.js on every tick. */
    run(tick) {
      for (const [id, task] of tasks) {
        if (task.due > tick) continue;
        // Reschedule from *now*, so after a stall a repeating task fires once, not in a burst.
        if (task.interval) task.due = tick + task.interval;
        else tasks.delete(id);
        try {
          task.fn(tick);
        } catch (err) {
          console.error(`[scheduler] task "${task.label || id}" failed:`, err);
        }
      }
    },

    /** What's waiting to run (for debugging). */
    pending: () => [...tasks.entries()].map(([id, t]) => ({
      id,
      label: t.label,
      inSeconds: (t.due - clock.tick) * TICK_SECONDS,
      repeats: t.interval > 0,
    })),
  };
}
