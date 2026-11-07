// Pet renderer entry: builds the shared `ctx`, starts every behavior, runs the frame loop.
// SHARED FILE — to add a behavior, create a file in ./behaviors and register it in
// ./behaviors/index.js. You shouldn't need to edit this file for that.
import { drawSprite } from '../shared/sprite.js';
import { createBubble } from './bubble.js';
import { initClickThrough, setPinned } from './clickThrough.js';
import { BEHAVIORS } from './behaviors/index.js';
import { createClock } from './core/clock.js';
import { createScheduler } from './core/scheduler.js';
import { createEventLog } from './core/eventLog.js';

const api = window.sprite;
const petEl = document.getElementById('pet');
const canvas = document.getElementById('sprite');
const stage = document.getElementById('stage');
const bubble = createBubble(document.getElementById('bubble'));

const SIZE = 64;

/**
 * Shared pet state. Behaviors read and write this; pet.js renders it every frame.
 * mode: 'idle' | 'walk' | 'drag'  (add more as needed, e.g. 'sleep')
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

// Session clock, timed events and event log (see ./core/). Session only: reset every launch.
const clock = createClock();
const scheduler = createScheduler(clock);
const { log, events } = createEventLog(clock);

const ctx = {
  api,
  pet,
  petEl,
  stage,
  cursor: { x: -9999, y: -9999 }, // last known cursor position (forwarded mousemove)
  catalog: [],
  groundY,
  stageWidth,
  say: (text, ms) => {
    bubble.say(text, ms);
    log('say', { text });
  },
  isSpeaking: () => bubble.isShowing(),
  setPinned,
  // Ticks & timed events
  clock, // clock.tick, clock.seconds (since app opened)
  after: scheduler.after, // after(seconds, fn, label) → id
  every: scheduler.every, // every(seconds, fn, label) → id
  cancel: scheduler.cancel, // cancel(id)
  // Event log
  log, // log(type, data)
  events, // events.last(type), .since(seconds), .count(type, withinSeconds), .all(), .onEntry(fn)
};

// Open DevTools on the pet window and inspect these, e.g. starby.events.all()
window.starby = { clock, scheduler, events, pet };

// ---- Look (equipped shop items → what we draw) ----
let prevState = null;

// Log stardust, purchases and equips by comparing each new state with the previous one.
// Done here so stardust.js / the shop don't each need their own logging.
function logStateChanges(prev, next) {
  if (!prev) return;
  if (next.stardust !== prev.stardust) {
    log('stardust', { delta: next.stardust - prev.stardust, total: next.stardust });
  }
  for (const id of next.owned) if (!prev.owned.includes(id)) log('buy', { item: id });
  for (const slot of Object.keys(next.equipped)) {
    if (next.equipped[slot] !== prev.equipped[slot]) log('equip', { slot, item: next.equipped[slot] });
  }
}

function applyState(state) {
  logStateChanges(prevState, state);
  prevState = structuredClone(state);
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

  // Every read-only system event (clipboard, idle, power, time of day) goes in the log.
  api.onSystemEvent((evt) => log('system', evt));

  log('app-start', { at: new Date(clock.startedAt).toISOString() });
  for (const b of BEHAVIORS) b.init?.(ctx);

  let last = performance.now();
  let lastMode = pet.mode;
  const onTick = (tick) => {
    scheduler.run(tick); // timed events first
    for (const b of BEHAVIORS) b.onTick?.(ctx, tick); // then behavior decisions
  };

  const frame = (now) => {
    const realDt = (now - last) / 1000;
    last = now;
    // Ticks follow real time (see core/clock.js); motion uses a clamped dt so a stall
    // doesn't teleport the star.
    clock.advance(realDt, onTick);
    const dt = Math.min(0.05, realDt);
    for (const b of BEHAVIORS) b.update?.(ctx, dt);

    if (pet.mode !== lastMode) {
      // Skip routine idle↔walk switches (walks are logged as 'walk' already) to keep the log useful.
      const routine = ['idle', 'walk'].includes(lastMode) && ['idle', 'walk'].includes(pet.mode);
      if (!routine) log('mode', { from: lastMode, to: pet.mode });
      lastMode = pet.mode;
    }

    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
