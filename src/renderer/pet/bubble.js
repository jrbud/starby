// Speech bubble UI. Behaviors call ctx.say(text, ms) rather than touching this directly.
//
// Every line is drawn in the team's talkbox art (./talkbox.js: picks the bubble size, squishes it
// so short lines don't get tall empty bubbles, boils frame 1 ↔ 2). The bubble sits above his head
// with the tail pointing at him, and is kept ON SCREEN every frame while it shows:
//   - near the left/right edge it slides sideways (the tail stays as close to him as it can)
//   - no room above him (top of the screen) → it flips below him, tail pointing up
// It can also show an OBJECT instead of words (showContent), in the speech box or the THOUGHT CLOUD
// (style 'think'): behaviors/dream.js uses the cloud for his dreams while he sleeps, so dreams follow the same one-bubble-at-a-time rule as his speech.
// Until the talkbox art has loaded (a moment after launch), lines use the old plain box from
// pet.css. The #bubble element lives inside #pet, so it moves with him; pet.css's .bubble look
// is switched off with the `talkbox-host` class while a talkbox is showing.
// Only one talkbox at a time: while the dialogue is open it holds his speech (./talkbox.js
// takeSpeech), so new lines go into ITS talkbox and this bubble stays hidden.
import { createTalkbox, loadTalkbox, registerSpeechBubble, speechTakenBy, speechBubbleShown, speechMuted } from './talkbox.js';
import { sfx } from '../shared/sfx.js';
import { chatScale, fontScale } from './uiScale.js';

const GAP = 3; // px between the tail tip and his head (or feet, when flipped)
// Thought cloud (dreams): its trailing dots come from his upper-LEFT, so the dots' tip sits here
// (share of his box) and the cloud floats lower and further left than a speech bubble.
const THINK_TIP = { x: 0.12, y: 0.28 };
const EDGE = 6; // px kept clear of the screen edges
const FONT = 14; // px
const MAX_TEXT = 200; // px: lines wrap past this
// ZOOMED (opts.zoom() > 1, events/secret.js: he leans right up to the screen): he's drawn that many
// times bigger around his middle, so the bubble goes above his BIG head (or below his big feet),
// never over his face, and grows a little so it reads easily from up close.
const ZOOM_GROW = 0.15; // bubble scale gained per 1× of zoom...
const ZOOM_GROW_MAX = 1.6; // ...up to this

function injectHostStyles() {
  if (document.getElementById('bubble-host-styles')) return;
  const style = document.createElement('style');
  style.id = 'bubble-host-styles';
  // Beats pet.css's `.bubble` (more specific), so pet.css doesn't need changing.
  style.textContent = `
    #pet .bubble.talkbox-host {
      left: 0; top: 0; bottom: auto; width: 0; height: 0; max-width: none; margin: 0; padding: 0;
      background: none; border: 0; border-radius: 0; transform: none;
    }
    #pet .bubble .talkbox { position: absolute; left: 0; top: 0; will-change: transform; }
  `;
  document.head.appendChild(style);
}

/**
 * @param {HTMLElement} el      the #bubble element (inside #pet)
 * @param {object} [opts]
 * @param {() => {left:number, top:number, right:number, bottom:number}} [opts.area]
 *        usable screen area to stay inside (default: the whole window)
 * @param {() => number} [opts.zoom]  how many times bigger he's drawn around his middle (pet.zoom)
 */
let instance = null; // the one speech bubble (pet.js creates it)
/** The speech bubble (for behaviors that show things in it, e.g. dreams). */
export const speechBubble = () => instance;

export function createBubble(el, opts = {}) {
  injectHostStyles();
  loadTalkbox();
  const area = opts.area || (() => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }));
  const petEl = el.parentElement;
  let hideTimer = null;
  let raf = null;
  let tb = null; // the talkbox showing now (speech or think)
  const boxes = {}; // style → its talkbox, made on first use

  function place() {
    raf = null;
    if (!tb || !el.classList.contains('talkbox-host') || el.classList.contains('hidden')) return;
    const pw = petEl.offsetWidth;
    const ph = petEl.offsetHeight;
    const r = petEl.getBoundingClientRect();
    const a = area();
    const think = tb.style === 'think';
    // Chat size setting (./uiScale.js): the bubble is drawn at tb.w × tb.h and scaled by s around its
    // tail, so everything below works with its on-screen size W × H.
    const z = Math.max(1, opts.zoom ? opts.zoom() : 1);
    const s = chatScale() * Math.min(ZOOM_GROW_MAX, 1 + (z - 1) * ZOOM_GROW);
    const W = tb.w * s;
    const H = tb.h * s;
    // Where he looks like he starts / ends vertically (zoom is around his middle).
    const headY = ph / 2 - (z * ph) / 2;
    const feetY = ph / 2 + (z * ph) / 2;
    let left = (think ? pw * THINK_TIP.x : pw / 2) - tb.tailFrac * W; // tail tip over his middle (cloud: his upper-left)
    let top = think ? ph * THINK_TIP.y - H : headY - H - GAP;
    const flipped = r.top + top < a.top + EDGE; // no room above → below him, tail up
    if (flipped) top = feetY + GAP;
    const screenLeft = r.left + left;
    if (screenLeft < a.left + EDGE) left += a.left + EDGE - screenLeft;
    else if (screenLeft + W > a.right - EDGE) left -= screenLeft + W - (a.right - EDGE);
    tb.setFlipped(flipped);
    // Scaling around the tail (transform-origin) moves the box's corner by origin × (1 − s): undo that.
    const ox = tb.tailFrac * tb.w;
    const oy = flipped ? 0 : tb.h;
    const tx = left - ox * (1 - s);
    const ty = top - oy * (1 - s);
    tb.el.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${s})`;
    tb.el.style.transformOrigin = `${(tb.tailFrac * 100).toFixed(1)}% ${flipped ? '0%' : '100%'}`;
    raf = requestAnimationFrame(place); // follow him (and the screen edges) while it shows
  }

  function hide() {
    clearTimeout(hideTimer);
    el.classList.add('hidden');
  }
  registerSpeechBubble(hide); // the dialogue hides this bubble when it opens

  // Put a filled talkbox up for `ms` (`fill(tb)` sets its text or content; false = art not ready).
  // style: 'speech' (his lines) or 'think' (the thought cloud, for dreams).
  function show(fill, ms, fallbackText, style = 'speech') {
    // Font size setting (./uiScale.js): bigger text, and lines wrap at a proportionally wider width
    // (so the same words share a line); the bubble grows to fit. Remake the talkbox when it changed.
    const fs = fontScale();
    if (boxes[style] && boxes[style].fontScale !== fs) {
      if (tb === boxes[style]) tb = null;
      boxes[style].remove();
      delete boxes[style];
    }
    if (!boxes[style]) {
      boxes[style] = createTalkbox({ fontSize: FONT * fs, maxText: MAX_TEXT * fs, padX: 9, padY: 6, style });
      boxes[style].fontScale = fs;
    }
    const box = boxes[style];
    if (fill(box)) {
      tb = box;
      el.textContent = '';
      el.appendChild(tb.el);
      el.classList.add('talkbox-host');
      // A quick pop from the tail (the `scale` property, so it doesn't fight the placement transform).
      tb.el.animate([{ scale: '0.85' }, { scale: '1' }], { duration: 170, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' });
    } else if (fallbackText != null) {
      el.classList.remove('talkbox-host'); // art not loaded yet: the plain box
      el.textContent = fallbackText.toLowerCase(); // he never speaks in uppercase
    } else {
      return false;
    }
    el.classList.remove('hidden');
    speechBubbleShown(); // a dialogue talkbox still shrinking away disappears now (no overlap)
    if (!raf) raf = requestAnimationFrame(place);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.add('hidden'), ms);
    return true;
  }

  instance = {
    // opts.force: show even while he's muted for being asleep (behaviors/dream.js sleep-talk).
    say(text, ms = 3000, opts = {}) {
      if (!opts.force && speechMuted()) return; // asleep: he doesn't talk (dreams still show, see showContent)
      const taker = speechTakenBy();
      if (taker) { // the dialogue is open: the line replaces his line there (no second bubble)
        hide();
        taker(text);
        return;
      }
      // chat-1..4.mp3 (random): he says something that needs no answer. (Questions go through the dialogue →
      // prompt.mp3; dreams use showContent's think cloud → silent.)
      if (show((t) => t.setText(text), ms, text)) sfx.play('chat');
    },
    /**
     * Show an element (w × h px) in the bubble instead of words, e.g. a dream. Not while the
     * dialogue holds his speech. Returns false if it couldn't show (art not loaded yet / dialogue).
     */
    showContent(node, w, h, ms = 4000, style = 'speech') {
      if (speechTakenBy()) return false;
      return show((t) => t.setContent(node, w, h), ms, null, style);
    },
    // While the dialogue holds his speech he counts as speaking (so chatter waits its turn).
    isShowing: () => Boolean(speechTakenBy()) || !el.classList.contains('hidden'),
    /** Hide right now (e.g. a video call just started, see events/hush.js). */
    hide,
  };
  return instance;
}
