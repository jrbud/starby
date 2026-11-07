// Walk: hop along the ground (top of the taskbar) toward pet.targetX, then go idle.
// TODO(movement owner): walk up screen edges, pause mid-walk, etc.

const SPEED = 70; // px/s
let t = 0;

export default {
  name: 'walk',

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'walk') return;
    t += dt;

    const dx = pet.targetX - pet.x;
    if (Math.abs(dx) < 2) {
      pet.mode = 'idle';
      return;
    }

    pet.facing = dx > 0 ? 1 : -1;
    pet.x += Math.sign(dx) * Math.min(Math.abs(dx), SPEED * dt);
    pet.y = ctx.groundY();

    // Little hop cycle: primitive transform animation, no sprite frames.
    const phase = Math.abs(Math.sin(t * 8));
    pet.bob = -phase * 6;
    pet.squash = 0.94 + phase * 0.1;
  },
};
