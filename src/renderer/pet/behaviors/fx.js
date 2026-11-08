// Effects director: plays the hand-drawn effects (../effects.js, art in assets/effects/) for
// things that happen to Starby. Every effect swaps its frames 1/2 quickly and fades in/out;
// sizes are relative to his size, so they scale with him.
//
//   wall hit     drag.js 'impact'      crash lines at the wall (in front), a dust puff off the
//                                      wall (behind), two small twinkling star clouds drifting away
//   swat         drag.js 'swat'        small crash lines on the side your hand came from
//   woken up     mood.js (shaken / thrown awake)  a small burst of star clouds
//   shop         pet.js 'buy' / 'equip'           a bigger burst of star clouds
// Nothing plays while he's hushed (a video call / fullscreen app, events/hush.js).
//
// The art is drawn for one direction, so it's turned to fit:
//   impact     crash lines drawn for a wall on his RIGHT
//   dust/stars drawn sitting on the floor
// DevTools: starby.impactFx('left', 2000), starby.fx('burst') / ('wake') / ('swat').
import { createEffects } from '../effects.js';

// ---- Tuning ----
const SOFT = 700; // px/s into a wall: drag.js's softest logged impact...
const HARD = 2500; // ...and its hardest (full squash)
const MAX_LIVE = 24; // cap so a corner ping-pong can't pile up effects
const SHOP_DEDUPE = 1.2; // seconds: buying then equipping right away = one burst

// Per wall: rotation for the crash lines (drawn for a right wall) and for the floor-based art
// (dust/stars), the direction pointing back into the screen, and a nudge toward the wall.
const WALLS = {
  right: { impact: 0, floor: -90, inward: { x: -1, y: 0 } },
  left: { impact: 0, mirror: true, floor: 90, inward: { x: 1, y: 0 } },
  // At the top his box pokes a little past the screen edge (drag.js lets his head touch it), so
  // the crash lines move in a touch to stay on screen.
  top: { impact: -90, floor: 180, inward: { x: 0, y: 1 }, push: -0.12 },
  // His legs fill the bottom of his box, so on the floor the crash lines move down to his feet.
  bottom: { impact: 90, floor: 0, inward: { x: 0, y: -1 }, push: 0.14 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const deg = (rad) => (rad * 180) / Math.PI;

let fx = null;
let lastShopBurst = -Infinity;

const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.bob + pet.size / 2 });

// ---- Wall hit ----
function wallHit(ctx, { side, speed }) {
  const wall = WALLS[side];
  if (!wall) return;
  const { pet } = ctx;
  const S = pet.size;
  const k = Math.max(0, Math.min(1, (speed - SOFT) / (HARD - SOFT))); // 0 = soft, 1 = hardest
  const big = 1 + 0.3 * k;
  const cx = pet.x + S / 2;
  const cy = pet.y + S / 2;
  const n = wall.inward;
  const along = { x: Math.abs(n.y), y: Math.abs(n.x) }; // direction along the wall
  // The point on the wall where he hit (middle of the side of his box touching it), kept on the
  // screen (his box can poke past the top edge).
  const hit = { x: cx - n.x * (S / 2), y: cy - n.y * (S / 2) };
  const a = ctx.area?.();
  if (a) {
    hit.x = Math.max(a.left, Math.min(a.right, hit.x));
    hit.y = Math.max(a.top, Math.min(a.bottom, hit.y));
  }

  // 1. Crash lines, over his box (the art places them at his edge), in front of him.
  const push = (wall.push || 0) * S;
  fx.play('impact', {
    x: cx - n.x * push, y: cy - n.y * push, size: S * 1.1 * big, rotate: wall.impact, mirror: Boolean(wall.mirror),
    life: 0.35 + 0.15 * k, every: 0.06, front: true,
  });
  if (fx.count() > MAX_LIVE) return;

  // 2. Dust kicked up off the wall: the art's floor (near its bottom edge) sits on the wall.
  const D = S * 1.25 * big;
  fx.play('dust', {
    x: hit.x + n.x * D * 0.43, y: hit.y + n.y * D * 0.43, size: D, rotate: wall.floor,
    life: 0.55 + 0.2 * k, every: 0.1, drift: { x: n.x * S * 0.15, y: n.y * S * 0.15 }, grow: 0.15,
  });

  // 3. A couple of small star clouds puffing out of the dust, drifting away from the wall.
  for (const s of [-1, 1]) {
    const spread = s * S * rand(0.25, 0.4);
    fx.play('starcloud', {
      x: hit.x + along.x * spread + n.x * S * 0.25,
      y: hit.y + along.y * spread + n.y * S * 0.25,
      size: S * rand(0.45, 0.6) * big,
      rotate: wall.floor + rand(-20, 20),
      life: 0.6 + 0.2 * k,
      every: 0.12,
      drift: { x: n.x * S * 0.4 + along.x * spread * 0.5, y: n.y * S * 0.4 + along.y * spread * 0.5 },
      grow: -0.2,
    });
  }
  ctx.log('impact-fx', { side, strength: Math.round(k * 100) / 100 });
}

// ---- Swat: small crash lines on the side your hand came from ----
function swat(ctx) {
  const { pet, cursor } = ctx;
  const c = centerOf(pet);
  // Crash lines are drawn for his right side; turn them toward the cursor (where the hand was).
  const angle = cursor.x > -1000 ? Math.atan2(cursor.y - c.y, cursor.x - c.x) : 0;
  fx.play('impact', { x: c.x, y: c.y, size: pet.size * 0.85, rotate: deg(angle), life: 0.3, every: 0.05, front: true });
}

// ---- Star cloud burst (woken up / shop) ----
function burst(ctx, count, sizeK, distK) {
  const { pet } = ctx;
  const S = pet.size;
  const c = centerOf(pet);
  const turn = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    fx.play('starcloud', {
      x: c.x + ux * S * 0.3, y: c.y + uy * S * 0.3, size: S * sizeK * rand(0.85, 1.15), rotate: rand(-30, 30),
      life: rand(0.65, 0.85), every: 0.12, drift: { x: ux * S * distK, y: uy * S * distK }, grow: -0.15,
      front: i % 2 === 1, // some in front, some behind: a burst all around him
    });
  }
}

export default {
  name: 'fx',

  init(ctx) {
    fx = createEffects({ stage: ctx.stage, petEl: ctx.petEl });
    fx.preload(['impact', 'dust', 'starcloud']);
    ctx.events.onEntry((e) => {
      if (ctx.pet.hushed) return;
      if (e.type === 'impact') wallHit(ctx, e.data);
      else if (e.type === 'swat') swat(ctx);
      else if (e.type === 'mood' && e.data.to === 'happy' && /shaken awake|thrown awake/.test(e.data.reason || '')) {
        burst(ctx, 4, 0.5, 0.55);
      } else if ((e.type === 'buy' || e.type === 'equip') && ctx.clock.seconds - lastShopBurst > SHOP_DEDUPE) {
        lastShopBurst = ctx.clock.seconds;
        burst(ctx, 6, 0.6, 0.8);
      }
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.impactFx = (side = 'right', speed = 2000) => wallHit(ctx, { side, speed });
      window.starby.fx = (what = 'burst') => {
        if (what === 'swat') swat(ctx);
        else if (what === 'wake') burst(ctx, 4, 0.5, 0.55);
        else burst(ctx, 6, 0.6, 0.8);
        return what;
      };
    }
  },

  update(ctx, dt) {
    fx?.update(dt);
  },
};
