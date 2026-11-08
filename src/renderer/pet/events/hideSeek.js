// HIDE AND SEEK — Starby runs off and hides, without saying a word.
//
// He hides "behind" something, picked at random:
//   - your active window: just inside one of its edges (needs the window's rectangle from
//     main/systemReads/activeWindow.js; skipped if it isn't known or there's no room)
//   - the taskbar, or just past an edge / corner of the screen (edges of ctx.area())
// The pet window is always on top, so "behind" is faked: while he's in a hiding spot, every part
// of him on the covered side of the edge is clipped away (CSS clip-path on the pet element), so
// peeking shows exactly the bit sticking out past the edge. The spot is fixed when he hides:
// moving / throwing that window around afterwards doesn't reveal or move him.
//
//   run     he runs off fast to the spot and ducks in. No speech, no countdown, no starbit drops,
//           no mood label (pet.hiding tells starbits.js / moodLabel.js to keep quiet).
//   hidden  fully covered for HIDE_FOR seconds. Nothing gives him away.
//   peek    he peeks out (PEEK_PX of him visible) for PEEK_FOR seconds. Touch him with the cursor
//           (or grab him) while he's peeking → you found him: "you found me!" and FOUND_REWARD
//           starbits. After a peek he sometimes (RELOCATE_CHANCE) runs to a new spot.
//   end     found → 'found'; not found within GAME_FOR seconds → he comes out, 'star-won'.
//
// Starts: the "Play a game? [... Hide & Seek]" buttons, the happenings timer (./happenings.js:
// he just quietly goes and hides on his own), or starby.startEvent('hide-seek'). Never offered
// in his "wanna play?" invites: he doesn't announce it. Shares the rest between games.
// DevTools: starby.setHideWindow({ x, y, width, height }) pretends that's the active window
// (screen coordinates), e.g. to test window hiding without get-windows.
//
// Owns the star via pet.mode = 'hide'. Decisions (timers, found, relocating) on ticks; motion
// and clipping every frame.
import { rand, clamp } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed, restLeft } from './games.js';

// ---- Tuning ----
const GAME_FOR = 150; // seconds before he gives up and comes out
const RUN_SPEED = 950; // px/s running to a spot
const DUCK_SPEED = 220; // px/s sliding into / out of cover
const HIDE_FOR = [4, 9]; // seconds fully hidden between peeks
const PEEK_FOR = 1.5; // seconds peeking
const PEEK_PX = 30; // px of him that show when he peeks
const RELOCATE_CHANCE = 0.35; // after a peek, chance he runs to a new spot
const WINDOW_CHANCE = 0.6; // chance of hiding behind the active window, when that's possible
const MIN_WINDOW = { width: 220, height: 160 }; // smaller windows aren't worth hiding behind
const CATCH_PAD = 6; // px around his visible part that still counts as touching him
const FOUND_REWARD = 10;

const LINES = {
  found: lineBag(['you found me! ✦', 'aw, you got me!', 'how did you see me?!', 'found me! hehe']),
  starWon: lineBag(["you couldn't find me! i win ✦", 'hehe, here i am! i win', 'too sneaky for you! ✦']),
};

// ---- State ----
let endGame = null;
let phase = 'run'; // run | duck | hidden | peekOut | peek | peekIn | leave | out
let spot = null; // { kind, vis: '+x'|'-x'|'+y'|'-y', line, hide: {x,y}, peek: {x,y}, approach: {x,y} }
let nextSpot = null; // when relocating: where he's heading next
let phaseLeft = 0; // seconds left in timed phases (hidden / peek)
let gameLeft = 0;
let seen = false; // touched while peeking (spotted in update, acted on at the tick)
let lastWindow = null; // active window rectangle (screen coordinates), from system events

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const PEEKING = ['peekOut', 'peek', 'peekIn'];
const CLIPPED = ['duck', 'hidden', 'peekOut', 'peek', 'peekIn', 'leave'];

// ---- Hiding spots ----
// Each spot is an edge `line` with the visible side given by `vis` ('+x' = visible to the right
// of the line, '-y' = visible above it, ...). hide = fully covered, peek = PEEK_PX showing,
// approach = just outside, fully visible (where he runs to before ducking in).
function edgeSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  const along = (lo, hi) => {
    // Half the time right at a corner, otherwise anywhere along the edge.
    if (Math.random() < 0.5) return Math.random() < 0.5 ? lo : hi;
    return rand(lo, hi);
  };
  const ys = [a.top + 10, a.bottom - S - 10];
  const xs = [a.left + 10, a.right - S - 10];
  const sides = [
    () => { const y = along(...ys); return { side: 'left', vis: '+x', line: a.left, hide: { x: a.left - S - 2, y }, peek: { x: a.left - S + PEEK_PX, y }, approach: { x: a.left + 8, y } }; },
    () => { const y = along(...ys); return { side: 'right', vis: '-x', line: a.right, hide: { x: a.right + 2, y }, peek: { x: a.right - PEEK_PX, y }, approach: { x: a.right - S - 8, y } }; },
    () => { const x = along(...xs); return { side: 'top', vis: '+y', line: a.top, hide: { x, y: a.top - S - 2 }, peek: { x, y: a.top - S + PEEK_PX }, approach: { x, y: a.top + 8 } }; },
    () => { const x = along(...xs); return { side: 'bottom', vis: '-y', line: a.bottom, hide: { x, y: a.bottom + 2 }, peek: { x, y: a.bottom - PEEK_PX }, approach: { x, y: a.bottom - S - 8 } }; },
  ];
  return { kind: 'edge', ...sides[Math.floor(Math.random() * sides.length)]() };
}

// Behind the active window: just inside one of its edges, peeking out of that edge.
function windowSpot(ctx) {
  if (!lastWindow) return null;
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  // Screen coordinates → this (full-screen) window's coordinates.
  const ox = typeof window !== 'undefined' ? window.screenX || 0 : 0;
  const oy = typeof window !== 'undefined' ? window.screenY || 0 : 0;
  const w = { x: lastWindow.x - ox, y: lastWindow.y - oy, width: lastWindow.width, height: lastWindow.height };
  if (w.width < MIN_WINDOW.width || w.height < MIN_WINDOW.height) return null;
  const right = w.x + w.width;
  const bottom = w.y + w.height;
  // The part of each edge that's on screen, with room for him.
  const yLo = Math.max(w.y, a.top) + 6;
  const yHi = Math.min(bottom, a.bottom) - S - 6;
  const xLo = Math.max(w.x, a.left) + 6;
  const xHi = Math.min(right, a.right) - S - 6;
  const options = [];
  if (yHi > yLo && right + S + 8 <= a.right) {
    const y = rand(yLo, yHi);
    options.push({ side: 'right', vis: '+x', line: right, hide: { x: right - S - 4, y }, peek: { x: right - S + PEEK_PX, y }, approach: { x: right + 8, y } });
  }
  if (yHi > yLo && w.x - S - 8 >= a.left) {
    const y = rand(yLo, yHi);
    options.push({ side: 'left', vis: '-x', line: w.x, hide: { x: w.x + 4, y }, peek: { x: w.x - PEEK_PX, y }, approach: { x: w.x - S - 8, y } });
  }
  if (xHi > xLo && bottom + S + 8 <= a.bottom) {
    const x = rand(xLo, xHi);
    options.push({ side: 'bottom', vis: '+y', line: bottom, hide: { x, y: bottom - S - 4 }, peek: { x, y: bottom - S + PEEK_PX }, approach: { x, y: bottom + 8 } });
  }
  if (xHi > xLo && w.y - S - 8 >= a.top) {
    const x = rand(xLo, xHi);
    options.push({ side: 'top', vis: '-y', line: w.y, hide: { x, y: w.y + 4 }, peek: { x, y: w.y - PEEK_PX }, approach: { x, y: w.y - S - 8 } });
  }
  if (!options.length) return null;
  return { kind: 'window', ...options[Math.floor(Math.random() * options.length)] };
}

function pickSpot(ctx) {
  const win = Math.random() < WINDOW_CHANCE ? windowSpot(ctx) : null;
  return win || edgeSpot(ctx);
}

// How much of him to clip away so only the part on the visible side of the edge shows.
function insets(s, x0, y0, S) {
  const i = { t: 0, r: 0, b: 0, l: 0 };
  if (s.vis === '+x') i.l = clamp(s.line - x0, 0, S);
  if (s.vis === '-x') i.r = clamp(x0 + S - s.line, 0, S);
  if (s.vis === '+y') i.t = clamp(s.line - y0, 0, S);
  if (s.vis === '-y') i.b = clamp(y0 + S - s.line, 0, S);
  return i;
}

function applyClip(ctx) {
  const { pet, petEl } = ctx;
  if (!spot || !CLIPPED.includes(phase)) {
    petEl.style.clipPath = '';
    petEl.style.opacity = '';
    return { visible: true, rect: { x: pet.x, y: pet.y, w: pet.size, h: pet.size } };
  }
  const S = pet.size;
  const i = insets(spot, pet.x, pet.y, S);
  const w = S - i.l - i.r;
  const h = S - i.t - i.b;
  petEl.style.clipPath = `inset(${i.t}px ${i.r}px ${i.b}px ${i.l}px)`;
  petEl.style.opacity = w <= 0.5 || h <= 0.5 ? '0' : '';
  return { visible: w > 0.5 && h > 0.5, rect: { x: pet.x + i.l, y: pet.y + i.t, w, h } };
}

function moveTo(pet, target, speed, dt) {
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed * dt || d < 0.5) {
    pet.x = target.x;
    pet.y = target.y;
    return true;
  }
  pet.x += (dx / d) * speed * dt;
  pet.y += (dy / d) * speed * dt;
  if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
  return false;
}

function comeOut(ctx, result) {
  const { pet } = ctx;
  phase = 'out';
  if (spot) { pet.x = spot.approach.x; pet.y = spot.approach.y; } // step out into view
  pet.hiding = false;
  applyClip(ctx);
  if (result === 'found') {
    ctx.say(LINES.found(), 2500);
    burstStarbits(ctx, FOUND_REWARD);
    requestMood(ctx, 'playful', 'found in hide and seek');
  } else {
    ctx.say(LINES.starWon(), 2500);
  }
  ctx.log('hide-end', { result, spot: spot && `${spot.kind}:${spot.side}` });
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'hide-seek',
  priority: 10, // a game: same level as tag / pong

  init(ctx) {
    // Keep the latest active-window rectangle (from main/systemReads/activeWindow.js).
    ctx.events.onEntry((e) => {
      if (e.type === 'system' && (e.data.type === 'active-window' || e.data.type === 'active-window-bounds') && e.data.bounds) {
        lastWindow = e.data.bounds;
      }
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.setHideWindow = (rect) => { lastWindow = rect; return rect; };
    }
  },

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    if (reason === 'happening') {
      // Hiding on his own: only when he's in the mood and rested; never says "i'm tired".
      const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
      const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
      return relaxed && goodMood && restLeft(ctx) === 0;
    }
    return readyToPlay(ctx, reason);
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    spot = pickSpot(ctx);
    nextSpot = null;
    phase = 'run';
    gameLeft = GAME_FOR;
    seen = false;
    pet.mode = 'hide'; // behaviors stand down
    pet.hiding = true; // starbits.js / moodLabel.js keep quiet
    pet.bob = 0;
    ctx.log('hide-start', { reason, spot: `${spot.kind}:${spot.side}` }); // silent: no speech
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (phase === 'out') return;

    // Grabbed: you caught him (only possible while some of him is showing).
    if (pet.mode !== 'hide') {
      if (pet.mode === 'drag') comeOut(ctx, 'found');
      else { const end = endGame; endGame = null; end?.(`interrupted:${pet.mode}`); }
      return;
    }

    gameLeft -= TICK_SECONDS;
    if (seen) { comeOut(ctx, 'found'); return; }
    if (gameLeft <= 0) { comeOut(ctx, 'star-won'); return; }

    if (phase === 'hidden') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) phase = 'peekOut';
    } else if (phase === 'peek') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        if (Math.random() < RELOCATE_CHANCE) {
          nextSpot = pickSpot(ctx);
          phase = 'leave'; // slip out the way he came, then run to the new spot
          ctx.log('hide-relocate', { to: `${nextSpot.kind}:${nextSpot.side}` });
        } else {
          phase = 'peekIn';
        }
      }
    }
  },

  update(ctx, dt) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'hide' || phase === 'out' || !spot) return;
    pet.bob = 0;
    pet.squash = 1;

    if (phase === 'run') {
      if (moveTo(pet, spot.approach, RUN_SPEED, dt)) phase = 'duck';
    } else if (phase === 'duck') {
      if (moveTo(pet, spot.hide, DUCK_SPEED, dt)) { phase = 'hidden'; phaseLeft = rand(...HIDE_FOR); }
    } else if (phase === 'peekOut') {
      if (moveTo(pet, spot.peek, DUCK_SPEED, dt)) { phase = 'peek'; phaseLeft = PEEK_FOR; }
    } else if (phase === 'peekIn') {
      if (moveTo(pet, spot.hide, DUCK_SPEED, dt)) { phase = 'hidden'; phaseLeft = rand(...HIDE_FOR); }
    } else if (phase === 'leave') {
      if (moveTo(pet, spot.approach, DUCK_SPEED * 2, dt)) { spot = nextSpot; nextSpot = null; phase = 'run'; }
    }

    const { visible, rect } = applyClip(ctx);
    // Touching the visible part of him while he peeks = found (acted on at the next tick).
    if (PEEKING.includes(phase) && visible && cursor.x > -1000
      && cursor.x >= rect.x - CATCH_PAD && cursor.x <= rect.x + rect.w + CATCH_PAD
      && cursor.y >= rect.y - CATCH_PAD && cursor.y <= rect.y + rect.h + CATCH_PAD) {
      seen = true;
    }
  },

  stop(ctx, result) {
    const { pet, petEl } = ctx;
    endGame = null;
    pet.hiding = false;
    petEl.style.clipPath = '';
    petEl.style.opacity = '';
    if (pet.mode === 'hide') pet.mode = 'idle'; // pet.js steps him back onto the screen if needed
    if (result === 'found' || result === 'star-won') markPlayed(ctx); // shared rest between games
    phase = 'out';
    spot = null;
  },
};
