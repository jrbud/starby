// Cursor awareness:
//   - eyes follow the cursor when it's near (every frame, smooth)
//   - says hi when the cursor comes close (tick decision, with cooldown)
//   - FLINCH & RUN: if the cursor rushes at the star, it squashes, hops and runs away
//     (tick decision → switches to 'flee' mode; walk.js does the actual running)
//   - if you keep chasing it, it gives up for a bit so you can still catch/click it
//
// Cursor position comes from forwarded mousemove events (see clickThrough.js). Cursor speed
// is measured once per tick (0.1s), which smooths out jittery per-frame mouse deltas.
// TODO(cursor owner): follow briefly (P1-4).
import { rand, clamp, clampToScreen, startJump, cancelJump } from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';

const NOTICE_RADIUS = 160;
const NOTICE_COOLDOWN = 15; // seconds between "oh hi!" lines

// Flinch tuning
const FLINCH_RADIUS = 180; // the cursor's path has to come this close (px) to the star's center
const MIN_RUSH_SPEED = 1300; // px/s toward the star (a quick flick, not a normal mouse move)
const MAX_MISS = 70; // ignore fast cursors whose straight-line path passes further than this from the star
const MAX_REAL_SPEED = 8000; // px/s; faster than this is a cursor jump, not a hand movement
const FLINCH_COOLDOWN = 2.5; // seconds between flinches
const FLEE_DIST = [170, 280]; // px to run
const FLEE_SPEED = [260, 340]; // px/s
const GIVE_UP_AFTER = 3; // flinches...
const GIVE_UP_WINDOW = 30; // ...within this many seconds → stop running for a while
const GIVE_UP_FOR = 20; // seconds

const FLINCH_LINES = ['eek!', 'whoa!', '!!', 'hey!', 'too fast!'];
const GIVE_UP_LINES = ['ok ok, you got me', "i'm too tired to run...", 'fine, you win'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let near = false;
let noticeCooldown = 0;
let flinchCooldown = 0;
let braveUntil = 0; // session seconds; won't flee before this
let prevCursor = null;

function petCenter(pet) {
  return { x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 };
}

// Pick a spot away from the cursor. If cornered (screen edge in the way), try angling off
// to the sides and take whichever direction actually gets it furthest.
function fleeTarget(ctx, awayX, awayY) {
  const { pet } = ctx;
  const base = Math.atan2(awayY, awayX) + rand(-0.4, 0.4);
  const dist = rand(...FLEE_DIST);
  let best = null;
  for (const offset of [0, 0.8, -0.8, 1.6, -1.6]) {
    const a = base + offset;
    const target = clampToScreen(ctx, pet.x + Math.cos(a) * dist, pet.y + Math.sin(a) * dist);
    const moved = Math.hypot(target.x - pet.x, target.y - pet.y);
    if (!best || moved > best.moved) best = { ...target, moved };
    if (moved >= dist * 0.6) break; // good enough
  }
  return best;
}

function flinch(ctx, awayX, awayY) {
  const { pet } = ctx;
  flinchCooldown = FLINCH_COOLDOWN;

  // Kept getting chased? Give up for a while (reads the session event log).
  if (ctx.events.count('flinch', GIVE_UP_WINDOW) >= GIVE_UP_AFTER - 1) {
    braveUntil = ctx.clock.seconds + GIVE_UP_FOR;
    ctx.say(pick(GIVE_UP_LINES), 2500);
    ctx.log('give-up', { forSeconds: GIVE_UP_FOR });
    return;
  }

  // Startle hop (startJump does the crouch squash → stretch → landing squish).
  cancelJump();
  startJump({ height: rand(10, 16), air: 0.22 });

  const target = fleeTarget(ctx, awayX, awayY);
  pet.targetX = target.x;
  pet.targetY = target.y;
  pet.walkSpeed = rand(...FLEE_SPEED);
  pet.walkKind = 'flee';
  pet.mode = 'flee'; // walk.js runs it; back to 'idle' on arrival

  ctx.say(pick(FLINCH_LINES), 1200);
  ctx.log('flinch', { toX: Math.round(target.x), toY: Math.round(target.y) });
}

export default {
  name: 'cursor-react',

  onTick(ctx) {
    const { pet, cursor } = ctx;
    noticeCooldown = Math.max(0, noticeCooldown - TICK_SECONDS);
    flinchCooldown = Math.max(0, flinchCooldown - TICK_SECONDS);

    // No cursor position yet (it hasn't moved over the screen since launch).
    if (cursor.x < -1000) return;
    const from = prevCursor; // where the cursor was last tick
    const vx = from ? (cursor.x - from.x) / TICK_SECONDS : 0;
    const vy = from ? (cursor.y - from.y) / TICK_SECONDS : 0;
    prevCursor = { x: cursor.x, y: cursor.y };

    const c = petCenter(pet);
    const awayX = c.x - cursor.x;
    const awayY = c.y - cursor.y;
    const dist = Math.hypot(awayX, awayY) || 1;
    // Speed of the cursor *toward* the star (positive = getting closer).
    const approach = (vx * awayX + vy * awayY) / dist;

    // ---- Notice (only calm approaches; a rushing cursor gets a flinch instead) ----
    // Only react while it's going about its business (not held, thrown, or already running).
    const free = pet.mode === 'idle' || pet.mode === 'walk';
    const isNear = dist < NOTICE_RADIUS;
    const calm = approach < MIN_RUSH_SPEED / 2;
    if (isNear && !near && calm && noticeCooldown === 0 && free) {
      ctx.say('oh! hi :)', 1500);
      noticeCooldown = NOTICE_COOLDOWN;
    }
    near = isNear;

    // ---- Flinch ----
    if (!free || !from) return;
    if (flinchCooldown > 0 || ctx.clock.seconds < braveUntil) return;
    // Impossibly fast = the cursor jumped (e.g. first mousemove after a while), not a flick.
    if (Math.hypot(vx, vy) > MAX_REAL_SPEED) return;

    // Judge the whole path the cursor took since last tick (from → now), not just where it
    // is now: a fast flick can cross the star's whole neighbourhood between two ticks.
    const fromAwayX = c.x - from.x;
    const fromAwayY = c.y - from.y;
    const fromDist = Math.hypot(fromAwayX, fromAwayY) || 1;
    // Speed toward the star at the start of the move (positive = heading at it).
    const rushSpeed = (vx * fromAwayX + vy * fromAwayY) / fromDist;
    if (rushSpeed < MIN_RUSH_SPEED) return;

    // Closest point of that path to the star.
    const sx = cursor.x - from.x;
    const sy = cursor.y - from.y;
    const along = clamp((fromAwayX * sx + fromAwayY * sy) / (sx * sx + sy * sy || 1), 0, 1);
    const nearX = from.x + sx * along;
    const nearY = from.y + sy * along;
    if (Math.hypot(c.x - nearX, c.y - nearY) > FLINCH_RADIUS) return;

    // How close the straight-line path passes to the star (cross product), i.e. was it aimed?
    const speed = Math.hypot(vx, vy) || 1;
    const missBy = Math.abs(vx * fromAwayY - vy * fromAwayX) / speed;
    if (missBy >= MAX_MISS) return;

    // Run away from the cursor's path. Dead-on hit (or it already flew past)? Jump sideways
    // out of the path instead of back along it.
    let fleeX = c.x - nearX;
    let fleeY = c.y - nearY;
    if (Math.hypot(fleeX, fleeY) < 10) {
      const side = Math.random() < 0.5 ? 1 : -1;
      fleeX = -vy * side;
      fleeY = vx * side;
    }
    flinch(ctx, fleeX, fleeY);
  },

  update(ctx) {
    const { pet, cursor } = ctx;
    const c = petCenter(pet);
    const dx = cursor.x - c.x;
    if (Math.hypot(dx, cursor.y - c.y) < NOTICE_RADIUS) {
      // lookX is in screen space; pet.js compensates for the facing flip.
      pet.lookX = clamp(dx / 60, -1, 1);
    } else {
      pet.lookX *= 0.9; // ease eyes back to center
    }
  },
};
