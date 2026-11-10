// LOADING MOON: shown in the top-right corner of the screen, like a moon in the sky, while the app loads, before the "Starby" title
// (events/intro.js). The team's moon (assets/events/moon.png) WAXES with progress like the real
// moon: new (dim) → crescent → half → gibbous → full, lit side growing from the right.
//
//   import { loadingMoon } from './loadingMoon.js';
//   loadingMoon.reach(0.3);        // progress 0..1 (only ever goes up)
//   await loadingMoon.finish();    // fill to full, fade out, remove (resolves when gone)
//
// It appears as soon as this module is imported (pet.js imports it first). After finish() it's
// gone for good: reach()/finish() become no-ops, so replaying the intro from DevTools still works.
//
// ART: nothing is drawn by code. Same trick as the game timer (events/countdown.js): the phases are
// a CSS mask that hides part of the PNG. Under it sits the same PNG at low opacity, so the
// "new moon" is a faint moon rather than nothing at all.
// Lives on <body> (not #stage), so the intro's `intro-prelaunch` hiding doesn't hide it, and it
// isn't `.hit`, so it stays click-through.

const MOON_ART = '../../../assets/events/moon.png'; // team art; relative to src/renderer/pet/index.html
const SIZE = 140; // px
const MARGIN = 40; // px from the top and right edges of the screen
const DIM = 0.18; // opacity of the unlit moon underneath
const EASE = 6; // how quickly the shown phase catches up with real progress (per second)
const MIN_SHOW_MS = 700; // don't flash by: stay at least this long, even if loading is instant
const FULL_HOLD_MS = 250; // linger on the full moon before fading
const FADE_MS = 350;

let root = null;
let lit = null;
let target = 0; // real progress
let shown = 0; // what the moon shows (eases toward target)
let raf = 0;
let last = 0;
let finishing = null; // Promise once finish() was called
const bornAt = performance.now();

function moonImg(opacity) {
  const img = document.createElement('img');
  img.src = MOON_ART;
  img.alt = '';
  img.draggable = false;
  img.onerror = () => console.warn(`[loading] missing moon art: ${MOON_ART}`);
  Object.assign(img.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', opacity,
  });
  return img;
}

function build() {
  root = document.createElement('div');
  root.className = 'loading-moon';
  // Up in the sky: the top-right corner of the usable area (the pet window covers the whole
  // display; avail* skips the taskbar wherever it is).
  Object.assign(root.style, {
    position: 'fixed',
    left: `${(screen.availLeft ?? 0) + screen.availWidth - SIZE - MARGIN}px`,
    top: `${(screen.availTop ?? 0) + MARGIN}px`,
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    pointerEvents: 'none',
    zIndex: '1000',
    transition: `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`,
  });
  root.append(moonImg(String(DIM)));
  lit = moonImg('1');
  root.append(lit);
  document.body.append(root);
  paint(0);
}

// Lit share f, lit from the RIGHT (waxing). Mirror of countdown.js's waning slice(): the lit right
// half plus (gibbous) or minus (crescent) a centered ellipse, the "terminator", |2f − 1| wide.
function paint(f) {
  const st = lit.style;
  if (f >= 0.999) { st.maskImage = 'none'; return; }
  if (f <= 0.001) { st.maskImage = 'linear-gradient(transparent, transparent)'; return; }
  const rx = Math.max(0.01, Math.abs(2 * f - 1) * 50);
  const half = 'linear-gradient(to left, #000 50%, transparent 50%)';
  const ellipse = `radial-gradient(ellipse ${rx.toFixed(2)}% 50% at 50% 50%, #000 99%, transparent 100%)`;
  st.maskImage = `${half}, ${ellipse}`;
  st.maskSize = '100% 100%';
  st.maskRepeat = 'no-repeat';
  st.maskComposite = f >= 0.5 ? 'add' : 'subtract';
}

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  shown += (target - shown) * Math.min(1, dt * EASE);
  if (target - shown < 0.002) shown = target;
  paint(shown);
  raf = shown < target ? requestAnimationFrame(tick) : 0; // idle until there's more to show
}

function start() {
  if (raf || !root) return;
  last = performance.now();
  raf = requestAnimationFrame(tick);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GIVE_UP_MS = 30000; // safety net: if startup breaks before finish() is called, don't stay forever

build();
start();
setTimeout(() => loadingMoon.finish(), GIVE_UP_MS);

export const loadingMoon = {
  /** Report progress, 0..1. Never goes backwards. No-op once finished. */
  reach(f) {
    if (!root || finishing) return;
    target = Math.max(target, Math.min(1, f));
    start();
  },

  /** Fill to full, hold, fade out and remove. Resolves once it's gone (immediately if it already is). */
  finish() {
    if (!root) return Promise.resolve();
    if (finishing) return finishing;
    target = 1;
    start();
    finishing = (async () => {
      const left = MIN_SHOW_MS - (performance.now() - bornAt);
      if (left > 0) await wait(left);
      while (shown < 1) await wait(16); // let the moon visibly fill up
      await wait(FULL_HOLD_MS);
      root.style.opacity = '0';
      root.style.transform = 'scale(1.15)';
      await wait(FADE_MS);
      cancelAnimationFrame(raf);
      root.remove();
      root = lit = null;
    })();
    return finishing;
  },
};
