// Stardust drops: every so often the pet drops a tiny diamond near itself.
// Collected by HOVERING (cursor proximity) — no click. Stardust isn't a `.hit` element,
// so it never blocks clicks; we detect proximity from forwarded mousemove events.
// The counter is persisted in the main process (window.sprite.collectStardust).
//
// MOODS (hooked up by Person 3, P3-6; rules in ./moods.js):
//   stardust  drop-rate multiplier: 2 = drops come twice as fast (playful), 0 = no drops at all
//             (mad, dizzy, yawning, asleep), including wall-hit drops
//   refuses   when a drop is skipped, say "no stardust for you!" once per mood spell (mad)
//
// WALL HITS: a throw that hits a screen edge hard (drag.js logs 'impact') drops 1–3 stardust
// at the impact point. Balance guard: only hits of at least IMPACT_DROP_SPEED count, with a
// cooldown, so throwing him around can't farm stardust much faster than normal play.
// (Agree the numbers with Person 4 — shop prices assume ~5 stardust per minute.)
// GAME REWARDS (called by events, e.g. ../events/tag.js):
//   burstStardust(ctx, 7)   he shoots stardust out in a ring; it flies, slows down and lands,
//                           then is collected by hovering like any other drop
//   reclaimStardust(ctx)    every drop on screen flies back into him and disappears (not counted)
import { rulesFor } from './moods.js';
import { chat, lineBag } from './chatter.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PICKUP_RADIUS = 22;
const MAX_ON_SCREEN = 8;

// Reward bursts / reclaiming
const BURST_SPEED = [380, 620]; // px/s launch speed
const FLY_FRICTION = 4; // per second: how fast a flying drop slows down
const LAND_SPEED = 15; // px/s: below this it has landed
const PICKUP_DELAY = 0.35; // seconds after launch before a burst drop can be collected
const RECLAIM_SPEED = 700; // px/s minimum while flying back into him

const IMPACT_DROP_SPEED = 900; // px/s into the wall
const IMPACT_DROP_COOLDOWN = 2; // seconds between wall-hit drop bursts
const IMPACT_DROPS = [1, 3]; // how many per hit (inclusive)

const REFUSE_LINES = lineBag(['no stardust for you!', 'hmph. no sparkles.', 'not dropping anything for a poker']);

const drops = []; // { el, x, y, vx, vy, bornAt, reclaiming }
let nextDropIn = rand(8, 15);
let lastImpactDropAt = -Infinity; // session seconds
let refusedThisSpell = false;

// opts: { vx, vy } to launch it flying; { ignoreCap: true } for rewards (always all of them).
function spawnAt(ctx, x, y, { vx = 0, vy = 0, ignoreCap = false } = {}) {
  if (!ignoreCap && drops.length >= MAX_ON_SCREEN) return false;
  const el = document.createElement('div');
  el.className = 'stardust';
  el.style.left = `${x - 4}px`;
  el.style.top = `${y - 4}px`;
  ctx.stage.appendChild(el);
  drops.push({ el, x, y, vx, vy, bornAt: ctx.clock.seconds, reclaiming: false });
  return true;
}

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });

/** Reward: shoot `count` stardust out of him in a ring. Returns how many were made. */
export function burstStardust(ctx, count = 7) {
  const { pet } = ctx;
  const cx = pet.x + pet.size / 2;
  const cy = pet.y + pet.size / 2;
  const turn = rand(0, Math.PI * 2);
  let made = 0;
  for (let i = 0; i < count; i++) {
    const angle = turn + (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
    const speed = rand(...BURST_SPEED);
    if (spawnAt(ctx, cx, cy, { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ignoreCap: true })) made++;
  }
  ctx.log('stardust-burst', { count: made });
  return made;
}

/** Take back every drop on screen: they fly into him and vanish (not added to the count). */
export function reclaimStardust(ctx) {
  let n = 0;
  for (const d of drops) {
    if (!d.reclaiming) {
      d.reclaiming = true;
      n++;
    }
  }
  ctx.log('stardust-reclaimed', { count: n });
  return n;
}

// Every frame: flying drops slow down and land (bouncing off the usable area's edges);
// reclaimed drops fly back into him and disappear.
function animateDrops(ctx, dt) {
  const { pet } = ctx;
  const a = areaOf(ctx);
  const px = pet.x + pet.size / 2;
  const py = pet.y + pet.size / 2;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.reclaiming) {
      const dx = px - d.x;
      const dy = py - d.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(RECLAIM_SPEED, dist * 6) * dt;
      if (dist <= step + 4) {
        drops.splice(i, 1);
        d.el.classList.add('collected'); // same little fade as a pickup
        setTimeout(() => d.el.remove(), 250);
        continue;
      }
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
    } else if (Math.hypot(d.vx, d.vy) > LAND_SPEED) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const slow = Math.exp(-FLY_FRICTION * dt);
      d.vx *= slow;
      d.vy *= slow;
      if (d.x < a.left + 6 || d.x > a.right - 6) { d.x = clamp(d.x, a.left + 6, a.right - 6); d.vx = -d.vx * 0.5; }
      if (d.y < a.top + 6 || d.y > a.bottom - 6) { d.y = clamp(d.y, a.top + 6, a.bottom - 6); d.vy = -d.vy * 0.5; }
    } else {
      d.vx = 0;
      d.vy = 0;
      continue; // resting: nothing to redraw
    }
    d.el.style.left = `${d.x - 4}px`;
    d.el.style.top = `${d.y - 4}px`;
  }
}

function spawn(ctx) {
  const { pet } = ctx;
  // At the star's feet, wherever it is.
  spawnAt(ctx, pet.x + pet.size / 2 + rand(-40, 40), pet.y + pet.size - 10 + rand(-6, 6));
}

// A hard wall hit during a throw: a little burst of stardust where he hit.
function impactDrops(ctx, impact) {
  const { pet } = ctx;
  const now = ctx.clock.seconds;
  if (rulesFor(pet).stardust === 0) return; // mad / asleep etc. drop nothing
  if (impact.speed < IMPACT_DROP_SPEED || now - lastImpactDropAt < IMPACT_DROP_COOLDOWN) return;
  lastImpactDropAt = now;

  const n = IMPACT_DROPS[0] + Math.floor(Math.random() * (IMPACT_DROPS[1] - IMPACT_DROPS[0] + 1));
  // Scatter them a little off the wall he hit, so they're on screen and easy to sweep up.
  const away = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[impact.side] || [0, 0];
  const cx = pet.x + pet.size / 2;
  const cy = pet.y + pet.size / 2;
  let made = 0;
  // Keep them in the usable screen area (not under the taskbar, wherever it is).
  const a = ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + pet.size };
  for (let i = 0; i < n; i++) {
    const x = clamp(cx + away[0] * rand(10, 40) + rand(-30, 30), a.left + 6, a.right - 6);
    const y = clamp(cy + away[1] * rand(10, 40) + rand(-30, 30), a.top + 6, a.bottom - 6);
    if (spawnAt(ctx, x, y)) made++;
  }
  ctx.log('impact-drops', { count: made, side: impact.side });
}

function collect(ctx, index) {
  const [drop] = drops.splice(index, 1);
  drop.el.classList.add('collected');
  setTimeout(() => drop.el.remove(), 250);
  ctx.api.collectStardust(1);
}

export default {
  name: 'stardust',

  init(ctx) {
    window.addEventListener('mousemove', (e) => {
      const now = ctx.clock.seconds;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.reclaiming || now - d.bornAt < PICKUP_DELAY) continue; // flying back / just launched
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < PICKUP_RADIUS) {
          collect(ctx, i);
        }
      }
    });
    ctx.events.onEntry((e) => {
      if (e.type === 'impact') impactDrops(ctx, e.data);
    });
  },

  update(ctx, dt) {
    animateDrops(ctx, dt); // always, even while he's held
    const rules = rulesFor(ctx.pet);
    if (!rules.refuses) refusedThisSpell = false; // next mad spell may refuse again
    if (ctx.pet.mode === 'drag') return;

    // Playful (rate 2) counts down twice as fast. Rate 0 still counts at normal speed,
    // so a mad star "refuses" at about the moment he'd have dropped one.
    nextDropIn -= dt * Math.max(1, rules.stardust);
    if (nextDropIn <= 0) {
      nextDropIn = rand(8, 15);
      if (rules.stardust > 0) {
        spawn(ctx);
      } else if (rules.refuses && !refusedThisSpell) {
        refusedThisSpell = true;
        chat(ctx, REFUSE_LINES(), 2000, { wait: 4 });
      }
    }
  },
};
