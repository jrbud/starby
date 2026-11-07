// Shared movement helpers for idle.js and walk.js (Person 1). Not a behavior itself,
// so it is NOT registered in behaviors/index.js.

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const chance = (perSecond, dt) => Math.random() < perSecond * dt;

// Ease a value toward a target. Used for squash so landings/crouches read as a squish
// instead of snapping back in one frame.
export const approach = (value, target, dt, speed = 12) =>
  value + (target - value) * Math.min(1, dt * speed);

// Leave room above the star so its speech bubble never goes off the top of the screen.
export const TOP_MARGIN = 60;

export function clampToScreen(ctx, x, y) {
  return {
    x: clamp(x, 0, ctx.stageWidth() - ctx.pet.size),
    y: clamp(y, TOP_MARGIN, ctx.groundY()),
  };
}

// ---- Jumps ----
// A jump is a short arc layered on top of idle/walk: a quick crouch, a parabola up and
// down, then a landing squish. It only changes pet.bob / pet.squash (visual offset);
// the star's actual position keeps following the walk.

const CROUCH = 0.08; // seconds of anticipation before leaving the ground
let jump = null; // { t, air, height, then }

/** Start a jump unless one is already happening. `then` runs on landing. */
export function startJump({ height = rand(14, 30), air = rand(0.32, 0.48), then } = {}) {
  if (jump) return;
  jump = { t: 0, air, height, then };
}

export function cancelJump() {
  jump = null;
}

export const isJumping = () => jump !== null;

/** Call every frame from idle/walk. Returns true while the jump is in progress. */
export function updateJump(pet, dt) {
  if (!jump) return false;
  jump.t += dt;

  if (jump.t < CROUCH) {
    pet.bob = 0;
    pet.squash = approach(pet.squash, 0.8, dt, 30);
    return true;
  }

  const p = (jump.t - CROUCH) / jump.air;
  if (p >= 1) {
    const { then } = jump;
    jump = null;
    pet.bob = 0;
    pet.squash = 0.78; // landing squish; callers ease it back to normal
    then?.();
    return false;
  }

  pet.bob = -4 * jump.height * p * (1 - p); // parabola: 0 → -height → 0
  pet.squash = approach(pet.squash, 1.12, dt, 20); // stretch while in the air
  return true;
}
