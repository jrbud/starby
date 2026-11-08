// STAR SHOWER — a sky event (./happenings.js): starbits rain from the sky for a short while.
//
// Starby shouts "THE SKY IS FALLING!" and hops, then for RAIN_FOR seconds starbits fall from the
// top of the usable screen at random spots (rainStarbit in ../behaviors/starbits.js). They don't
// stay on screen: catch them with the cursor as they fall, or they fade away at the bottom.
// When the last ones have landed (or been caught) he says how many you got.
//
// He isn't taken over: no pet.mode of its own, so he keeps wandering and reacting while it rains
// (with some extra excited hops). A SKY EVENT: high priority, interrupts a dance; the sky timer
// waits for a running game to finish rather than interrupting it.
// Decisions (when to drop the next starbit, ending) run on ticks.
import { rand, chance, startJump, isJumping } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { rainStarbit } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const RAIN_FOR = 12; // seconds of rain
const COUNT = 30; // starbits dropped over RAIN_FOR
const FALL_SPEED = [170, 320]; // px/s
const TAIL = 5; // seconds after the rain for the last ones to finish falling
const HOP_PER_SEC = 0.5; // his excited hops while it rains (only when idle / walking)
const EDGE = 24; // px in from the left/right of the usable area

const LINES = {
  start: lineBag(['THE SKY IS FALLING!', 'THE SKY IS FALLING!! catch them!', 'THE SKY IS FALLING! ✦✦✦']),
  sleepyStart: lineBag(['zzz... huh?! THE SKY IS FALLING!']),
  caughtSome: (n) => (n === 1 ? 'you caught 1 starbit!' : `you caught ${n} starbits!`),
  caughtNone: lineBag(['aw, they all got away...', "phew, it's over. none caught!"]),
};

let endShower = null;
let elapsed = 0;
let dropped = 0;
let startedAt = 0;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });

function finish(result) {
  const end = endShower;
  endShower = null;
  end?.(result);
}

export default {
  name: 'star-shower',
  category: 'sky',
  priority: 14, // high: beats dancing, invites and games; below hush (15), so a call silences it

  start(ctx, end) {
    const { pet } = ctx;
    endShower = end;
    elapsed = 0;
    dropped = 0;
    startedAt = ctx.clock.seconds;
    ctx.say(pet.mood === 'sleepy' ? LINES.sleepyStart() : LINES.start(), 2500);
    if (pet.mode !== 'drag' && pet.mode !== 'toss' && !isJumping()) startJump({ height: rand(18, 26), air: 0.32 });
  },

  onTick(ctx) {
    const { pet } = ctx;
    elapsed += TICK_SECONDS;

    // Drop starbits evenly across the rain, at random spots along the top.
    const due = Math.min(COUNT, Math.floor((elapsed / RAIN_FOR) * COUNT));
    const a = areaOf(ctx);
    while (dropped < due) {
      rainStarbit(ctx, rand(a.left + EDGE, a.right - EDGE), rand(...FALL_SPEED));
      dropped++;
    }

    // Excited hops while it rains, if he's just wandering about.
    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    if (elapsed < RAIN_FOR && relaxed && !isJumping() && chance(HOP_PER_SEC, TICK_SECONDS)) {
      startJump({ height: rand(10, 18), air: 0.28 });
    }

    if (elapsed >= RAIN_FOR + TAIL) {
      // How many did you catch? (pet.js logs every change to the starbits total.)
      const caught = ctx.events.since(ctx.clock.seconds - startedAt)
        .filter((e) => e.type === 'starbits' && e.data.delta > 0)
        .reduce((sum, e) => sum + e.data.delta, 0);
      ctx.say(caught > 0 ? LINES.caughtSome(caught) : LINES.caughtNone(), 2500);
      ctx.log('star-shower-end', { dropped, caught });
      finish('done');
    }
  },

  stop() {
    endShower = null;
  },
};
