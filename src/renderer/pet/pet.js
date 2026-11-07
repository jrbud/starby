// Pet renderer entry: builds the shared `ctx`, starts every behavior, runs the frame loop.
// SHARED FILE — to add a behavior, create a file in ./behaviors and register it in
// ./behaviors/index.js. You shouldn't need to edit this file for that.
import { drawSprite } from '../shared/sprite.js';
import { createBubble } from './bubble.js';
import { initClickThrough, setPinned } from './clickThrough.js';
import { BEHAVIORS } from './behaviors/index.js';

const api = window.sprite;
const petEl = document.getElementById('pet');
const canvas = document.getElementById('sprite');
const stage = document.getElementById('stage');
const bubble = createBubble(document.getElementById('bubble'));

const SIZE = 64;

/**
 * Shared pet state. Behaviors read and write this; pet.js renders it every frame.
 * mode: 'idle' | 'walk' | 'drag' | 'fall'  (add more as needed, e.g. 'sleep')
 */
const pet = {
  x: 200,
  y: 0,
  size: SIZE,
  mode: 'idle',
  facing: 1, // 1 = right, -1 = left
  bob: 0, // vertical offset in px (idle bobbing, hops)
  squash: 1, // 1 = normal; <1 squashed, >1 stretched
  lookX: 0, // -1..1 eye direction
  blink: false,
  look: { color: '#ffd84a', shape: 'star4', accessory: 'none' },
};

// "Ground" = just above the taskbar. screen.availHeight excludes the taskbar on Windows.
// (Assumes the taskbar is at the bottom of the primary display.)
const groundY = () => window.screen.availHeight - SIZE;
const stageWidth = () => window.innerWidth;

const ctx = {
  api,
  pet,
  petEl,
  stage,
  cursor: { x: -9999, y: -9999 }, // last known cursor position (forwarded mousemove)
  catalog: [],
  groundY,
  stageWidth,
  say: (text, ms) => bubble.say(text, ms),
  isSpeaking: () => bubble.isShowing(),
  setPinned,
};

// ---- Look (equipped shop items → what we draw) ----
function applyState(state) {
  const byId = (id) => ctx.catalog.find((item) => item.id === id);
  pet.look = {
    color: byId(state.equipped.color)?.value ?? pet.look.color,
    shape: byId(state.equipped.shape)?.value ?? pet.look.shape,
    accessory: byId(state.equipped.accessory)?.value ?? pet.look.accessory,
  };
}

// ---- Render ----
let lastDrawKey = '';
function render() {
  const { x, y, bob, squash, facing, look, lookX, blink } = pet;
  petEl.style.transform = `translate(${x}px, ${y + bob}px)`;
  canvas.style.transform = `scale(${(1 / Math.sqrt(squash)) * facing}, ${squash})`;

  // Only redraw the canvas when something visual changed.
  const key = `${look.color}|${look.shape}|${look.accessory}|${lookX.toFixed(1)}|${blink}`;
  if (key !== lastDrawKey) {
    lastDrawKey = key;
    drawSprite(canvas, { ...look, lookX: lookX * facing, blink });
  }
}

// ---- Boot ----
async function boot() {
  ctx.catalog = await api.getCatalog();
  applyState(await api.getState());
  api.onStateChanged(applyState);

  pet.y = groundY();
  initClickThrough();
  window.addEventListener('mousemove', (e) => {
    ctx.cursor.x = e.clientX;
    ctx.cursor.y = e.clientY;
  });

  for (const b of BEHAVIORS) b.init?.(ctx);

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); // seconds, clamped after tab stalls
    last = now;
    for (const b of BEHAVIORS) b.update?.(ctx, dt);
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
