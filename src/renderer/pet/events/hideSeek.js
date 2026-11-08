// HIDE AND SEEK — Starby runs off and hides, without saying a word.
//
// He only ever hides just past an EDGE of the usable screen: behind the taskbar, or past the
// left / right / top edge (edges of ctx.area()). No windows.
// The pet window is always on top, so "behind the edge" is drawn by clipping: while he's in a spot,
// the part of him past the edge is clipped away (CSS clip-path on the pet element), so a peek
// shows exactly the bit sticking out.
//
//   run     he runs off fast to an edge spot and ducks in. No speech, no countdown, no starbit
//           drops, no mood label (pet.hiding tells starbits.js / moodLabel.js to keep quiet).
//   hidden  fully hidden for HIDE_FOR seconds. Nothing gives him away.
//   peek    he peeks out (PEEK_PX of him visible) for PEEK_FOR seconds — and every peek comes from
//           a NEW random spot on any edge: while hidden he silently moves there, so where you saw
//           him go isn't where he'll pop out. Touch him with the cursor (or grab him) while he's
//           peeking → you found him: "you found me!" and FOUND_REWARD starbits.
//   end     found → 'found'; not found within GAME_FOR seconds → he comes out, 'star-won'.
//
// Starts: the "Play a game?" buttons, the happenings timer (./happenings.js: he just quietly goes
// and hides on his own), the right-click menu ("Play hide & seek"), or starby.startEvent('hide-seek').
// Never offered in his "wanna play?" invites: he doesn't announce it. Shares the rest between games.
//
// Owns the star via pet.mode = 'hide'. Decisions (timers, found, picking spots) on ticks; motion
// and clipping every frame.
import { rand, clamp } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed, restLeft } from './games.js';

// ---- Tuning ----
const GAME_FOR = 150; // seconds before he gives up and comes out
const RUN_SPEED = 950; // px/s running to his first spot
const DUCK_SPEED = 220; // px/s sliding into / out of cover
const HIDE_FOR = [4, 9]; // seconds fully hidden between peeks
const PEEK_FOR = 1.5; // seconds peeking
const PEEK_PX = 30; // px of him that show when he peeks
const CATCH_PAD = 6; // px around his visible part that still counts as touching him
const FOUND_REWARD = 10;

const LINES = {
  found: lineBag(['you found me! ✦', 'aw, you got me!', 'how did you see me?!', 'found me! hehe']),
  starWon: lineBag(["you couldn't find me! i win ✦", 'hehe, here i am! i win', 'too sneaky for you! ✦']),
};

// ---- State ----
let endGame = null;
let phase = 'out'; // run | duck | hidden | peekOut | peek | peekIn | out
let spot = null; // { side, vis: '+x'|'-x'|'+y'|'-y', line, hide: {x,y}, peek: {x,y}, approach: {x,y} }
let phaseLeft = 0; // seconds left in timed phases (hidden / peek)
let gameLeft = 0;
let seen = false; // touched while peeking (spotted in update, acted on at the tick)
let peeks = 0;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const PEEKING = ['peekOut', 'peek', 'peekIn'];
const CLIPPED = ['duck', 'hidden', 'peekOut', 'peek', 'peekIn'];

// ---- Hiding spots (edges of the usable screen only) ----
// Each spot is an edge `line` with the visible side given by `vis` ('+x' = visible to the right
// of the line, '-y' = visible above it, ...). hide = fully past the edge, peek = PEEK_PX showing,
// approach = just inside, fully visible (where he runs to before ducking out of sight).
function edgeSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  const along = (lo, hi) => {
    // Sometimes right at a corner, otherwise anywhere along the edge.
    if (Math.random() < 0.3) return Math.random() < 0.5 ? lo : hi;
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
  return sides[Math.floor(Math.random() * sides.length)]();
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

// While fully hidden: slip to a new random edge spot (unseen), ready to peek out from there.
function moveToNewSpot(ctx) {
  const { pet } = ctx;
  spot = edgeSpot(ctx);
  pet.x = spot.hide.x;
  pet.y = spot.hide.y;
  applyClip(ctx); // still fully hidden at the new spot
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
  ctx.log('hide-end', { result, peeks, spot: spot && spot.side });
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'hide-seek',
  priority: 10, // a game: same level as tag / pong

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
    spot = edgeSpot(ctx);
    phase = 'run';
    gameLeft = GAME_FOR;
    seen = false;
    peeks = 0;
    pet.mode = 'hide'; // behaviors stand down
    pet.hiding = true; // starbits.js / moodLabel.js keep quiet
    pet.bob = 0;
    ctx.log('hide-start', { reason, spot: spot.side }); // silent: no speech
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
      if (phaseLeft <= 0) {
        moveToNewSpot(ctx); // peek out from somewhere new
        phase = 'peekOut';
        peeks++;
        ctx.log('hide-peek', { side: spot.side });
      }
    } else if (phase === 'peek') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) phase = 'peekIn';
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
