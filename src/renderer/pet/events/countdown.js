// The game timer (tag, Starby Says, hoop shot...): a "moon" that WANES like the real moon. Full at
// the start; every second the dark side creeps a little further across from the right, through the
// moon's phases: full → gibbous (3/4 lit) → half → crescent (1/4) → new (gone) when time's up. No
// numbers or text, just the moon, on the team's purple button art (menuIcons/button-hover.png).
// The last URGENT_AT seconds it gently pulses.
//
//   const countdown = createCountdown(ctx.stage, () => ctx.area());
//   countdown.show('Tag', 15);   countdown.set(secondsLeft);   countdown.hide();
// The first show() of a game (while hidden) sets the full moon = that many seconds; calling show()
// again mid-game (tag does, on every tag) keeps ticking from where it is.
//
// ART: the moon is the team's hand-drawn moon (assets/events/moon.png). Nothing is drawn by code:
// the phases are a CSS mask that hides part of the PNG, i.e. code only shows/hides the team's art.
// A phase = the lit LEFT half of
// the moon plus (gibbous) or minus (crescent) an ellipse down the middle, the "terminator": two
// mask layers combined with mask-composite add / subtract. Lit share f: the ellipse is
// |2f − 1| of the moon's radius wide, so f = 3/4, 1/2, 1/4 give the right lit areas.
//
// Sits at the TOP LEFT of the usable screen (getArea = ctx.area, so it dodges the taskbar on any
// side). The starbit counter lives top right, so the two never overlap.
// Not a `.hit` element: it stays click-through and never blocks the desktop.

const URGENT_AT = 5; // seconds: pulse for the last few
const MOON_ART = '../../../assets/events/moon.png'; // team art; relative to src/renderer/pet/index.html
const CARD_ART = '../../../assets/menuIcons/button-hover.png'; // team button art behind the moon
const CARD_EDGE = 16; // px: the art's hand-drawn edge (CSS border-image keeps it this thick)
const CARD_SLICE = 120; // art px of that edge in the PNG (same as the dialogue's buttons)
const CARD = 150; // px: the card (square), big enough to read at a glance
const MOON = 110; // px: the moon inside it
const INSET = 16; // px from the usable area's top-left corner (the same margin as the starbit counter)

// The pulse for the last seconds (a style tag, injected once).
function injectStyles() {
  if (document.getElementById('moon-timer-styles')) return;
  const style = document.createElement('style');
  style.id = 'moon-timer-styles';
  style.textContent = `
    @keyframes moon-timer-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
    .moon-timer-urgent { animation: moon-timer-pulse 0.5s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

export function createCountdown(stage, getArea = null) {
  let el = null;
  let moonEl = null;
  let total = 1; // whole seconds in a full moon (set by the first show() of a game)
  let shownLeft = null; // whole seconds currently shown

  function build() {
    injectStyles();
    el = document.createElement('div');
    el.className = 'event-countdown';
    Object.assign(el.style, {
      position: 'absolute',
      top: `${INSET}px`,
      left: `${INSET}px`,
      display: 'none',
      width: `${CARD}px`,
      height: `${CARD}px`,
      boxSizing: 'border-box',
      border: `${CARD_EDGE}px solid transparent`,
      borderImage: `url("${CARD_ART}") ${CARD_SLICE} fill / ${CARD_EDGE}px stretch`,
      filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.3))', // follows the art's wobbly edge
      pointerEvents: 'none',
    });
    moonEl = document.createElement('img');
    moonEl.className = 'moon-timer';
    moonEl.src = MOON_ART;
    moonEl.alt = '';
    moonEl.draggable = false;
    moonEl.onerror = () => console.warn(`[timer] missing moon art: ${MOON_ART}`);
    Object.assign(moonEl.style, {
      position: 'absolute',
      left: `${(CARD - 2 * CARD_EDGE - MOON) / 2}px`, // (positioned inside the border)
      top: `${(CARD - 2 * CARD_EDGE - MOON) / 2}px`,
      width: `${MOON}px`,
      height: `${MOON}px`,
      objectFit: 'contain',
    });
    el.appendChild(moonEl);
    stage.appendChild(el);
  }

  // Show the moon's phase for `left` of `total` seconds: lit share f, dark creeping in from the right.
  function slice(left) {
    const f = left / total;
    const st = moonEl.style;
    if (f >= 1) { st.maskImage = 'none'; return; } // full moon
    if (f <= 0) { st.maskImage = 'linear-gradient(transparent, transparent)'; return; } // new moon: gone
    const rx = Math.max(0.01, Math.abs(2 * f - 1) * 50); // terminator ellipse half-width, % of the moon's width
    const half = 'linear-gradient(to right, #000 50%, transparent 50%)'; // the lit left half
    const ellipse = `radial-gradient(ellipse ${rx.toFixed(2)}% 50% at 50% 50%, #000 99%, transparent 100%)`;
    st.maskImage = `${half}, ${ellipse}`;
    st.maskSize = '100% 100%';
    st.maskRepeat = 'no-repeat';
    // Gibbous: half PLUS the ellipse. Crescent: half MINUS the ellipse (top layer outside the one below).
    st.maskComposite = f >= 0.5 ? 'add' : 'subtract';
  }

  return {
    show(title, seconds) {
      if (!el) build();
      el.setAttribute?.('aria-label', `${title} timer`);
      if (el.style.display === 'none') { // a new game: this many seconds is a full moon
        total = Math.max(1, Math.ceil(seconds));
        shownLeft = null;
      }
      this.set(seconds);
      el.style.display = 'block';
    },
    set(seconds) {
      if (!el) return;
      const a = getArea && getArea();
      if (a) {
        // Recomputed each update, in case the taskbar moves mid-game.
        el.style.top = `${Math.max(0, a.top) + INSET}px`;
        el.style.left = `${Math.max(0, a.left) + INSET}px`;
      }
      // Ticking: whole seconds only, so a slice disappears exactly once per second.
      const left = Math.min(total, Math.max(0, Math.ceil(seconds)));
      if (left === shownLeft) return;
      shownLeft = left;
      slice(left);
      moonEl.classList.toggle('moon-timer-urgent', left > 0 && left <= URGENT_AT);
    },
    hide() {
      if (el) el.style.display = 'none';
      moonEl?.classList.remove('moon-timer-urgent');
    },
  };
}
