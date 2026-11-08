// HOOP SHOT — a game: slingshot Starby into a hoop on the other side of the screen, with gravity.
//
//   setup   he flies to a launch spot near his side of the screen; the hoop appears on the far
//           side. "hoop shot! right-click and drag me back, let go to shoot!"
//   aim     GAME_FOR seconds on the clock (countdown top right). Right- OR left-click and drag him back
//           like a slingshot: he's pulled toward the cursor, and a few small starbits show the START of
//           the arc he'd fly (PREVIEW_DOTS dots, only the first PREVIEW_FOR seconds of the flight,
//           so you still have to judge the rest). Let go to shoot. Just a click (or a pull < PULL_MIN):
//           he stays put and says "right click or left click and drag me!"
//   flight  he flies in an ARC: real gravity (GRAVITY) only in this game, spinning, bouncing off the
//           screen edges. Passing DOWN through the hoop's opening → scored!
//   miss    he bounces on the floor, says "so close!" and flies back to the launch spot to try again.
//   end     scored → "SWISH!" + SCORE_REWARD starbits. Out of time → "aww, out of time!" (a shot
//           already in the air when the clock hits 0 still counts if it goes in).
//
// RIGHT-CLICK: normally right-click on him opens the menu (drag.js). While this game runs, a
// capture listener on window swallows the contextmenu event before it reaches him, so the menu stays shut; it's back
// to normal the moment the game ends. LEFT presses on him are caught the same way (window capture
// mousedown), so drag.js doesn't grab him: left-drag pulls the slingshot too, and never ends the game.
// While pulling, click-through is pinned off (ctx.setPinned) so the release isn't lost when the
// cursor leaves him (see ../clickThrough.js).
//
// ART: the hoop is the team's halo PNG (assets/accessories/halo.png) as a PLACEHOLDER until a hoop
// is drawn: swap HOOP_ART (and HOOP_ART_BOX, the visible part of the PNG) when it exists. The aim
// dots are the team's starbit PNGs. Nothing is drawn by code.
//
// Starts like the other games: his "wanna play hoop shot?" invite (./invite.js, via the games timer),
// the "Play a game?" buttons, the right-click menu ("Play hoop shot"), starby.startEvent('hoop-shot').
// Shares the rest between games (./games.js). Owns the star via pet.mode = 'hoop'.
// Decisions (timer, ending) on ticks; aiming and the flight physics every frame.
import { rand, clamp, startJump, cancelJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createCountdown } from './countdown.js';
import { readyToPlay, markPlayed } from './games.js';
import { starbitImages, enabledColors } from '../../shared/starbitArt.js';

// ---- Tuning ----
const GAME_FOR = 15; // seconds to make the shot
const GRAVITY = 1500; // px/s² pulling him down in flight (this game only)
const PULL_MAX = 170; // px: the furthest you can pull him back
const PULL_MIN = 20; // px: smaller pulls are cancelled, not shot
const SHOT_SPEED_MAX = 1750; // px/s at a full pull
// The pull LOOKS like the normal slingshot (../behaviors/slingshot.js): his feet stay pinned at the
// launch spot and his head is held by the cursor, so his body stretches between them like a rubber
// band (pet.warp), turning upside down if you pull below him and trembling near full pull. Let go
// and he flies off with the same damped rubber-band wobble.
const GRAB_SNAP = 40; // px: over the first part of the pull his head glides onto the cursor
const MIN_LENGTH = 0.5; // his length (feet → head) stays within these, × his height
const MAX_LENGTH = 3;
const TREMBLE_FROM = 0.75; // pull tension above which he trembles
const TREMBLE_PX = 1.5;
const WOBBLE_HZ = 5; // rubber-band wobble after the release (wobbles per second)...
const WOBBLE_DAMPING = 0.07; // ...and how fast it dies out (low = wobbly)
const UPRIGHT_SPEED = 10; // 1/s: how quickly he tips back upright after landing
const PREVIEW_DOTS = 6; // starbits showing the start of the arc
const PREVIEW_FOR = 0.4; // seconds of flight they cover (the arc is longer: you judge the rest)
const PREVIEW_SIZE = 14; // px
const WALL_BOUNCE = 0.6; // speed kept bouncing off a screen edge
const FLOOR_BOUNCE = 0.45; // speed kept bouncing off the floor
const FLOOR_STOP = 260; // px/s: slower than this hitting the floor → he's landed
const SPIN = [7, 14]; // rad/s spin in flight: light pull ... full pull (rolls the way he's flying)
const SETUP_SPEED = 900; // px/s flying to the launch spot
const RETURN_SPEED = 1100; // px/s flying back after a miss
const HOOP_WIDTH = 2.2; // hoop width, in Starby sizes
const OPENING = [0.14, 0.86]; // part of the hoop's width that counts as "through" (rest = rim)
const SCORE_REWARD = 10;
const SUBSTEPS = 4; // physics steps per frame (fast shots don't skip through the hoop)

// Placeholder hoop art: the halo accessory. HOOP_ART_BOX = where the drawing sits inside the PNG
// (left, top, right, bottom in PNG px, out of HOOP_ART_SIZE), so the hoop is sized by the visible ring.
const HOOP_ART = '../../../assets/accessories/halo.png'; // relative to src/renderer/pet/index.html
const HOOP_ART_SIZE = 2048;
const HOOP_ART_BOX = [412, 25, 1576, 403];

const LINES = {
  intro: 'hoop shot! right click or left click and drag me back, let go to shoot!',
  howTo: 'right click or left click and drag me!',
  scored: lineBag(['SWISH!', 'nothing but net! SWISH!', 'SWISH! what a shot!']),
  miss: lineBag(['so close!', 'again again!', 'ooh, almost!', 'one more try!']),
  timeUp: lineBag(['aww, out of time!', "time's up! next time!", 'aww, so close...']),
};

// ---- State ----
let endGame = null;
let phase = 'done'; // setup | aim | pull | flight | wait (result pending, judged at the tick) | return | done
let gameLeft = 0;
let launch = null; // { x, y } his top-left at the launch spot
let hoop = null; // { x, y, w, h } visible ring box on screen
let hoopEl = null;
let dots = [];
let countdown = null;
let mouse = { x: 0, y: 0 };
let vel = { x: 0, y: 0 };
let spin = 0;
// His angle during the game, kept HERE: behaviors/drag.js straightens him (rotation = 0) every frame
// whenever he isn't held or thrown, which would wipe out the spin. Events update after behaviors,
// so setting pet.rotation = rot each frame keeps it.
let rot = 0;
let press = null; // cursor when the pull started (the pull is measured from here)
let feet = null; // his feet's pinned point during the pull (bottom-middle of him at the launch spot)
let headRest = null; // the top of his head when the pull started
let lastStretch = 1; // stretch on the last pulled frame (where the release wobble starts)
let wobble = null; // { x, v } rubber-band wobble after the release (stretch offset and its speed)
let scored = false;
let landed = false; // a missed shot finished (acted on at the tick)
let played = false;
let hooked = false;
let pullButton = 2; // which mouse button is pulling (0 = left, 2 = right)

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const center = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const active = () => phase !== 'done';

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

// Spring offset → drawn stretch (same as the slingshot's: as-is when stretched, eased when squashed).
const wobbleStretch = (x) => (x >= 0 ? 1 + x : 1 + x / (1 - x));

// Pull vector: how far the cursor has moved since the press (where on him you clicked doesn't
// matter, like the slingshot), clamped to PULL_MAX.
function pullVector() {
  let dx = mouse.x - press.x;
  let dy = mouse.y - press.y;
  const d = Math.hypot(dx, dy);
  if (d > PULL_MAX) { dx *= PULL_MAX / d; dy *= PULL_MAX / d; }
  return { dx, dy, d: Math.min(d, PULL_MAX) };
}

// The shot goes the opposite way to the pull, faster the further you pull.
const shotFrom = (p) => ({ x: (-p.dx / PULL_MAX) * SHOT_SPEED_MAX, y: (-p.dy / PULL_MAX) * SHOT_SPEED_MAX });

function buildHoop(ctx) {
  if (!hoopEl) {
    hoopEl = document.createElement('div');
    hoopEl.className = 'hoop-shot-hoop';
    Object.assign(hoopEl.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' });
    const img = document.createElement('img');
    img.src = HOOP_ART;
    img.alt = '';
    img.draggable = false;
    img.style.position = 'absolute';
    img.onerror = () => console.warn(`[hoop-shot] missing hoop art: ${HOOP_ART}`);
    hoopEl.appendChild(img);
  }
  // Behind him, so he flies in front of the ring.
  if (!hoopEl.parentNode) {
    if (ctx.petEl.parentNode === ctx.stage) ctx.stage.insertBefore(hoopEl, ctx.petEl);
    else ctx.stage.appendChild(hoopEl);
  }
  const [l, t, r] = HOOP_ART_BOX;
  const scale = hoop.w / (r - l); // screen px per PNG px
  const img = hoopEl.children[0];
  Object.assign(img.style, { width: `${HOOP_ART_SIZE * scale}px`, height: `${HOOP_ART_SIZE * scale}px`, left: `${-l * scale}px`, top: `${-t * scale}px` });
  Object.assign(hoopEl.style, { transform: `translate(${hoop.x}px, ${hoop.y}px)`, width: `${hoop.w}px`, height: `${hoop.h}px`, display: 'block' });
}

function buildDots(ctx) {
  if (dots.length) return;
  const pool = starbitImages(enabledColors());
  for (let i = 0; i < PREVIEW_DOTS; i++) {
    const el = document.createElement('img');
    el.className = 'hoop-shot-aim';
    el.src = pool[i % pool.length];
    el.alt = '';
    el.draggable = false;
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px`, pointerEvents: 'none', display: 'none', opacity: String(1 - i / (PREVIEW_DOTS + 1)) });
    ctx.stage.appendChild(el);
    dots.push(el);
  }
}

function showDots(ctx, p) {
  const c = center(ctx.pet);
  const v = shotFrom(p);
  dots.forEach((el, i) => {
    const t = ((i + 1) / PREVIEW_DOTS) * PREVIEW_FOR;
    const x = c.x + v.x * t;
    const y = c.y + v.y * t + 0.5 * GRAVITY * t * t;
    el.style.transform = `translate(${x - PREVIEW_SIZE / 2}px, ${y - PREVIEW_SIZE / 2}px)`;
    el.style.display = p.d >= PULL_MIN ? 'block' : 'none';
  });
}

const hideDots = () => dots.forEach((el) => { el.style.display = 'none'; });

function hookMouse(ctx) {
  if (hooked) return;
  hooked = true;
  const { petEl } = ctx;
  // Swallow right-click's menu while the game runs: a CAPTURE listener on window runs before the
  // event ever reaches him, and stopPropagation keeps it from getting to drag.js's listener (which
  // opens the menu). Outside the game it does nothing, so the menu works as usual.
  window.addEventListener('contextmenu', (e) => {
    if (!active()) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // Presses on him, LEFT or RIGHT button: the same kind of capture listener, so drag.js never sees
  // them during the game (a left press would otherwise grab him, which used to end the game).
  // Either button pulls the slingshot while he's waiting at the launch spot; any other moment of
  // the game (setup, flight, flying back) the press is just ignored.
  window.addEventListener('mousedown', (e) => {
    if (!active() || !(e.target === petEl || petEl.contains?.(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
    if (phase !== 'aim' || (e.button !== 0 && e.button !== 2)) return;
    mouse = { x: e.clientX, y: e.clientY };
    press = { ...mouse };
    // Pin his feet (bottom-middle) where he stands; his head (top-middle) is what the cursor holds.
    const S = ctx.pet.size;
    feet = { x: launch.x + S / 2, y: launch.y + S };
    headRest = { x: launch.x + S / 2, y: launch.y };
    wobble = null;
    pullButton = e.button;
    phase = 'pull';
    ctx.setPinned(true); // keep getting mouse events when the cursor leaves him
  }, true);
  window.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup', (e) => {
    if (phase !== 'pull' || e.button !== pullButton) return;
    ctx.setPinned(false);
    const p = pullVector();
    hideDots();
    if (p.d < PULL_MIN) { // just a click (or a tiny pull): he stays put and tells you how
      ctx.pet.x = launch.x;
      ctx.pet.y = launch.y;
      ctx.pet.squash = 1;
      rot = 0;
      ctx.pet.rotation = 0;
      ctx.pet.warp = null;
      phase = 'aim';
      ctx.say(LINES.howTo, 2200);
      return;
    }
    vel = shotFrom(p);
    // A good spin, rolling the way he's flying, harder the further you pulled.
    const tension = p.d / PULL_MAX;
    spin = (vel.x >= 0 ? 1 : -1) * (SPIN[0] + (SPIN[1] - SPIN[0]) * tension);
    // Rubber-band snap: the wobble starts from exactly how stretched he was.
    const d = lastStretch - 1;
    wobble = { x: d >= 0 ? d : d / (1 + d), v: 0 };
    phase = 'flight';
    ctx.log('hoop-shot', { speed: Math.round(Math.hypot(vel.x, vel.y)) });
  });
}

// One physics step of the flight. Returns 'scored' | 'landed' | null.
function step(ctx, h) {
  const { pet } = ctx;
  const a = areaOf(ctx);
  const S = pet.size;
  const before = center(pet);
  vel.y += GRAVITY * h;
  pet.x += vel.x * h;
  pet.y += vel.y * h;
  rot += spin * h;
  pet.rotation = rot;
  const after = center(pet);

  // Through the hoop: crossing its middle line going DOWN, inside the opening.
  const lineY = hoop.y + hoop.h / 2;
  if (vel.y > 0 && before.y < lineY && after.y >= lineY) {
    const k = (lineY - before.y) / (after.y - before.y);
    const xAt = before.x + (after.x - before.x) * k;
    if (xAt >= hoop.x + hoop.w * OPENING[0] && xAt <= hoop.x + hoop.w * OPENING[1]) return 'scored';
  }

  // Screen edges (left / right / top): bounce.
  if (pet.x < a.left) { pet.x = a.left; vel.x = Math.abs(vel.x) * WALL_BOUNCE; spin = -spin; }
  if (pet.x > a.right - S) { pet.x = a.right - S; vel.x = -Math.abs(vel.x) * WALL_BOUNCE; spin = -spin; }
  if (pet.y < a.top) { pet.y = a.top; vel.y = Math.abs(vel.y) * WALL_BOUNCE; }
  // Floor: bounce, then land.
  if (pet.y > a.bottom - S) {
    pet.y = a.bottom - S;
    if (vel.y < FLOOR_STOP) return 'landed';
    vel.y = -vel.y * FLOOR_BOUNCE;
    vel.x *= 0.7;
    spin *= 0.6;
  }
  return null;
}

function moveToward(pet, target, speed, dt) {
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed * dt || d < 0.5) { pet.x = target.x; pet.y = target.y; return true; }
  pet.x += (dx / d) * speed * dt;
  pet.y += (dy / d) * speed * dt;
  return false;
}

function cleanUp(ctx) {
  hideDots();
  if (hoopEl) hoopEl.style.display = 'none';
  countdown?.hide();
  ctx.setPinned?.(false);
}

export default {
  name: 'hoop-shot',
  category: 'games',
  priority: 10, // a game: same level as the others

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    hookMouse(ctx);
    const a = areaOf(ctx);
    const S = pet.size;
    const W = a.right - a.left;
    const H = a.bottom - a.top;
    // Launch from the side he's on; the hoop goes on the other side.
    const fromLeft = pet.x + S / 2 < (a.left + a.right) / 2;
    launch = {
      x: fromLeft ? a.left + W * 0.1 : a.right - W * 0.1 - S,
      y: a.bottom - S - H * 0.15,
    };
    const hw = S * HOOP_WIDTH;
    const [l, t, r, b] = HOOP_ART_BOX;
    const hh = hw * ((b - t) / (r - l));
    const hx = fromLeft ? a.right - W * 0.2 - hw / 2 : a.left + W * 0.2 - hw / 2;
    hoop = { x: hx, y: rand(a.top + H * 0.25, a.top + H * 0.55), w: hw, h: hh };
    buildHoop(ctx);
    buildDots(ctx);
    countdown = countdown || createCountdown(ctx.stage, () => (ctx.area ? ctx.area() : null));
    gameLeft = GAME_FOR;
    scored = false;
    landed = false;
    played = false;
    vel = { x: 0, y: 0 };
    phase = 'setup';
    pet.mode = 'hoop'; // behaviors stand down
    rot = 0;
    pet.rotation = 0;
    cancelJump();
    pet.facing = fromLeft ? 1 : -1;
    requestMood(ctx, 'playful', 'hoop shot');
    ctx.say(LINES.intro, 3500);
    ctx.log('hoop-start', { reason, fromLeft });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endGame || phase === 'done') return;
    if (pet.mode !== 'hoop') { finish(`interrupted:${pet.mode}`); return; } // something else took him over
    if (phase === 'setup') return;

    gameLeft -= TICK_SECONDS;
    countdown?.set(gameLeft);

    if (scored) {
      ctx.say(LINES.scored(), 2500);
      burstStarbits(ctx, SCORE_REWARD);
      requestMood(ctx, 'happy', 'scored a hoop shot');
      ctx.log('hoop-end', { result: 'scored' });
      finish('scored');
      return;
    }
    if (landed) {
      landed = false;
      if (gameLeft <= 0) { ctx.say(LINES.timeUp(), 2500); ctx.log('hoop-end', { result: 'time' }); finish('time'); return; }
      ctx.say(LINES.miss(), 1500);
      phase = 'return';
      return;
    }
    // Out of time (a shot in the air gets to finish first).
    if (gameLeft <= 0 && phase !== 'flight') {
      ctx.say(LINES.timeUp(), 2500);
      ctx.log('hoop-end', { result: 'time' });
      finish('time');
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'hoop' || phase === 'done') return;
    pet.bob = 0;

    // Rubber-band wobble after the release (while flying, and as he lands and flies back).
    if (wobble && phase !== 'pull') {
      const w = 2 * Math.PI * WOBBLE_HZ;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        wobble.v += (-w * w * wobble.x - 2 * WOBBLE_DAMPING * w * wobble.v) * h;
        wobble.x += wobble.v * h;
      }
      if (Math.abs(wobble.x) < 0.004 && Math.abs(wobble.v) < 0.05) { wobble = null; pet.warp = null; }
      else pet.warp = { angle: rot - Math.PI / 2, stretch: wobbleStretch(wobble.x) };
    }
    // Landed: tip back upright smoothly (to the nearest full turn, no snap).
    if (phase === 'wait' || phase === 'return') {
      const upright = Math.round(rot / (2 * Math.PI)) * 2 * Math.PI;
      rot = upright + (rot - upright) * Math.exp(-UPRIGHT_SPEED * dt);
      if (Math.abs(rot - upright) < 0.01) rot = 0;
    }
    pet.rotation = rot; // (drag.js zeroed it this frame; see `rot`)

    if (phase === 'setup' || phase === 'return') {
      if (phase === 'setup') { rot = 0; pet.rotation = 0; }
      if (moveToward(pet, launch, phase === 'setup' ? SETUP_SPEED : RETURN_SPEED, dt)) {
        if (phase === 'setup') {
          played = true;
          countdown.show('Hoop Shot', gameLeft);
        }
        phase = 'aim';
        rot = 0; // fully upright at the launch spot
        pet.rotation = 0;
        startJump({ height: rand(6, 9), air: 0.2 }); // ready!
      }
    } else if (phase === 'aim') {
      pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
    } else if (phase === 'pull') {
      // Slingshot look: feet pinned, head held by the cursor, body stretched between them.
      const p = pullVector();
      const raw = Math.hypot(mouse.x - press.x, mouse.y - press.y);
      const tension = p.d / PULL_MAX;
      const k = tension > TREMBLE_FROM ? (tension - TREMBLE_FROM) / (1 - TREMBLE_FROM) : 0;
      const offset = Math.max(0, 1 - raw / GRAB_SNAP); // his head glides onto the cursor at first
      // His head sits under the cursor (the pull clamped to PULL_MAX), after gliding there from where
      // it was during the first GRAB_SNAP px (like the slingshot); trembles near a full pull.
      const headX = press.x + p.dx + (headRest.x - press.x) * offset + rand(-TREMBLE_PX, TREMBLE_PX) * k;
      const headY = press.y + p.dy + (headRest.y - press.y) * offset + rand(-TREMBLE_PX, TREMBLE_PX) * k;
      let vx = headX - feet.x;
      let vy = headY - feet.y;
      let len = Math.hypot(vx, vy);
      if (len < 0.001) { vx = 0; vy = -1; len = 1; }
      const ux = vx / len;
      const uy = vy / len;
      const stretch = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, len / pet.size));
      lastStretch = stretch;
      const bodyLen = stretch * pet.size;
      // Drawn centered halfway between feet and head, turned along the body (rotation 0 = head up).
      pet.x = feet.x + (ux * bodyLen) / 2 - pet.size / 2;
      pet.y = feet.y + (uy * bodyLen) / 2 - pet.size / 2;
      pet.squash = 1;
      rot = Math.atan2(ux, -uy);
      pet.rotation = rot;
      pet.warp = { angle: Math.atan2(uy, ux), stretch };
      if (Math.abs(p.dx) > 2) pet.facing = p.dx < 0 ? 1 : -1; // faces where he'll fly
      showDots(ctx, p);
    } else if (phase === 'flight') {
      pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
      const h = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) {
        const r = step(ctx, h);
        if (r === 'scored') { scored = true; phase = 'wait'; break; }
        if (r === 'landed') { landed = true; phase = 'wait'; break; } // tips upright (above)
      }
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    phase = 'done';
    cleanUp(ctx);
    rot = 0;
    pet.rotation = 0;
    pet.squash = 1;
    pet.warp = null; // no leftover stretch
    wobble = null;
    if (pet.mode === 'hoop') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
