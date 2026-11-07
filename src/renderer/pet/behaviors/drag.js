// Click / drag / throw / right-click on the pet.
//
// HOLDING ('drag' mode): the star hangs from the cursor like a real object pinned at the
// point you grabbed. Gravity swings that point to sit right under the cursor (grab an edge
// and it swings round; grab the middle and it just follows). Jerking the cursor pushes it
// around the pin, and fast swipes spin it all the way round.
//
// THROWING ('toss' mode): on release it keeps the speed and spin it had, glides and slows
// down, bounces off screen edges, then wobbles back upright and goes idle.
//
// Spin hard enough and it gets dizzy for a few seconds after landing.
//
// Physics runs every frame (smooth); reactions ("wheee!", dizzy) are decided on ticks.
// A click without moving emits a 'pet:clicked' DOM event that other behaviors can react to.
import { approach, clamp, TOP_MARGIN } from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';

const CLICK_SLOP = 4; // px of movement before a press counts as a drag

// Holding (pendulum)
const GRAVITY = 1400; // px/s² — light, so it swings instead of hanging like a dead weight
const SWING_DAMPING = 2.2; // per second: how quickly swinging dies down while held
const GYRATION = 0.45; // how spread out its "mass" is, as a fraction of its size
const MAX_SPIN = 30; // rad/s
const MAX_PIVOT_ACCEL = 25000; // px/s², caps wild mouse spikes
const SUBSTEPS = 4; // physics steps per frame, keeps fast spins stable

// Throwing
const MAX_TOSS_SPEED = 2500; // px/s
const GLIDE_FRICTION = 2.4; // per second (a max-speed throw glides ~1000px)
const SPIN_FRICTION = 1.4; // per second
const BOUNCE = 0.6; // fraction of speed kept when hitting a screen edge
const UPRIGHT_STIFFNESS = 60; // spring pulling it back upright...
const UPRIGHT_DAMPING = 9; // ...and how quickly the wobble settles

// Reactions
const WHEE_SPIN = 12; // rad/s (about 2 turns per second)
const WHEE_COOLDOWN = 5; // seconds
const DIZZY_TURNS = 3; // full turns in one grab/throw
const DIZZY_SECONDS = 4;

const WHEE_LINES = ['wheee!', 'weee~', 'spinnn', 'whoaaa'];
const DIZZY_LINES = ['@_@ so dizzy...', 'the room is spinning', 'whoa... wobbly'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TAU = Math.PI * 2;
const rotate = (v, a) => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});

// Interaction state
let pressing = false;
let moved = false;
let start = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 }; // latest cursor position while pressing

// Physics state
let grabLocal = { x: 0, y: 0 }; // grab point relative to the star's center, in unrotated star space
let pivot = null; // cursor position last frame
let pivotVel = { x: 0, y: 0 };
let omega = 0; // spin speed, rad/s (positive = clockwise)
let vel = { x: 0, y: 0 }; // center velocity, px/s
let lastCenter = null;
let turns = 0; // total radians spun since this grab started
let uprighting = false;

// Reaction state
let wheeCooldown = 0;
let landedPending = false;
let dizzyUntil = 0;
let t = 0;

const center = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
function setCenter(pet, c) {
  pet.x = c.x - pet.size / 2;
  pet.y = c.y - pet.size / 2;
}

// ---- Holding ----
function holdStep(ctx, dt) {
  const { pet } = ctx;
  if (!pivot) pivot = { ...mouse };

  // Cursor velocity (smoothed) and acceleration. Acceleration is what pushes the star around.
  const rawV = { x: (mouse.x - pivot.x) / dt, y: (mouse.y - pivot.y) / dt };
  pivot = { ...mouse };
  const prevV = pivotVel;
  pivotVel = { x: approach(pivotVel.x, rawV.x, dt, 20), y: approach(pivotVel.y, rawV.y, dt, 20) };
  let ax = (pivotVel.x - prevV.x) / dt;
  let ay = (pivotVel.y - prevV.y) / dt;
  const aMag = Math.hypot(ax, ay);
  if (aMag > MAX_PIVOT_ACCEL) {
    ax *= MAX_PIVOT_ACCEL / aMag;
    ay *= MAX_PIVOT_ACCEL / aMag;
  }

  // Rigid body swinging on a moving pin. In the cursor's frame the star feels gravity minus
  // the cursor's acceleration; torque = (pin → center) × that force.
  const k2 = (GYRATION * pet.size) ** 2;
  const inertia = k2 + grabLocal.x ** 2 + grabLocal.y ** 2;
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    const d = rotate(grabLocal, pet.rotation);
    const toCenter = { x: -d.x, y: -d.y };
    const torque = toCenter.x * (GRAVITY - ay) + toCenter.y * ax;
    omega += (torque / inertia) * h;
    omega *= Math.exp(-SWING_DAMPING * h);
    omega = clamp(omega, -MAX_SPIN, MAX_SPIN);
    pet.rotation += omega * h;
    turns += Math.abs(omega * h);
  }

  // The grab point stays glued to the cursor; the center hangs off it.
  const d = rotate(grabLocal, pet.rotation);
  const c = { x: mouse.x - d.x, y: mouse.y - d.y };
  if (lastCenter) {
    vel = {
      x: approach(vel.x, (c.x - lastCenter.x) / dt, dt, 20),
      y: approach(vel.y, (c.y - lastCenter.y) / dt, dt, 20),
    };
  }
  lastCenter = c;
  setCenter(pet, c);
  pet.bob = 0;
  pet.squash = approach(pet.squash, 1.06, dt, 10);
}

// ---- Throwing ----
function tossStep(ctx, dt) {
  const { pet } = ctx;
  const decay = Math.exp(-GLIDE_FRICTION * dt);
  vel.x *= decay;
  vel.y *= decay;

  // Glide and bounce off the screen edges.
  pet.x += vel.x * dt;
  pet.y += vel.y * dt;
  const maxX = ctx.stageWidth() - pet.size;
  const maxY = ctx.groundY();
  if (pet.x < 0 || pet.x > maxX) {
    pet.x = clamp(pet.x, 0, maxX);
    vel.x = -vel.x * BOUNCE;
    omega *= 0.8;
    pet.squash = 0.85;
  }
  if (pet.y < TOP_MARGIN || pet.y > maxY) {
    pet.y = clamp(pet.y, TOP_MARGIN, maxY);
    vel.y = -vel.y * BOUNCE;
    omega *= 0.8;
    pet.squash = 0.85;
  }
  pet.squash = approach(pet.squash, 1, dt, 8);
  pet.bob = 0;

  const speed = Math.hypot(vel.x, vel.y);
  if (!uprighting) {
    omega *= Math.exp(-SPIN_FRICTION * dt);
    pet.rotation += omega * dt;
    turns += Math.abs(omega * dt);
    if (Math.abs(omega) < 2.5 && speed < 60) {
      // Slow enough: wobble back to the nearest upright position.
      uprighting = true;
      pet.rotation -= TAU * Math.round(pet.rotation / TAU);
    }
  } else {
    omega += (-UPRIGHT_STIFFNESS * pet.rotation - UPRIGHT_DAMPING * omega) * dt;
    pet.rotation += omega * dt;
    if (Math.abs(pet.rotation) < 0.02 && Math.abs(omega) < 0.3 && speed < 15) {
      pet.rotation = 0;
      omega = 0;
      vel = { x: 0, y: 0 };
      pet.squash = 0.85;
      pet.mode = 'idle';
      landedPending = true; // onTick decides whether it's dizzy
      ctx.log('land', { x: Math.round(pet.x), y: Math.round(pet.y), turns: Math.round((turns / TAU) * 10) / 10 });
    }
  }
}

export default {
  name: 'drag',

  init(ctx) {
    const { pet, petEl } = ctx;

    petEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      pressing = true;
      moved = false;
      start = { x: e.clientX, y: e.clientY };
      mouse = { x: e.clientX, y: e.clientY };
      // Where on the star you grabbed, undoing its current rotation.
      const c = center(pet);
      grabLocal = rotate({ x: e.clientX - c.x, y: e.clientY - c.y }, -pet.rotation);
      // Keep click-through off until mouseup even if the cursor leaves the sprite.
      ctx.setPinned(true);
    });

    window.addEventListener('mousemove', (e) => {
      if (!pressing) return;
      mouse = { x: e.clientX, y: e.clientY };
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) {
        moved = true;
        // Caught mid-throw: keep its spin. Otherwise start a fresh grab.
        if (pet.mode !== 'toss') {
          // A tiny random nudge, like a real hand: grabbed by the bottom it tips over and
          // swings round instead of balancing perfectly upside down.
          omega = (Math.random() - 0.5) * 0.6;
          turns = 0;
        }
        pivot = null;
        pivotVel = { x: 0, y: 0 };
        lastCenter = null;
        uprighting = false;
        pet.mode = 'drag';
        petEl.classList.add('dragging');
        ctx.log('grab', { atX: Math.round(grabLocal.x), atY: Math.round(grabLocal.y) });
      }
    });

    window.addEventListener('mouseup', () => {
      if (!pressing) return;
      pressing = false;
      ctx.setPinned(false);
      petEl.classList.remove('dragging');
      if (moved) {
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > MAX_TOSS_SPEED) {
          vel.x *= MAX_TOSS_SPEED / speed;
          vel.y *= MAX_TOSS_SPEED / speed;
        }
        uprighting = false;
        pet.mode = 'toss';
        ctx.log('toss', { speed: Math.round(Math.min(speed, MAX_TOSS_SPEED)), spin: Math.round(omega * 10) / 10 });
      } else {
        ctx.log('click', {});
        petEl.dispatchEvent(new CustomEvent('pet:clicked'));
      }
    });

    petEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctx.api.showContextMenu();
    });
  },

  onTick(ctx) {
    const { pet } = ctx;
    wheeCooldown = Math.max(0, wheeCooldown - TICK_SECONDS);

    const flying = pet.mode === 'drag' || pet.mode === 'toss';
    if (flying && Math.abs(omega) > WHEE_SPIN && wheeCooldown === 0) {
      wheeCooldown = WHEE_COOLDOWN;
      ctx.say(pick(WHEE_LINES), 1200);
      ctx.log('spin', { speed: Math.round(Math.abs(omega)) });
    }

    if (landedPending) {
      landedPending = false;
      if (turns >= DIZZY_TURNS * TAU) {
        dizzyUntil = ctx.clock.seconds + DIZZY_SECONDS;
        ctx.say(pick(DIZZY_LINES), 2500);
        ctx.log('dizzy', { turns: Math.round(turns / TAU) });
      }
      turns = 0;
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    if (pet.mode === 'drag') {
      holdStep(ctx, dt);
    } else if (pet.mode === 'toss') {
      tossStep(ctx, dt);
    } else {
      // Not held or flying: stay upright, apart from a dizzy wobble after a big spin.
      const dizzyLeft = dizzyUntil - ctx.clock.seconds;
      pet.rotation = dizzyLeft > 0
        ? Math.sin(t * 8) * 0.35 * Math.min(1, dizzyLeft / DIZZY_SECONDS)
        : 0;
    }
  },
};
