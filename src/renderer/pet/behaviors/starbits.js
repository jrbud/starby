// Starbit drops: every so often the pet tosses a starbit out of itself.
// Collected by HOVERING (cursor proximity) — no click. A starbit isn't a `.hit` element,
// so it never blocks clicks; we detect proximity from forwarded mousemove events.
// The counter is persisted in the main process (window.sprite.collectStarbits).
//
// Each starbit has two phases, all driven per-frame in update() and applied as a CSS
// transform (left/top stay at the spawn point; the element is only moved and rotated):
//   1. Thrown: launched from the star's center at a random speed/direction (mostly up and
//      outward), spinning fast. Space-like drag (no gravity) slows it down smoothly.
//   2. Floating: once it's slowed to drifting speed it settles where it is and floats like
//      it's in zero gravity — slow wandering drift, gentle bob, slow spin that changes over
//      time — leashed loosely to the spot where it settled.
//
// MOODS (hooked up by Person 3, P3-6; rules in ./moods.js):
//   starbits  drop-rate multiplier: 2 = drops come twice as fast (playful), 0 = no drops at all
//             (mad, dizzy, yawning, asleep), including wall-hit drops
//   refuses   when a drop is skipped, say "no starbits for you!" once per mood spell (mad)
//
// WALL HITS: a throw that hits a screen edge hard (drag.js logs 'impact') throws 1–3 starbits
// out from the wall he hit. Balance guard: only hits of at least IMPACT_DROP_SPEED count, with
// a cooldown, so throwing him around can't farm starbits much faster than normal play.
// (Agree the numbers with Person 4 — shop prices assume ~5 starbits per minute.)
//
// SCREEN EDGES: uses ctx.area() (the usable screen minus the taskbar, wherever the taskbar is).
//
// GAME REWARDS (called by events, e.g. ../events/tag.js):
//   burstStarbits(ctx, 7)   he throws starbits out in a full ring, a bit farther than a normal drop,
//                           ignoring tuning.maxOnScreen; for REWARD_PICKUP_DELAY the magnet and pickup
//                           leave them alone, so you see them fly out before sweeping them up
//   rainStarbit(ctx, x, speed)  one starbit falls from the top of the screen (star shower happening):
//                           catch it with the cursor before it reaches the bottom, or it fades away
//   shootStarbit(ctx, side, y, speed, drift)  one starbit shoots across the screen with a trail
//                           (shooting star happening): catch it before it reaches the other side
//   reclaimStarbits(ctx)    every starbit on screen spins and flies back into him and disappears
//                           (not added to the count); reclaimStarbits(ctx, list) = only those
//   placeStarbit(ctx, x, y) he throws one starbit to (x, y) and it STAYS there, held: no drift, no
//                           magnet, no pickup, no fading (constellation quiz, ../events/constellation.js)
//   releaseStarbits(ctx, list)  held starbits become normal floating ones you can collect
import { rulesFor } from './moods.js';
import { chat, lineBag } from './chatter.js';

// ======================= TUNING — the main knobs =======================
// Spawn rate, burst size, value, lifetime and magnet strength/reach are NOT constants here:
// their defaults, ranges and labels live in ../../shared/starbitsTuning.js, and they can be
// changed live from the right-click menu → "Admin Settings…". Read them as `tuning.<key>`:
//   tuning.dropEveryMin / dropEveryMax   seconds between drops (moods scale this)
//   tuning.burstMin / burstMax           starbits per drop
//   tuning.maxOnScreen                   most starbits floating at once (rewards can exceed it)
//   tuning.value                         counter increase per starbit collected
//   tuning.lifetime                      seconds before an uncollected starbit fades (P2-3)
//   tuning.magnetStrength                cursor pull multiplier (0 = magnet off)
//   tuning.magnetRadius                  px the cursor must be within to pull
import { DEFAULT_TUNING, resolveTuning } from '../../shared/starbitsTuning.js';
let tuning = { ...DEFAULT_TUNING }; // replaced with saved Admin Settings at startup
// =======================================================================

const rand = (a, b) => a + Math.random() * (b - a);
// Touch distance for pickup: 22px at the default size, growing with bigger starbits.
const pickupRadius = () => Math.max(22, size / 2 + 12);
// Old starbits fade (P2-3): after tuning.lifetime seconds uncollected, a starbit fades out over
// FADE_OUT seconds (still floating, but no longer collectable or magnetic), then is removed.
const FADE_OUT = 1.5;
// On-screen size in px, from Settings → Starbits → Size (followed live; see applySize).
let size = STARBIT_SIZE.default;

// ART: team-drawn PNGs in assets/starbits/ (list of colors in ../../shared/starbitArt.js).
// Each new starbit picks a random image from the colors switched on in Settings → Starbits →
// Color (yellow only by default). Starbits already on screen keep their color when it's toggled.
import { starbitImages, enabledColors, STARBIT_SIZE, clampStarbitSize } from '../../shared/starbitArt.js';
let starbitImagePool = starbitImages(enabledColors()); // updated from Settings at startup
// Size and center an element on (x, y). Movement is a transform relative to the spawn
// point, so re-running this on a resize keeps it in the same place on screen.
function sizeElement(el, x, y) {
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `${x - size / 2}px`;
  el.style.top = `${y - size / 2}px`;
}

const randomStarbitImage = () => starbitImagePool[Math.floor(Math.random() * starbitImagePool.length)];
const EDGE_MARGIN = 12; // keep this far inside the screen

// Throw: how far past the star's edge it lands, and how fast space-drag bleeds speed off.
// The launch speed is worked out from the distance (see throwVelocity), so the landing
// spot is predictable: THROW_DIST_MIN–MAX px out from the star's edge.
const THROW_DIST_MIN = 18; // px past the star's edge (leaves ~7px for the float wobble,
const THROW_DIST_MAX = 42; //   so it always stays 10–50 px away)
const THROW_UP_CHANCE = 0.8; // otherwise any direction
const THROW_DRAG = 2.2; // 1/s, exponential slow-down
const THROW_SPIN = 360; // deg/s, max spin right out of the throw (eases down after)

// Bursts (size set by tuning.burstMin/burstMax): a burst fans out across the throw arc
// (each starbit gets its own slice of it, so they don't stack) and comes out
// BURST_STAGGER seconds apart, so it reads as a little flurry. tuning.maxOnScreen still caps it.
const BURST_STAGGER = 0.07; // s between starbits in one burst

// Wall-hit drops (see WALL HITS above). They're thrown out from the star, fanned across
// IMPACT_ARC degrees centered on "away from the wall".
const IMPACT_DROP_SPEED = 900; // px/s into the wall
const IMPACT_DROP_COOLDOWN = 2; // seconds between wall-hit drop bursts
const IMPACT_DROPS = [1, 3]; // how many per hit (inclusive)
const IMPACT_ARC = 120; // degrees

// Game rewards (see GAME REWARDS above).
const REWARD_DIST = [60, 130]; // px past the star's edge a reward starbit lands
const REWARD_PICKUP_DELAY = 0.35; // s before the magnet/pickup notice a fresh reward starbit
const RECLAIM_SPEED = 700; // px/s minimum while flying back into him
// Falling starbits (rainStarbit, used by the star shower happening in ../events/starShower.js)
const FALL_SWAY = [10, 28]; // px side-to-side sway
const FALL_SWAY_FREQ = [1.2, 2.4]; // rad/s
const FALL_SPIN = 160; // deg/s max
const FALL_CATCH_BONUS = 8; // px added to the pickup reach for a falling starbit (no magnet while falling)
const FALL_MISS_FADE = 0.35; // s fade when one reaches the bottom uncaught
// Shooting starbits (shootStarbit, used by the shooting star happening in ../events/shootingStar.js)
const SHOOT_SWAY = [3, 9]; // px wobble across its path
const SHOOT_SWAY_FREQ = [3, 6]; // rad/s
const SHOOT_SPIN = 520; // deg/s max
const SHOOT_CATCH_BONUS = 14; // px added to the pickup reach (they're fast)
const SHOOT_TRAIL_EVERY = 2; // leave a trail copy every N frames
const RECLAIM_SPIN = 720; // deg/s while flying back

const REFUSE_LINES = lineBag(['no starbits for you!', 'hmph. no sparkles.', 'not dropping anything for a poker']);

// Floating drift: velocity wanders a little each frame, capped so it stays slow and dreamy.
const DRIFT_MAX = 9; // px/s
const DRIFT_WANDER = 6; // px/s² of random nudging
// Leash: free to drift within LEASH px of where it settled; past that, a pull back so
// starbits hover right around where they landed (keeps them 10–50 px from the star).
const LEASH = 3; // px
const LEASH_PULL = 3; // 1/s² per px beyond the leash
const LEASH_HARD = 5; // px, never further than this from the landing spot (+ BOB_AMP bob)
// Bob: two layered sine waves per axis so it never looks like a clean loop.
const BOB_AMP = 3; // px
// Spin: deg/s, eases toward a new random target every few seconds (can reverse).
const SPIN_MAX = 40;

// Magnet (tuning.magnetStrength / magnetRadius): when the cursor comes within reach, the
// starbit is pulled toward it — gently at the edge of the radius, quickly up close. It steers
// toward the cursor (rather than accelerating straight at it) so it homes in instead of
// orbiting. If the cursor leaves before pickup, the starbit coasts to a stop and floats
// wherever it ends up. These are the values at magnet strength 1.
const MAGNET_SPEED_MIN = 40; // px/s at the edge of the radius
const MAGNET_SPEED_MAX = 420; // px/s right next to the cursor
const MAGNET_STEER = 7; // 1/s, how quickly velocity turns toward the cursor

// { el, spawnX, spawnY, px, py, vx, vy, thrown, anchorX, anchorY, angle, spin, spinTarget,
//   retargetIn, bob, x, y }  — px/py = position without bob; x/y = live position (for pickup)
const drops = [];
const nextDropDelay = () => rand(tuning.dropEveryMin, tuning.dropEveryMax);
let nextDropIn = nextDropDelay();
let lastImpactDropAt = -Infinity; // session seconds
let refusedThisSpell = false;

// Usable screen area { left, top, right, bottom }, taskbar excluded wherever it is.
const area = (ctx) =>
  ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size };
// Standing on the bottom edge of the usable area (e.g. on a bottom taskbar).
const onGround = (ctx) => ctx.pet.y + ctx.pet.size >= area(ctx).bottom - 2;

function throwVelocity(petRadius, deg, past = [THROW_DIST_MIN, THROW_DIST_MAX]) {
  // With exponential drag, a starbit launched at speed v travels (v - DRIFT_MAX) / DRAG before
  // it slows to drift speed and settles. Solve that for v to land at the chosen distance.
  const distance = petRadius + rand(...past); // from the star's center
  const speed = distance * THROW_DRAG + DRIFT_MAX;
  const a = (deg * Math.PI) / 180;
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}

// Throw directions for a burst of n: split the arc into n equal slices and pick a random
// angle inside each one, so they fan out but still look random. Shuffled so the stagger
// doesn't always sweep left-to-right.
function burstAngles(n, grounded) {
  // Screen y points down, so "up" is negative. Upper arc: -160° (up-left) to -20° (up-right).
  // On the ground a downward throw would hit the floor right under him, so always go up.
  const up = grounded || Math.random() < THROW_UP_CHANCE;
  const [from, to] = up ? [-160, -20] : [0, 360];
  const offset = up ? 0 : rand(0, 360); // full circle: random starting point
  return fanAngles(n, from + offset, to + offset);
}

// n angles fanned across [from, to]: one random angle inside each equal slice.
function fanAngles(n, from, to) {
  const slice = (to - from) / n;
  const angles = [];
  for (let i = 0; i < n; i++) angles.push(from + slice * (i + rand(0.15, 0.85)));
  for (let i = angles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [angles[i], angles[j]] = [angles[j], angles[i]];
  }
  return angles;
}

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Throw one starbit per angle, BURST_STAGGER apart. Returns how many it will try to throw.
// opts are passed to spawn() (rewards use them).
function throwAngles(ctx, angles, opts) {
  angles.forEach((deg, i) => {
    if (i === 0) spawn(ctx, deg, opts);
    else ctx.after(i * BURST_STAGGER, () => spawn(ctx, deg, opts), 'starbits burst');
  });
  return angles.length;
}

/** Reward: throw `count` starbits out of him in a full ring (ignores tuning.maxOnScreen). */
export function burstStarbits(ctx, count = 7) {
  if (!switches.spawning) return 0; // Settings → Starbits → Spawning is off
  const turn = rand(0, 360);
  const n = throwAngles(ctx, fanAngles(count, turn, turn + 360), {
    ignoreCap: true,
    past: REWARD_DIST,
    pickupDelay: REWARD_PICKUP_DELAY,
  });
  ctx.log('starbits-burst', { count: n });
  return n;
}

/**
 * Take back every starbit on screen (or only the ones in `only`): they fly into him and vanish
 * (not added to the count).
 */
export function reclaimStarbits(ctx, only = null) {
  let n = 0;
  for (const d of drops) {
    if (only && !only.includes(d)) continue;
    if (!d.reclaiming) {
      d.held = null; // a held one flies home too
      d.reclaiming = true;
      n++;
    }
  }
  ctx.log('starbits-reclaimed', { count: n });
  return n;
}

// ---- Held starbits (constellation quiz) ----
// Thrown from his center to an exact spot over HELD_FLY seconds (eased, with a little arc), then held
// there with a faint twinkle: no drift, no magnet, can't be picked up, never fades. They don't count
// against tuning.maxOnScreen. releaseStarbits() turns them into normal floating starbits;
// reclaimStarbits(ctx, list) sends them back into him.
const HELD_FLY = 0.55; // s from him to its spot
const HELD_ARC = 40; // px the flight bows sideways
const HELD_TWINKLE = 1.2; // px of wobble while held
const HELD_SPIN = 30; // deg/s max slow spin while held

/** Throw one starbit to (x, y) and hold it there. Returns its handle, or null (spawning is off). */
export function placeStarbit(ctx, x, y) {
  if (!switches.spawning) return null; // Settings → Starbits → Spawning is off
  const { pet } = ctx;
  const sx = pet.x + pet.size / 2;
  const sy = pet.y + pet.size / 2;
  const el = document.createElement('img');
  el.className = 'starbits';
  el.src = randomStarbitImage();
  el.alt = '';
  el.draggable = false;
  sizeElement(el, sx, sy);
  ctx.stage.appendChild(el);
  const d = {
    el, spawnX: sx, spawnY: sy, px: sx, py: sy, x: sx, y: sy, vx: 0, vy: 0,
    held: { fromX: sx, fromY: sy, toX: x, toY: y, t: 0, arc: rand(-HELD_ARC, HELD_ARC), phase: rand(0, 6.28) },
    thrown: false, attracted: false, age: 0, fading: false, reclaiming: false,
    pickableAt: Infinity, anchorX: x, anchorY: y,
    angle: rand(0, 360), spin: rand(-HELD_SPIN, HELD_SPIN), spinTarget: rand(-SPIN_MAX, SPIN_MAX), retargetIn: rand(2, 6),
    bob: {
      t: 0, amp: 0,
      fx1: rand(0.5, 0.9), fx2: rand(1.1, 1.7), px1: rand(0, 6.28), px2: rand(0, 6.28),
      fy1: rand(0.4, 0.8), fy2: rand(1.0, 1.6), py1: rand(0, 6.28), py2: rand(0, 6.28),
    },
  };
  drops.push(d);
  return d;
}

/** Held starbits (from placeStarbit) become normal floating starbits, ready to collect. */
export function releaseStarbits(ctx, list) {
  let n = 0;
  for (const d of list) {
    if (!d || !d.held || d.reclaiming || !drops.includes(d)) continue;
    d.held = null;
    d.px = d.anchorX = d.x;
    d.py = d.anchorY = d.y;
    d.vx = 0;
    d.vy = 0;
    d.age = 0; // full lifetime from now
    d.pickableAt = ctx.clock.seconds;
    n++;
  }
  ctx.log('starbits-released', { count: n });
  return n;
}

// One frame of a held starbit: fly in, then sit still with a faint twinkle.
function heldStep(ctx, d, dt) {
  const h = d.held;
  h.t += dt;
  const k = Math.min(1, h.t / HELD_FLY);
  const e = 1 - (1 - k) ** 3; // ease out
  const dx = h.toX - h.fromX;
  const dy = h.toY - h.fromY;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.sin(Math.PI * e) * h.arc;
  const tw = k < 1 ? 0 : HELD_TWINKLE;
  d.px = h.fromX + dx * e + (-dy / len) * bow;
  d.py = h.fromY + dy * e + (dx / len) * bow;
  d.x = d.px + tw * Math.sin(h.t * 2.1 + h.phase);
  d.y = d.py + tw * Math.sin(h.t * 1.7 + h.phase * 2);
  d.angle = (d.angle + (k < 1 ? 600 : d.spin) * dt) % 360;
  d.el.style.transform = `translate(${d.x - d.spawnX}px, ${d.y - d.spawnY}px) rotate(${d.angle}deg)`;
}

// ---- Flying starbits: rain (falls from the top) and shooting stars (fly across) ----
// They move in a straight line with a little sideways sway and spin, aren't pulled by the magnet,
// get a bigger catch zone, don't count against tuning.maxOnScreen, and fade away where they leave
// the usable screen uncaught. Stored with d.falling = { ...path } so update()/pickup treat them alike.
function launchFlying(ctx, x, y, vx, vy, { sway, freq, spin, catchBonus, trail = false }) {
  if (!switches.spawning) return; // Settings → Starbits → Spawning is off (no drops of any kind)
  const el = document.createElement('img');
  el.className = 'starbits';
  el.src = randomStarbitImage();
  el.alt = '';
  el.draggable = false;
  sizeElement(el, x, y); // Settings → Starbits → Size
  ctx.stage.appendChild(el);
  drops.push({
    el, spawnX: x, spawnY: y, px: x, py: y, x, y, vx, vy,
    falling: { bx: x, by: y, sway, freq, phase: rand(0, 6.28), t: 0, catchBonus, trail, frames: 0 },
    thrown: false, attracted: false, age: 0, fading: false, reclaiming: false,
    pickableAt: ctx.clock.seconds, anchorX: x, anchorY: y,
    angle: rand(0, 360), spin: rand(-spin, spin), spinTarget: 0, retargetIn: 99,
    bob: { t: 0, amp: 0, fx1: 1, fx2: 1, px1: 0, px2: 0, fy1: 1, fy2: 1, py1: 0, py2: 0 },
  });
}

/**
 * Rain: drop one starbit from the top of the usable screen at x, falling at `speed` px/s. It sways
 * and spins on the way down; catch it with the cursor or it fades away at the bottom.
 */
export function rainStarbit(ctx, x, speed = 240) {
  const a = area(ctx);
  launchFlying(ctx, x, a.top + EDGE_MARGIN, 0, speed, {
    sway: rand(...FALL_SWAY), freq: rand(...FALL_SWAY_FREQ), spin: FALL_SPIN, catchBonus: FALL_CATCH_BONUS,
  });
}

/**
 * Shooting star: one starbit shoots across the usable screen from `fromSide` ('left' | 'right')
 * at height y, `speed` px/s, drifting `drift` px/s up/down, leaving a trail. Catch it with the
 * cursor before it reaches the other side, or it's gone.
 */
export function shootStarbit(ctx, fromSide, y, speed = 900, drift = 0) {
  const a = area(ctx);
  const dir = fromSide === 'left' ? 1 : -1;
  const x = dir > 0 ? a.left + EDGE_MARGIN : a.right - EDGE_MARGIN;
  launchFlying(ctx, x, y, dir * speed, drift, {
    sway: rand(...SHOOT_SWAY), freq: rand(...SHOOT_SWAY_FREQ), spin: SHOOT_SPIN, catchBonus: SHOOT_CATCH_BONUS, trail: true,
  });
}

// One frame of flying (see launchFlying). Leaving the usable screen uncaught → fade out and remove.
function fallStep(ctx, d, dt) {
  if (d.fading) return; // missed: stays where it left the screen while it fades
  const f = d.falling;
  f.t += dt;
  f.bx += d.vx * dt;
  f.by += d.vy * dt;
  // Sway across the direction of travel.
  const speed = Math.hypot(d.vx, d.vy) || 1;
  const off = Math.sin(f.t * f.freq + f.phase) * f.sway;
  d.px = f.bx + (-d.vy / speed) * off;
  d.py = f.by + (d.vx / speed) * off;
  d.angle = (d.angle + d.spin * dt) % 360;
  d.x = d.px;
  d.y = d.py;
  d.el.style.transform = `translate(${d.x - d.spawnX}px, ${d.y - d.spawnY}px) rotate(${d.angle}deg)`;
  if (f.trail && !d.fading && ++f.frames % SHOOT_TRAIL_EVERY === 0) leaveGhost(ctx, d);
  const a = area(ctx);
  const out = d.py >= a.bottom - EDGE_MARGIN || d.py < a.top + EDGE_MARGIN - 1
    || d.px < a.left + EDGE_MARGIN - 1 || d.px > a.right - EDGE_MARGIN + 1;
  if (!d.fading && out && f.t > 0.05) {
    d.fading = true; // too late to catch
    d.vx = 0; // stop right there (don't slide over the taskbar / off screen while fading)
    d.vy = 0;
    d.px = Math.max(a.left + EDGE_MARGIN, Math.min(a.right - EDGE_MARGIN, d.px));
    d.py = Math.max(a.top + EDGE_MARGIN, Math.min(a.bottom - EDGE_MARGIN, d.py));
    d.x = d.px;
    d.y = d.py;
    d.el.style.transform = `translate(${d.x - d.spawnX}px, ${d.y - d.spawnY}px) rotate(${d.angle}deg)`; // drawn at the edge
    d.el.style.transition = `opacity ${FALL_MISS_FADE}s ease-in`;
    d.el.style.opacity = '0';
    ctx.after(FALL_MISS_FADE, () => {
      const i = drops.indexOf(d);
      if (i !== -1) drops.splice(i, 1);
      d.el.remove();
    }, 'flying starbit missed');
    ctx.log('starbit-missed', {});
  }
}

// One frame of flying back into him. Returns true once it has arrived (then it's removed).
function reclaimStep(ctx, d, dt) {
  const { pet } = ctx;
  const tx = pet.x + pet.size / 2;
  const ty = pet.y + pet.size / 2;
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(RECLAIM_SPEED, dist * 6) * dt;
  if (dist <= step + 4) return true;
  d.x += (dx / dist) * step;
  d.y += (dy / dist) * step;
  d.px = d.x;
  d.py = d.y;
  d.angle = (d.angle + RECLAIM_SPIN * dt) % 360;
  d.el.style.transform = `translate(${d.x - d.spawnX}px, ${d.y - d.spawnY}px) rotate(${d.angle}deg) scale(0.85)`;
  return false;
}

// The regular timed drop.
function throwBurst(ctx) {
  throwAngles(ctx, burstAngles(randInt(tuning.burstMin, tuning.burstMax), onGround(ctx)));
}

// A hard wall hit during a throw: a little burst of starbits flung out from the wall he hit.
function impactDrops(ctx, impact) {
  const now = ctx.clock.seconds;
  if (rulesFor(ctx.pet).starbits === 0) return; // mad / asleep etc. drop nothing
  if (impact.speed < IMPACT_DROP_SPEED || now - lastImpactDropAt < IMPACT_DROP_COOLDOWN) return;
  lastImpactDropAt = now;
  // Direction pointing away from the wall (screen y points down).
  const away = { left: 0, right: 180, top: 90, bottom: -90 }[impact.side] ?? -90;
  const n = randInt(IMPACT_DROPS[0], IMPACT_DROPS[1]);
  const count = throwAngles(ctx, fanAngles(n, away - IMPACT_ARC / 2, away + IMPACT_ARC / 2));
  ctx.log('impact-drops', { count, side: impact.side });
}

// opts (for rewards): ignoreCap, past = [min, max] px past the star's edge to land,
// pickupDelay = seconds before the magnet/pickup notice it.
function spawn(ctx, deg, { ignoreCap = false, past, pickupDelay = 0 } = {}) {
  if (!switches.spawning) return; // Settings → Starbits → Spawning is off (no drops of any kind)
  // Falling (star shower) and held (constellation) starbits don't count against the cap.
  if (!ignoreCap && drops.filter((d) => !d.falling && !d.held).length >= tuning.maxOnScreen) return;
  const { pet } = ctx;
  // Out of the star's center, wherever it is.
  const x = pet.x + pet.size / 2;
  const y = pet.y + pet.size / 2;
  const el = document.createElement('img');
  el.className = 'starbits';
  el.src = randomStarbitImage();
  el.alt = '';
  el.draggable = false;
  sizeElement(el, x, y);
  ctx.stage.appendChild(el);
  const { vx, vy } = throwVelocity(pet.size / 2, deg, past);
  drops.push({
    el,
    spawnX: x,
    spawnY: y,
    px: x,
    py: y,
    x,
    y,
    vx,
    vy,
    thrown: true,
    attracted: false, // being pulled toward the cursor
    age: 0, // seconds since thrown
    fading: false, // past tuning.lifetime: fading out, can't be collected
    reclaiming: false, // flying back into him (reclaimStarbits)
    pickableAt: ctx.clock.seconds + pickupDelay, // magnet/pickup ignore it until then
    anchorX: x, // set for real when it settles
    anchorY: y,
    angle: rand(0, 360),
    spin: rand(-THROW_SPIN, THROW_SPIN),
    spinTarget: rand(-SPIN_MAX, SPIN_MAX),
    retargetIn: rand(2, 6),
    // Random frequencies (rad/s) and phases so no two starbits bob in sync.
    bob: {
      t: 0,
      amp: 0, // fades in after it settles, so the throw arc stays clean
      fx1: rand(0.5, 0.9), fx2: rand(1.1, 1.7), px1: rand(0, 6.28), px2: rand(0, 6.28),
      fy1: rand(0.4, 0.8), fy2: rand(1.0, 1.6), py1: rand(0, 6.28), py2: rand(0, 6.28),
    },
  });
}

function move(ctx, d, dt) {
  const cdx = ctx.cursor.x - d.px;
  const cdy = ctx.cursor.y - d.py;
  const cdist = Math.hypot(cdx, cdy);
  const { magnetStrength, magnetRadius } = tuning;
  // Not while fading away, and not while a fresh reward starbit is still flying out.
  const pickable = !d.fading && ctx.clock.seconds >= (d.pickableAt ?? 0);
  if (pickable && magnetStrength > 0 && cdist < magnetRadius && cdist > 0.001) {
    // Pulled by the cursor: steer toward it, faster the closer it is.
    const closeness = 1 - cdist / magnetRadius; // 0 at the edge → 1 at the cursor
    const speed =
      (MAGNET_SPEED_MIN + (MAGNET_SPEED_MAX - MAGNET_SPEED_MIN) * closeness * closeness) * magnetStrength;
    const steer = Math.min(1, MAGNET_STEER * magnetStrength * dt);
    d.vx += ((cdx / cdist) * speed - d.vx) * steer;
    d.vy += ((cdy / cdist) * speed - d.vy) * steer;
    d.attracted = true;
  } else if (d.attracted) {
    // Cursor got away: coast to a stop like after a throw, then float at the new spot.
    d.attracted = false;
    d.thrown = true;
  }

  if (d.attracted) {
    // (velocity already set above; skip throw drag and floating drift)
  } else if (d.thrown) {
    // Space drag: no gravity, just a smooth exponential slow-down.
    const k = Math.exp(-THROW_DRAG * dt);
    d.vx *= k;
    d.vy *= k;
    if (Math.hypot(d.vx, d.vy) <= DRIFT_MAX) {
      // Slowed to drifting speed: settle here and start floating.
      d.thrown = false;
      d.anchorX = d.px;
      d.anchorY = d.py;
    }
  } else {
    // Wandering drift: random nudge, leash pull, then cap the speed.
    d.vx += rand(-DRIFT_WANDER, DRIFT_WANDER) * dt;
    d.vy += rand(-DRIFT_WANDER, DRIFT_WANDER) * dt;
    const ax = d.px - d.anchorX;
    const ay = d.py - d.anchorY;
    const dist = Math.hypot(ax, ay);
    if (dist > LEASH) {
      const pull = (dist - LEASH) * LEASH_PULL * dt;
      d.vx -= (ax / dist) * pull;
      d.vy -= (ay / dist) * pull;
    }
    const speed = Math.hypot(d.vx, d.vy);
    if (speed > DRIFT_MAX) {
      d.vx *= DRIFT_MAX / speed;
      d.vy *= DRIFT_MAX / speed;
    }
  }
  d.px += d.vx * dt;
  d.py += d.vy * dt;

  if (!d.thrown && !d.attracted) {
    // Hard leash: guarantees the 10–50 px range no matter how the drift wanders.
    const ax = d.px - d.anchorX;
    const ay = d.py - d.anchorY;
    const dist = Math.hypot(ax, ay);
    if (dist > LEASH_HARD) {
      d.px = d.anchorX + (ax / dist) * LEASH_HARD;
      d.py = d.anchorY + (ay / dist) * LEASH_HARD;
    }
  }

  // Walls: keep it in the usable screen area (off the taskbar, wherever it is). A throw
  // bounces off (losing some speed); a floating starbit just turns gently back.
  const a = area(ctx);
  const minX = a.left + EDGE_MARGIN;
  const maxX = a.right - EDGE_MARGIN;
  const minY = a.top + EDGE_MARGIN;
  const maxY = a.bottom - EDGE_MARGIN;
  const bounce = d.thrown || d.attracted ? 0.5 : 1;
  if (d.px < minX) { d.px = minX; d.vx = Math.abs(d.vx) * bounce; }
  if (d.px > maxX) { d.px = maxX; d.vx = -Math.abs(d.vx) * bounce; }
  if (d.py < minY) { d.py = minY; d.vy = Math.abs(d.vy) * bounce; }
  if (d.py > maxY) { d.py = maxY; d.vy = -Math.abs(d.vy) * bounce; }
}

// Past its lifetime: fade out where it is, then remove it.
function expire(ctx, d) {
  d.fading = true;
  d.attracted = false;
  d.el.style.transition = `opacity ${FADE_OUT}s ease-in`;
  d.el.style.opacity = '0';
  ctx.after(FADE_OUT, () => {
    const i = drops.indexOf(d);
    if (i !== -1) drops.splice(i, 1);
    d.el.remove();
  }, 'starbit expired');
  ctx.log('starbit-expired', {});
}

function animate(ctx, d, dt) {
  d.age += dt;
  if (!d.fading && d.age >= tuning.lifetime) expire(ctx, d);
  move(ctx, d, dt);

  // Bob on top of the position (fades in once floating).
  const b = d.bob;
  b.t += dt;
  if (d.thrown || d.attracted) b.amp = Math.max(0, b.amp - BOB_AMP * 4 * dt); // calm while moving
  else b.amp = Math.min(BOB_AMP, b.amp + BOB_AMP * dt); // ~1s fade-in once floating
  const bobX = b.amp * (0.6 * Math.sin(b.t * b.fx1 + b.px1) + 0.4 * Math.sin(b.t * b.fx2 + b.px2));
  const bobY = b.amp * (0.6 * Math.sin(b.t * b.fy1 + b.py1) + 0.4 * Math.sin(b.t * b.fy2 + b.py2));

  // Spin: the fast throw-spin eases down to a slow float-spin; new target every few seconds.
  d.retargetIn -= dt;
  if (d.retargetIn <= 0) {
    d.retargetIn = rand(2, 6);
    d.spinTarget = rand(-SPIN_MAX, SPIN_MAX);
  }
  d.spin += (d.spinTarget - d.spin) * Math.min(1, dt * 0.8);
  d.angle = (d.angle + d.spin * dt) % 360;

  d.x = d.px + bobX; // pickup uses the live position
  d.y = d.py + bobY;
  d.el.style.transform = `translate(${d.x - d.spawnX}px, ${d.y - d.spawnY}px) rotate(${d.angle}deg)`;
}

// ---- Collection ----
// What a starbit does when picked up (Settings → Starbits → Shooting animation):
//   on  — the count card slides in at the top right; the starbit zips into it with a trail,
//         and the count ticks up with a pulse as it lands.
//   off — it rises a little, shrinks and fades where it was; the card still slides in and
//         ticks up with a pulse.
// Either way the card slides back out COUNTER_SHOW_SEC after the last pickup lands.

// Settings → Starbits on/off switches (followed live; see applySettings in init).
const switches = { spawning: true, visible: true, shootAnimation: true };

const ZIP_TIME = 0.5; // s, flight time to the corner
// px, the most the zip path can bow out sideways. Each starbit picks a random bow anywhere
// from -ZIP_ARC to +ZIP_ARC, so every one takes its own curve (straight-ish to full bend).
const ZIP_ARC = 70;
const ZIP_SPIN = 900; // deg/s while zipping
const TOAST_MARGIN = 16; // px in from the top-right corner of the usable screen area
const TRAIL_FADE_MS = 260; // how long each trail ghost takes to fade out
const COUNTER_SHOW_SEC = 2; // how long the card stays up after the last arrival
// Pulse when the number goes up: a quick springy pop (overshoots, settles back).
const PULSE_MS = 420;
const PULSE_SCALE = 1.5;

const zipping = []; // { el, sx, sy, angle, t, arc, x, y }
let total = null; // latest starbits total from the main process (includes ones still zipping)
let toast = null; // { el, countEl } — the notification card
let toastHideId = null;

// The count on the card only counts starbits that have *arrived*, so it ticks up as each one
// lands rather than jumping when it's picked up.
// (Each zipping starbit remembers its own value, in case the value is changed mid-flight.)
const shownCount = () => Math.max(0, (total ?? 0) - zipping.reduce((sum, z) => sum + z.value, 0));

function ensureToast(ctx) {
  if (toast) return toast;
  // Shop-style card (pet.css: starCardBg.png art, Sour Gummy). CLICK IT → opens the shop (added by
  // Person 3). It's a .hit element, so click-through switches off over it (../clickThrough.js);
  // it's parked off-screen when hidden, so it only catches clicks while it's showing. Hovering it
  // keeps it up (it won't slide away under your cursor) and grows it a touch.
  const el = document.createElement('div');
  el.className = 'starbits-toast hit';
  Object.assign(el.style, { pointerEvents: 'auto', cursor: 'pointer', transition: 'scale 120ms ease-out' });
  el.title = 'open the shop';
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    ctx.log('starbits-counter-click', {});
    ctx.api.openShop?.();
  });
  el.addEventListener('mouseenter', () => {
    el.style.scale = '1.06';
    ctx.cancel(toastHideId); // stay up while you're reaching for it
    toastHideId = null;
  });
  el.addEventListener('mouseleave', () => {
    el.style.scale = '';
    if (el.classList.contains('visible')) scheduleToastOut(ctx);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  const icon = document.createElement('img');
  icon.className = 'starbits-toast-icon';
  icon.src = '../../../assets/starbits/cluster.png'; // same icon as the shop's wallet
  icon.alt = '';
  const countEl = document.createElement('span');
  countEl.className = 'starbits-toast-count';
  const label = document.createElement('span');
  label.className = 'starbits-toast-label';
  label.textContent = 'starbits';
  el.append(icon, countEl, label);
  ctx.stage.appendChild(el);
  toast = { el, countEl };
  return toast;
}

function placeToast(ctx) {
  const t = ensureToast(ctx);
  // Top-right of the usable area, so it's never under the taskbar (top or right side).
  // The stage covers the whole screen, taskbar included, so convert to right/top offsets.
  const a = area(ctx);
  t.el.style.right = `${Math.max(0, window.innerWidth - a.right) + TOAST_MARGIN}px`;
  t.el.style.top = `${Math.max(0, a.top) + TOAST_MARGIN}px`;
  t.el.style.bottom = '';
}

function slideToastIn(ctx) {
  const t = ensureToast(ctx);
  placeToast(ctx);
  if (!t.el.classList.contains('visible')) t.countEl.textContent = String(shownCount());
  t.el.classList.add('visible');
  ctx.cancel(toastHideId); // stays up while starbits are still on their way
  toastHideId = null;
  // It may slide in under a cursor that isn't moving: click-through is only re-checked on
  // mousemove (clickThrough.js), so nudge that check once it's in place, or a still click would
  // go through to the desktop instead of opening the shop.
  setTimeout(() => {
    const c = ctx.cursor;
    if (c && c.x > -1000) window.dispatchEvent(new MouseEvent('mousemove', { clientX: c.x, clientY: c.y }));
  }, 420);
}

function scheduleToastOut(ctx) {
  ctx.cancel(toastHideId);
  toastHideId = ctx.after(COUNTER_SHOW_SEC, () => {
    // (Not while the cursor is on it: mouseleave schedules the slide-out again.)
    if (zipping.length === 0 && !toast.el.matches(':hover')) toast.el.classList.remove('visible');
  }, 'starbits toast slide out');
}

function pulseCount(t) {
  t.countEl.textContent = String(shownCount());
  // Web Animations API so it restarts cleanly on every arrival, even mid-pulse.
  t.countEl.animate(
    [
      // Shop yellow at rest, flashes white at the peak of the pop.
      { transform: 'scale(1)', color: '#ffe8a3' },
      { transform: `scale(${PULSE_SCALE})`, color: '#ffffff', offset: 0.35 },
      { transform: 'scale(0.92)', offset: 0.7 },
      { transform: 'scale(1)', color: '#ffe8a3' },
    ],
    { duration: PULSE_MS, easing: 'ease-out' },
  );
  // A tiny nudge of the whole card, like it "caught" the starbit.
  t.el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
    { duration: 220, easing: 'ease-out', composite: 'add' },
  );
}

// Where zipping starbits fly to: the number on the card (live, since the card may still be
// sliding in when the flight starts).
function zipTarget(ctx) {
  const r = ensureToast(ctx).countEl.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    // Not laid out yet: aim at the top-right corner.
    const a = area(ctx);
    return { x: a.right - TOAST_MARGIN - 40, y: a.top + TOAST_MARGIN + 16 };
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function collect(ctx, index) {
  const [drop] = drops.splice(index, 1);
  const value = tuning.value;
  const shoot = switches.shootAnimation;
  slideToastIn(ctx); // shows the count before this pickup; it ticks up when it lands
  ctx.api.collectStarbits(value).then((state) => {
    if (state && Number.isFinite(state.starbits)) total = state.starbits;
    if (!shoot) {
      // No flight: tick the card up as soon as the pickup is saved.
      pulseCount(toast);
      scheduleToastOut(ctx);
    }
  });

  if (shoot) {
    zipping.push({
      value,
      el: drop.el,
      spawnX: drop.spawnX,
      spawnY: drop.spawnY,
      sx: drop.x,
      sy: drop.y,
      x: drop.x,
      y: drop.y,
      angle: drop.angle,
      t: 0,
      arc: rand(-ZIP_ARC, ZIP_ARC),
    });
    return;
  }

  // No shooting animation: movement sets an inline transform, so the pickup poof is done
  // inline too: rise a little, shrink and fade from wherever it currently is.
  drop.el.style.transition = 'opacity 200ms, transform 200ms';
  drop.el.style.transform =
    `translate(${drop.x - drop.spawnX}px, ${drop.y - drop.spawnY - 12}px) rotate(${drop.angle}deg) scale(0.5)`;
  drop.el.classList.add('collected');
  ctx.after(0.25, () => drop.el.remove(), 'starbit poof cleanup');
}

// Trail: each frame of the zip leaves a copy of the starbit element behind that fades out.
// It's a clone of the starbit itself (same class, so the same art), not a new visual.
function leaveGhost(ctx, z) {
  const ghost = z.el.cloneNode(false);
  ghost.classList.add('starbits-ghost');
  ghost.style.transition = `opacity ${TRAIL_FADE_MS}ms linear, transform ${TRAIL_FADE_MS}ms linear`;
  ctx.stage.appendChild(ghost);
  ghost.addEventListener('transitionend', () => ghost.remove(), { once: true });
  // Backup in case the transition never runs (e.g. the window was throttled): no leaks.
  ctx.after(TRAIL_FADE_MS / 1000 + 0.3, () => ghost.remove(), 'starbit trail cleanup');
  // Next frame: start fading/shrinking (needs one frame at full opacity to transition from).
  requestAnimationFrame(() => {
    ghost.style.opacity = '0';
    ghost.style.transform = `${ghost.style.transform} scale(0.4)`;
  });
}

function zip(ctx, z, dt) {
  z.t = Math.min(1, z.t + dt / ZIP_TIME);
  const u = z.t * z.t * z.t; // ease-in: slow start, then whoosh
  const c = zipTarget(ctx);
  // Straight line start → card, bowed sideways by a sine arc.
  const lx = z.sx + (c.x - z.sx) * u;
  const ly = z.sy + (c.y - z.sy) * u;
  const len = Math.hypot(c.x - z.sx, c.y - z.sy) || 1;
  const nx = -(c.y - z.sy) / len; // unit normal to the path
  const ny = (c.x - z.sx) / len;
  const bow = Math.sin(Math.PI * u) * z.arc;
  z.x = lx + nx * bow;
  z.y = ly + ny * bow;
  z.angle = (z.angle + ZIP_SPIN * dt) % 360;
  z.el.style.transform = `translate(${z.x - z.spawnX}px, ${z.y - z.spawnY}px) rotate(${z.angle}deg)`;
  leaveGhost(ctx, z);
  return z.t >= 1;
}

export default {
  name: 'starbits',

  init(ctx) {
    // Tuning from Admin Settings: load the saved values, and follow live changes.
    const applyTuning = (overrides) => {
      tuning = resolveTuning(overrides);
      // A shorter drop interval should kick in now, not after the old (longer) wait.
      nextDropIn = Math.min(nextDropIn, tuning.dropEveryMax);
    };
    ctx.api.getAdminSettings?.().then(applyTuning);
    ctx.api.onAdminSettingsChanged?.(applyTuning);

    // Colors switched on in Settings (Settings → Starbits → Color), followed live.
    const applySettings = (settings) => {
      // On/off switches (missing = on, so older settings files keep today's behavior).
      const on = (v) => v === undefined || Number(v) !== 0;
      switches.spawning = on(settings?.starbitSpawning);
      switches.visible = on(settings?.starbitVisible);
      switches.shootAnimation = on(settings?.starbitShootAnimation);
      // Hidden starbits: one class on the stage hides every starbit and trail (see pet.css);
      // the count card isn't a .starbits element, so it still shows.
      ctx.stage.classList.toggle('starbits-hidden', !switches.visible);

      starbitImagePool = starbitImages(enabledColors(settings?.starbitColors));
      const next = clampStarbitSize(settings?.starbitSize);
      if (next !== size) {
        size = next;
        // Resize the ones already on screen (floating and zipping) too.
        for (const d of drops) sizeElement(d.el, d.spawnX, d.spawnY);
        for (const z of zipping) sizeElement(z.el, z.spawnX, z.spawnY);
      }
    };
    ctx.api.getSettings?.().then(applySettings);
    ctx.api.onSettingsChanged?.(applySettings);

    // Preload every starbit image so the first throw of each color doesn't pop in late.
    for (const src of starbitImages()) {
      const img = new Image();
      img.onerror = () => console.warn(`[starbits] missing art: ${src}`);
      img.src = src;
    }
    ctx.api.getState().then((s) => {
      if (s && Number.isFinite(s.starbits)) total = s.starbits;
    });
    ctx.api.onStateChanged((s) => {
      if (s && Number.isFinite(s.starbits)) total = s.starbits;
    });
    ctx.events.onEntry((e) => {
      if (e.type === 'impact') impactDrops(ctx, e.data);
    });
  },

  update(ctx, dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.held && !d.reclaiming) {
        heldStep(ctx, d, dt); // constellation quiz
      } else if (d.falling && !d.reclaiming) {
        fallStep(ctx, d, dt); // rain (star shower)
      } else if (!d.reclaiming) {
        animate(ctx, d, dt);
      } else if (reclaimStep(ctx, d, dt)) {
        drops.splice(i, 1); // arrived back inside him
        d.el.remove();
      }
    }

    for (let i = zipping.length - 1; i >= 0; i--) {
      if (zip(ctx, zipping[i], dt)) {
        zipping[i].el.remove();
        zipping.splice(i, 1);
        pulseCount(toast); // count ticks up as it lands
        scheduleToastOut(ctx); // restarts on every arrival
      }
    }

    // Pickup is checked every frame (not just on mousemove): a starbit pulled in by the
    // magnet can reach a cursor that's standing still. ctx.cursor is kept up to date by pet.js.
    const now = ctx.clock.seconds;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.fading) continue; // too late, it's fading away
      if (d.held || d.reclaiming || now < (d.pickableAt ?? 0)) continue; // held / flying home / just thrown as a reward
      const reach = pickupRadius() + (d.falling ? d.falling.catchBonus : 0);
      if (Math.hypot(ctx.cursor.x - d.x, ctx.cursor.y - d.y) < reach) {
        collect(ctx, i);
      }
    }

    const rules = rulesFor(ctx.pet);
    if (!rules.refuses) refusedThisSpell = false; // next mad spell may refuse again
    // 'shop': parked in the shop's display box (events/shop.js), so no drops while shopping.
    // 'quiz': drawing a constellation (events/constellation.js); a stray drop would muddle it.
    // 'focus': "Sorry, I gotta focus" (events/focus.js): fully quiet, no drops.
    if (ctx.pet.mode === 'drag' || ctx.pet.mode === 'shop' || ctx.pet.mode === 'quiz' || ctx.pet.mode === 'focus') return;
    if (ctx.pet.hiding) return; // hide and seek: a starbit flying out would give him away

    // Playful (rate 2) counts down twice as fast. Rate 0 still counts at normal speed,
    // so a mad star "refuses" at about the moment he'd have dropped some.
    nextDropIn -= dt * Math.max(1, rules.starbits);
    if (nextDropIn <= 0) {
      nextDropIn = nextDropDelay();
      if (rules.starbits > 0) {
        throwBurst(ctx);
      } else if (rules.refuses && !refusedThisSpell) {
        refusedThisSpell = true;
        chat(ctx, REFUSE_LINES(), 2000, { wait: 4 });
      }
    }
  },
};
