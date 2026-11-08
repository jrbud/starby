// TALKBOXES: every line Starby says is shown in the team's hand-drawn speech bubble art
// (assets/talkbox/speech-box-<small|medium|large>-frame-1/2.png). Used by ./bubble.js (ctx.say:
// all his speech) and ./dialogue/dialogue.js (his line in the right-click dialogue).
//
//   sizing   for a line of text, pick the size (small / medium / large) whose shape wastes the
//            least space, scale it so the text fits inside the white area, and SQUISH it
//            vertically (team-approved: the art is tall and its tail long) down to MIN_SQUISH of
//            its natural height, so short lines get a short, wide bubble without empty white space.
//   boil     the artist drew two frames of each bubble; frame 1 and frame 2 swap every BOIL_EVERY
//            ms (one class on <html> flips, every talkbox follows it).
//   flip     a bubble can be flipped upside down (tail pointing UP) for when there's no room
//            above him; the text stays the right way up.
//   loading  each 4096px PNG is decoded, cropped to its bubble and shrunk ONCE to TALK_RES wide,
//            one at a time (never several full-size images in memory). The files aren't changed.
//            Until it's loaded, callers fall back to their plain box (talkboxReady() is false).

// ---- Tuning ----
const ASSETS = '../../../assets'; // relative to src/renderer/pet/index.html
const TALK_RES = 720; // px wide each cropped frame is shrunk to
const BOIL_EVERY = 140; // ms between frame swaps (matches the dialogue boxes' boil)
const MIN_SQUISH = 0.55; // a bubble may be squished down to this share of its natural height
const MIN_W = 96; // px: never narrower than this
const LOAD_DELAY = 600; // ms after startup before loading (don't compete with the first frames)

// Measured from the PNGs (4096×4096 canvas, art px): `crop` covers the bubble in both frames
// [x, y, w, h], `inner` is the white inside [left, top, right, bottom] (inside both frames'
// outlines), `tailX` the tail tip. All three share height and tail; only the width differs.
// Listed in loading order: large first (squished, it fits most lines), so talkboxes switch on as
// soon as it's in; the others join when they finish.
const TALKBOX = {
  large: { crop: [218, 986, 3572, 2042], inner: [362, 1171, 3598, 2437], tailX: 1954 },
  medium: { crop: [556, 986, 2910, 2042], inner: [709, 1164, 3269, 2436], tailX: 1944 },
  small: { crop: [888, 996, 2308, 2038], inner: [1029, 1165, 2992, 2454], tailX: 1962 },
};

const art = {}; // size → [frame1, frame2]
let loading = null;
let boilTimer = null;

export const talkboxReady = () => Object.keys(art).length > 0;

// ---- One talkbox at a time ----
// Talkboxes never overlap. While the dialogue (or an event menu) is open it TAKES his speech:
// whatever he was saying in the speech bubble disappears as it comes up, and any new ctx.say line
// replaces his line in the dialogue's talkbox instead of popping up a second bubble. Unprompted
// chatter (behaviors/chatter.js) sees him as "speaking" and waits until the dialogue closes.
let speechTaker = null; // (text) => void, set while the dialogue is open
let hideSpeechBubble = null; // registered by ./bubble.js

/** ./dialogue/dialogue.js: take over his speech (hides the speech bubble right away). */
export function takeSpeech(fn) {
  speechTaker = fn;
  hideSpeechBubble?.();
}
/** ...and give it back when the dialogue closes. */
export function releaseSpeech(fn) {
  if (speechTaker === fn) speechTaker = null;
}
/** ./bubble.js: is the dialogue holding his speech? Then send lines here. */
export const speechTakenBy = () => speechTaker;
export function registerSpeechBubble(hide) {
  hideSpeechBubble = hide;
}
// The other direction: when the speech bubble pops up, a dialogue talkbox still animating away
// (it just closed) is removed at once, so the two never overlap even for a moment.
let speechShownHooks = [];
export function onSpeechBubbleShown(fn) { speechShownHooks.push(fn); }
export function speechBubbleShown() { for (const fn of speechShownHooks) fn(); }

function injectStyles() {
  if (document.getElementById('talkbox-styles')) return;
  const style = document.createElement('style');
  style.id = 'talkbox-styles';
  style.textContent = `
    @font-face {
      font-family: 'Sour Gummy';
      src: local('Sour Gummy'), url('${ASSETS}/fonts/SourGummy.ttf') format('truetype');
      font-weight: 100 900;
      font-display: swap;
    }
    .talkbox { isolation: isolate; font-family: 'Sour Gummy', 'Segoe UI', system-ui, sans-serif; }
    .talkbox canvas {
      position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none;
    }
    .talkbox.flipped canvas { transform: scaleY(-1); }
    .talkbox .f2, .talk-alt .talkbox .f1 { visibility: hidden; }
    .talk-alt .talkbox .f2 { visibility: visible; }
    .talkbox-text {
      position: absolute; display: flex; align-items: center; justify-content: center;
      text-align: center; color: #372118; /* the bubble's outline brown */
      font-weight: 700; line-height: 1.2; white-space: normal;
    }
    .talkbox-measure {
      position: fixed; left: -9999px; top: 0; visibility: hidden; width: max-content;
      font-family: 'Sour Gummy', 'Segoe UI', system-ui, sans-serif;
      font-weight: 700; line-height: 1.2; text-align: center; pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

/** Start loading the art (once). Resolves when done. */
export function loadTalkbox() {
  if (loading) return loading;
  injectStyles();
  loading = (async () => {
    await new Promise((r) => setTimeout(r, LOAD_DELAY));
    for (const [size, def] of Object.entries(TALKBOX)) {
      const frames = [];
      for (const f of [1, 2]) {
        const img = new Image();
        img.src = `${ASSETS}/talkbox/speech-box-${size}-frame-${f}.png`;
        try {
          await img.decode();
          const [x, y, w, h] = def.crop;
          frames.push(await createImageBitmap(img, x, y, w, h, {
            resizeWidth: TALK_RES, resizeHeight: Math.round((TALK_RES * h) / w), resizeQuality: 'high',
          }));
        } catch {
          frames.length = 0; // missing / undecodable: skip this size
          break;
        }
      }
      if (frames.length === 2) art[size] = frames;
      if (talkboxReady() && !boilTimer) {
        boilTimer = setInterval(() => document.documentElement.classList.toggle('talk-alt'), BOIL_EVERY);
      }
    }
  })();
  return loading;
}

/**
 * A talkbox element. Put `.el` wherever you like (the caller positions it), then setText().
 * @param {object} o
 * @param {number} o.fontSize   px
 * @param {number} o.maxText    px: the line wraps past this width
 * @param {number} [o.padX]     px of room inside the white area, left/right
 * @param {number} [o.padY]     px of room inside the white area, top/bottom
 * @param {string} [o.className] extra classes for .el
 */
export function createTalkbox({ fontSize, maxText, padX = 10, padY = 4, className = '' }) {
  injectStyles();
  const el = document.createElement('div');
  el.className = `talkbox ${className}`.trim();
  const canvases = [document.createElement('canvas'), document.createElement('canvas')];
  canvases[0].className = 'f1';
  canvases[1].className = 'f2';
  const textEl = document.createElement('div');
  textEl.className = 'talkbox-text';
  // Padding inside the text area = the padding it was measured with, so it wraps exactly the same.
  Object.assign(textEl.style, { fontSize: `${fontSize}px`, padding: `${padY}px ${padX}px`, boxSizing: 'border-box' });
  el.append(...canvases, textEl);
  const measureEl = document.createElement('div');
  measureEl.className = 'talkbox-measure';
  Object.assign(measureEl.style, { fontSize: `${fontSize}px`, maxWidth: `${maxText}px` });
  document.body.appendChild(measureEl);

  const box = { el, w: 0, h: 0, tailFrac: 0.5, inner: null, flipped: false };

  function placeText() {
    if (!box.inner) return;
    const { left, top, width, height } = box.inner;
    // Flipped (tail up): the white area mirrors top ↔ bottom.
    const y = box.flipped ? box.h - top - height : top;
    Object.assign(textEl.style, { left: `${left}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
  }

  /** Show `text`; sizes the bubble. Returns false if the art isn't loaded (use a fallback). */
  box.setText = (text) => {
    if (!talkboxReady()) return false;
    measureEl.textContent = text;
    const tw = measureEl.offsetWidth + padX * 2;
    const th = measureEl.offsetHeight + padY * 2;
    let best = null;
    for (const [size, def] of Object.entries(TALKBOX)) {
      if (!art[size]) continue;
      const [cx, cy, cw, ch] = def.crop;
      const [il, it, ir, ib] = def.inner;
      const sx = Math.max(tw / (ir - il), MIN_W / cw); // css px per art px, across
      const sy = Math.min(sx, Math.max(th / (ib - it), sx * MIN_SQUISH)); // ...down: squished
      const area = cw * sx * ch * sy;
      if (!best || area < best.area) best = { size, def, sx, sy, area, cx, cy, cw, ch, il, it, ir, ib };
    }
    if (!best) return false;
    const { def, sx, sy, cx, cy, cw, ch, il, it, ir, ib } = best;
    box.w = Math.round(cw * sx);
    box.h = Math.round(ch * sy);
    box.tailFrac = (def.tailX - cx) / cw;
    box.inner = { left: (il - cx) * sx, top: (it - cy) * sy, width: (ir - il) * sx, height: (ib - it) * sy };
    Object.assign(el.style, { width: `${box.w}px`, height: `${box.h}px` });
    textEl.textContent = text;
    placeText();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    art[best.size].forEach((frame, i) => {
      const c = canvases[i];
      c.width = Math.round(box.w * dpr);
      c.height = Math.round(box.h * dpr);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(frame, 0, 0, c.width, c.height);
    });
    return true;
  };

  /** Tail up (bubble below him) or down (above him, the default). */
  box.setFlipped = (flipped) => {
    if (box.flipped === flipped) return;
    box.flipped = flipped;
    el.classList.toggle('flipped', flipped);
    placeText();
  };

  box.remove = () => { el.remove(); measureEl.remove(); };
  return box;
}
