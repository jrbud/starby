// Pet renderer entry: builds the shared `ctx`, starts every behavior, runs the frame loop.
// SHARED FILE — to add a behavior, create a file in ./behaviors and register it in
// ./behaviors/index.js; to add an event (a scripted sequence like tag), add it to
// ./events/index.js. You shouldn't need to edit this file for either.
import { drawSprite } from '../shared/sprite.js';
import { createBubble } from './bubble.js';
import { initClickThrough, setPinned } from './clickThrough.js';
import { BEHAVIORS } from './behaviors/index.js';
import { createClock } from './core/clock.js';
import { createScheduler } from './core/scheduler.js';
import { createEventLog } from './core/eventLog.js';
import { createEventRunner } from './events/index.js';
import { clampToScreen } from './behaviors/motion.js';
import { createFrames, DEFAULT_SET } from './frames.js';
import { createAccessoryArt, drawWorn, anchorAt, OVERHANG } from './accessories.js';
import { createFloaters } from './floaters.js';

const api = window.sprite;
const petEl = document.getElementById('pet');
const canvas = document.getElementById('sprite');
const stage = document.getElementById('stage');
const bubbleEl = document.getElementById('bubble');
const bubble = createBubble(bubbleEl);

// How big Starby is on screen, in css px. Everything else (hit box, ground, drag physics,
// starbits, prompts, labels) is sized from pet.size, so changing this one number is enough.
const SIZE = 96;
const ART = 2048; // the art's canvas size (frames and accessories)
const CSS_PER_ART = SIZE / ART;

// The canvas holds his frame (SIZE×SIZE, exactly over the #pet box) plus room around it for
// worn accessories that stick out (a raised lollipop, a hat). It's drawn at a higher internal
// resolution (PX canvas px per css px) so the art stays crisp at 125%/150%/200% scaling.
// pointer-events: none, so the extra room never blocks clicks: only the #pet box is clickable.
const PX = Math.max(2, window.devicePixelRatio || 1);
const PAD = { top: OVERHANG.top * CSS_PER_ART, side: OVERHANG.side * CSS_PER_ART, bottom: OVERHANG.bottom * CSS_PER_ART };
const RES = Math.round(SIZE * PX); // his frame, in canvas px
canvas.width = Math.round((SIZE + 2 * PAD.side) * PX);
canvas.height = Math.round((SIZE + PAD.top + PAD.bottom) * PX);
Object.assign(canvas.style, {
  position: 'absolute',
  left: `${-PAD.side}px`,
  top: `${-PAD.top}px`,
  width: `${SIZE + 2 * PAD.side}px`,
  height: `${SIZE + PAD.top + PAD.bottom}px`,
  pointerEvents: 'none',
  zIndex: '1',
  // Squash/stretch pivots at his feet: bottom-center of the #pet box (overrides pet.css).
  transformOrigin: `${PAD.side + SIZE / 2}px ${PAD.top + SIZE}px`,
});
bubbleEl.style.zIndex = '2'; // speech bubble stays in front of hats
// The clickable box (#pet, the `.hit` element) follows SIZE too, overriding the 64px in pet.css.
petEl.style.width = `${SIZE}px`;
petEl.style.height = `${SIZE}px`;

// Starby's hand-drawn PNG frames (see ./frames.js) and accessories (./accessories.js).
const frames = createFrames(RES);
const accessoryArt = createAccessoryArt(RES);

/**
 * Shared pet state. Behaviors read and write this; pet.js renders it every frame.
 * mode: 'idle' | 'walk' | 'follow' | 'flee' | 'drag' | 'toss' | 'tag'  (add more as needed)
 *   'tag' is set by the tag event (./events/tag.js) while it runs.
 */
const pet = {
  x: 200,
  y: 0,
  size: SIZE,
  mode: 'idle',
  facing: 1, // 1 = right, -1 = left (direction logic only; the art isn't mirrored, see render)
  bob: 0, // vertical offset in px (idle bobbing, hops)
  squash: 1, // 1 = normal; <1 squashed, >1 stretched
  rotation: 0, // radians, clockwise, around the star's center (drag/toss spin)
  lookX: 0, // -1..1 eye direction (only the old drawn star used it; the PNGs have painted eyes)
  blink: false, // (old drawn star only; blinks/closed eyes are in the PNG frames now)
  face: 'happy', // which PNG frames to show; set every frame by behaviors/mood.js
  frameFile: 'idle-1', // which PNG file is on screen right now (accessories follow its pose)
  lookUp: false, // set by events (e.g. a star shower) to make him look up
  // colorSet = folder in assets/sprite/ for the equipped color ('sunny' for 'color-sunny',
  // or the item's `set`, e.g. 'bubblegum' for color-pink).
  // accessories = what he's wearing, as accessory values (e.g. ['tophat']). A list so several
  // can be worn at once later; for now the save holds one (see shopCatalog.js / stateSchema.js).
  look: { color: '#ffd84a', colorSet: DEFAULT_SET, accessory: 'none', accessories: [] },
};

// Usable screen area: the whole display minus the taskbar, wherever the taskbar is (bottom,
// top, left or right), in this window's coordinates: { left, top, right, bottom }.
// WINDOWS QUIRK: the pet window covers the whole display, taskbar included, so its own size
// says nothing about the taskbar. Chromium reports the work area as screen.availLeft/availTop/
// availWidth/availHeight in screen coordinates; the window sits at the display's top-left, so
// subtracting window.screenX/Y converts. Read live, so moving the taskbar while running is
// picked up on the next call.
function workArea() {
  const s = window.screen;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const within = (v, max) => Math.max(0, Math.min(max, v));
  const left = within(Number.isFinite(s.availLeft) ? s.availLeft - window.screenX : 0, W);
  const top = within(Number.isFinite(s.availTop) ? s.availTop - window.screenY : 0, H);
  const right = Math.min(W, left + (s.availWidth || W));
  const bottom = Math.min(H, top + (s.availHeight || H));
  return { left, top, right, bottom };
}
// Kept for existing code: "ground" = lowest y for the star's top-left (just above a bottom
// taskbar), and the usable area's right edge. New code should prefer ctx.area() / petBounds().
const groundY = () => workArea().bottom - SIZE;
const stageWidth = () => workArea().right;

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
  area: workArea, // usable screen area { left, top, right, bottom } (taskbar on any side)
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
  // Scripted events (./events/) — not to be confused with the event *log* above
  startEvent: (name, reason) => eventRunner.start(name, reason), // → true if it started
  stopEvent: (result) => eventRunner.stop(result),
  activeEvent: () => eventRunner.active(), // → name or null
  // Shop try-on: show this accessory value instead of the equipped one (null = back to normal).
  previewAccessory: (value) => setPreviewAccessory(value),
  // Shop try-on for colors/skins: show this color item id instead of the equipped one (null = back).
  previewColor: (id) => setPreviewColor(id),
};

const eventRunner = createEventRunner(ctx);

// Open DevTools on the pet window and inspect these, e.g. starby.events.all(), starby.startEvent('tag')
window.starby = {
  clock, scheduler, events, pet,
  area: workArea, // usable screen area right now (taskbar excluded)
  startEvent: (name = 'tag') => eventRunner.start(name, 'devtools'),
  stopEvent: () => eventRunner.stop('devtools'),
};

// ---- Look (equipped shop items → what we draw) ----
let prevState = null;

// Log starbits, purchases and equips by comparing each new state with the previous one.
// Done here so starbits.js / the shop don't each need their own logging.
function logStateChanges(prev, next) {
  if (!prev) return;
  if (next.starbits !== prev.starbits) {
    log('starbits', { delta: next.starbits - prev.starbits, total: next.starbits });
  }
  for (const id of next.owned) if (!prev.owned.includes(id)) log('buy', { item: id });
  for (const slot of Object.keys(next.equipped)) {
    if (next.equipped[slot] !== prev.equipped[slot]) log('equip', { slot, item: next.equipped[slot] });
  }
}

// Shop try-on (events/shop.js → ctx.previewAccessory): an accessory value shown INSTEAD of the
// equipped one while you browse the shop, or null for "what he's really wearing". Never saved.
let previewAccessory = null;
let lastState = null;

function setPreviewAccessory(value) {
  previewAccessory = value || null;
  if (lastState) applyLook(lastState);
}

// Same for colors/skins: a color item id (e.g. 'color-pink') shown instead of the equipped
// color while you browse the shop. Never saved; only Equip changes state.equipped.color.
let previewColorId = null;

function setPreviewColor(id) {
  previewColorId = id || null;
  if (lastState) applyLook(lastState);
}

function applyState(state) {
  logStateChanges(prevState, state);
  prevState = structuredClone(state);
  lastState = state;
  applyLook(state);
}

function applyLook(state) {
  const byId = (id) => ctx.catalog.find((item) => item.id === id);
  const tryColor = previewColorId && byId(previewColorId)?.slot === 'color' ? previewColorId : null;
  const colorId = tryColor || state.equipped.color || `color-${DEFAULT_SET}`;
  const accessory = previewAccessory ?? byId(state.equipped.accessory)?.value ?? pet.look.accessory;
  pet.look = {
    color: byId(colorId)?.value ?? pet.look.color,
    // Each shop color is a PNG set: assets/sprite/<set>/. An item can name its folder with
    // `set` (e.g. color-pink → 'bubblegum'); otherwise it's the id minus "color-".
    colorSet: byId(colorId)?.set ?? colorId.replace(/^color-/, ''),
    accessory,
    // A list, so wearing several later only changes how this list is filled.
    accessories: accessory && accessory !== 'none' ? [accessory] : [],
  };
  // Load that color's frames in the background (missing files fall back to sunny meanwhile).
  frames.loadAll(pet.look.colorSet);
  floaters.setActive(pet.look.accessories);
}

// ---- Where things are on screen ----
const center = () => ({ x: pet.x + SIZE / 2, y: pet.y + pet.bob + SIZE / 2 });

// A body point (accessories.js anchor, e.g. 'lhand') on screen, for the frame shown right now,
// through the same transform the canvas gets in render() (squash about his feet, then the spin
// about his middle), so e.g. the balloon string stays tied to his hand while he swings.
function anchorOnScreen(name) {
  const a = anchorAt(pet.frameFile || 'idle-1', name);
  if (!a) return null;
  const px = a.x * CSS_PER_ART; // in the #pet box, css px
  const py = a.y * CSS_PER_ART;
  const qx = (px - SIZE / 2) / Math.sqrt(pet.squash); // scale(1/√squash, squash) about the feet
  const qy = (py - SIZE) * pet.squash + SIZE / 2; // ...then translateY(+half)
  const c = Math.cos(pet.rotation);
  const s = Math.sin(pet.rotation);
  return {
    x: pet.x + SIZE / 2 + qx * c - qy * s,
    y: pet.y + pet.bob + SIZE + qx * s + qy * c - SIZE / 2, // rotate, then translateY(-half)
  };
}

// Balloon, UFO and star trail (./floaters.js): behind him, following with a lag.
const floaters = createFloaters({
  stage, petEl, art: accessoryArt, size: () => SIZE, anchor: anchorOnScreen, center,
});

// ---- Render ----
const g = canvas.getContext('2d');
g.imageSmoothingQuality = 'high';
let shownFace = null; // face currently on screen...
let faceSince = 0; // ...since this time (ms), so its frames alternate from the start
let fallback = null; // the old drawn star, only if the PNGs can't load

function render(now, dt) {
  const { x, y, bob, squash, look, rotation } = pet;
  petEl.style.transform = `translate(${x}px, ${y + bob}px)`;
  // The canvas's transform-origin is his feet (set above). Rotation goes around his middle
  // instead: shift up half a size, rotate, shift back. Only the canvas rotates, so the speech
  // bubble stays upright. Worn accessories are in the canvas, so they spin/squash with him.
  // No mirroring by pet.facing: the PNGs face the viewer, and walking left/right has its own
  // frames (frames.js 'left' / 'right'). Mirroring would flip the wink and tongue to the wrong side.
  const half = SIZE / 2;
  canvas.style.transform =
    `translateY(${-half}px) rotate(${rotation}rad) translateY(${half}px) ` +
    `scale(${1 / Math.sqrt(squash)}, ${squash})`;

  // Which frame: pet.face (mood.js), alternating from when that face appeared.
  const face = pet.face || 'happy';
  if (face !== shownFace) {
    shownFace = face;
    faceSince = now;
  }
  const picked = frames.pick(face, look.colorSet, (now - faceSince) / 1000);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const ox = PAD.side * PX; // where his frame box starts in the canvas
  const oy = PAD.top * PX;
  if (picked) {
    pet.frameFile = picked.file;
    // Frames come out of frames.js already lined up, with his feet on the bottom edge.
    g.drawImage(picked.img, ox, oy, RES, RES);
    if (look.accessories.length) {
      const u = RES / ART; // worn accessories are placed in art units
      g.setTransform(u, 0, 0, u, ox, oy);
      drawWorn(g, accessoryArt, look.accessories, picked.file, now / 1000);
    }
  } else {
    // No PNG loaded (art missing or failed to load): fall back to the old drawn star so he's
    // never invisible. Should only ever happen if assets/sprite/ is missing.
    if (!fallback) {
      fallback = document.createElement('canvas');
      fallback.width = RES;
      fallback.height = RES;
    }
    drawSprite(fallback, { ...look });
    g.drawImage(fallback, ox, oy, RES, RES);
  }
  floaters.update(dt, now / 1000);
}

// ---- Boot ----
async function boot() {
  ctx.catalog = await api.getCatalog();
  applyState(await api.getState());
  api.onStateChanged(applyState);

  // Load his standing frames before he first appears (no flash of an empty or old star);
  // the rest of the faces keep loading in the background.
  await frames.loadEssentials(pet.look.colorSet);
  await frames.loadEssentials(DEFAULT_SET);
  frames.loadAll(DEFAULT_SET).then(() => accessoryArt.loadAll()); // accessories appear once loaded

  pet.x = workArea().left + 200;
  pet.y = groundY();
  initClickThrough();
  window.addEventListener('mousemove', (e) => {
    ctx.cursor.x = e.clientX;
    ctx.cursor.y = e.clientY;
  });

  // Every read-only system event (clipboard, idle, power, time of day) goes in the log.
  api.onSystemEvent((evt) => log('system', evt));

  // Commands from the main process, e.g. the right-click menu's "Play tag".
  api.onPetCommand?.((cmd) => {
    if (cmd && cmd.type === 'start-event') eventRunner.start(cmd.name, 'menu');
    // Right-click → Developer: call a debug helper on window.starby (see src/main/ipc.js).
    if (cmd && cmd.type === 'starby' && typeof window.starby[cmd.fn] === 'function') {
      const result = window.starby[cmd.fn](...(cmd.args || []));
      log('dev-command', { fn: cmd.fn, result: typeof result === 'object' ? 'object' : String(result) });
    }
  });

  log('app-start', { at: new Date(clock.startedAt).toISOString() });
  for (const b of BEHAVIORS) b.init?.(ctx);

  let last = performance.now();
  let lastMode = pet.mode;
  const onTick = (tick) => {
    scheduler.run(tick); // timed events first
    for (const b of BEHAVIORS) b.onTick?.(ctx, tick); // then behavior decisions
    eventRunner.onTick(tick); // then the active event, which gets the final say
  };

  const frame = (now) => {
    const realDt = (now - last) / 1000;
    last = now;
    // Ticks follow real time (see core/clock.js); motion uses a clamped dt so a stall
    // doesn't teleport the star.
    clock.advance(realDt, onTick);
    const dt = Math.min(0.05, realDt);
    for (const b of BEHAVIORS) b.update?.(ctx, dt);
    eventRunner.update(dt);
    // Taskbar moved (or the screen changed) while he was sitting still: step out from under it.
    if (pet.mode === 'idle') {
      const kept = clampToScreen(ctx, pet.x, pet.y);
      pet.x = kept.x;
      pet.y = kept.y;
    }

    if (pet.mode !== lastMode) {
      // Skip routine idle↔walk switches (walks are logged as 'walk' already) to keep the log useful.
      const routine = ['idle', 'walk'].includes(lastMode) && ['idle', 'walk'].includes(pet.mode);
      if (!routine) log('mode', { from: lastMode, to: pet.mode });
      lastMode = pet.mode;
    }

    render(now, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
