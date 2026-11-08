// THE DIALOGUE BOX: right-click Starby and he talks to you: his line plus answers to pick from.
// What he says and the answers live in ./tree.js (plain data, easy to edit); this file shows the
// box, keeps it beside him, and runs the answer you pick.
//
//   right-click him   open the box at the 'start' node (or 'busy' during a game / sky event);
//                     right-click again closes it
//   the box           sits on whichever side of him has more room: his right when he's on the left
//                     half of the screen, his left on the right half (data-side="left|right" on
//                     the element, for styling later)
//   while it's open   he stands still and faces you (only if he was just idling / walking)
//   it closes when    you pick an answer that ends it, he's picked up, an event takes over, or
//                     you leave it alone for AUTO_CLOSE seconds (hovering the box keeps it open)
//
// Plain box + text buttons for now (UI chrome, no art); the visuals come later. It has the `hit`
// class, so click-through switches off over it (../clickThrough.js) and the buttons can be clicked.
// Run by events/index.js as a helper (init / watch / watchFrame), like the games menu.
// DevTools: starby.dialogue() opens it, starby.dialogue('settings') opens a node directly.
import { TREE } from './tree.js';
import { requestGame } from '../events/games.js';
import { TICK_SECONDS } from '../core/clock.js';

const GAP = 16; // px between him and the box
const EDGE = 8; // px kept clear of the usable screen's edges
const AUTO_CLOSE = 20; // seconds with no hover before the box closes on its own

// Events and what a right-click does during them.
// hoop-shot: right-drag is its slingshot (hoopShot.js also swallows right-clicks while it runs).
const IGNORE = ['intro', 'shop', 'hoop-shot']; // nothing: the launch animation / he's in the shop window
const SNAP_OUT = ['dance', 'invite']; // stop it, then talk normally
const CALM = ['focus', 'hush']; // talk normally, the event keeps going (he stays parked/quiet)
// anything else (games, sky events) → the 'busy' node: keep going, or stop it

let box = null;
let lineEl = null;
let optionsEl = null;
let size = { w: 0, h: 0 };
let open = null; // { id, event } — node showing, and the event running when it opened
let pressed = null; // option clicked; acted on at the next tick (on the session clock)
let hovering = false;
let quietFor = 0; // seconds open without hover
let froze = false; // we put him in 'dialogue' mode (and must hand him back)

function injectStyles() {
  if (document.getElementById('dialogue-styles')) return;
  const style = document.createElement('style');
  style.id = 'dialogue-styles';
  style.textContent = `
    .dialogue-box {
      position: absolute; left: 0; top: 0; display: none; max-width: 260px;
      background: #ffffff; color: #2b2b3a; border: 2px solid #2b2b3a; border-radius: 10px;
      padding: 10px; font: 13px "Segoe UI", system-ui, sans-serif; will-change: transform;
    }
    .dialogue-line { font-weight: 600; margin-bottom: 8px; }
    .dialogue-options { display: flex; flex-direction: column; gap: 5px; }
    .dialogue-option {
      font: inherit; text-align: left; border-radius: 6px; padding: 4px 10px; cursor: pointer;
      border: 1.5px solid #6c5ce7; background: #ffffff; color: #6c5ce7; white-space: nowrap;
    }
    .dialogue-option:hover { background: #6c5ce7; color: #ffffff; }
  `;
  document.head.appendChild(style);
}

function build(ctx) {
  injectStyles();
  box = document.createElement('div');
  box.className = 'dialogue-box hit';
  lineEl = document.createElement('div');
  lineEl.className = 'dialogue-line';
  optionsEl = document.createElement('div');
  optionsEl.className = 'dialogue-options';
  box.append(lineEl, optionsEl);
  box.addEventListener('mouseenter', () => { hovering = true; });
  box.addEventListener('mouseleave', () => { hovering = false; });
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  ctx.stage.appendChild(box);
}

const resolve = (ctx, line) => {
  if (typeof line === 'function') return line(ctx);
  if (Array.isArray(line)) return line[Math.floor(Math.random() * line.length)];
  return line || '';
};

function showNode(ctx, id) {
  const node = TREE[id];
  if (!node) { close(ctx); return; }
  if (!box) build(ctx);
  lineEl.textContent = resolve(ctx, node.line);
  optionsEl.textContent = '';
  for (const option of node.options || []) {
    if (option.show && !option.show(ctx)) continue;
    const btn = document.createElement('button');
    btn.className = 'dialogue-option';
    btn.textContent = option.label;
    // mousedown so it answers on the first press even though the pet window isn't focusable.
    btn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button === 0) pressed = option;
    });
    optionsEl.appendChild(btn);
  }
  box.style.display = 'block';
  size = { w: box.offsetWidth, h: box.offsetHeight };
  open = { id, event: open ? open.event : ctx.activeEvent() };
  quietFor = 0;
  place(ctx);
}

function place(ctx) {
  if (!open) return;
  const { pet } = ctx;
  const a = ctx.area();
  const onLeft = pet.x + pet.size / 2 > (a.left + a.right) / 2; // he's on the right half → box on his left
  let x = onLeft ? pet.x - size.w - GAP : pet.x + pet.size + GAP;
  let y = pet.y + pet.bob + pet.size / 2 - size.h / 2;
  x = Math.max(a.left + EDGE, Math.min(a.right - EDGE - size.w, x));
  y = Math.max(a.top + EDGE, Math.min(a.bottom - EDGE - size.h, y));
  box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  box.dataset.side = onLeft ? 'left' : 'right';
}

function openDialogue(ctx, id = null) {
  const { pet } = ctx;
  if (pet.mode === 'drag' || pet.mode === 'toss') return false;
  let active = ctx.activeEvent();
  if (IGNORE.includes(active)) return false;
  if (SNAP_OUT.includes(active)) {
    ctx.stopEvent('right-click');
    active = ctx.activeEvent();
  }
  // Hold him still while you talk (only if he was just hanging around).
  if (pet.mode === 'idle' || pet.mode === 'walk' || pet.mode === 'follow') {
    pet.mode = 'dialogue';
    froze = true;
  }
  open = null;
  const node = id || (active && !CALM.includes(active) ? 'busy' : 'start');
  showNode(ctx, node);
  ctx.log('dialogue-open', { node, event: active });
  return true;
}

function close(ctx) {
  if (!open) return;
  open = null;
  pressed = null;
  hovering = false;
  if (box) box.style.display = 'none';
  if (froze && ctx.pet.mode === 'dialogue') ctx.pet.mode = 'idle';
  froze = false;
}

// ---- Actions (an answer's `action`) ----
function runAction(ctx, action) {
  if (!action || action === 'close') return;
  const api = ctx.api || {};
  const active = ctx.activeEvent();
  if (action === 'shop') api.openShop?.();
  else if (action === 'settings') api.openSettings?.();
  else if (action === 'admin') api.openAdminSettings?.();
  else if (action === 'quit') api.quitApp?.();
  else if (action === 'devtools') api.openPetDevTools?.();
  else if (action === 'focus') ctx.startEvent('focus', 'dialogue');
  else if (action === 'unfocus') { if (active === 'focus') ctx.stopEvent('done'); }
  else if (action === 'stop-event') { if (active) ctx.stopEvent('dialogue'); }
  else if (action.startsWith('game:')) {
    if (active === 'focus') ctx.stopEvent('done'); // asked to play: focus time's over
    requestGame(ctx, action.slice(5));
  } else if (action.startsWith('starby:')) {
    const [fn, ...args] = action.slice(7).split(':');
    if (typeof window.starby?.[fn] === 'function') window.starby[fn](...args);
  }
}

function choose(ctx, option) {
  ctx.log('dialogue-choice', { node: open?.id, label: option.label, action: option.action || null, next: option.next || null });
  if (option.next) {
    runAction(ctx, option.action);
    showNode(ctx, option.next);
    return;
  }
  close(ctx); // hand him back first, so an event (game, focus) can take him
  runAction(ctx, option.action);
  if (option.say) ctx.say(option.say, 2200);
}

export const dialogue = {
  name: 'dialogue',

  init(ctx) {
    // drag.js turns a right-click on him into this event (instead of the old native menu).
    ctx.petEl.addEventListener('pet:right-clicked', () => {
      if (open) close(ctx);
      else openDialogue(ctx);
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.dialogue = (id) => (openDialogue(ctx, id) ? (id || 'start') : 'not now');
    }
  },

  // Every tick: act on a clicked answer; close when he's taken or left alone too long.
  watch(ctx) {
    if (!open) return;
    if (pressed) {
      const option = pressed;
      pressed = null;
      choose(ctx, option);
      return;
    }
    const { pet } = ctx;
    const taken = pet.mode === 'drag' || pet.mode === 'toss' || (froze && pet.mode !== 'dialogue');
    const eventChanged = ctx.activeEvent() !== open.event;
    quietFor = hovering ? 0 : quietFor + TICK_SECONDS;
    if (taken || eventChanged || quietFor >= AUTO_CLOSE) close(ctx);
  },

  // Every frame: keep the box beside him (he may be walking to his focus corner).
  watchFrame(ctx) {
    if (open) place(ctx);
  },
};
