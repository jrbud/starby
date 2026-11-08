// SHOOTING STAR — a happening (./happenings.js): a bunch of starbits shoot across the screen, from
// left to right or right to left, in a quick stream with trails.
//
// Starby spots it ("ooh, a shooting star! ✦") and turns to watch; then COUNT starbits launch from
// one side over STREAM_FOR seconds, in a band at a random height, each flying fast to the other
// side (shootStarbit in ../behaviors/starbits.js). Catch them with the cursor as they fly past; any
// that reach the other side are gone. Afterwards he says how many you caught.
//
// Like the star shower he isn't taken over (no pet.mode of his own), it's low priority (never
// interrupts a game), and it shares the 20–50 minute happenings timer. Decisions run on ticks.
// DevTools: starby.happening('shooting-star'), or right-click → Developer → "Start shooting star now".
import { rand, startJump, isJumping } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { shootStarbit } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const COUNT = [10, 16]; // starbits in the stream
const STREAM_FOR = 2.2; // seconds over which they launch
const SPEED = [750, 1100]; // px/s across the screen
const DRIFT = 90; // px/s max up/down drift (the whole stream shares a slant, each one varies a bit)
const BAND = 70; // px: starbits launch within ± this of the stream's height
const TAIL = 3.5; // seconds after the last launch for them to finish crossing

const LINES = {
  start: lineBag(['ooh, a shooting star! ✦', 'shooting star! make a wish!', 'look look! a shooting star!']),
  caughtSome: (n) => (n === 1 ? 'you caught 1 starbit!' : `you caught ${n} starbits!`),
  caughtNone: lineBag(['whoosh! they all got away', 'too fast! none caught']),
};

let endIt = null;
let elapsed = 0;
let launched = 0;
let total = 0;
let side = 'left';
let laneY = 0;
let slant = 0;
let startedAt = 0;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });

function finish(result) {
  const end = endIt;
  endIt = null;
  end?.(result);
}

export default {
  name: 'shooting-star',
  priority: 3, // below games and invites

  start(ctx, end) {
    const { pet } = ctx;
    endIt = end;
    elapsed = 0;
    launched = 0;
    total = Math.round(rand(...COUNT));
    side = Math.random() < 0.5 ? 'left' : 'right';
    const a = areaOf(ctx);
    // Somewhere in the upper two-thirds of the screen, like a real shooting star.
    laneY = rand(a.top + 80, a.top + (a.bottom - a.top) * 0.66);
    slant = rand(-DRIFT, DRIFT);
    startedAt = ctx.clock.seconds;
    // He looks toward where it's coming from.
    if (pet.mode === 'idle' || pet.mode === 'walk') pet.facing = side === 'left' ? -1 : 1;
    ctx.say(LINES.start(), 2200);
    if (pet.mode !== 'drag' && pet.mode !== 'toss' && !isJumping()) startJump({ height: rand(14, 22), air: 0.3 });
    ctx.log('shooting-star', { from: side, count: total });
  },

  onTick(ctx) {
    elapsed += TICK_SECONDS;
    const a = areaOf(ctx);

    // Launch the stream evenly over STREAM_FOR seconds.
    const due = Math.min(total, Math.ceil((elapsed / STREAM_FOR) * total));
    while (launched < due) {
      const y = Math.max(a.top + 20, Math.min(a.bottom - 20, laneY + rand(-BAND, BAND)));
      shootStarbit(ctx, side, y, rand(...SPEED), slant + rand(-25, 25));
      launched++;
    }

    if (elapsed >= STREAM_FOR + TAIL) {
      const caught = ctx.events.since(ctx.clock.seconds - startedAt)
        .filter((e) => e.type === 'starbits' && e.data.delta > 0)
        .reduce((sum, e) => sum + e.data.delta, 0);
      ctx.say(caught > 0 ? LINES.caughtSome(caught) : LINES.caughtNone(), 2500);
      ctx.log('shooting-star-end', { launched, caught });
      finish('done');
    }
  },

  stop() {
    endIt = null;
  },
};
