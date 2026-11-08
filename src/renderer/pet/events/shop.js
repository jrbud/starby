// SHOP — while the shop window is open, Starby runs into its display box (the square above the
// Buy button) and stands there, still. He leaves when the shop is closed or minimized.
//
// Driven by commands from the main process (src/main/windows/shopWindow.js):
//   { type: 'shop-park', x, y }  the box's center in this window's coordinates. Starts the
//                                event, or re-aims it (the shop window was moved).
//   { type: 'shop-release' }     shop closed / minimized: hand him back.
//   { type: 'shop-say', text }   the shop wants him to say something (browsing, can't afford...).
//   { type: 'shop-preview', accessory }  try-on: wear this accessory value while browsing
//                                (null = what he really has on). Removed again when the shop
//                                closes/minimizes; only Buy/Equip make it stick (that's saved
//                                state, which pet.js shows once the preview is cleared).
//   { type: 'shop-preview-color', color }  same for colors/skins: show this color item id
//                                (e.g. 'color-pink' = the bubblegum skin); null = equipped color.
//
// He owns the star via pet.mode = 'shop', so behaviors stand down (they only act on modes they
// know): no wandering, no flinching, no idle chatter, and starbits.js drops nothing in 'shop'.
// You can still grab and throw him; when he lands he runs straight back to the box.
// Priority 20: opening the shop interrupts a game of tag (10).

import { approach, cancelJump } from '../behaviors/motion.js';

// What he says after Settings → "Reset progress".
const RESET_LINES = ['My accessories... :(', 'You lost your starbits! :(', "Where'd my stuff go? :("];

const RUN_SPEED = 420; // px/s top speed on the way to the box
const ACCEL = 6; // 1/s, how fast he gets up to speed
const ARRIVE = 1.5; // px: close enough, snap into place
const FREE_MODES = ['idle', 'walk', 'follow', 'flee']; // landed after a throw, etc. → go back

let box = null; // { x, y } center of the shop's display box, in this window's coordinates
let shopOpen = false; // between 'shop-park' and 'shop-release'
let speed = 0;
let arrived = false;
let endFn = null;

function setTarget(ctx, cmd) {
  box = { x: cmd.x, y: cmd.y };
  arrived = false;
}

// Where his top-left goes so he's centered in the box. Worked out from his CURRENT size every
// frame, so changing "Starby size" in Settings while the shop is open keeps him centered.
function spotFor(pet) {
  const half = pet.size / 2;
  // Keep him inside this window (the box may be partly off the primary display).
  const maxX = window.innerWidth - pet.size;
  const maxY = window.innerHeight - pet.size;
  return {
    x: Math.max(0, Math.min(maxX, box.x - half)),
    y: Math.max(0, Math.min(maxY, box.y - half)),
  };
}

export default {
  name: 'shop',
  category: 'system',
  priority: 20,

  init(ctx) {
    ctx.api.onPetCommand?.((cmd) => {
      if (!cmd) return;
      if (cmd.type === 'shop-park') {
        setTarget(ctx, cmd);
        shopOpen = true;
        if (ctx.activeEvent() !== 'shop') ctx.startEvent('shop', 'shop-open');
      } else if (cmd.type === 'shop-release') {
        shopOpen = false;
        box = null;
        ctx.previewAccessory?.(null); // take off anything he was only trying on
        ctx.previewColor?.(null);
        endFn?.('shop-closed');
      } else if (cmd.type === 'shop-preview') {
        ctx.previewAccessory?.(typeof cmd.accessory === 'string' ? cmd.accessory : null);
      } else if (cmd.type === 'shop-preview-color') {
        ctx.previewColor?.(typeof cmd.color === 'string' ? cmd.color : null);
      } else if (cmd.type === 'shop-say' && typeof cmd.text === 'string') {
        ctx.say(cmd.text, 2800);
      } else if (cmd.type === 'progress-reset') {
        // Settings → "Reset progress" just wiped his starbits and shop items (src/main/ipc.js).
        ctx.say(RESET_LINES[Math.floor(Math.random() * RESET_LINES.length)], 3500);
        ctx.log('progress-reset', {});
      }
    });
  },

  // Every tick, even when not running: if the shop is open but he isn't in it (the launch intro,
  // priority 100, was still playing when the shop opened, or something higher interrupted),
  // keep asking until he's free. Without this he never went into the box.
  watch(ctx) {
    if (shopOpen && box && ctx.activeEvent() !== 'shop') ctx.startEvent('shop', 'shop-open');
  },

  start(ctx, end) {
    endFn = end;
    speed = 0;
    arrived = false;
    const { pet } = ctx;
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'shop';
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (!box) return;
    if (pet.mode === 'drag' || pet.mode === 'toss') {
      arrived = false; // grabbed or thrown: wait, then run back
      speed = 0;
      return;
    }
    if (FREE_MODES.includes(pet.mode)) {
      pet.mode = 'shop';
      cancelJump(); // a hop that started before we took over (e.g. a startle) is dropped
    }
    if (pet.mode !== 'shop') return;

    // In 'shop' mode no behavior eases his body back to normal, so do it here. Without this, a
    // throw's landing squish (drag.js sets squash 0.85; idle.js only eases it in 'idle') stuck
    // around and he ran back into the box stretched wide.
    pet.bob = 0;
    pet.rotation = 0;
    pet.squash = approach(pet.squash, 1, dt, 10);
    const target = spotFor(pet);
    if (arrived) {
      pet.x = target.x;
      pet.y = target.y;
      return;
    }

    const dx = target.x - pet.x;
    const dy = target.y - pet.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE) {
      pet.x = target.x;
      pet.y = target.y;
      arrived = true;
      speed = 0;
      ctx.log('shop-parked', { x: Math.round(pet.x), y: Math.round(pet.y) });
      return;
    }
    // Speed up toward RUN_SPEED, slow down for the last bit so he doesn't overshoot.
    speed += (RUN_SPEED - speed) * Math.min(1, ACCEL * dt);
    const step = Math.min(dist, speed * dt, dist * 0.5 + 60 * dt);
    pet.x += (dx / dist) * step;
    pet.y += (dy / dist) * step;
    pet.facing = dx < 0 ? -1 : 1;
    // Running pose (mood.js picks faces earlier in the frame; the event gets the final say).
    if (Math.abs(dx) > 4 && !ctx.isSpeaking()) pet.face = dx < 0 ? 'left' : 'right';
  },

  // Closing/minimizing ('shop-release') clears the target and try-ons. If he was only
  // interrupted, the target stays so watch() can send him back once he's free.
  stop(ctx) {
    const { pet } = ctx;
    endFn = null;
    if (!shopOpen) {
      ctx.previewAccessory?.(null);
      ctx.previewColor?.(null);
    }
    if (pet.mode === 'shop') pet.mode = 'idle'; // free to wander again
  },
};
