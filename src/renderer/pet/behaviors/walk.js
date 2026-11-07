// Walk: head toward (pet.targetX, pet.targetY) at pet.walkSpeed (both set by idle.js),
// with enough randomness to feel alive:
//   - eases into and out of each walk instead of starting/stopping at full speed
//   - stops for short pauses to look around
//   - sometimes changes its mind and turns back partway
//   - hops over nothing now and then
//
// Also runs 'flee' mode (set by cursorReact.js when the cursor rushes at the star):
// same movement, but fast, with a quick start and none of the random pauses/turn-backs.
//
// Split between ticks and frames:
//   onTick (10/s)  → decisions: pause, turn back, hop, pause countdown
//   update (every frame) → smooth motion: moving, easing, hop cycle, jump arc
import { rand, chance, approach, clampToScreen, startJump, updateJump, isJumping } from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';

const MOVING_MODES = ['walk', 'flee'];

const DEFAULT_SPEED = 70; // px/s, if idle.js didn't set one
const PAUSE_PER_SEC = 0.25; // chance per second of a mid-walk pause
const JUMP_PER_SEC = 0.12; // chance per second of a hop while walking
const TURN_BACK_CHANCE = 0.2; // chance per walk of changing its mind partway

let t = 0; // drives the hop cycle
let walkedFor = 0;
let speedNow = 0;
let pauseLeft = 0;
let willTurnBackAt = null; // seconds into the walk, or null
let movingMode = null; // which moving mode we last set up for ('walk' | 'flee' | null)

function startWalk(pet) {
  walkedFor = 0;
  pauseLeft = 0;
  if (pet.mode === 'flee') {
    // Bolt: start at a good clip, never stop to think.
    speedNow = Math.max(speedNow, (pet.walkSpeed || DEFAULT_SPEED) * 0.6);
    willTurnBackAt = null;
  } else {
    speedNow = 0;
    willTurnBackAt = Math.random() < TURN_BACK_CHANCE ? rand(0.6, 1.8) : null;
  }
}

// Set up a fresh walk whenever we enter a moving mode or switch between them (e.g. a walk
// interrupted by a flinch). Called from both onTick and update, so whichever runs first after
// the mode change does the setup — no frame runs with stale pause/turn-back state.
function syncMode(pet) {
  const moving = MOVING_MODES.includes(pet.mode);
  if (!moving) {
    movingMode = null;
    return false;
  }
  if (pet.mode !== movingMode) {
    movingMode = pet.mode;
    startWalk(pet);
  }
  return true;
}

// "Hmm, never mind": stop, look back, then head part of the way back.
function turnBack(ctx) {
  const { pet } = ctx;
  const back = rand(0.3, 0.8);
  const target = clampToScreen(
    ctx,
    pet.x - (pet.targetX - pet.x) * back,
    pet.y - (pet.targetY - pet.y) * back,
  );
  pet.targetX = target.x;
  pet.targetY = target.y;
  pet.facing *= -1;
  pauseLeft = rand(0.3, 0.7);
  speedNow = 0;
  ctx.log('turn-back', {});
}

export default {
  name: 'walk',

  onTick(ctx) {
    const { pet } = ctx;
    if (!syncMode(pet)) return;
    if (pet.mode === 'flee') return; // no random events while running away

    // ---- Paused: count down, maybe glance around ----
    if (pauseLeft > 0) {
      pauseLeft -= TICK_SECONDS;
      if (!isJumping() && chance(0.8, TICK_SECONDS)) pet.facing *= -1;
      // Face the way we're about to go once the pause ends.
      if (pauseLeft <= 0) pet.facing = pet.targetX >= pet.x ? 1 : -1;
      return;
    }

    walkedFor += TICK_SECONDS;

    // ---- Random events ----
    if (willTurnBackAt !== null && walkedFor >= willTurnBackAt) {
      willTurnBackAt = null;
      turnBack(ctx);
      return;
    }
    if (walkedFor > 0.5 && !isJumping() && chance(PAUSE_PER_SEC, TICK_SECONDS)) {
      pauseLeft = rand(0.4, 1.6);
      speedNow = 0;
      ctx.log('pause', { seconds: Math.round(pauseLeft * 10) / 10 });
      return;
    }
    if (!isJumping() && chance(JUMP_PER_SEC, TICK_SECONDS)) {
      startJump();
      ctx.log('jump', { while: 'walk' });
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (!syncMode(pet)) return;
    const fleeing = pet.mode === 'flee';

    const jumping = updateJump(pet, dt);

    // Paused: stand still and settle.
    if (pauseLeft > 0) {
      if (!jumping) {
        pet.bob = approach(pet.bob, 0, dt, 10);
        pet.squash = approach(pet.squash, 1, dt, 10);
      }
      return;
    }

    const dx = pet.targetX - pet.x;
    const dy = (pet.targetY ?? pet.y) - pet.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      if (!jumping) pet.mode = 'idle'; // land any hop before stopping
      return;
    }

    // Ease in (speed builds up) and ease out (slow down over the last ~40px).
    const cruise = pet.walkSpeed || DEFAULT_SPEED;
    const target = cruise * Math.min(1, 0.25 + dist / 40);
    speedNow = approach(speedNow, target, dt, fleeing ? 12 : 5);

    // Only flip facing on real horizontal movement, so walking straight up/down doesn't jitter.
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
    const step = speedNow * dt;
    if (step >= dist) {
      // Land exactly on the target (avoids float drift like x = -1e-17 at screen edges).
      pet.x = pet.targetX;
      pet.y = pet.targetY ?? pet.y;
    } else {
      pet.x += (dx / dist) * step;
      pet.y += (dy / dist) * step;
    }

    // Hop cycle: faster walks bounce faster. Skipped mid-jump (the jump owns bob/squash).
    if (!jumping) {
      t += dt * Math.min(speedNow / 70, 2.5) * 8; // capped so a sprint doesn't vibrate
      const phase = Math.abs(Math.sin(t));
      pet.bob = -phase * 6;
      pet.squash = approach(pet.squash, 0.94 + phase * 0.1, dt, 15);
    }
  },
};
