// Walk: head toward (pet.targetX, pet.targetY) at pet.walkSpeed (both set by idle.js),
// with enough randomness to feel alive:
//   - eases into and out of each walk instead of starting/stopping at full speed
//   - stops for short pauses to look around
//   - sometimes changes its mind and turns back partway
//   - hops over nothing now and then
import { rand, chance, approach, clampToScreen, startJump, updateJump } from './motion.js';

const DEFAULT_SPEED = 70; // px/s, if idle.js didn't set one
const PAUSE_PER_SEC = 0.25; // chance per second of a mid-walk pause
const JUMP_PER_SEC = 0.12; // chance per second of a hop while walking
const TURN_BACK_CHANCE = 0.2; // chance per walk of changing its mind partway

let t = 0; // drives the hop cycle
let walkedFor = 0;
let speedNow = 0;
let pauseLeft = 0;
let willTurnBackAt = null; // seconds into the walk, or null
let wasWalking = false;

function startWalk() {
  walkedFor = 0;
  speedNow = 0;
  pauseLeft = 0;
  willTurnBackAt = Math.random() < TURN_BACK_CHANCE ? rand(0.6, 1.8) : null;
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
}

export default {
  name: 'walk',

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'walk') {
      wasWalking = false;
      return;
    }
    if (!wasWalking) {
      wasWalking = true;
      startWalk();
    }

    const jumping = updateJump(pet, dt);

    // ---- Paused: stand still, breathe, maybe glance around ----
    if (pauseLeft > 0) {
      pauseLeft -= dt;
      if (!jumping) {
        pet.bob = approach(pet.bob, 0, dt, 10);
        pet.squash = approach(pet.squash, 1, dt, 10);
        if (chance(0.8, dt)) pet.facing *= -1;
      }
      // Face the way we're about to go once the pause ends.
      if (pauseLeft <= 0) pet.facing = pet.targetX >= pet.x ? 1 : -1;
      return;
    }

    walkedFor += dt;

    // ---- Random events ----
    if (willTurnBackAt !== null && walkedFor >= willTurnBackAt) {
      willTurnBackAt = null;
      turnBack(ctx);
      return;
    }
    if (walkedFor > 0.5 && !jumping && chance(PAUSE_PER_SEC, dt)) {
      pauseLeft = rand(0.4, 1.6);
      speedNow = 0;
      return;
    }
    if (!jumping && chance(JUMP_PER_SEC, dt)) startJump();

    // ---- Move ----
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
    speedNow = approach(speedNow, target, dt, 5);

    // Only flip facing on real horizontal movement, so walking straight up/down doesn't jitter.
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
    const step = Math.min(dist, speedNow * dt);
    pet.x += (dx / dist) * step;
    pet.y += (dy / dist) * step;

    // Hop cycle: faster walks bounce faster. Skipped mid-jump (the jump owns bob/squash).
    if (!jumping) {
      t += dt * (speedNow / 70) * 8;
      const phase = Math.abs(Math.sin(t));
      pet.bob = -phase * 6;
      pet.squash = approach(pet.squash, 0.94 + phase * 0.1, dt, 15);
    }
  },
};
