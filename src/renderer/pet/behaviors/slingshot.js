// SLINGSHOT: hold the RIGHT mouse button on Starby and pull. You always hold him by the TOP OF
// HIS HEAD, wherever on him you clicked, and his FEET (the very bottom of the sprite) stay pinned
// where they were: his head follows the cursor part of the way and his body stretches between his
// feet and his head like a rubber band, turning so his head points away from his feet. Let go and
// he's flung the opposite way from the pull, harder the further you pulled, using the
// normal throw physics (launch() in ./drag.js, so the Fling power slider applies). He glides,
// bounces off the screen edges, wobbles back upright and lands as usual.
//
// A plain right-CLICK (no pull) still opens his dialogue box (drag.js turns 'contextmenu' into a
// 'pet:right-clicked' event, see ../dialogue/). On Windows 'contextmenu' comes on mouse-up; if you
// pulled, we swallow it so the dialogue box doesn't pop up after a slingshot. If it ever arrives
// while the button is still down, we hold it until mouse-up and only open the box if you didn't pull.
// (Hoop Shot, ../events/hoopShot.js, has its own right-click slingshot inside its game; this one
// only works while he's wandering, so they never overlap.)
//
// Like a grab, it respects moods: a star that can't be picked up (mad) can't be slingshotted
// either, and only works while he's just wandering around (idle / walk / follow / flee).
// Owns pet.mode 'sling' while pulling.
import { launch } from './drag.js';
import { rulesFor } from './moods.js';
import { rand } from './motion.js';

// ---- Tuning ----
const PULL_SLOP = 6; // px of pull before it counts as a slingshot (less = a right-click)
const MAX_PULL = 200; // px: pulling further than this doesn't add power
const FOLLOW = 0.35; // how far his head follows the cursor, as a fraction of the pull
const MIN_LENGTH = 0.6; // × his height: shortest he squishes (pulling his head back toward his feet)
const MAX_LENGTH = 2.2; // × his height: longest he stretches (feet to head)
const LAUNCH_PER_PX = 8; // "hand" speed (px/s) per px of pull; scaled by Fling power like a throw
const LAUNCH_SPIN = [3, 8]; // rad/s at full pull (random direction)
const TREMBLE_FROM = 0.75; // tension above which he trembles
const TREMBLE_PX = 1.5;
const SNAP_SQUASH = 0.78; // squish on release (eases back while flying)
const SLING_MODES = ['idle', 'walk', 'follow', 'flee'];

let pressing = false; // right button down on him
let pulled = false; // pulled past PULL_SLOP: it's a slingshot, not a click
let press = null; // cursor at press (the pull is measured from here, so where you clicked on him doesn't matter)
let cursor = null; // latest cursor
let headRest = null; // the top of his head at press: the grab point
let feet = null; // the bottom-center of his sprite at press: pinned while you pull
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
  pet.warp = null;
  pet.squash = SNAP_SQUASH;
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
      headRest = { x: pet.x + pet.size / 2, y: pet.y }; // top-center of his box = top of his head
      feet = { x: pet.x + pet.size / 2, y: pet.y + pet.size }; // bottom-center = his feet
      ctx.setPinned(true); // keep click-through off while the cursor leaves him (see clickThrough.js)
    });

    window.addEventListener('mousemove', (e) => {
      if (!pressing) return;
      cursor = { x: e.clientX, y: e.clientY };
      if (!pulled && Math.hypot(cursor.x - press.x, cursor.y - press.y) > PULL_SLOP) {
        pulled = true;
        pet.mode = 'sling';
        pet.rotation = 0;
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

  update(ctx) {
    const { pet } = ctx;
    if (!pulled) return;
    if (pet.mode !== 'sling') { reset(ctx); return; } // something else took over (an event)

    // Pull = how far the cursor has moved since the press (where on him you clicked doesn't matter).
    const px = cursor.x - press.x;
    const py = cursor.y - press.y;
    const raw = Math.hypot(px, py);
    const dist = Math.min(MAX_PULL, raw);
    const tension = dist / MAX_PULL;
    const dx = raw ? px / raw : 0;
    const dy = raw ? py / raw : 0;

    // His head (the grab point) follows the cursor part of the way; trembles when really stretched.
    let headX = headRest.x + dx * dist * FOLLOW;
    let headY = headRest.y + dy * dist * FOLLOW;
    if (tension > TREMBLE_FROM) {
      const k = (tension - TREMBLE_FROM) / (1 - TREMBLE_FROM);
      headX += rand(-TREMBLE_PX, TREMBLE_PX) * k;
      headY += rand(-TREMBLE_PX, TREMBLE_PX) * k;
    }

    // His feet stay pinned; his body spans feet → head. Length (as a stretch of his height) and
    // direction come from that line, kept within MIN/MAX_LENGTH (the head is pulled back onto the
    // line at that length, so the feet never move).
    let vx = headX - feet.x;
    let vy = headY - feet.y;
    let len = Math.hypot(vx, vy);
    if (len < 0.001) { vx = 0; vy = -1; len = 1; }
    const ux = vx / len;
    const uy = vy / len;
    const stretch = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, len / pet.size));
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
