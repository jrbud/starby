// FIDGETS (Person 3): when he's been left alone for a while, just standing there happy, now and
// then he does one little thing on his own: a spin, a tiny bop, a look around, or a stretch.
// Existing frames and motion only (rotation, hops, squash, the left/right/up faces); nothing drawn.
//
// Only when: idle (not walking, held, in an event...), happy or playful, not speaking, and nothing
// happened to him for QUIET_FOR seconds. Rolled every CHECK_EVERY seconds with CHANCE, so it stays
// rare. Owns the star via pet.mode = 'fidget' for the second or so it takes; grab him (or anything
// else takes him) and it just stops.
// DevTools: starby.fidget('spin' | 'bop' | 'look' | 'stretch').
import { approach, startJump, updateJump, cancelJump } from './motion.js';
import { strikePose } from './mood.js';

// ---- Tuning ----
const CHECK_EVERY = 8; // seconds between rolls
const CHANCE = 0.18; // per roll
const QUIET_FOR = 20; // seconds with nothing happening to him first
const MOVES = {
  spin: 0.8, // seconds each
  bop: 0.9,
  look: 1.5,
  stretch: 1.1,
};
const BUSY_EVENTS = ['click', 'grab', 'toss', 'flinch', 'swat', 'petted', 'dialogue-open', 'event-start'];

let current = null; // { move, t, dur }
let nextCheckAt = 0;

function begin(ctx, move) {
  const { pet } = ctx;
  current = { move, t: 0, dur: MOVES[move] };
  pet.mode = 'fidget';
  cancelJump();
  if (move === 'look') strikePose(ctx, 'left', 0.6);
  ctx.log('fidget', { move });
}

function end(ctx) {
  const { pet } = ctx;
  current = null;
  cancelJump();
  pet.rotation = 0;
  pet.bob = 0;
  pet.squash = 1;
  if (pet.mode === 'fidget') pet.mode = 'idle';
}

export default {
  name: 'fidget',

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.fidget = (move = 'spin') => {
        if (!MOVES[move]) return `try: ${Object.keys(MOVES).join(', ')}`;
        if (ctx.pet.mode !== 'idle') return 'busy';
        begin(ctx, move);
        return move;
      };
    }
  },

  onTick(ctx) {
    const { pet } = ctx;
    const now = ctx.clock.seconds;
    if (current || now < nextCheckAt) return;
    nextCheckAt = now + CHECK_EVERY;
    if (pet.mode !== 'idle' || !['happy', 'playful'].includes(pet.mood)) return;
    if (ctx.activeEvent() || ctx.isSpeaking()) return;
    if (ctx.events.since(QUIET_FOR).some((e) => BUSY_EVENTS.includes(e.type))) return;
    if (Math.random() >= CHANCE) return;
    const names = Object.keys(MOVES);
    begin(ctx, names[Math.floor(Math.random() * names.length)]);
  },

  update(ctx, dt) {
    if (!current) return;
    const { pet } = ctx;
    if (pet.mode !== 'fidget') { // taken (grabbed, the dialogue...): just stop
      current = null;
      if (pet.mode !== 'drag' && pet.mode !== 'toss') { pet.rotation = 0; pet.bob = 0; pet.squash = 1; } // (no tilt left over)
      return;
    }
    current.t += dt;
    const u = Math.min(1, current.t / current.dur);
    const S = pet.size;
    if (current.move === 'spin') {
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; // ease in-out
      pet.rotation = e * Math.PI * 2;
      pet.bob = -Math.sin(Math.PI * u) * 0.06 * S;
    } else if (current.move === 'bop') {
      if (current.t - dt <= 0 || (current.t >= 0.42 && current.t - dt < 0.42)) startJump({ height: 0.1 * S, air: 0.3 });
      updateJump(pet, dt);
    } else if (current.move === 'look') {
      if (current.t >= 0.7 && current.t - dt < 0.7) strikePose(ctx, 'right', 0.6);
    } else if (current.move === 'stretch') {
      pet.squash = approach(pet.squash, 1 + 0.16 * Math.sin(Math.PI * u), dt, 18); // a big tall stretch
    }
    if (u >= 1) end(ctx);
  },
};
