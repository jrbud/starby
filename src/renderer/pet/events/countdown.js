// A countdown box in the top-right corner of the screen, for events (tag uses it).
//
// Plain text on a plain box: UI chrome, not character art. Not a `.hit` element, so it stays
// click-through and never blocks the desktop.

const URGENT_AT = 5; // seconds: turn red for the last few

const mmss = (s) => {
  const whole = Math.ceil(s); // 19.2s left shows as 0:20, like a real countdown
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export function createCountdown(stage) {
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
      top: '20px',
      right: '20px',
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
