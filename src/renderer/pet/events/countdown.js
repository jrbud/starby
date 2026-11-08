// A countdown box in the top-right corner of the usable screen area, for events (tag uses it).
// Pass getArea (ctx.area from pet.js) so it sits below a top taskbar / left of a right one.
//
// Plain text on a plain box: UI chrome, not character art. Not a `.hit` element, so it stays
// click-through and never blocks the desktop.

const URGENT_AT = 5; // seconds: turn red for the last few

const mmss = (s) => {
  const whole = Math.ceil(s); // 19.2s left shows as 0:20, like a real countdown
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const INSET = 20; // px from the usable area's top-right corner

export function createCountdown(stage, getArea = null) {
  let el = null;
  let titleEl = null;
  let timeEl = null;
  let hintEl = null;
  let lastShown = '';

  function build() {
    el = document.createElement('div');
    el.className = 'event-countdown';
    Object.assign(el.style, {
      position: 'absolute',
      top: `${INSET}px`,
      right: `${INSET}px`,
      pointerEvents: 'none',
      font: '600 14px "Segoe UI", system-ui, sans-serif',
      color: '#2b2b3a',
      background: 'rgba(255, 255, 255, 0.92)',
      border: '2px solid #2b2b3a',
      borderRadius: '10px',
      padding: '6px 12px',
      textAlign: 'center',
      display: 'none',
      minWidth: '110px',
    });
    titleEl = document.createElement('div');
    timeEl = document.createElement('div');
    Object.assign(timeEl.style, { font: '700 28px "Segoe UI", system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' });
    hintEl = document.createElement('div');
    Object.assign(hintEl.style, { font: '12px "Segoe UI", system-ui, sans-serif', color: '#77768a' });
    el.append(titleEl, timeEl, hintEl);
    stage.appendChild(el);
  }

  return {
    show(title, seconds, hint = '') {
      if (!el) build();
      titleEl.textContent = title;
      hintEl.textContent = hint;
      lastShown = '';
      this.set(seconds);
      el.style.display = 'block';
    },
    set(seconds) {
      if (!el) return;
      const a = getArea && getArea();
      if (a) {
        // Recomputed each update, in case the taskbar moves mid-game.
        el.style.top = `${a.top + INSET}px`;
        el.style.right = `${window.innerWidth - a.right + INSET}px`;
      }
      const s = Math.max(0, seconds);
      const text = mmss(s);
      if (text === lastShown) return;
      lastShown = text;
      timeEl.textContent = text;
      timeEl.style.color = s <= URGENT_AT ? '#c0392b' : '#2b2b3a';
    },
    hide() {
      if (el) el.style.display = 'none';
    },
  };
}
