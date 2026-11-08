// SHOOTING STAR — a sky event (./happenings.js): a clump of starbits shoots across the screen, from
// left to right or right to left, with trails.
//
// Starby yells "WATCH OUT! STARS INCOMING!" and turns toward where they'll come from; WARN_FOR
// seconds later COUNT starbits launch from that side in a tight clump (all within STREAM_FOR seconds,
// ±BAND px of one height, similar speeds and slant), flying fast to the other side (shootStarbit in
// ../behaviors/starbits.js). Catch them with the cursor as they fly past; any that reach the other
// side are gone. Afterwards he says how many you caught.
//
// Like the star shower he isn't taken over (no pet.mode of his own). A SKY EVENT (./happenings.js):
// high priority, interrupts a dance, shares the 10–15 minute sky timer (which waits for a running
// game to finish). Decisions run on ticks.
// DevTools: starby.happening('shooting-star'), or right-click → Developer → "Start shooting star now".
import { rand, startJump, isJumping } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { shootStarbit } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const WARN_FOR = 1.5; // seconds between the warning and the first starbit
const COUNT = [10, 16]; // starbits in the clump
const STREAM_FOR = 0.2; // seconds over which they all launch (short = clumped: 0.2s ≈ 190px apart at most)
const SPEED = [910, 970]; // px/s across the screen (close together, so the clump holds its shape)
const DRIFT = 90; // px/s max up/down drift for the whole clump (they share one slant)
const DRIFT_JITTER = 8; // px/s each starbit may differ from that slant
const BAND = 25; // px: starbits launch within ± this of the clump's height
const TAIL = 3; // seconds after the last launch for them to finish crossing

const LINES = {
  start: lineBag(['WATCH OUT! STARS INCOMING!', 'WATCH OUT! STARS INCOMING!! ✦']),
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
  category: 'sky',
  priority: 14, // high: beats dancing, invites and games; below hush (15), so a call silences it

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
    ctx.say(LINES.start(), (WARN_FOR + 0.8) * 1000); // the warning stays up until they arrive
    if (pet.mode !== 'drag' && pet.mode !== 'toss' && !isJumping()) startJump({ height: rand(20, 28), air: 0.32 }); // alarmed hop
    ctx.log('shooting-star', { from: side, count: total });
  },

  onTick(ctx) {
    elapsed += TICK_SECONDS;
    const a = areaOf(ctx);

    // After the warning, launch the clump over STREAM_FOR seconds.
    const sinceWarn = elapsed - WARN_FOR;
    const due = sinceWarn <= 0 ? 0 : Math.min(total, Math.ceil((sinceWarn / STREAM_FOR) * total));
    while (launched < due) {
      const y = Math.max(a.top + 20, Math.min(a.bottom - 20, laneY + rand(-BAND, BAND)));
      shootStarbit(ctx, side, y, rand(...SPEED), slant + rand(-DRIFT_JITTER, DRIFT_JITTER));
      launched++;
    }

    if (elapsed >= WARN_FOR + STREAM_FOR + TAIL) {
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
