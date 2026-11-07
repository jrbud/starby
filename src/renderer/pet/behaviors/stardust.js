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
import { rulesFor } from './moods.js';
import { chat, lineBag } from './chatter.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PICKUP_RADIUS = 22;
const MAX_ON_SCREEN = 8;

const IMPACT_DROP_SPEED = 900; // px/s into the wall
const IMPACT_DROP_COOLDOWN = 2; // seconds between wall-hit drop bursts
const IMPACT_DROPS = [1, 3]; // how many per hit (inclusive)

const REFUSE_LINES = lineBag(['no stardust for you!', 'hmph. no sparkles.', 'not dropping anything for a poker']);

const drops = []; // { el, x, y }
let nextDropIn = rand(8, 15);
let lastImpactDropAt = -Infinity; // session seconds
let refusedThisSpell = false;

function spawnAt(ctx, x, y) {
  if (drops.length >= MAX_ON_SCREEN) return false;
  const el = document.createElement('div');
  el.className = 'stardust';
  el.style.left = `${x - 4}px`;
  el.style.top = `${y - 4}px`;
  ctx.stage.appendChild(el);
  drops.push({ el, x, y });
  return true;
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
  for (let i = 0; i < n; i++) {
    const x = clamp(cx + away[0] * rand(10, 40) + rand(-30, 30), 6, ctx.stageWidth() - 6);
    const y = clamp(cy + away[1] * rand(10, 40) + rand(-30, 30), 6, ctx.groundY() + pet.size - 6);
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
      for (let i = drops.length - 1; i >= 0; i--) {
        if (Math.hypot(e.clientX - drops[i].x, e.clientY - drops[i].y) < PICKUP_RADIUS) {
          collect(ctx, i);
        }
      }
    });
    ctx.events.onEntry((e) => {
      if (e.type === 'impact') impactDrops(ctx, e.data);
    });
  },

  update(ctx, dt) {
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
