// Cursor awareness: eyes follow the cursor when it's near, and the pet "notices" you.
// Cursor position comes from forwarded mousemove events (see clickThrough.js).
// TODO(cursor owner): follow briefly, flinch when the cursor rushes at it, etc.

const NOTICE_RADIUS = 160;
const NOTICE_COOLDOWN = 15; // seconds between "oh hi!" lines

let near = false;
let cooldown = 0;

export default {
  name: 'cursor-react',

  update(ctx, dt) {
    const { pet, cursor } = ctx;
    cooldown = Math.max(0, cooldown - dt);

    const cx = pet.x + pet.size / 2;
    const cy = pet.y + pet.size / 2;
    const dx = cursor.x - cx;
    const dist = Math.hypot(dx, cursor.y - cy);

    if (dist < NOTICE_RADIUS) {
      // lookX is in screen space; pet.js compensates for the facing flip.
      pet.lookX = Math.max(-1, Math.min(1, dx / 60));
      if (!near && cooldown === 0 && pet.mode !== 'drag') {
        ctx.say('oh! hi :)', 1500);
        cooldown = NOTICE_COOLDOWN;
      }
      near = true;
    } else {
      pet.lookX *= 0.9; // ease eyes back to center
      near = false;
    }
  },
};
