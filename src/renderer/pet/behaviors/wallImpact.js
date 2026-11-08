// Wall impact effects: when a throw slams him into a screen edge, play the hand-drawn effects
// (../effects.js, art in assets/effects/) right where he hit:
//   impact     the red crash lines, at the wall, in front of him
//   dust       a puff kicked up off the wall, behind him
//   starcloud  a couple of small star clouds drifting away from the wall, twinkling
// All of them swap frames 1/2 quickly and fade in/out. Bigger and longer for harder hits.
//
// Triggered by drag.js's 'impact' log entry { side, speed }, which it only logs for hard hits
// (soft bumps stay clean). The art is drawn for one orientation, so it's turned to face the wall:
//   impact: drawn for a wall on his RIGHT → mirrored for the left wall, rotated for top/bottom
//   dust / starcloud: drawn sitting on the floor → rotated so the "floor" is the wall he hit
import { createEffects } from '../effects.js';

const SOFT = 700; // px/s into the wall: drag.js's softest logged impact...
const HARD = 2500; // ...and its hardest (full squash)
const MAX_LIVE = 12; // don't pile up effects in a corner ping-pong

// Per wall: rotation for the impact lines (drawn for a right wall) and for the floor-based art
// (dust/stars, drawn on the floor), plus the direction pointing back into the screen.
const WALLS = {
  right: { impact: 0, floor: -90, inward: { x: -1, y: 0 } },
  left: { impact: 0, mirror: true, floor: 90, inward: { x: 1, y: 0 } },
  // At the top his box pokes a little past the screen edge (drag.js lets his head touch it), so
  // the crash lines move in a touch to stay on screen.
  top: { impact: -90, floor: 180, inward: { x: 0, y: 1 }, push: -0.12 },
  // His legs fill the bottom of his box, so on the floor the crash lines move down to his feet.
  bottom: { impact: 90, floor: 0, inward: { x: 0, y: -1 }, push: 0.14 },
};

let fx = null;

function onImpact(ctx, { side, speed }) {
  const wall = WALLS[side];
  if (!wall || !fx) return;
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
  const push = (wall.push || 0) * S; // nudged toward the wall where his body is in the way
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
  for (const side2 of [-1, 1]) {
    const C = S * (0.45 + 0.15 * Math.random()) * big;
    const spread = side2 * S * (0.25 + 0.15 * Math.random());
    fx.play('starcloud', {
      x: hit.x + along.x * spread + n.x * S * 0.25,
      y: hit.y + along.y * spread + n.y * S * 0.25,
      size: C,
      rotate: wall.floor + (Math.random() - 0.5) * 40,
      life: 0.6 + 0.2 * k,
      every: 0.12,
      drift: { x: n.x * S * 0.4 + along.x * spread * 0.5, y: n.y * S * 0.4 + along.y * spread * 0.5 },
      grow: -0.2,
    });
  }
  ctx.log('impact-fx', { side, strength: Math.round(k * 100) / 100 });
}

export default {
  name: 'wall-impact',

  init(ctx) {
    fx = createEffects({ stage: ctx.stage, petEl: ctx.petEl });
    fx.preload(['impact', 'dust', 'starcloud']);
    ctx.events.onEntry((e) => {
      if (e.type === 'impact') onImpact(ctx, e.data);
    });
    // DevTools: starby.impactFx('left', 2000) plays the effects as if he hit that wall.
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.impactFx = (side = 'right', speed = 2000) => onImpact(ctx, { side, speed });
    }
  },

  update(ctx, dt) {
    fx?.update(dt);
  },
};
