// Idle: gentle bob + occasional blink. After a while, start walking somewhere.

const rand = (a, b) => a + Math.random() * (b - a);

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
      pet.targetX = rand(0, ctx.stageWidth() - pet.size);
      pet.mode = 'walk';
    }
  },
};
