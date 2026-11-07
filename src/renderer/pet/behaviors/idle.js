// Idle: breathing bob, blinking, looking around, the odd happy jump.
// Rests for a short, medium or long while, then picks a kind of walk and sets off.
import {
  rand, chance, approach, clampToScreen, startJump, updateJump, cancelJump, isJumping,
} from './motion.js';

// Kinds of walk, picked at random. Speeds are px/s; walk.js eases in and out of them.
const WALK_KINDS = [
  { name: 'shuffle', weight: 3, dist: [25, 90], speed: [35, 55] },
  { name: 'wander', weight: 5, dist: [90, 320], speed: [60, 95] },
  { name: 'trip', weight: 2, dist: null, speed: [110, 160] }, // dist null = anywhere on screen
];

function pickWeighted(items) {
  let r = Math.random() * items.reduce((sum, i) => sum + i.weight, 0);
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function planWalk(ctx) {
  const { pet } = ctx;
  const kind = pickWeighted(WALK_KINDS);
  let target;
  if (kind.dist) {
    // Shuffles are mostly sideways; wanders go any direction.
    const angle = kind.name === 'shuffle'
      ? (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.4, 0.4)
      : rand(0, Math.PI * 2);
    const dist = rand(...kind.dist);
    target = clampToScreen(ctx, pet.x + Math.cos(angle) * dist, pet.y + Math.sin(angle) * dist);
  } else {
    target = clampToScreen(ctx, rand(0, ctx.stageWidth()), rand(0, ctx.groundY()));
  }
  pet.targetX = target.x;
  pet.targetY = target.y;
  pet.walkSpeed = rand(...kind.speed);
  pet.walkKind = kind.name;
}

// Rest length: mostly short or medium, sometimes a long sit.
function pickRest() {
  const r = Math.random();
  if (r < 0.35) return rand(0.6, 1.8);
  if (r < 0.85) return rand(2.5, 5.5);
  return rand(6, 10);
}

let t = 0;
let idleFor = 0;
let restFor = pickRest();
let blinkIn = rand(2, 5);
let lookIn = rand(1.5, 4);
let wasIdle = false;

export default {
  name: 'idle',

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;

    // Blink regardless of mode (sometimes a quick double blink).
    blinkIn -= dt;
    if (blinkIn <= 0) {
      pet.blink = !pet.blink;
      blinkIn = pet.blink ? 0.12 : Math.random() < 0.2 ? 0.15 : rand(2, 5);
    }

    if (pet.mode === 'drag') cancelJump();
    if (pet.mode !== 'idle') {
      wasIdle = false;
      return;
    }
    if (!wasIdle) {
      // Just stopped: start a fresh rest.
      wasIdle = true;
      idleFor = 0;
      restFor = pickRest();
    }

    if (!updateJump(pet, dt)) {
      // Breathing bob; ease squash so landing squishes are visible.
      pet.bob = Math.sin(t * 3) * 3;
      pet.squash = approach(pet.squash, 1 + Math.sin(t * 3) * 0.03, dt, 8);

      // Look around now and then.
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = rand(1.2, 4);
        if (Math.random() < 0.5) pet.facing *= -1;
      }

      // Happy hop, occasionally a double hop.
      if (chance(0.06, dt)) {
        const double = Math.random() < 0.3;
        startJump({ then: double ? () => startJump({ height: rand(10, 18), air: 0.3 }) : undefined });
      }
    }

    idleFor += dt;
    // Wait for any hop to land before setting off.
    if (idleFor >= restFor && !isJumping()) {
      planWalk(ctx);
      pet.mode = 'walk';
    }
  },
};
