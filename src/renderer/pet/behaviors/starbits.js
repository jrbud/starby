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
//                           ignoring MAX_ON_SCREEN; for REWARD_PICKUP_DELAY the magnet and pickup
//                           leave them alone, so you see them fly out before sweeping them up
//   reclaimStarbits(ctx)    every starbit on screen spins and flies back into him and disappears
//                           (not added to the count)
import { rulesFor } from './moods.js';
import { chat, lineBag } from './chatter.js';

// ======================= TUNING — the main knobs =======================
// Spawn rate, burst size, value, lifetime and magnet strength/reach are NOT constants here:
// their defaults, ranges and labels live in ../../shared/starbitsTuning.js, and they can be
// changed live from the right-click menu → "Admin Settings…". Read them as `tuning.<key>`:
//   tuning.dropEveryMin / dropEveryMax   seconds between drops (moods scale this)
//   tuning.burstMin / burstMax           starbits per drop
//   tuning.value                         counter increase per starbit collected
//   tuning.lifetime                      seconds before an uncollected starbit fades (P2-3)
//   tuning.magnetStrength                cursor pull multiplier (0 = magnet off)
//   tuning.magnetRadius                  px the cursor must be within to pull
import { DEFAULT_TUNING, resolveTuning } from '../../shared/starbitsTuning.js';
let tuning = { ...DEFAULT_TUNING }; // replaced with saved Admin Settings at startup
// =======================================================================

const rand = (a, b) => a + Math.random() * (b - a);
const PICKUP_RADIUS = 22;
const MAX_ON_SCREEN = 8;
// Old starbits fade (P2-3): after tuning.lifetime seconds uncollected, a starbit fades out over
// FADE_OUT seconds (still floating, but no longer collectable or magnetic), then is removed.
const FADE_OUT = 1.5;
const SIZE = 20; // px on screen; matches .starbits width/height in pet.css

// ART: team-drawn PNGs in assets/starbits/, named <color><n>.png (e.g. pink3.png). Each
// starbit picks one at random. The page can't list a folder, so the files are listed here:
// to add a color, add it to STARBIT_COLORS; to add a 5th design per color, bump the count.
// Paths are relative to src/renderer/pet/index.html.
const STARBIT_ART_DIR = '../../../assets/starbits/';
const STARBIT_COLORS = ['blue', 'green', 'pink', 'red', 'teal', 'yellow'];
const STARBIT_VARIANTS_PER_COLOR = 4;
const STARBIT_IMAGES = STARBIT_COLORS.flatMap((color) =>
  Array.from({ length: STARBIT_VARIANTS_PER_COLOR }, (_, i) => `${STARBIT_ART_DIR}${color}${i + 1}.png`),
);
const randomStarbitImage = () => STARBIT_IMAGES[Math.floor(Math.random() * STARBIT_IMAGES.length)];
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
// BURST_STAGGER seconds apart, so it reads as a little flurry. MAX_ON_SCREEN still caps it.
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

/** Reward: throw `count` starbits out of him in a full ring (ignores MAX_ON_SCREEN). */
export function burstStarbits(ctx, count = 7) {
  const turn = rand(0, 360);
  const n = throwAngles(ctx, fanAngles(count, turn, turn + 360), {
    ignoreCap: true,
    past: REWARD_DIST,
    pickupDelay: REWARD_PICKUP_DELAY,
  });
  ctx.log('starbits-burst', { count: n });
  return n;
}

/** Take back every starbit on screen: they fly into him and vanish (not added to the count). */
export function reclaimStarbits(ctx) {
  let n = 0;
  for (const d of drops) {
    if (!d.reclaiming) {
      d.reclaiming = true;
      n++;
    }
  }
  ctx.log('starbits-reclaimed', { count: n });
  return n;
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
  if (!ignoreCap && drops.length >= MAX_ON_SCREEN) return;
  const { pet } = ctx;
  // Out of the star's center, wherever it is.
  const x = pet.x + pet.size / 2;
  const y = pet.y + pet.size / 2;
  const el = document.createElement('img');
  el.className = 'starbits';
  el.src = randomStarbitImage();
  el.alt = '';
  el.draggable = false;
  el.style.left = `${x - SIZE / 2}px`;
  el.style.top = `${y - SIZE / 2}px`;
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
// COLLECT_STYLE picks what a starbit does when picked up:
//   'zip'  — a notification card slides in at the bottom right; the starbit zips into it with
//            a trail, and the count ticks up with a pulse. The card slides back out
//            COUNTER_SHOW_SEC after the last arrival.
//   'fade' — the original: rises a little, shrinks and fades where it was.
// (Trying out 'zip'; set back to 'fade' to undo.)
const COLLECT_STYLE = 'zip';

const ZIP_TIME = 0.5; // s, flight time to the corner
const ZIP_ARC = 70; // px, how far the path bows out sideways (sign is random)
const ZIP_SPIN = 900; // deg/s while zipping
const TOAST_MARGIN = 16; // px in from the bottom-right corner of the usable screen area
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
  // Plain box + text (UI chrome, like the speech bubble); NOT a .hit element, so it stays
  // click-through.
  const el = document.createElement('div');
  el.className = 'starbits-toast';
  const countEl = document.createElement('span');
  countEl.className = 'starbits-toast-count';
  const label = document.createElement('span');
  label.className = 'starbits-toast-label';
  label.textContent = 'starbits';
  el.append(countEl, label);
  ctx.stage.appendChild(el);
  toast = { el, countEl };
  return toast;
}

function placeToast(ctx) {
  const t = ensureToast(ctx);
  // Bottom-right of the usable area, so it's never under the taskbar (bottom or right side).
  // The stage covers the whole screen, taskbar included, so convert to right/bottom offsets.
  const a = area(ctx);
  t.el.style.right = `${Math.max(0, window.innerWidth - a.right) + TOAST_MARGIN}px`;
  t.el.style.bottom = `${Math.max(0, window.innerHeight - a.bottom) + TOAST_MARGIN}px`;
}

function slideToastIn(ctx) {
  const t = ensureToast(ctx);
  placeToast(ctx);
  if (!t.el.classList.contains('visible')) t.countEl.textContent = String(shownCount());
  t.el.classList.add('visible');
  ctx.cancel(toastHideId); // stays up while starbits are still on their way
  toastHideId = null;
}

function scheduleToastOut(ctx) {
  ctx.cancel(toastHideId);
  toastHideId = ctx.after(COUNTER_SHOW_SEC, () => {
    if (zipping.length === 0) toast.el.classList.remove('visible');
  }, 'starbits toast slide out');
}

function pulseCount(t) {
  t.countEl.textContent = String(shownCount());
  // Web Animations API so it restarts cleanly on every arrival, even mid-pulse.
  t.countEl.animate(
    [
      { transform: 'scale(1)', color: '#ffffff' },
      { transform: `scale(${PULSE_SCALE})`, color: '#ffe680', offset: 0.35 },
      { transform: 'scale(0.92)', offset: 0.7 },
      { transform: 'scale(1)', color: '#ffffff' },
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
    // Not laid out yet: aim at the bottom-right corner.
    const a = area(ctx);
    return { x: a.right - TOAST_MARGIN - 40, y: a.bottom - TOAST_MARGIN - 16 };
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function collect(ctx, index) {
  const [drop] = drops.splice(index, 1);
  const value = tuning.value;
  ctx.api.collectStarbits(value).then((state) => {
    if (state && Number.isFinite(state.starbits)) total = state.starbits;
  });

  if (COLLECT_STYLE === 'zip') {
    slideToastIn(ctx); // give it somewhere to land
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
      arc: ZIP_ARC * (Math.random() < 0.5 ? -1 : 1),
    });
    return;
  }

  // 'fade': movement sets an inline transform, so the pickup poof is done inline too:
  // rise a little, shrink and fade from wherever it currently is.
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

    // Preload every starbit image so the first throw of each color doesn't pop in late.
    for (const src of STARBIT_IMAGES) {
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
      if (!d.reclaiming) {
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
      if (d.reclaiming || now < (d.pickableAt ?? 0)) continue; // flying home / just thrown as a reward
      if (Math.hypot(ctx.cursor.x - d.x, ctx.cursor.y - d.y) < PICKUP_RADIUS) {
        collect(ctx, i);
      }
    }

    const rules = rulesFor(ctx.pet);
    if (!rules.refuses) refusedThisSpell = false; // next mad spell may refuse again
    if (ctx.pet.mode === 'drag') return;

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
