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

const RUN_SPEED = 420; // px/s top speed on the way to the box
const ACCEL = 6; // 1/s, how fast he gets up to speed
const ARRIVE = 1.5; // px: close enough, snap into place
const FREE_MODES = ['idle', 'walk', 'follow', 'flee']; // landed after a throw, etc. → go back

let target = null; // { x, y } top-left for the star so he's centered in the box
let speed = 0;
let arrived = false;
let endFn = null;

function setTarget(ctx, cmd) {
  const { pet } = ctx;
  const half = pet.size / 2;
  // Keep him inside this window (the box may be partly off the primary display).
  const maxX = window.innerWidth - pet.size;
  const maxY = window.innerHeight - pet.size;
  target = {
    x: Math.max(0, Math.min(maxX, cmd.x - half)),
    y: Math.max(0, Math.min(maxY, cmd.y - half)),
  };
  arrived = false;
}

export default {
  name: 'shop',
  priority: 20,

  init(ctx) {
    ctx.api.onPetCommand?.((cmd) => {
      if (!cmd) return;
      if (cmd.type === 'shop-park') {
        setTarget(ctx, cmd);
        if (ctx.activeEvent() !== 'shop') ctx.startEvent('shop', 'shop-open');
      } else if (cmd.type === 'shop-release') {
        ctx.previewAccessory?.(null); // take off anything he was only trying on
        ctx.previewColor?.(null);
        endFn?.('shop-closed');
      } else if (cmd.type === 'shop-preview') {
        ctx.previewAccessory?.(typeof cmd.accessory === 'string' ? cmd.accessory : null);
      } else if (cmd.type === 'shop-preview-color') {
        ctx.previewColor?.(typeof cmd.color === 'string' ? cmd.color : null);
      } else if (cmd.type === 'shop-say' && typeof cmd.text === 'string') {
        ctx.say(cmd.text, 2800);
      }
    });
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
    if (!target) return;
    if (pet.mode === 'drag' || pet.mode === 'toss') {
      arrived = false; // grabbed or thrown: wait, then run back
      speed = 0;
      return;
    }
    if (FREE_MODES.includes(pet.mode)) pet.mode = 'shop';
    if (pet.mode !== 'shop') return;

    pet.bob = 0;
    pet.rotation = 0;
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

  stop(ctx) {
    const { pet } = ctx;
    endFn = null;
    target = null;
    ctx.previewAccessory?.(null);
    ctx.previewColor?.(null);
    if (pet.mode === 'shop') pet.mode = 'idle'; // free to wander again
  },
};
