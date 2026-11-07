// Walk: move in a straight line toward (pet.targetX, pet.targetY) anywhere on screen,
// then go idle. Targets are picked in idle.js.
// TODO(movement owner): pauses mid-walk, turning around, varied speed (P1-2).

const SPEED = 70; // px/s
let t = 0;

export default {
  name: 'walk',

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'walk') return;
    t += dt;

    const dx = pet.targetX - pet.x;
    const dy = (pet.targetY ?? pet.y) - pet.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      pet.mode = 'idle';
      return;
    }

    // Only flip facing on real horizontal movement, so walking straight up/down doesn't jitter.
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
    const step = Math.min(dist, SPEED * dt);
    pet.x += (dx / dist) * step;
    pet.y += (dy / dist) * step;

    // Little hop cycle while moving: transform-only animation.
    const phase = Math.abs(Math.sin(t * 8));
    pet.bob = -phase * 6;
    pet.squash = 0.94 + phase * 0.1;
  },
};
