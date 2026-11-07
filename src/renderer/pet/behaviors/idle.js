// Idle: breathing bob, blinking, looking around, the odd happy jump.
// Rests for a short, medium or long while, then picks a kind of walk and sets off.
//
// Split between ticks and frames:
//   onTick (10/s)  → decisions: schedule the next walk, look around, roll for a hop
//   update (every frame) → smooth visuals: breathing bob, squash easing, jump arc, blinking
import {
  rand, chance, approach, clampToScreen, startJump, updateJump, cancelJump, isJumping,
} from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';

// Kinds of walk, picked at random. Speeds are px/s; walk.js eases in and out of them.
const WALK_KINDS = [
  { name: 'shuffle', weight: 3, dist: [25, 90], speed: [35, 55] },
  { name: 'wander', weight: 5, dist: [90, 320], speed: [60, 95] },
  { name: 'trip', weight: 2, dist: null, speed: [110, 160] }, // dist null = anywhere on screen
];

const LOOK_AROUND_PER_SEC = 0.2; // chance per second of turning to face the other way
const HOP_PER_SEC = 0.06; // chance per second of a happy hop
const DOUBLE_HOP_CHANCE = 0.3;

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
let blinkIn = rand(2, 5);
let wasIdle = false;
let walkTimer = null; // scheduler id for "start walking"

function scheduleWalk(ctx, seconds) {
  ctx.cancel(walkTimer);
  walkTimer = ctx.after(seconds, () => {
    walkTimer = null;
    // Picked up or otherwise busy: a new walk gets scheduled when it's idle again.
    if (ctx.pet.mode !== 'idle') return;
    if (isJumping()) {
      scheduleWalk(ctx, 0.2); // let the hop land first
      return;
    }
    planWalk(ctx);
    ctx.pet.mode = 'walk';
    ctx.log('walk', { kind: ctx.pet.walkKind, toX: Math.round(ctx.pet.targetX), toY: Math.round(ctx.pet.targetY) });
  }, 'idle: start walking');
}

export default {
  name: 'idle',

  onTick(ctx) {
    const { pet } = ctx;
    if (pet.mode === 'drag') cancelJump();
    if (pet.mode !== 'idle') {
      wasIdle = false;
      return;
    }
    if (!wasIdle) {
      // Just stopped: rest for a bit, then walk.
      wasIdle = true;
      scheduleWalk(ctx, pickRest());
    }
    if (isJumping()) return;

    if (chance(LOOK_AROUND_PER_SEC, TICK_SECONDS)) pet.facing *= -1;

    if (chance(HOP_PER_SEC, TICK_SECONDS)) {
      const double = Math.random() < DOUBLE_HOP_CHANCE;
      startJump({ then: double ? () => startJump({ height: rand(10, 18), air: 0.3 }) : undefined });
      ctx.log('jump', { while: 'idle', double });
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;

    // Blink regardless of mode (sometimes a quick double blink). Per frame: it's visual.
    blinkIn -= dt;
    if (blinkIn <= 0) {
      pet.blink = !pet.blink;
      blinkIn = pet.blink ? 0.12 : Math.random() < 0.2 ? 0.15 : rand(2, 5);
    }

    if (pet.mode !== 'idle') return;
    if (updateJump(pet, dt)) return;

    // Breathing bob; ease squash so landing squishes are visible.
    pet.bob = Math.sin(t * 3) * 3;
    pet.squash = approach(pet.squash, 1 + Math.sin(t * 3) * 0.03, dt, 8);
  },
};
