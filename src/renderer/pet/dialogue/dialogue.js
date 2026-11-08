// THE DIALOGUE: right-click Starby and he talks to you. His line goes in a box above his head,
// and the answers burst out of him into a horseshoe of boxes around him (3 down each side; an odd
// last answer sits centered under him). What he says and the answers live in ./tree.js (plain
// data, at most MAX_OPTIONS answers per node); this file shows them and runs the one you pick.
//
//   right-click him   if he's too close to an edge for everything to fit, he first slides away
//                     from it (quickly), then the boxes burst out. Right-click again closes it.
//   pick an answer    the other boxes snap back into him; the picked one pops. If it opens another
//                     menu, the new boxes burst out FROM the picked box into a fresh horseshoe.
//   while it's open   he stands still (only if he was just hanging around: idle / walk / follow).
//                     If an event owns him (focus, hush), he isn't moved: the boxes shift instead.
//   it closes when    you pick an answer that ends it, he's picked up, an event takes over, or
//                     you leave it alone for AUTO_CLOSE seconds (the cursor over a box keeps it open)
//   one talkbox       while it's open it holds his speech (../talkbox.js takeSpeech): the speech bubble
//                     he had up goes away as it opens, and any new line he says replaces his line
//                     here (a little pop) instead of stacking a second bubble on top.
//
// LOOK: the answers match the shop / settings windows; his line is a real speech bubble.
//   his line    a talkbox (../talkbox.js: the team's speech bubble art, sized and squished to fit,
//               boiling frame 1 ↔ 2), tail pointing down at him, dark brown text, so it stands
//               apart from the yellow answers. Same bubbles as all his other speech (../bubble.js).
//               Until the art has loaded (a moment after launch) he uses the purple box below.
//   answers     button-idle.png → button-hover.png on hover as a CSS border-image (keeps the
//               hand-drawn edge the same thickness at any size), a small grow on hover
//               (border-image keeps the hand-drawn edge the same thickness at any size)
//   text        Sour Gummy in the shop's yellow (#ffe8a3)
//   boil        frames wobble slightly like hand-drawn animation: an SVG noise displacement
//               filter on the frame art only (text stays crisp), cycling BOIL_SEEDS patterns every
//               BOIL_EVERY ms while anything is showing. Code-only: no new art, PNGs unchanged.
// Every box has the `hit` class, so click-through switches off only over the boxes themselves
// (../clickThrough.js); the gaps between them stay click-through.
// Run by events/index.js as a helper (init / watch / watchFrame).
// EVENT MENUS: events show their choices the same way (talkbox line + burst horseshoe + boil):
//   showMenu(ctx, { line, options: [{ label, onPick }] })   e.g. "wanna play pong?" [Yes!] [No]
//   setMenuLine(ctx, text)                                   update his line (e.g. a countdown)
//   closeMenu(ctx)                                           take it away (the event ended / timed out)
// An event menu never moves him (the event owns him; the boxes shift to fit instead), doesn't
// auto-close (the event has its own timer), closes when the event ends, and ignores right-clicks.
// Used by events/invite.js and events/constellation.js (the star quiz).
// DevTools: starby.dialogue() opens it, starby.dialogue('settings') opens a node directly.
import { TREE } from './tree.js';
import { requestGame } from '../events/games.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createTalkbox, loadTalkbox, talkboxReady, takeSpeech, releaseSpeech, onSpeechBubbleShown } from '../talkbox.js';

// ---- Tuning ----
export const MAX_OPTIONS = 6; // answers per node (tree.js keeps to this; extras are dropped)
const GAP = 14; // px between Starby and the side boxes
const ROW_GAP = 9; // px between rows of boxes
const FAN = 12; // px each higher row sits further out (the horseshoe opens upward)
const SAY_GAP = 10; // px between the top boxes / his head and the speech box
const EDGE = 10; // px kept clear of the usable screen's edges
const AUTO_CLOSE = 20; // seconds with no hover before it closes on its own
const ROOM_SPEED = 18; // how snappily he slides away from an edge (approach rate)
const ROOM_MAX_MS = 450; // ...and the longest that may take before the boxes burst anyway
const IN_MS = 230; // burst out: each box flies to its spot with a little overshoot
const STAGGER_MS = 28; // ...one after another
const OUT_MS = 150; // unpicked boxes snapping back into him
const POP_MS = 170; // the picked box popping
const SAY_MS = 200; // speech box popping up
const ASSETS = '../../../assets'; // relative to src/renderer/pet/index.html
const BOIL_EVERY = 140; // ms per boil step (~7 fps, the classic hand-drawn boil rate)
const BOIL_SEEDS = [3, 11, 27];
const BOIL_STRENGTH = 2.6; // px the frame edges wobble (keep it subtle)
const BOIL_GRAIN = 0.04; // noise frequency: lower = broader, gentler waves
// The button art (1871×687) has ~55px of empty margin, then the hand-drawn border, then the flat
// fill from ~120px in: slice there, so the edges keep their look and the fill stretches.
const SLICE = 120;
const TALK_FONT = 16; // px, his line in the dialogue
const TALK_MAX = 210; // px: his line wraps past this

// Events and what a right-click does during them.
// hoop-shot: right-drag is its slingshot (hoopShot.js also swallows right-clicks while it runs).
const IGNORE = ['intro', 'shop', 'hoop-shot']; // nothing: the launch animation / he's in the shop window
const SNAP_OUT = ['dance', 'invite']; // stop it, then talk normally
const CALM = ['focus', 'hush']; // talk normally, the event keeps going (he stays parked/quiet)
// anything else (games, sky events) → the 'busy' node: keep going, or stop it

// ---- State ----
let root = null; // container for everything (holds the --boil variable)
let say = null; // { el, textEl, w, h, slot, kind, start, dur }
let boxes = []; // { el, option, w, h, slot, from, kind, start, dur }
let ext = null; // how far the whole layout reaches from his middle: { left, right, top, bottom }
let open = null; // { id, event }: node showing, and the event running when it opened
let room = null; // { x, y, until }: sliding him away from an edge before the burst
let froze = false; // we put him in 'dialogue' mode (and must hand him back)
let quietFor = 0;
let boilTimer = null;
let ctxRef = null;
// While open, his ctx.say lines land here (replacing his line) instead of a second bubble.
const takeLine = (text) => { if (ctxRef && open && say) replaceLine(ctxRef, text, true); };
let boilStep = 0;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (p, k = 1.5) => 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2;
const easeIn = (p) => p * p * p;
// His standing middle (ignores hops/bob, so the boxes don't bounce when he does, e.g. invites).
const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });

// ---- Styles + boil filters ----
function injectStyles() {
  if (document.getElementById('dialogue-styles')) return;
  const style = document.createElement('style');
  style.id = 'dialogue-styles';
  style.textContent = `
    @font-face {
      font-family: 'Sour Gummy';
      src: local('Sour Gummy'), url('${ASSETS}/fonts/SourGummy.ttf') format('truetype');
      font-weight: 100 900;
      font-display: swap;
    }
    .dlg-root {
      --dialogue-yellow: #ffe8a3; /* shop.css --yellow */
      position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none;
      font-family: 'Sour Gummy', 'Segoe UI', system-ui, sans-serif; color: var(--dialogue-yellow);
    }
    .dlg-slot {
      /* max-content: the root is 0 wide, so without it text would wrap at every word. */
      position: absolute; left: 0; top: 0; width: max-content; opacity: 0; pointer-events: none;
      transform-origin: 50% 50%; will-change: transform, opacity;
      filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.28));
    }
    .dlg-say {
      max-width: 240px; padding: 13px 18px 14px; isolation: isolate; text-align: center;
      font-size: 15px; font-weight: 700; line-height: 1.25; transform-origin: 50% 100%;
    }
    .dlg-frame {
      position: absolute; inset: 0; z-index: -1; pointer-events: none;
      border: 12px solid transparent;
      border-image: url('${ASSETS}/menuIcons/button-hover.png') ${SLICE} fill / 12px stretch;
      filter: var(--boil, none);
    }
    .dialogue-option {
      position: relative; isolation: isolate; display: block; cursor: pointer;
      border: 0; background: none; margin: 0; padding: 9px 16px 10px;
      font: inherit; font-size: 14px; font-weight: 700; color: var(--dialogue-yellow);
      text-align: center; white-space: nowrap; transition: transform 110ms ease-out;
    }
    .dialogue-option::before {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      border: 9px solid transparent;
      border-image: url('${ASSETS}/menuIcons/button-idle.png') ${SLICE} fill / 9px stretch;
      filter: var(--boil, none);
    }
    .dialogue-option:hover { transform: scale(1.06); }
    .dialogue-option:hover::before { border-image-source: url('${ASSETS}/menuIcons/button-hover.png'); }
  `;
  document.head.appendChild(style);
  // Load both button images now, so the first hover doesn't flash while one loads.
  for (const f of ['button-idle', 'button-hover']) new Image().src = `${ASSETS}/menuIcons/${f}.png`;
}

function injectBoilFilters() {
  if (document.getElementById('dialogue-boil-filters')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'dialogue-boil-filters';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = BOIL_SEEDS.map((seed, i) => `
    <filter id="dialogue-boil-${i}" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="${BOIL_GRAIN}" numOctaves="2" seed="${seed}" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="${BOIL_STRENGTH}" xChannelSelector="R" yChannelSelector="G" />
    </filter>`).join('');
  document.body.appendChild(svg);
}

function startBoil() {
  if (boilTimer) return;
  const step = () => {
    boilStep = (boilStep + 1) % BOIL_SEEDS.length;
    root?.style.setProperty('--boil', `url(#dialogue-boil-${boilStep})`); // answers: noise boil
  };
  step();
  boilTimer = setInterval(step, BOIL_EVERY);
}

function stopBoil() {
  clearInterval(boilTimer);
  boilTimer = null;
}

function build(ctx) {
  injectStyles();
  injectBoilFilters();
  root = document.createElement('div');
  root.className = 'dlg-root';
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  ctx.stage.appendChild(root);
}

// ---- Layout (offsets from his middle) ----
// Horseshoe: answers alternate left, right, left, right... top to bottom, the upper rows a little
// further out; an odd last answer goes centered under him. The speech box sits above it all.
function layout(ctx) {
  const S = ctx.pet.size;
  const n = boxes.length;
  const pairs = Math.floor(n / 2);
  const H = Math.max(0, ...boxes.map((b) => b.h));
  const rowStep = H + ROW_GAP;
  for (let i = 0; i < pairs * 2; i++) {
    const b = boxes[i];
    const row = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const out = S / 2 + GAP + (pairs - 1 - row) * FAN;
    b.slot = { x: side * (out + b.w / 2), y: (row - (pairs - 1) / 2) * rowStep };
  }
  if (n % 2) {
    const b = boxes[n - 1];
    const lastRowY = pairs ? ((pairs - 1) / 2) * rowStep : 0;
    b.slot = { x: 0, y: Math.max(S / 2 + ROW_GAP + b.h / 2, pairs ? lastRowY + rowStep : 0) };
  }
  let left = S / 2; let right = S / 2; let top = -S / 2; let bottom = S / 2;
  for (const b of boxes) {
    left = Math.max(left, b.w / 2 - b.slot.x);
    right = Math.max(right, b.slot.x + b.w / 2);
    top = Math.min(top, b.slot.y - b.h / 2);
    bottom = Math.max(bottom, b.slot.y + b.h / 2);
  }
  // Speech above it all; a talkbox bubble is shifted so its tail tip points at his middle.
  say.slot = { x: (0.5 - say.tailFrac) * say.w, y: top - SAY_GAP - say.h / 2 };
  top = say.slot.y - say.h / 2;
  left = Math.max(left, say.w / 2 - say.slot.x);
  right = Math.max(right, say.slot.x + say.w / 2);
  ext = { left, right, top: -top, bottom };
}

// Where his middle must be for everything to fit on screen (or as close as it gets).
function fitCenter(ctx, c) {
  const a = ctx.area();
  const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  return {
    x: fit(c.x, a.left + ext.left + EDGE, a.right - ext.right - EDGE),
    y: fit(c.y, a.top + ext.top + EDGE, a.bottom - ext.bottom - EDGE),
  };
}

// ---- Animation state per box ----
function stateOf(b, now) {
  const p = b.dur ? clamp01((now - b.start) / b.dur) : 1;
  if (b.kind === 'wait') return { x: b.from.x, y: b.from.y, s: 0.35, o: 0, p };
  if (b.kind === 'in') {
    const e = easeOutBack(p);
    return { x: lerp(b.from.x, b.slot.x, e), y: lerp(b.from.y, b.slot.y, e), s: 0.35 + 0.65 * e, o: clamp01(p * 3), p };
  }
  if (b.kind === 'out') {
    const e = easeIn(p);
    return { x: lerp(b.from.x, b.to.x, e), y: lerp(b.from.y, b.to.y, e), s: 1 - 0.75 * e, o: 1 - e, p };
  }
  if (b.kind === 'pop') {
    const e = 1 - (1 - p) ** 2;
    return { x: b.from.x, y: b.from.y, s: 1 + 0.18 * e, o: 1 - e, p };
  }
  return { x: b.slot.x, y: b.slot.y, s: 1, o: 1, p: 1 }; // 'shown'
}

function setKind(b, kind, now, dur, extra = {}) {
  Object.assign(b, { kind, start: now, dur }, extra);
}

// ---- Building a node ----
const resolve = (ctx, line) => {
  if (typeof line === 'function') return line(ctx);
  if (Array.isArray(line)) return line[Math.floor(Math.random() * line.length)];
  return line || '';
};

// His line: the talkbox bubble if its art is loaded, else the purple box (button art).
function makeSay() {
  const base = { w: 0, h: 0, slot: { x: 0, y: 0 }, from: { x: 0, y: 0 }, kind: 'wait', start: 0, dur: 0, tailFrac: 0.5 };
  if (talkboxReady()) {
    const tb = createTalkbox({ fontSize: TALK_FONT, maxText: TALK_MAX, padX: 12, padY: 5, className: 'dlg-slot hit' });
    root.appendChild(tb.el);
    return { ...base, el: tb.el, tb, talk: true };
  }
  const el = document.createElement('div');
  el.className = 'dlg-slot dlg-say hit';
  const frame = document.createElement('div');
  frame.className = 'dlg-frame';
  const textEl = document.createElement('div');
  el.append(frame, textEl);
  root.appendChild(el);
  return { ...base, el, textEl, talk: false };
}

function setSayText(ctx, text) {
  if (say.talk && say.tb.setText(text)) {
    say.tailFrac = say.tb.tailFrac;
    say.el.style.transformOrigin = `${(say.tailFrac * 100).toFixed(1)}% 100%`; // pops from the tail
    return;
  }
  say.textEl.textContent = text;
}

function makeBox(ctx, option, from) {
  const el = document.createElement('div');
  el.className = 'dlg-slot hit';
  const btn = document.createElement('button');
  btn.className = 'dialogue-option';
  btn.textContent = option.label;
  el.appendChild(btn);
  root.appendChild(el);
  const b = { el, option, w: 0, h: 0, slot: { x: 0, y: 0 }, from: { ...from }, kind: 'wait', start: 0, dur: 0 };
  // mousedown so it answers on the first press even though the pet window isn't focusable.
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.button === 0 && open && (b.kind === 'shown' || b.kind === 'in')) choose(ctx, b);
  });
  return b;
}

const measure = (b) => { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; };

// Show node `id`; its boxes burst out from `origin` (an offset from his middle).
// `id` is a node id in TREE, or a node object (event menus: { line, options, menu: true }).
function showNode(ctx, id, origin = { x: 0, y: 0 }) {
  const node = typeof id === 'string' ? TREE[id] : id;
  if (!node) { close(ctx); return; }
  if (typeof id !== 'string') id = node.id || 'menu';
  let options = (node.options || []).filter((o) => !o.show || o.show(ctx));
  if (options.length > MAX_OPTIONS) {
    console.warn(`dialogue: node '${id}' has ${options.length} answers; only ${MAX_OPTIONS} fit (tree.js)`);
    options = options.slice(0, MAX_OPTIONS);
  }
  if (!say) say = makeSay();
  setSayText(ctx, resolve(ctx, node.line));
  boxes.push(...options.map((o) => makeBox(ctx, o, origin)));
  const fresh = boxes.filter((b) => b.kind === 'wait');
  // Measure (they're laid out but invisible), then place everything.
  measure(say);
  for (const b of fresh) measure(b);
  const live = boxes;
  boxes = fresh; // layout only the new node's boxes...
  layout(ctx);
  boxes = live; // ...keep the leaving ones animating
  open = { id, event: open ? open.event : ctx.activeEvent(), menu: Boolean(node.menu) };
  quietFor = 0;
  // Too close to an edge? Slide him away first (only if he's ours to move), then burst.
  const c = centerOf(ctx.pet);
  const fit = fitCenter(ctx, c);
  if (froze && Math.hypot(fit.x - c.x, fit.y - c.y) > 1) {
    room = { x: fit.x - ctx.pet.size / 2, y: fit.y - ctx.pet.size / 2, until: performance.now() + ROOM_MAX_MS };
  } else {
    burst(performance.now());
  }
}

function burst(now) {
  room = null;
  let i = 0;
  for (const b of boxes) {
    if (b.kind === 'wait') setKind(b, 'in', now + STAGGER_MS * i++, IN_MS);
  }
  setKind(say, 'in', now, SAY_MS, { from: { ...say.slot } });
}

// ---- Open / pick / close ----
function openDialogue(ctx, id = null) {
  const { pet } = ctx;
  if (pet.mode === 'drag' || pet.mode === 'toss') return false;
  let active = ctx.activeEvent();
  if (IGNORE.includes(active)) return false;
  if (SNAP_OUT.includes(active)) {
    ctx.stopEvent('right-click');
    active = ctx.activeEvent();
  }
  if (!root) build(ctx);
  clearAll(); // anything still animating away from last time
  // Hold him still while you talk (only if he was just hanging around).
  if (pet.mode === 'idle' || pet.mode === 'walk' || pet.mode === 'follow') {
    pet.mode = 'dialogue';
    froze = true;
  }
  root.style.display = '';
  startBoil();
  open = null;
  const node = id || (active && !CALM.includes(active) ? 'busy' : 'start');
  showNode(ctx, node);
  takeSpeech(takeLine); // his speech bubble goes away; new lines come here
  ctx.log('dialogue-open', { node, event: active });
  return true;
}

// Unpicked boxes snap back into him; the picked one (if any) pops where it is.
function retire(picked, now) {
  for (const b of boxes) {
    if (b.kind === 'out' || b.kind === 'pop') continue;
    const st = stateOf(b, now);
    if (b === picked) setKind(b, 'pop', now, POP_MS, { from: { x: st.x, y: st.y } });
    else setKind(b, 'out', now, OUT_MS, { from: { x: st.x, y: st.y }, to: { x: 0, y: 0 } });
  }
}

function choose(ctx, picked) {
  const { option } = picked;
  const now = performance.now();
  ctx.log('dialogue-choice', { node: open?.id, label: option.label, action: option.action || null, next: option.next || null });
  if (option.onPick) { // an event menu's answer
    close(ctx, picked);
    option.onPick();
    return;
  }
  if (option.next) {
    const origin = { ...stateOf(picked, now) };
    retire(picked, now);
    runAction(ctx, option.action);
    showNode(ctx, option.next, { x: origin.x, y: origin.y });
    return;
  }
  close(ctx, picked); // hand him back first, so an event (game, focus) can take him
  runAction(ctx, option.action);
  if (option.say) ctx.say(option.say, 2200);
}

function close(ctx, picked = null) {
  if (!open) return;
  open = null;
  releaseSpeech(takeLine); // lines go back to his speech bubble
  room = null;
  const now = performance.now();
  retire(picked, now);
  if (say && say.kind !== 'out') {
    const st = stateOf(say, now);
    setKind(say, 'out', now, OUT_MS, { from: { x: st.x, y: st.y }, to: { x: 0, y: -ctx.pet.size / 2 } });
  }
  if (froze && ctx.pet.mode === 'dialogue') ctx.pet.mode = 'idle';
  froze = false;
}

function clearAll() {
  for (const b of boxes) b.el.remove();
  boxes = [];
  if (say?.tb) say.tb.remove(); else say?.el.remove();
  say = null;
}

// ---- Actions (an answer's `action`) ----
function runAction(ctx, action) {
  if (!action || action === 'close') return;
  const api = ctx.api || {};
  const active = ctx.activeEvent();
  if (action === 'shop') api.openShop?.();
  else if (action === 'settings') api.openSettings?.();
  else if (action === 'admin') api.openAdminSettings?.();
  else if (action === 'quit') api.quitApp?.();
  else if (action === 'devtools') api.openPetDevTools?.();
  else if (action === 'focus') ctx.startEvent('focus', 'dialogue');
  else if (action === 'unfocus') { if (active === 'focus') ctx.stopEvent('done'); }
  else if (action === 'stop-event') { if (active) ctx.stopEvent('dialogue'); }
  else if (action.startsWith('game:')) {
    if (active === 'focus') ctx.stopEvent('done'); // asked to play: focus time's over
    requestGame(ctx, action.slice(5));
  } else if (action.startsWith('starby:')) {
    const [fn, ...args] = action.slice(7).split(':');
    if (typeof window.starby?.[fn] === 'function') window.starby[fn](...args);
  }
}

// ---- Drawing ----
function draw(b, anchor, now) {
  const st = stateOf(b, now);
  b.el.style.transform = `translate(${(anchor.x + st.x - b.w / 2).toFixed(1)}px, ${(anchor.y + st.y - b.h / 2).toFixed(1)}px) scale(${st.s.toFixed(3)})`;
  b.el.style.opacity = st.o.toFixed(3);
  // Clickable once it's (nearly) in place; never while flying back in.
  b.el.style.pointerEvents = (b.kind === 'shown' || (b.kind === 'in' && st.p > 0.6)) ? 'auto' : 'none';
  if (b.kind === 'in' && st.p >= 1) b.kind = 'shown';
  return (b.kind === 'out' || b.kind === 'pop') && st.p >= 1; // finished leaving
}

// ---- Event menus (see the header) ----
/** Show an event's choices like the dialogue: his `line` in a talkbox, `options` bursting out. */
export function showMenu(ctx, { line, options }) {
  if (!root) build(ctx);
  clearAll();
  if (froze && ctx.pet.mode === 'dialogue') ctx.pet.mode = 'idle'; // (the player's dialogue was open)
  froze = false; // the event owns him: never move him (fitCenter shifts the boxes instead)
  room = null;
  root.style.display = '';
  startBoil();
  open = null;
  showNode(ctx, { line, options: options.slice(0, MAX_OPTIONS), menu: true });
  takeSpeech(takeLine);
}

/** Change his line in an open event menu (the answer boxes stay put). */
export function setMenuLine(ctx, text) {
  if (open?.menu) replaceLine(ctx, text, false);
}

// Swap his line in the open dialogue/menu; the answer boxes stay put. `pop`: a little pop to show
// it's a new line (not for countdown ticks).
function replaceLine(ctx, text, pop) {
  if (!open || !say) return;
  setSayText(ctx, text);
  measure(say);
  const all = boxes;
  boxes = all.filter((b) => b.kind !== 'out' && b.kind !== 'pop');
  layout(ctx); // same boxes, same spots; just re-aims the speech box for its new size
  boxes = all;
  if (pop && say.kind === 'shown') setKind(say, 'in', performance.now(), SAY_MS, { from: { ...say.slot } });
}

/** Take an event menu away (no-op if the player's own dialogue is open instead). */
export function closeMenu(ctx) {
  if (open?.menu) close(ctx);
}

export const dialogue = {
  name: 'dialogue',

  init(ctx) {
    ctxRef = ctx;
    // His speech bubble just popped up: drop our talkbox if it's still animating away (closed).
    onSpeechBubbleShown(() => {
      if (open || !say) return;
      if (say.tb) say.tb.remove(); else say.el.remove();
      say = null;
    });
    loadTalkbox(); // (bubble.js already started it; this just makes sure)
    // drag.js turns a right-click on him into this event (instead of the old native menu).
    ctx.petEl.addEventListener('pet:right-clicked', () => {
      if (open?.menu) return; // an event is asking you something: answer with the boxes
      if (open) close(ctx);
      else openDialogue(ctx);
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.dialogue = (id) => (openDialogue(ctx, id) ? (id || 'start') : 'not now');
    }
  },

  // Every tick: close when he's taken, an event takes over, or it's been left alone too long.
  watch(ctx) {
    if (!open) return;
    const { pet, cursor } = ctx;
    const under = cursor.x > -1000 ? document.elementFromPoint(cursor.x, cursor.y) : null;
    quietFor = under && under.closest('.dlg-root') ? 0 : quietFor + TICK_SECONDS;
    const taken = pet.mode === 'drag' || pet.mode === 'toss' || (froze && pet.mode !== 'dialogue');
    const eventChanged = ctx.activeEvent() !== open.event;
    if (taken || eventChanged || (!open.menu && quietFor >= AUTO_CLOSE)) close(ctx);
  },

  // Every frame: slide him away from an edge if needed, animate and place the boxes.
  watchFrame(ctx, dt) {
    if (!root || (!say && !boxes.length)) return;
    const now = performance.now();
    const { pet } = ctx;
    if (room) {
      const k = Math.min(1, (dt || 0.016) * ROOM_SPEED);
      pet.x += (room.x - pet.x) * k;
      pet.y += (room.y - pet.y) * k;
      if (Math.hypot(room.x - pet.x, room.y - pet.y) < 1.5 || now >= room.until) {
        pet.x = room.x;
        pet.y = room.y;
        burst(now);
      }
    }
    const c = centerOf(pet);
    const anchor = ext ? fitCenter(ctx, c) : c;
    boxes = boxes.filter((b) => {
      if (!draw(b, anchor, now)) return true;
      b.el.remove();
      return false;
    });
    if (say && draw(say, anchor, now)) {
      if (say.tb) say.tb.remove(); else say.el.remove();
      say = null;
    }
    if (!open && !say && !boxes.length) {
      root.style.display = 'none';
      stopBoil();
    }
  },
};
