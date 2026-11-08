// CATCH — a game: Starby throws himself across the screen and you catch him in the box.
//
//   setup   "i'm gonna throw myself! catch me in the box!" A dashed catch box (BOX_STARBYS × BOX_STARBYS
//           Starbys big) appears on the right side of the usable screen, labelled with the strikes;
//           he goes to the far left.
//   windup  he stretches out (squashed wide, winding up) and says "ready?"
//   fly     he flings himself at the box, fast (THROW_SPEED). Click / grab him WHILE HE'S INSIDE THE
//           BOX → "NICE!" and WIN_REWARD starbits. He leaves the box uncaught → "STRIKE!"; he bonks
//           into the edge, walks back to the left (facing left) and winds up again. STRIKES_OUT strikes → you're out.
//           Grabbing him before he reaches the box or after he's left it → "CHEATER!", game over.
//
// CLICK-THROUGH: the pet window is click-through except over `.hit` elements, and that only flips
// on a mousemove. A cursor held still in the box while he flies under it would click the desktop.
// So during the game the box itself is a `.hit` element: clicks in it reach us, and count as a
// catch if he's under the cursor. It goes away (and stops catching clicks) when the game ends.
//
// Started from the "Play a game?" buttons, his invites (./invite.js), or starby.startEvent('catch').
// Owns the star via pet.mode = 'catch'. Clicks are recorded when they happen and judged at the next
// tick (decisions on ticks); flying runs every frame.
import { rand, clamp, approach, startJump, cancelJump, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed } from './games.js';

// ---- Tuning ----
const BOX_STARBYS = 5; // the box is this many Starbys wide and tall
const BOX_INSET = 60; // px from the usable area's right edge
const START_INSET = 20; // px from the usable area's left edge where he winds up
const WINDUP_FOR = 1.3; // seconds of "ready?" before each throw
const THROW_SPEED = 950; // px/s
const WALK_SPEED = 650; // px/s walking back to the left (at the start and after a strike)
const STEP_RATE = 14; // rad/s of the little step bounce while walking back
const STEP_HOP = 5; // px of that bounce
const STRIKES_OUT = 3;
const WIN_REWARD = 10;
const CATCH_PAD = 12; // px around him that still counts as clicking him (from inside the box)

const LINES = {
  intro: lineBag(["i'm gonna throw myself! catch me in the box!", 'catch me! but only in the box!']),
  ready: lineBag(['ready?', 'ready? ✦', 'here i go... ready?']),
  strike: (n) => (n >= STRIKES_OUT ? `STRIKE ${n}! you're out!` : `STRIKE ${n}!`),
  nice: lineBag(['NICE! ✦', 'NICE! great catch!', 'NICE!! you got me!']),
  cheater: lineBag(['CHEATER! that was outside the box!', "CHEATER! no catching outside the box!", 'hey! CHEATER! game over']),
};

// ---- State ----
let endGame = null;
let phase = 'setup'; // setup | windup | fly | bonk | return | done
let strikes = 0;
let phaseLeft = 0;
let laneY = 0; // center y of this throw
let box = null; // { x, y, size } in pet-window coordinates
let boxEl = null;
let labelEl = null;
let wasInBox = false; // his center was inside the box last frame
let leftBox = false; // he went through and out the far side this throw
let grab = null; // { inBox } recorded on mousedown, judged at the next tick
let thrown = false; // at least one throw happened (for the shared rest)
let walkTarget = null; // where he's walking to (picked ONCE per walk, so he heads straight there)
let stepT = 0;
let result = null; // { line, at } the NICE / CHEATER line, re-said if a click reply lands right after

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const inBoxNow = (pet) => {
  if (!box) return false;
  const c = centerOf(pet);
  return c.x >= box.x && c.x <= box.x + box.size && c.y >= box.y && c.y <= box.y + box.size;
};

function buildBox(ctx) {
  boxEl = document.createElement('div');
  boxEl.className = 'catch-box hit'; // .hit: catches clicks during the game (see CLICK-THROUGH above)
  Object.assign(boxEl.style, {
    position: 'absolute', boxSizing: 'border-box', display: 'none',
    border: '3px dashed rgba(255, 255, 255, 0.95)', outline: '2px solid rgba(43, 43, 58, 0.55)',
    borderRadius: '12px', background: 'rgba(108, 92, 231, 0.10)',
  });
  labelEl = document.createElement('div');
  Object.assign(labelEl.style, {
    position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: '6px',
    font: '700 12px "Segoe UI", system-ui, sans-serif', color: '#2b2b3a', background: 'rgba(255,255,255,0.92)',
    border: '1px solid #2b2b3a', borderRadius: '6px', padding: '2px 8px', whiteSpace: 'nowrap', pointerEvents: 'none',
  });
  boxEl.appendChild(labelEl);
  // Under Starby, so he flies in front of the box.
  ctx.stage.insertBefore(boxEl, ctx.petEl);
  // A click in the box counts if he's under the cursor (incl. a little padding).
  boxEl.addEventListener('mousedown', (e) => {
    const { pet } = ctx;
    if (phase !== 'fly' || grab) return;
    const near = e.clientX >= pet.x - CATCH_PAD && e.clientX <= pet.x + pet.size + CATCH_PAD
      && e.clientY >= pet.y - CATCH_PAD && e.clientY <= pet.y + pet.size + CATCH_PAD;
    if (near) grab = { inBox: inBoxNow(pet) };
  });
}

function showLabel() {
  if (!labelEl) return;
  const dots = Array.from({ length: STRIKES_OUT }, (_, i) => (i < strikes ? '●' : '○')).join(' ');
  labelEl.textContent = `CATCH ZONE · strikes ${dots}`;
}

function placeBox(ctx) {
  const a = areaOf(ctx);
  const size = Math.min(BOX_STARBYS * ctx.pet.size, (a.bottom - a.top) - 60);
  const y = clamp((a.top + a.bottom) / 2 - size / 2 + rand(-80, 80), a.top + 30, a.bottom - size - 10);
  box = { x: a.right - BOX_INSET - size, y, size };
  Object.assign(boxEl.style, {
    left: `${box.x}px`, top: `${box.y}px`, width: `${size}px`, height: `${size}px`, display: 'block',
  });
  showLabel();
}

// Where he winds up for the next throw: far left, at a height that sends him through the box.
function startSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  laneY = clamp(box.y + box.size / 2 + rand(-box.size * 0.3, box.size * 0.3), box.y + S / 2, box.y + box.size - S / 2);
  return { x: a.left + START_INSET, y: laneY - S / 2 };
}

function moveTo(pet, target, speed, dt) {
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed * dt || d < 0.5) { pet.x = target.x; pet.y = target.y; return true; }
  pet.x += (dx / d) * speed * dt;
  pet.y += (dy / d) * speed * dt;
  if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
  return false;
}

// Walk back to the far left, facing left (the 'left' art: pet.faceOverride, honoured by mood.js).
function walkBack(ctx, nextPhase) {
  phase = nextPhase;
  walkTarget = startSpot(ctx);
  stepT = 0;
  ctx.pet.faceOverride = 'left';
}

function windUp(ctx) {
  ctx.pet.faceOverride = null;
  ctx.pet.bob = 0;
  phase = 'windup';
  phaseLeft = WINDUP_FOR;
  wasInBox = false;
  leftBox = false;
  grab = null;
  ctx.pet.facing = 1;
  ctx.say(LINES.ready(), WINDUP_FOR * 1000);
}

// Say the result line, and remember it: the click that caught him also makes speech.js answer the
// click on mouse-up, which would cover "NICE!" — so 'pet:clicked' right after re-says it (init).
function sayResult(ctx, line, ms) {
  ctx.say(line, ms);
  result = { line, ms, at: ctx.clock.seconds };
}

function finish(ctx, result) {
  phase = 'done';
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'catch',
  category: 'games',
  priority: 10, // a game: same level as tag / pong / hide and seek

  init(ctx) {
    ctx.petEl.addEventListener('pet:clicked', () => {
      if (result && ctx.clock.seconds - result.at < 1.5) ctx.say(result.line, result.ms);
    });
  },

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end) {
    const { pet } = ctx;
    endGame = end;
    strikes = 0;
    thrown = false;
    grab = null;
    result = null;
    if (!boxEl) buildBox(ctx);
    // Everything that needs a click on him (mousedown on the star itself).
    if (!ctx.petEl.__catchHooked) {
      ctx.petEl.__catchHooked = true;
      ctx.petEl.addEventListener('mousedown', () => {
        if (pet.mode !== 'catch' || grab) return;
        // Only a click while he's flying through the box counts; any other moment of the game
        // (winding up, before the box, after it, bonking, flying back) is cheating.
        if (phase !== 'done') grab = { inBox: phase === 'fly' && inBoxNow(pet) };
      });
    }
    placeBox(ctx);
    pet.mode = 'catch'; // behaviors stand down
    cancelJump();
    requestMood(ctx, 'playful', 'catch');
    walkBack(ctx, 'setup');
    ctx.say(LINES.intro(), 2500);
    ctx.log('catch-start', {});
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (phase === 'done') return;

    // Grabbed / clicked (recorded on mousedown, or drag.js took him): judge it now.
    if (grab || pet.mode === 'drag') {
      const inBox = grab ? grab.inBox : false;
      grab = null;
      if (inBox) {
        sayResult(ctx, LINES.nice(), 2500);
        burstStarbits(ctx, WIN_REWARD);
        ctx.log('catch-caught', { strikes });
        finish(ctx, 'caught');
      } else {
        sayResult(ctx, LINES.cheater(), 2800);
        ctx.log('catch-cheater', { phase });
        finish(ctx, 'cheater');
      }
      return;
    }
    if (pet.mode !== 'catch') { finish(ctx, `interrupted:${pet.mode}`); return; }

    if (phase === 'windup') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        phase = 'fly';
        thrown = true;
        startJump({ height: 6, air: 0.15 }); // a little push-off
        ctx.log('catch-throw', { attempt: strikes + 1 });
      }
    } else if (phase === 'fly' && leftBox) {
      // Out the far side of the box without being caught.
      strikes++;
      showLabel();
      ctx.say(LINES.strike(strikes), 1600);
      ctx.log('catch-strike', { strikes });
      phase = 'bonk'; // keeps flying to the edge (update), then comes back or the game ends
      leftBox = false;
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'catch' || phase === 'done') return;
    updateJump(pet, dt);
    const a = areaOf(ctx);

    if (phase === 'setup' || phase === 'return') {
      // Walking back to the left: one fixed target, facing left, a little step bounce.
      pet.squash = approach(pet.squash, 1, dt, 10);
      stepT += dt * STEP_RATE;
      pet.bob = -Math.abs(Math.sin(stepT)) * STEP_HOP;
      if (moveTo(pet, walkTarget, WALK_SPEED, dt)) windUp(ctx);
      return;
    }
    if (phase === 'windup') {
      // Stretched out wide while winding up (pet.js: squash < 1 = wide and flat).
      pet.squash = approach(pet.squash, 0.62, dt, 6);
      return;
    }
    if (phase === 'fly' || phase === 'bonk') {
      pet.squash = approach(pet.squash, 0.78, dt, 12); // streamlined while flying
      pet.x += THROW_SPEED * dt;
      pet.facing = 1;
      const inBox = inBoxNow(pet);
      if (phase === 'fly' && wasInBox && !inBox) leftBox = true; // went through and out
      wasInBox = inBox;
      if (pet.x >= a.right - pet.size) {
        pet.x = a.right - pet.size; // bonk into the edge
        pet.squash = 1.35;
        if (phase === 'fly') { leftBox = true; } // (in case a frame skipped the box exit)
        if (phase === 'bonk') {
          if (strikes >= STRIKES_OUT) { ctx.log('catch-out', {}); finish(ctx, 'out'); return; }
          walkBack(ctx, 'return');
        }
      }
      return;
    }
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endGame = null;
    phase = 'done';
    grab = null;
    if (boxEl) boxEl.style.display = 'none'; // also stops it catching clicks
    pet.faceOverride = null;
    pet.bob = 0;
    if (pet.mode === 'catch') pet.mode = 'idle';
    if (thrown) markPlayed(ctx); // shared rest between games
    if (result === 'caught' && (pet.mood === 'happy' || pet.mood === 'playful')) requestMood(ctx, 'playful', 'caught');
  },
};
