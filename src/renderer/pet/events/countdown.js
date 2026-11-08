// The game timer (tag, Starby Says, hoop shot...): a "moon" that ticks away. A full moon at the
// start; every second ONE more slice disappears, clockwise from the top, like a pie chart, until
// it's gone when time's up. No numbers or text, just the moon, in the same card art as the
// starbit counter (starCardBg.png). The last URGENT_AT seconds it gently pulses.
//
//   const countdown = createCountdown(ctx.stage, () => ctx.area());
//   countdown.show('Tag', 15);   countdown.set(secondsLeft);   countdown.hide();
// The first show() of a game (while hidden) sets the full moon = that many seconds; calling show()
// again mid-game (tag does, on every tag) keeps ticking from where it is.
//
// ART: there's no moon art yet, so the "moon" is a PLACEHOLDER: the team's starbit cluster PNG
// (assets/starbits/cluster.png, the starbit counter's icon). When a moon is drawn, change MOON_ART
// (square PNG on a transparent background). Nothing is drawn by code: the slices are a CSS mask
// (a conic-gradient) that hides part of the PNG, i.e. code only shows/hides the team's art.
//
// Sits at the TOP LEFT of the usable screen (getArea = ctx.area, so it dodges the taskbar on any
// side). The starbit counter lives top right, so the two never overlap.
// Not a `.hit` element: it stays click-through and never blocks the desktop.

const URGENT_AT = 5; // seconds: pulse for the last few
const MOON_ART = '../../../assets/starbits/cluster.png'; // PLACEHOLDER moon; relative to src/renderer/pet/index.html
const CARD_ART = '../../../assets/backgrounds/starCardBg.png'; // the starbit counter's card art
const CARD = 110; // px: the card (square), big enough to read at a glance
const MOON = 78; // px: the moon inside it
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
      background: `url("${CARD_ART}") center / 100% 100% no-repeat`,
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
      left: `${(CARD - MOON) / 2}px`,
      top: `${(CARD - MOON) / 2}px`,
      width: `${MOON}px`,
      height: `${MOON}px`,
      objectFit: 'contain',
    });
    el.appendChild(moonEl);
    stage.appendChild(el);
  }

  // Hide the part of the moon that's gone: the first `gone` degrees clockwise from the top.
  function slice(left) {
    const gone = Math.round((1 - left / total) * 360 * 100) / 100;
    const mask = gone <= 0 ? 'none' : `conic-gradient(from 0deg, transparent 0deg ${gone}deg, #000 ${gone}deg 360deg)`;
    moonEl.style.maskImage = mask;
    moonEl.style.webkitMaskImage = mask;
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
