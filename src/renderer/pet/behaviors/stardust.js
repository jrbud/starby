// Stardust drops: every so often the pet drops a tiny diamond near itself.
// Collected by HOVERING (cursor proximity) — no click. Stardust isn't a `.hit` element,
// so it never blocks clicks; we detect proximity from forwarded mousemove events.
// The counter is persisted in the main process (window.sprite.collectStardust).

const rand = (a, b) => a + Math.random() * (b - a);
const PICKUP_RADIUS = 22;
const MAX_ON_SCREEN = 8;

const drops = []; // { el, x, y }
let nextDropIn = rand(8, 15);

function spawn(ctx) {
  if (drops.length >= MAX_ON_SCREEN) return;
  const { pet } = ctx;
  const x = pet.x + pet.size / 2 + rand(-40, 40);
  const y = ctx.groundY() + pet.size - 10;
  const el = document.createElement('div');
  el.className = 'stardust';
  el.style.left = `${x - 4}px`;
  el.style.top = `${y - 4}px`;
  ctx.stage.appendChild(el);
  drops.push({ el, x, y });
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
  },

  update(ctx, dt) {
    if (ctx.pet.mode === 'drag') return;
    nextDropIn -= dt;
    if (nextDropIn <= 0) {
      nextDropIn = rand(8, 15);
      spawn(ctx);
    }
  },
};
