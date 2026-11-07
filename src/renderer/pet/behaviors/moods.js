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
// Rules (who reads them, once Phase 2 hooks them up):
//   stardust   drop-rate multiplier: 0 = no drops, 2 = twice as often             (stardust.js)
//   wander     true = random walks, false = stays put,
//              'corner' = walk to pet.goal (set by mood.js) instead of random spots  (idle.js / walk.js)
//   follow     may walk over to a calm cursor                                     (cursorReact.js)
//   flee       may flinch & run from a rushing cursor                             (cursorReact.js)
//   hop        may do random happy hops                                           (idle.js / walk.js)
//   grabbable  false = a grab attempt becomes a swat instead of a drag            (drag.js)
//   quiet      true = unprompted lines (system reactions etc.) are dropped        (chatter.js)
//   bobSpeed   idle breathing speed; idle.js uses 3 today                         (idle.js)

export const MOODS = {
  happy: { stardust: 1, wander: true, follow: true, flee: true, hop: true, grabbable: true, quiet: false, bobSpeed: 3 },
  mad: { stardust: 0, wander: true, follow: false, flee: true, hop: false, grabbable: false, quiet: false, bobSpeed: 3 },
  playful: { stardust: 2, wander: true, follow: true, flee: true, hop: true, grabbable: true, quiet: false, bobSpeed: 4 },
  dizzy: { stardust: 0, wander: false, follow: false, flee: false, hop: false, grabbable: true, quiet: false, bobSpeed: 2 },
  yawning: { stardust: 0, wander: 'corner', follow: false, flee: false, hop: false, grabbable: true, quiet: false, bobSpeed: 2 },
  sleepy: { stardust: 0, wander: false, follow: false, flee: false, hop: false, grabbable: true, quiet: true, bobSpeed: 1 },
};

export const MOOD_NAMES = Object.keys(MOODS);

/** The rules for the pet's current mood (happy if mood isn't set yet). */
export const rulesFor = (pet) => MOODS[pet && pet.mood] || MOODS.happy;
