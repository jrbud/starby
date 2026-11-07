// Idle: gentle bob + occasional blink. After a while, start walking somewhere on screen.

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Leave room above the star so its speech bubble never goes off the top of the screen.
const TOP_MARGIN = 60;

// Pick somewhere to walk to: usually a short wander nearby, sometimes a long trip anywhere.
function pickTarget(ctx) {
  const { pet } = ctx;
  const maxX = ctx.stageWidth() - pet.size;
  const maxY = ctx.groundY(); // just above the taskbar
  if (Math.random() < 0.7) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(80, 300);
    return {
      x: clamp(pet.x + Math.cos(angle) * dist, 0, maxX),
      y: clamp(pet.y + Math.sin(angle) * dist, TOP_MARGIN, maxY),
    };
  }
  return { x: rand(0, maxX), y: rand(TOP_MARGIN, maxY) };
}

let t = 0;
let idleFor = 0;
let nextWalkIn = rand(3, 7);
let blinkIn = rand(2, 5);

export default {
  name: 'idle',

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;

    // Blink regardless of mode.
    blinkIn -= dt;
    if (blinkIn <= 0) {
      pet.blink = !pet.blink;
      blinkIn = pet.blink ? 0.12 : rand(2, 5);
    }

    if (pet.mode !== 'idle') {
      idleFor = 0;
      return;
    }

    pet.bob = Math.sin(t * 3) * 3;
    pet.squash = 1 + Math.sin(t * 3) * 0.03;

    idleFor += dt;
    if (idleFor >= nextWalkIn) {
      idleFor = 0;
      nextWalkIn = rand(3, 7);
      const target = pickTarget(ctx);
      pet.targetX = target.x;
      pet.targetY = target.y;
      pet.mode = 'walk';
    }
  },
};
