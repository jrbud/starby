// Session clock: a steady tick counted from when the app opened.
//
// Frames (requestAnimationFrame) run at whatever the monitor refreshes at and are for
// smooth motion. Ticks run at a fixed TICK_RATE and are for *decisions* and timed events
// (see scheduler.js, and the optional `onTick(ctx, tick)` on behaviors).
//
// The clock follows real time: if the window stalls (e.g. the PC sleeps), it catches up
// instead of losing time, so "after 10 minutes open" means 10 real minutes.

export const TICK_RATE = 10; // ticks per second
export const TICK_SECONDS = 1 / TICK_RATE;

// Run at most this many ticks per frame. After a long stall the clock jumps ahead
// silently instead of replaying thousands of ticks; due scheduled tasks still fire once.
const MAX_CATCH_UP = 20;

export const secondsToTicks = (seconds) => Math.max(1, Math.round(seconds * TICK_RATE));

export function createClock() {
  let tick = 0;
  let pending = 0; // seconds not yet turned into ticks
  const startedAt = Date.now();

  return {
    startedAt,
    get tick() { return tick; },
    get seconds() { return tick * TICK_SECONDS; },

    /** Advance by `dt` real seconds, calling onTick(tick) for each tick that passes. */
    advance(dt, onTick) {
      pending += dt;
      let due = Math.floor(pending / TICK_SECONDS);
      pending -= due * TICK_SECONDS;
      if (due > MAX_CATCH_UP) {
        tick += due - MAX_CATCH_UP; // skip ahead
        due = MAX_CATCH_UP;
      }
      for (let i = 0; i < due; i++) {
        tick++;
        onTick(tick);
      }
    },
  };
}
