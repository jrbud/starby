// Mood rules (Person 3). Not a behavior itself, so it is NOT registered in behaviors/index.js.
//
// pet.mood is set by ./mood.js. Other behaviors should NOT check mood names; they read the one
// rule they care about:
//
//   import { rulesFor } from './moods.js';
//   if (!rulesFor(ctx.pet).follow) return;
//
// That way tuning a mood, or adding a new one later, only touches this table.
//
// Rules (and who reads them):
//   stardust   drop-rate multiplier: 0 = no drops (incl. wall-hit drops), 2 = twice as often (stardust.js)
//   refuses    when a drop is skipped (stardust 0), say "no stardust for you!" once         (stardust.js)
//   wander     true = random walks, false = stays put,
//              'corner' = walk to pet.goal (set by mood.js) instead of random spots         (idle.js / walk.js)
//   follow     may say "oh! hi" to a calm cursor and walk over to it                       (cursorReact.js)
//   flee       may flinch & run from a rushing cursor                                       (cursorReact.js)
//   lookAway   eyes avoid the cursor instead of following it                                (cursorReact.js)
//   hop        may do random happy hops                                                     (idle.js / walk.js)
//   grabbable  false = a grab attempt becomes a swat instead of a drag                      (drag.js)
//   quiet      true = unprompted lines (system reactions etc.) are dropped                  (chatter.js)
//   bobSpeed   idle breathing speed (3 = the original)                                      (idle.js)
//   eyesShut   eyes stay closed (uses the existing blink drawing, no new art)               (idle.js)

const BASE = {
  stardust: 1, refuses: false, wander: true, follow: true, flee: true, lookAway: false,
  hop: true, grabbable: true, quiet: false, bobSpeed: 3, eyesShut: false,
};

export const MOODS = {
  happy: { ...BASE },
  mad: { ...BASE, stardust: 0, refuses: true, follow: false, lookAway: true, hop: false, grabbable: false },
  playful: { ...BASE, stardust: 2, bobSpeed: 4 },
  dizzy: { ...BASE, stardust: 0, wander: false, follow: false, flee: false, hop: false, bobSpeed: 2 },
  yawning: { ...BASE, stardust: 0, wander: 'corner', follow: false, flee: false, hop: false, bobSpeed: 2 },
  sleepy: {
    ...BASE, stardust: 0, wander: false, follow: false, flee: false, hop: false, quiet: true, bobSpeed: 1, eyesShut: true,
  },
};

export const MOOD_NAMES = Object.keys(MOODS);

/** The rules for the pet's current mood (happy if mood isn't set yet). */
export const rulesFor = (pet) => MOODS[pet && pet.mood] || MOODS.happy;
