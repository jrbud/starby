// HUSH — Starby keeps quiet and out of the way when you're busy:
//   video call   (src/main/systemReads/calls.js → { type: 'call', active })
//                he stops where he is and sits still, and says nothing
//   fullscreen   (activeWindow.js → { type: 'fullscreen', active }, a fullscreen game or video)
//                he tiptoes to the nearest bottom corner, sits still there, and says nothing
// While hushed, pet.hushed = true and pet.js's ctx.say shows nothing at all (every line goes
// through it: clicks, flinches, games, system reactions), so he's completely silent.
// You can still pick him up and move him; once you let go he settles and stays quiet.
//
// Priority 15: above the games (10), so a call starting ends a game, and the dance/star shower
// etc. can't start; below the shop window (20). Ends as soon as there's no call and no
// fullscreen app. Owns the star via pet.mode = 'hush'.
// In DevTools: starby.startEvent('hush') hushes him until starby.stopEvent().
import { approach, petBounds } from '../behaviors/motion.js';

const TIPTOE_SPEED = 160; // px/s toward the corner (quick: you just went fullscreen)
const EDGE = 8; // px in from the corner

let inCall = false;
let fullscreen = false;
let manual = false; // started from DevTools
let endHush = null;
let t = 0;

const wanted = () => inCall || fullscreen || manual;

function finish(result) {
  const end = endHush;
  endHush = null;
  end?.(result);
}

// Nearest bottom corner of the usable screen (out of the way of a fullscreen game or video).
function cornerFor(ctx) {
  const { pet } = ctx;
  const b = petBounds(ctx);
  const left = pet.x + pet.size / 2 < (b.minX + b.maxX + pet.size) / 2;
  return { x: left ? b.minX + EDGE : b.maxX - EDGE, y: b.maxY };
}

export default {
  name: 'hush',
  priority: 15,

  init(ctx) {
    ctx.events.onEntry((e) => {
      if (e.type !== 'system') return;
      if (e.data.type === 'call') inCall = Boolean(e.data.active);
      if (e.data.type === 'fullscreen') fullscreen = Boolean(e.data.active);
    });
  },

  watch(ctx) {
    if (wanted() && ctx.activeEvent() !== 'hush') ctx.startEvent('hush', inCall ? 'call' : 'fullscreen');
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endHush = end;
    t = 0;
    manual = reason === 'devtools';
    pet.hushed = true;
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'hush';
    ctx.log('hush', { call: inCall, fullscreen });
  },

  onTick() {
    if (!wanted() && t > 0.5) finish('over');
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    // Picked up / thrown: let that happen; once he's settled again, he's ours (and quiet) again.
    if (pet.mode === 'drag' || pet.mode === 'toss') return;
    if (pet.mode !== 'hush') pet.mode = 'hush';
    pet.rotation = 0;

    if (fullscreen) {
      // Tiptoe to the corner: small quick steps.
      const c = cornerFor(ctx);
      const dx = c.x - pet.x;
      const dy = c.y - pet.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, TIPTOE_SPEED * dt);
        pet.x += (dx / d) * step;
        pet.y += (dy / d) * step;
        pet.bob = -Math.abs(Math.sin(t * 14)) * 3;
        pet.squash = approach(pet.squash, 1, dt, 10);
        return;
      }
    }
    // Sitting still: just a slow, quiet breath.
    pet.bob = Math.sin(t * 1.5) * 1.5;
    pet.squash = approach(pet.squash, 1 + Math.sin(t * 1.5) * 0.015, dt, 6);
  },

  stop(ctx) {
    const { pet } = ctx;
    endHush = null;
    manual = false;
    pet.hushed = false;
    pet.bob = 0;
    if (pet.mode === 'hush') pet.mode = 'idle';
  },
};
