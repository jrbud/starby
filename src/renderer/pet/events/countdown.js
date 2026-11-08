// The game timer card (tag, Starby Says, hoop shot...), styled exactly like the starbit counter
// (behaviors/starbits.js + pet.css .starbits-toast): the team's card art (starCardBg.png, stretched),
// Sour Gummy (declared in pet.css), the shop's tan/yellow #ffe8a3, small. Just one line: the time,
// big, then the game's name, small ("0:12 Tag"). No descriptions or hints, only the name. The last
// URGENT_AT seconds the time turns a soft red.
//
//   const countdown = createCountdown(ctx.stage, () => ctx.area());
//   countdown.show('Tag', 15);   countdown.set(secondsLeft);   countdown.hide();
//
// Sits at the top right of the usable screen (getArea = ctx.area, so it dodges the taskbar on any
// side), just BELOW where the starbit counter slides in, so the two never overlap.
// Not a `.hit` element: it stays click-through and never blocks the desktop.

const URGENT_AT = 5; // seconds: turn red for the last few
const TAN = '#ffe8a3'; // shop.css --yellow, same as the starbit counter
const URGENT = '#ff9d8a'; // soft red that still reads on the dark card
const CARD_ART = '../../../assets/backgrounds/starCardBg.png'; // relative to src/renderer/pet/index.html

const mmss = (s) => {
  const whole = Math.ceil(s); // 19.2s left shows as 0:20, like a real countdown
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const INSET = 16; // px from the usable area's right edge (= the starbit counter's margin)
const BELOW_COUNTER = 16 + 58 + 8; // px from the top: under the counter card (16px margin + 58px card + gap)
const FONT = "'Sour Gummy', 'Segoe UI', system-ui, sans-serif";

export function createCountdown(stage, getArea = null) {
  let el = null;
  let titleEl = null;
  let timeEl = null;
  let lastShown = '';

  function build() {
    el = document.createElement('div');
    el.className = 'event-countdown';
    Object.assign(el.style, {
      position: 'absolute',
      top: `${BELOW_COUNTER}px`,
      right: `${INSET}px`,
      display: 'none',
      minWidth: '150px', // same as the starbit counter
      height: '58px', // exactly the counter's height: one line
      boxSizing: 'border-box',
      padding: '0 22px 2px', // clear of the art's thick hand-drawn border (like the counter)
      background: `url("${CARD_ART}") center / 100% 100% no-repeat`,
      color: TAN,
      fontFamily: FONT,
      filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.3))', // follows the art's wobbly edge
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      textAlign: 'center',
    });
    const line = document.createElement('div');
    // Vertically centered in the 58px card, like the counter's flex row.
    Object.assign(line.style, { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px', lineHeight: '1', height: '100%', paddingTop: '17px', boxSizing: 'border-box' });
    timeEl = document.createElement('span');
    Object.assign(timeEl.style, { fontSize: '26px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }); // = counter number
    titleEl = document.createElement('span');
    Object.assign(titleEl.style, { fontSize: '15px', fontWeight: '700', opacity: '0.85' }); // = counter label
    line.append(timeEl, titleEl);
    el.append(line);
    stage.appendChild(el);
  }

  return {
    show(title, seconds) {
      if (!el) build();
      titleEl.textContent = title; // just the game's name
      lastShown = '';
      this.set(seconds);
      el.style.display = 'block';
    },
    set(seconds) {
      if (!el) return;
      const a = getArea && getArea();
      if (a) {
        // Recomputed each update, in case the taskbar moves mid-game.
        el.style.top = `${Math.max(0, a.top) + BELOW_COUNTER}px`;
        el.style.right = `${Math.max(0, window.innerWidth - a.right) + INSET}px`;
      }
      const s = Math.max(0, seconds);
      const text = mmss(s);
      if (text === lastShown) return;
      lastShown = text;
      timeEl.textContent = text;
      timeEl.style.color = s <= URGENT_AT ? URGENT : TAN;
    },
    hide() {
      if (el) el.style.display = 'none';
    },
  };
}
