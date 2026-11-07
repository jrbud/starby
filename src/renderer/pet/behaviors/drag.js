// Click / drag / throw / right-click on the pet.
//
// HOLDING ('drag' mode): the star hangs from the cursor like a real object pinned at the
// point you grabbed. Gravity swings that point to sit right under the cursor (grab an edge
// and it swings round; grab the middle and it just follows). Jerking the cursor pushes it
// around the pin, and fast swipes spin it all the way round.
//
// THROWING ('toss' mode): on release it keeps the speed and spin it had, glides and slows
// down, bounces off screen edges, then wobbles back upright and goes idle.
// The "Fling power" slider (Settings window, see ../../shared/flingTuning.js) scales how fast
// throws fly, how far they glide and how bouncy the screen edges are.
//
// IMPACT FRAMES: a hard hit on a screen edge freezes the star flattened against it for up to
// a second (harder hit = longer), then it launches off the wall.
//
// Spin hard enough and it gets dizzy for a few seconds after landing.
//
// SWAT (added by Person 3 for emotions, P3-6): a mad star can't be picked up (mood rule
// `grabbable: false`, see ./moods.js). Pressing and dragging him cancels the grab, and he knocks
// your hand away instead: recoils off the cursor with a little spin and glides to a stop using
// the normal throw physics. Logged as 'swat'; mood.js treats it as another poke. The real cursor
// is never moved (that would be a system write, out of scope). A plain click is still a poke.
//
// Physics runs every frame (smooth); reactions ("wheee!", dizzy) are decided on ticks.
// A click without moving emits a 'pet:clicked' DOM event that other behaviors can react to.
import { approach, clamp, petBounds } from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';
import { flingTuning, DEFAULT_FLING_POWER } from '../../shared/flingTuning.js';
import { rulesFor } from './moods.js';

const CLICK_SLOP = 4; // px of movement before a press counts as a drag

// Holding (pendulum)
const GRAVITY = 1400; // px/s² — light, so it swings instead of hanging like a dead weight
const SWING_DAMPING = 2.2; // per second: how quickly swinging dies down while held
const GYRATION = 0.45; // how spread out its "mass" is, as a fraction of its size
const MAX_SPIN = 30; // rad/s
const MAX_PIVOT_ACCEL = 25000; // px/s², caps wild mouse spikes
const SUBSTEPS = 4; // physics steps per frame, keeps fast spins stable

// Throwing (speed, glide friction and wall bounce come from the Fling power slider)
const SPIN_FRICTION = 1.4; // per second
const STOP_DRAG = 90; // px/s² constant slow-down on top of friction, so slippery throws don't drift for ages

// Impact frames
const IMPACT_MIN_SPEED = 700; // px/s into the wall; softer hits just bounce, no freeze
const IMPACT_FULL_SPEED = 2500; // px/s into the wall for the full freeze
const IMPACT_FREEZE_MAX = 0.125; // seconds — a quick hit-stop, not a long pause
const IMPACT_SQUASH = 0.62; // how flat it gets against the wall (lower = flatter)
const UPRIGHT_STIFFNESS = 60; // spring pulling it back upright...
const UPRIGHT_DAMPING = 9; // ...and how quickly the wobble settles

// Reactions
const WHEE_SPIN = 12; // rad/s (about 2 turns per second)
const WHEE_COOLDOWN = 5; // seconds
const DIZZY_TURNS = 3; // full turns in one grab/throw
const DIZZY_SECONDS = 4;

const OOF_SPEED = 1800; // px/s into the wall to say something
const OOF_COOLDOWN = 4; // seconds

// Swat (mad)
const SWAT_SPEED = 420; // px/s recoil away from the cursor (~200px slide at the default Fling power)
const SWAT_SPIN = 7; // rad/s lean-away spin (below WHEE_SPIN, so no "wheee!")
const SWAT_SQUASH = 0.7; // recoil squish

const WHEE_LINES = ['wheee!', 'weee~', 'spinnn', 'whoaaa'];
const SWAT_LINES = ['hands off!', 'hey! no touching!', '*swat*', 'nope!', "don't even try"];
const OOF_LINES = ['oof!', 'bonk!', 'ow!', 'splat!'];
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

let tuning = flingTuning(DEFAULT_FLING_POWER); // updated live from the settings slider
let freezeLeft = 0; // seconds left in an impact freeze
let freezeSquash = 1; // squash held during the freeze (side wall = tall, top/bottom = flat)

// Reaction state
let wheeCooldown = 0;
let oofCooldown = 0;
let impactPending = null; // { side, speed } for onTick to react to
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
// Hit a screen edge: bounce (keeping tuning.bounce of the speed) and, if it was a hard hit,
// freeze for an impact frame. `side` = which edge; `into` = speed straight into the wall.
function hitWall(ctx, side, into) {
  const { pet } = ctx;
  omega *= 0.8;
  const strength = clamp((into - IMPACT_MIN_SPEED) / (IMPACT_FULL_SPEED - IMPACT_MIN_SPEED), 0, 1);
  if (strength <= 0) {
    pet.squash = 0.85; // soft bump
    return;
  }
  // Flatten against the wall: tall and thin on the sides, short and wide on top/bottom.
  // (pet.js squash is vertical, with width compensating, so >1 reads as squeezed sideways.)
  const flat = 1 - (1 - IMPACT_SQUASH) * strength;
  freezeSquash = side === 'left' || side === 'right' ? 1 / flat : flat;
  pet.squash = freezeSquash;
  freezeLeft = Math.max(freezeLeft, IMPACT_FREEZE_MAX * strength);
  impactPending = { side, speed: Math.round(into) };
  ctx.log('impact', { side, speed: Math.round(into), freeze: Math.round(freezeLeft * 100) / 100 });
}

function tossStep(ctx, dt) {
  const { pet } = ctx;

  // Impact frame: hold still, flattened against the wall, then launch off it.
  // (The bounce velocity was already set on impact, so it flies off when the freeze ends.)
  if (freezeLeft > 0) {
    freezeLeft -= dt;
    pet.squash = freezeSquash;
    pet.bob = 0;
    return;
  }

  const decay = Math.exp(-tuning.friction * dt);
  vel.x *= decay;
  vel.y *= decay;
  const v = Math.hypot(vel.x, vel.y);
  if (v > 0) {
    const slower = Math.max(0, v - STOP_DRAG * dt) / v;
    vel.x *= slower;
    vel.y *= slower;
  }

  // Glide and bounce off the screen edges.
  pet.x += vel.x * dt;
  pet.y += vel.y * dt;
  // Walls = edges of the usable screen (a taskbar on any side counts as a wall).
  const { minX, maxX, minY, maxY } = petBounds(ctx);
  if (pet.x < minX || pet.x > maxX) {
    const side = pet.x < minX ? 'left' : 'right';
    pet.x = clamp(pet.x, minX, maxX);
    const into = Math.abs(vel.x);
    vel.x = -vel.x * tuning.bounce;
    hitWall(ctx, side, into);
  }
  if (pet.y < minY || pet.y > maxY) {
    const side = pet.y < minY ? 'top' : 'bottom';
    pet.y = clamp(pet.y, minY, maxY);
    const into = Math.abs(vel.y);
    vel.y = -vel.y * tuning.bounce;
    hitWall(ctx, side, into);
  }
  if (freezeLeft > 0) return; // just hit hard: start the impact frame next frame
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

// ---- Swat (mad: can't be picked up) ----
function swat(ctx, e) {
  const { pet } = ctx;
  // Cancel the press: no grab, and the coming mouseup won't count as a click.
  pressing = false;
  moved = false;
  ctx.setPinned(false);

  // Recoil straight away from the cursor (pick a side if it's dead center).
  const c = center(pet);
  let ax = c.x - e.clientX;
  let ay = c.y - e.clientY;
  const len = Math.hypot(ax, ay);
  if (len < 1) {
    ax = Math.random() < 0.5 ? -1 : 1;
    ay = 0;
  } else {
    ax /= len;
    ay /= len;
  }
  vel = { x: ax * SWAT_SPEED, y: ay * SWAT_SPEED };
  omega = (ax >= 0 ? 1 : -1) * SWAT_SPIN;
  turns = 0;
  uprighting = false;
  freezeLeft = 0;
  pet.squash = SWAT_SQUASH;
  pet.facing = ax >= 0 ? -1 : 1; // glare back at the hand he just swatted
  pet.mode = 'toss'; // tossStep glides, bounces off edges, wobbles upright, then 'idle'

  ctx.say(pick(SWAT_LINES), 1200);
  ctx.log('swat', { speed: SWAT_SPEED });
}

export default {
  name: 'drag',

  init(ctx) {
    const { pet, petEl } = ctx;

    // Fling power slider (Settings window). Applies live while you drag the slider.
    const applySettings = (settings) => { tuning = flingTuning(settings?.flingPower); };
    ctx.api.getSettings?.().then(applySettings);
    ctx.api.onSettingsChanged?.(applySettings);

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
        // Mad: no picking him up, he swats your hand away instead (see swat()).
        if (!rulesFor(pet).grabbable) {
          swat(ctx, e);
          return;
        }
        moved = true;
        // Caught mid-throw: keep its spin. Otherwise start a fresh grab.
        if (pet.mode !== 'toss') {
          // A tiny random nudge, like a real hand: grabbed by the bottom it tips over and
          // swings round instead of balancing perfectly upside down.
          omega = (Math.random() - 0.5) * 0.6;
          turns = 0;
        }
        freezeLeft = 0; // grabbed mid impact-frame: let go of the wall
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
        // Fling power: scale the throw, then cap it.
        vel.x *= tuning.speedMul;
        vel.y *= tuning.speedMul;
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > tuning.maxSpeed) {
          vel.x *= tuning.maxSpeed / speed;
          vel.y *= tuning.maxSpeed / speed;
        }
        uprighting = false;
        freezeLeft = 0;
        pet.mode = 'toss';
        ctx.log('toss', { speed: Math.round(Math.min(speed, tuning.maxSpeed)), spin: Math.round(omega * 10) / 10 });
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
    oofCooldown = Math.max(0, oofCooldown - TICK_SECONDS);

    if (impactPending) {
      if (impactPending.speed >= OOF_SPEED && oofCooldown === 0) {
        oofCooldown = OOF_COOLDOWN;
        ctx.say(pick(OOF_LINES), 1000);
      }
      impactPending = null;
    }

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
