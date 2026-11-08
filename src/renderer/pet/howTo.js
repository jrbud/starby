// HOW TO CARE FOR YOUR STARBY: a popup with the basics, shown when the app opens.
//
// It appears once the launch intro (events/intro.js) has finished, centered on the usable screen:
// a title, a short list of tips (TIPS), and two buttons:
//   "Got it!"           closes it; it shows again next time the app opens
//   "Don't show again"  closes it and it never shows again (remembered on this computer)
//
// "Don't show again" is saved in this page's localStorage (HIDE_KEY), like the Settings window's
// collapsed sections: a per-computer convenience, no change to the saved-state schema. If storage
// isn't available it just shows every launch.
//
// LOOK: the team's hand-drawn frame art, like the dialogue box (../dialogue/dialogue.js): the panel
// is button-hover.png, the buttons button-idle.png → button-hover.png on hover, as CSS
// border-images; Sour Gummy (declared in pet.css) in the shop's yellow. Nothing is drawn by code.
// The panel has the `hit` class, so clicks work on it while the rest of the screen stays
// click-through (../clickThrough.js).
//
// Run by events/index.js as a helper (init / watch). DevTools: starby.howTo() shows it now,
// starby.howToReset() forgets "don't show again".

const HIDE_KEY = 'starby.howTo.hidden';
const ART = '../../../assets/menuIcons'; // relative to src/renderer/pet/index.html
const SLICE = 120; // px of the button art's hand-drawn edge (same as the dialogue box)
const SHOW_AFTER = 0.6; // seconds after the intro ends before it pops up

const TITLE = 'How To Care for Your New Starby';
const TIPS = [
  'Left click and drag to carry Starby around',
  'Let go while dragging to throw him',
  'Right click Starby to talk to him',
  'Hover over star bits to collect',
];

let el = null;
let shownThisLaunch = false;
let introSeen = false;
let readyAt = null; // session seconds when it may pop up

function hidden() {
  try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
}

function injectStyles() {
  if (document.getElementById('how-to-styles')) return;
  const style = document.createElement('style');
  style.id = 'how-to-styles';
  style.textContent = `
    .how-to {
      position: absolute; left: 0; top: 0; box-sizing: border-box; width: 430px; max-width: calc(100vw - 32px);
      padding: 22px 28px 20px; isolation: isolate; text-align: center;
      font-family: 'Sour Gummy', 'Segoe UI', system-ui, sans-serif; color: #ffe8a3;
      filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35));
      opacity: 0; transform: scale(0.9); transition: opacity 180ms ease-out, transform 220ms cubic-bezier(0.2, 1.4, 0.4, 1);
    }
    .how-to.open { opacity: 1; transform: scale(1); }
    .how-to::before {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      border: 16px solid transparent;
      border-image: url('${ART}/button-hover.png') ${SLICE} fill / 16px stretch;
    }
    .how-to h2 { margin: 0 0 12px; font-size: 22px; font-weight: 800; line-height: 1.15; }
    .how-to ul { margin: 0 0 16px; padding: 0 0 0 20px; text-align: left; font-size: 15px; font-weight: 600; line-height: 1.35; }
    .how-to li { margin: 0 0 6px; }
    .how-to-buttons { display: flex; gap: 10px; justify-content: center; }
    .how-to-button {
      position: relative; isolation: isolate; cursor: pointer; border: 0; background: none; margin: 0;
      padding: 9px 18px 10px; font: inherit; font-size: 15px; font-weight: 700; color: #ffe8a3;
      white-space: nowrap; transition: transform 110ms ease-out;
    }
    .how-to-button::before {
      content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
      border: 9px solid transparent;
      border-image: url('${ART}/button-idle.png') ${SLICE} fill / 9px stretch;
    }
    .how-to-button:hover { transform: scale(1.06); }
    .how-to-button:hover::before { border-image-source: url('${ART}/button-hover.png'); }
  `;
  document.head.appendChild(style);
  for (const f of ['button-idle', 'button-hover']) new Image().src = `${ART}/${f}.png`;
}

function close(ctx) {
  if (!el) return;
  el.classList.remove('open'); // fades/shrinks out (CSS transition), then hidden
  const gone = el;
  ctx.after(0.2, () => { gone.style.display = 'none'; }, 'how-to: hide');
}

function build(ctx) {
  injectStyles();
  el = document.createElement('div');
  el.className = 'how-to hit'; // .hit: clickable while the rest stays click-through
  const h = document.createElement('h2');
  h.textContent = TITLE;
  const list = document.createElement('ul');
  for (const tip of TIPS) {
    const li = document.createElement('li');
    li.textContent = tip;
    list.appendChild(li);
  }
  const buttons = document.createElement('div');
  buttons.className = 'how-to-buttons';
  const button = (label, onClick) => {
    const b = document.createElement('button');
    b.className = 'how-to-button';
    b.textContent = label;
    // mousedown: answers on the first press even though the pet window isn't focusable.
    b.addEventListener('mousedown', (e) => { e.stopPropagation(); onClick(); });
    return b;
  };
  buttons.append(
    button('Got it!', () => { ctx.log('how-to', { closed: 'got-it' }); close(ctx); }),
    button("Don't show again", () => {
      try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* storage unavailable: it'll just show next time */ }
      ctx.log('how-to', { closed: 'dont-show-again' });
      close(ctx);
    }),
  );
  el.append(h, list, buttons);
  ctx.stage.appendChild(el);
}

function show(ctx) {
  if (!el) build(ctx);
  el.style.display = 'block';
  // Centered on the usable screen (off the taskbar wherever it is).
  const a = ctx.area ? ctx.area() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const w = el.offsetWidth || 430;
  const h = el.offsetHeight || 300;
  el.style.left = `${Math.round(a.left + (a.right - a.left - w) / 2)}px`;
  el.style.top = `${Math.round(a.top + Math.max(16, (a.bottom - a.top - h) / 2))}px`;
  requestAnimationFrame(() => el.classList.add('open'));
  ctx.log('how-to', { shown: true });
}

export const howTo = {
  name: 'how-to',

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.howTo = () => { show(ctx); return 'shown'; };
      window.starby.howToReset = () => {
        try { localStorage.removeItem(HIDE_KEY); } catch { /* ignore */ }
        return 'the how-to popup will show again next launch';
      };
    }
  },

  // Every tick until it's shown: wait for the launch intro to finish, then pop up (once).
  watch(ctx) {
    if (shownThisLaunch) return;
    const active = ctx.activeEvent();
    if (active === 'intro') { introSeen = true; return; }
    if (readyAt === null) {
      // The intro starts itself on the first tick; once it's over (or if it never ran), pop up shortly.
      if (!introSeen && ctx.clock.seconds < 0.5) return;
      readyAt = ctx.clock.seconds + SHOW_AFTER;
    }
    if (ctx.clock.seconds < readyAt) return;
    shownThisLaunch = true;
    if (!hidden()) show(ctx);
  },
};
