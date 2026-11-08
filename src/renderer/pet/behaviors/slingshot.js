// SLINGSHOT: hold the RIGHT mouse button on Starby and pull. The middle-bottom pixel of his sprite
// (his feet) is LOCKED in place, and you drag him by the middle-top pixel (the top of his head),
// wherever on him you clicked: his head sits right under the cursor (it glides there over the first
// few px of the pull), he swings around his locked feet to follow it, and his body stretches
// between his feet and his head like a rubber band. Pull below him and his head goes
// below his feet, so he turns upside down. Let go and he's flung the opposite way from the pull,
// harder the further you pulled, using the
// normal throw physics (launch() in ./drag.js, so the Fling power slider applies). He glides,
// bounces off the screen edges, wobbles back upright and lands as usual.
//
// A plain right-CLICK (no pull) still opens his dialogue box (drag.js turns 'contextmenu' into a
// 'pet:right-clicked' event, see ../dialogue/). On Windows 'contextmenu' comes on mouse-up; if you
// pulled, we swallow it so the dialogue box doesn't pop up after a slingshot. If it ever arrives
// while the button is still down, we hold it until mouse-up and only open the box if you didn't pull.
// (Hoop Shot, ../events/hoopShot.js, has its own right-click slingshot inside its game; this one
// never runs during games or other scripted events, so they never overlap.)
//
// Works ANY time he's not in a game/event: standing, walking, following, fleeing, mid-hop, or
// flying through the air after a throw or a slingshot (catch him mid-flight and sling him again).
// The lock is taken where his feet and head are DRAWN the moment the pull starts (his spin
// included), so he never jumps when you grab him on the move. Like a grab, it respects moods: a
// star that can't be picked up (mad) can't be slingshotted either.
// Owns pet.mode 'sling' while pulling.
import { launch } from './drag.js';
import { rulesFor } from './moods.js';
import { rand, cancelJump } from './motion.js';

// ---- Tuning ----
const PULL_SLOP = 6; // px of pull before it counts as a slingshot (less = a right-click)
const MAX_PULL = 200; // px: pulling further than this doesn't add power
// You probably clicked somewhere on him other than his head. Over the first GRAB_SNAP px of the
// pull his head glides onto the cursor (no jump); after that it stays right under it.
const GRAB_SNAP = 40;
// His length (feet to head) is kept within these, × his height. Past them his head stays on the
// line from his feet toward the cursor, at that length.
const MIN_LENGTH = 0.5;
const MAX_LENGTH = 3;
const LAUNCH_PER_PX = 8; // "hand" speed (px/s) per px of pull; scaled by Fling power like a throw
const LAUNCH_SPIN = [3, 8]; // rad/s at full pull (random direction)
const TREMBLE_FROM = 0.75; // tension above which he trembles
const TREMBLE_PX = 1.5;
// Rubber-band wobble on release: his stretch springs back past normal and oscillates, dying out
// (a damped spring on the stretch, along his body as he spins). It starts from exactly the
// stretch he had (no jump on release). Frequency in wobbles per second, DAMPING 0…1 (lower = more
// wobbles). The squash side is softened by SQUASH_SOFT so a big stretch doesn't flatten him on
// the first swing back (a 2.2× release bottoms out around 0.5×).
const WOBBLE_HZ = 5;
const WOBBLE_DAMPING = 0.07; // low = dramatically wobbly (lots of big swings, ~2s to settle)
const SQUASH_SOFT = 1;
// Spring offset → drawn stretch: as-is when stretched, eased off when squashed.
const wobbleStretch = (x) => (x >= 0 ? 1 + x : 1 + x / (1 - SQUASH_SOFT * x));
// The behaviors' own modes. Anything else belongs to a game or scripted event: hands off.
// 'toss' = flying after a throw/slingshot, so you can catch him mid-air.
const SLING_MODES = ['idle', 'walk', 'follow', 'flee', 'toss'];

let pressing = false; // right button down on him
let pulled = false; // pulled past PULL_SLOP: it's a slingshot, not a click
let press = null; // cursor at press (the pull is measured from here, so where you clicked on him doesn't matter)
let cursor = null; // latest cursor
let headRest = null; // the top of his head (as drawn) when the pull started: the grab point
let feet = null; // the bottom-middle of his sprite (as drawn) when the pull started: pinned
let lastStretch = 1; // his stretch on the last pulled frame (where the release wobble starts)
let wobble = null; // { x, v } after a release: stretch offset from normal and its speed
let menuWaiting = false; // a contextmenu arrived while the button was still down
let swallowNextMenu = false; // a slingshot just ended: eat the contextmenu that follows

function reset(ctx) {
  pressing = false;
  pulled = false;
  ctx.pet.warp = null;
}

function release(ctx) {
  const { pet } = ctx;
  const px = cursor.x - press.x;
  const py = cursor.y - press.y;
  const dist = Math.min(MAX_PULL, Math.hypot(px, py));
  const tension = dist / MAX_PULL;
  const len = Math.hypot(px, py) || 1;
  // Flung the opposite way from the pull.
  const vx = (-px / len) * dist * LAUNCH_PER_PX;
  const vy = (-py / len) * dist * LAUNCH_PER_PX;
  // Snap: start the rubber-band wobble from exactly how stretched (or squashed) he was.
  // (Inverse of wobbleStretch on the squash side, so the first frame matches what was drawn.)
  const d = lastStretch - 1;
  wobble = { x: d >= 0 ? d : d / (1 + SQUASH_SOFT * d), v: 0 };
  launch(ctx, { vx, vy, spin: (Math.random() < 0.5 ? -1 : 1) * rand(...LAUNCH_SPIN) * tension });
  ctx.log('slingshot', { pull: Math.round(dist), angle: Math.round((Math.atan2(-py, -px) * 180) / Math.PI) });
}

export default {
  name: 'slingshot',

  init(ctx) {
    const { petEl, pet } = ctx;

    petEl.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      const canSling = SLING_MODES.includes(pet.mode) && rulesFor(pet).grabbable !== false;
      if (!canSling) return; // plain right-click behavior (menu)
      pressing = true;
      pulled = false;
      press = { x: e.clientX, y: e.clientY };
      cursor = { ...press };
      ctx.setPinned(true); // keep click-through off while the cursor leaves him (see clickThrough.js)
      // (The lock points are taken when the pull actually starts, below: he may still be moving.)
    });

    window.addEventListener('mousemove', (e) => {
      if (!pressing) return;
      // Lost right-button mouseup (no button held any more): let go the normal way. (Person 3)
      if (e.buttons === 0) {
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: e.clientX, clientY: e.clientY, button: 2 }));
        return;
      }
      cursor = { x: e.clientX, y: e.clientY };
      if (!pulled && Math.hypot(cursor.x - press.x, cursor.y - press.y) > PULL_SLOP) {
        // Still allowed? (an event may have taken him over since the press)
        if (!SLING_MODES.includes(pet.mode)) return;
        pulled = true;
        // Lock where his feet and head are DRAWN right now: from his middle (idle bob included),
        // turned by his current spin (around his middle: his feet are along (−sin r, cos r)), and
        // stretched by any wobble still going (pet.warp: × stretch along its angle, ÷ √stretch across),
        // exactly like pet.js draws him.
        const half = pet.size / 2;
        const r = pet.rotation || 0;
        const cx = pet.x + half;
        const cy = pet.y + (pet.bob || 0) + half;
        let vx = -Math.sin(r) * half; // middle → feet
        let vy = Math.cos(r) * half;
        if (pet.warp && pet.warp.stretch !== 1) {
          const s = pet.warp.stretch;
          const dx = Math.cos(pet.warp.angle);
          const dy = Math.sin(pet.warp.angle);
          const along = vx * dx + vy * dy;
          const px = vx - dx * along;
          const py = vy - dy * along;
          vx = dx * along * s + px / Math.sqrt(s);
          vy = dy * along * s + py / Math.sqrt(s);
        }
        feet = { x: cx + vx, y: cy + vy };
        headRest = { x: cx - vx, y: cy - vy };
        wobble = null; // a leftover release wobble ends here
        pet.warp = null;
        cancelJump(); // stop a hop in progress
        pet.mode = 'sling'; // flying (toss) stops: drag.js only moves him in 'toss'
        ctx.log('slingshot-pull', {});
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 2 || !pressing) return;
      ctx.setPinned(false);
      const wasSling = pulled && pet.mode === 'sling';
      if (wasSling) {
        release(ctx);
        swallowNextMenu = true; // the contextmenu that Windows sends right after mouse-up
        setTimeout(() => { swallowNextMenu = false; }, 400);
      } else if (menuWaiting) {
        // It was just a click after all: open the dialogue box the same way drag.js does.
        ctx.petEl.dispatchEvent(new CustomEvent('pet:right-clicked'));
      }
      menuWaiting = false;
      reset(ctx);
    });

    // Runs before drag.js's menu handler (capture phase on window).
    window.addEventListener('contextmenu', (e) => {
      if (swallowNextMenu) {
        swallowNextMenu = false;
        e.preventDefault();
        e.stopPropagation();
      } else if (pressing) {
        // Button still down: can't tell click from slingshot yet. Decide on mouse-up.
        menuWaiting = true;
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (wobble && !pulled) {
      // Released: rubber-band wobble while he flies (damped spring on his stretch, along his body).
      if (pet.mode === 'drag' || pet.mode === 'sling') {
        wobble = null; // grabbed (or a new pull): stop wobbling
        if (pet.mode === 'drag') pet.warp = null;
      } else {
        const w = 2 * Math.PI * WOBBLE_HZ;
        // Semi-implicit Euler in small steps keeps the spring stable at any frame rate.
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          wobble.v += (-w * w * wobble.x - 2 * WOBBLE_DAMPING * w * wobble.v) * h;
          wobble.x += wobble.v * h;
        }
        if (Math.abs(wobble.x) < 0.004 && Math.abs(wobble.v) < 0.05) {
          wobble = null;
          pet.warp = null;
        } else {
          // Along his body: the head points along (sin r, -cos r), i.e. at angle r − 90°.
          pet.warp = { angle: pet.rotation - Math.PI / 2, stretch: wobbleStretch(wobble.x) };
        }
      }
    }
    if (!pulled) return;
    if (pet.mode !== 'sling') { reset(ctx); return; } // something else took over (an event)

    // Pull = how far the cursor has moved since the press (where on him you clicked doesn't matter).
    const px = cursor.x - press.x;
    const py = cursor.y - press.y;
    const raw = Math.hypot(px, py);
    const dist = Math.min(MAX_PULL, raw);
    const tension = dist / MAX_PULL;

    const k = tension > TREMBLE_FROM ? (tension - TREMBLE_FROM) / (1 - TREMBLE_FROM) : 0;

    // His head (the top-middle pixel) is held by the cursor: it sits right under it, after gliding
    // over from wherever you clicked during the first GRAB_SNAP px. Trembles when really stretched.
    const offset = Math.max(0, 1 - raw / GRAB_SNAP); // 1 at the press … 0 once snapped
    const headX = cursor.x + (headRest.x - press.x) * offset + rand(-TREMBLE_PX, TREMBLE_PX) * k;
    const headY = cursor.y + (headRest.y - press.y) * offset + rand(-TREMBLE_PX, TREMBLE_PX) * k;

    // His feet (the bottom-middle pixel) are locked; his body spans feet → head. Below his feet
    // the line points down, so he's upside down. Length kept within MIN/MAX_LENGTH.
    let vx = headX - feet.x;
    let vy = headY - feet.y;
    let len = Math.hypot(vx, vy);
    if (len < 0.001) { vx = 0; vy = -1; len = 1; }
    const ux = vx / len;
    const uy = vy / len;
    const stretch = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, len / pet.size));
    lastStretch = stretch;
    const bodyLen = stretch * pet.size;

    // rotation 0 = head up; the head points along (sin r, -cos r) = (ux, uy).
    const r = Math.atan2(ux, -uy);
    // His middle is halfway between his feet and his head; we draw him centered there, turned
    // and stretched along the body, so his feet land exactly on the pinned point.
    const cx = feet.x + (ux * bodyLen) / 2;
    const cy = feet.y + (uy * bodyLen) / 2;
    pet.x = cx - pet.size / 2;
    pet.y = cy - pet.size / 2;
    pet.bob = 0;
    pet.squash = 1;
    pet.rotation = r;
    // Stretch along his body (feet ↔ head), around his middle.
    pet.warp = { angle: Math.atan2(uy, ux), stretch };
  },
};
