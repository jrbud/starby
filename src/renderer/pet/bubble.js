// Speech bubble UI. Behaviors call ctx.say(text, ms) rather than touching this directly.
//
// Every line is drawn in the team's talkbox art (./talkbox.js: picks the bubble size, squishes it
// so short lines don't get tall empty bubbles, boils frame 1 ↔ 2). The bubble sits above his head
// with the tail pointing at him, and is kept ON SCREEN every frame while it shows:
//   - near the left/right edge it slides sideways (the tail stays as close to him as it can)
//   - no room above him (top of the screen) → it flips below him, tail pointing up
// Until the talkbox art has loaded (a moment after launch), lines use the old plain box from
// pet.css. The #bubble element lives inside #pet, so it moves with him; pet.css's .bubble look
// is switched off with the `talkbox-host` class while a talkbox is showing.
// Only one talkbox at a time: while the dialogue is open it holds his speech (./talkbox.js
// takeSpeech), so new lines go into ITS talkbox and this bubble stays hidden.
import { createTalkbox, loadTalkbox, registerSpeechBubble, speechTakenBy, speechBubbleShown } from './talkbox.js';

const GAP = 3; // px between the tail tip and his head (or feet, when flipped)
const EDGE = 6; // px kept clear of the screen edges
const FONT = 14; // px
const MAX_TEXT = 200; // px: lines wrap past this

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
 */
export function createBubble(el, opts = {}) {
  injectHostStyles();
  loadTalkbox();
  const area = opts.area || (() => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }));
  const petEl = el.parentElement;
  let hideTimer = null;
  let raf = null;
  let tb = null; // the talkbox, once the art is in

  function place() {
    raf = null;
    if (!tb || !el.classList.contains('talkbox-host') || el.classList.contains('hidden')) return;
    const pw = petEl.offsetWidth;
    const ph = petEl.offsetHeight;
    const r = petEl.getBoundingClientRect();
    const a = area();
    let left = pw / 2 - tb.tailFrac * tb.w; // tail tip over his middle
    let top = -tb.h - GAP;
    const flipped = r.top + top < a.top + EDGE; // no room above → below him, tail up
    if (flipped) top = ph + GAP;
    const screenLeft = r.left + left;
    if (screenLeft < a.left + EDGE) left += a.left + EDGE - screenLeft;
    else if (screenLeft + tb.w > a.right - EDGE) left -= screenLeft + tb.w - (a.right - EDGE);
    tb.setFlipped(flipped);
    tb.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    tb.el.style.transformOrigin = `${(tb.tailFrac * 100).toFixed(1)}% ${flipped ? '0%' : '100%'}`;
    raf = requestAnimationFrame(place); // follow him (and the screen edges) while it shows
  }

  function hide() {
    clearTimeout(hideTimer);
    el.classList.add('hidden');
  }
  registerSpeechBubble(hide); // the dialogue hides this bubble when it opens

  return {
    say(text, ms = 3000) {
      const taker = speechTakenBy();
      if (taker) { // the dialogue is open: the line replaces his line there (no second bubble)
        hide();
        taker(text);
        return;
      }
      if (!tb) tb = createTalkbox({ fontSize: FONT, maxText: MAX_TEXT, padX: 9, padY: 3 });
      if (tb.setText(text)) {
        el.textContent = '';
        el.appendChild(tb.el);
        el.classList.add('talkbox-host');
        // A quick pop from the tail (the `scale` property, so it doesn't fight the placement transform).
        tb.el.animate([{ scale: '0.85' }, { scale: '1' }], { duration: 170, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' });
      } else {
        el.classList.remove('talkbox-host'); // art not loaded yet: the plain box
        el.textContent = text;
      }
      el.classList.remove('hidden');
      speechBubbleShown(); // a dialogue talkbox still shrinking away disappears now (no overlap)
      if (!raf) raf = requestAnimationFrame(place);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el.classList.add('hidden'), ms);
    },
    // While the dialogue holds his speech he counts as speaking (so chatter waits its turn).
    isShowing: () => Boolean(speechTakenBy()) || !el.classList.contains('hidden'),
    /** Hide right now (e.g. a video call just started, see events/hush.js). */
    hide,
  };
}
