// DEBUG (Person 3): shows what he's feeling as plain text under the star, e.g.
//   "happy · yawn in 1:52"   "mad · 14s"   "sleepy · shake to wake"   "playful · dragged"
// The part after the dot is a countdown, a hint, or the face when it differs from the mood.
//
// Plain text on a plain box: UI chrome, not character art. Not a `.hit` element, so it stays
// click-through and never blocks the desktop.
//
// On/off: right-click menu → Admin Settings → Debug → "Show mood label" (OFF by default; followed
// live; key showMoodLabel in ../../shared/starbitsTuning.js). DevTools: starby.showMood(true/false)
// still works until the next Admin Settings change.
// To remove it before the demo: delete this file and its line in behaviors/index.js.
import { moodStatus } from './mood.js';
import { resolveTuning } from '../../shared/starbitsTuning.js';

const SHOW = false; // until Admin Settings load (the default is off)
const GAP = 4; // px between the star and the label

let el = null;
let lastText = '';
let size = { w: 0, h: 0 };

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function describe(ctx) {
  const { pet } = ctx;
  if (!pet.mood) return '?';
  const status = moodStatus(ctx);
  let detail = '';
  if (pet.face && pet.face !== pet.mood && pet.face !== 'talking') detail = pet.face; // e.g. held → dragged
  else if (status.endsIn !== undefined) detail = `${Math.ceil(status.endsIn)}s`;
  else if (status.yawnIn !== undefined) detail = `yawn in ${mmss(status.yawnIn)}`;
  else if (pet.mood === 'sleepy') detail = 'shake to wake';
  else if (pet.mood === 'yawning') detail = 'heading to a corner';
  return detail ? `${pet.mood} · ${detail}` : pet.mood;
}

export default {
  name: 'mood-label',

  init(ctx) {
    el = document.createElement('div');
    el.className = 'mood-label';
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      font: '11px "Segoe UI", system-ui, sans-serif',
      color: '#2b2b3a',
      background: 'rgba(255, 255, 255, 0.85)',
      border: '1px solid #2b2b3a',
      borderRadius: '6px',
      padding: '1px 6px',
      whiteSpace: 'nowrap',
      willChange: 'transform',
      display: SHOW ? 'block' : 'none',
    });
    ctx.stage.appendChild(el);

    if (window.starby) {
      window.starby.showMood = (on = true) => {
        el.style.display = on ? 'block' : 'none';
        return on;
      };
    }

    // Admin Settings → Debug → "Show mood label".
    const apply = (overrides) => {
      el.style.display = resolveTuning(overrides).showMoodLabel ? 'block' : 'none';
    };
    ctx.api.getAdminSettings?.().then(apply).catch(() => {});
    ctx.api.onAdminSettingsChanged?.(apply);
  },

  update(ctx) {
    if (!el || el.style.display === 'none') return;
    const { pet } = ctx;
    // Hide and seek (events/hideSeek.js): the label would give away where he's hiding.
    el.style.visibility = pet.hiding ? 'hidden' : '';
    if (pet.hiding) return;

    const text = describe(ctx);
    if (text !== lastText) {
      lastText = text;
      el.textContent = text;
      size = { w: el.offsetWidth, h: el.offsetHeight }; // measure only when the text changes
    }

    // Centered under the star (ignoring hops, so it doesn't jiggle), kept inside the usable
    // screen area (not under the taskbar, wherever it is).
    const a = ctx.area ? ctx.area() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const x = Math.max(a.left, Math.min(a.right - size.w, pet.x + pet.size / 2 - size.w / 2));
    const y = Math.max(a.top, Math.min(a.bottom - size.h, pet.y + pet.size + GAP));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  },
};
