// PONG — a high-priority event. Starby is the ball.
//
//   setup   he glides to the middle of the usable screen; a paddle appears on each side:
//           LEFT = yours (follows your mouse up and down), RIGHT = the AI
//   ready   "pong? i'll be the ball!", then "3...", "2...", "1...", "GO!" (./games.js)
//   play    he's served toward you. He bounces off the top and bottom edges and off the
//           paddles: where he hits a paddle sets the bounce angle (classic pong), and every
//           hit speeds him up a little. He spins while flying and squashes on each hit.
//           The AI predicts where he'll arrive but misjudges more as he gets faster, and it has
//           a top speed, so long rallies give you a chance.
//   end     ONE POINT WINS:
//             he gets past the AI paddle → you win ('user-won'): he bursts out WIN_REWARD starbits
//             he gets past your paddle  → you lose ('ai-won'): he takes back any starbits on screen
//           grabbing him mid-game is a foul ('foul'); made dizzy etc. → ends quietly
//
// Started when Starby asks you to play and picks pong (./invite.js, Yes), from the "Play a game?"
// buttons (click him), the right-click menu ("Play pong"), or starby.startEvent('pong') in
// DevTools. After a game he needs the shared rest (./games.js).
//
// Owns the star via pet.mode = 'pong' (behaviors stand down for modes they don't know).
// Decisions (AI aim, scoring, ending) run on ticks; motion runs every frame.
//
// ART: the paddles are plain flat CSS bars, i.e. UI chrome like the countdown box, not character
// art. Only YOUR paddle gets a "YOU" label, and it fades out YOU_LABEL_FOR seconds after "GO!" (the
// other paddle is obviously the AI's, so it has no label). Swap in team art here if wanted.
import { rand, clamp, approach, startJump, cancelJump, updateJump } from '../behaviors/motion.js';
import { chat, lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits, reclaimStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed, createReady } from './games.js';

// ---- Tuning ----
const PADDLE_W = 14; // px
const PADDLE_H = 130; // px
const PADDLE_INSET = 40; // px from the usable area's left/right edge
const PADDLE_FOLLOW = 25; // how snappily your paddle follows the mouse (higher = tighter)
const BALL_R = 26; // px: collision radius of the star (a bit smaller than his 64px box)
const HIT_GRACE = 0.6; // paddles count as BALL_R * this taller at each end (forgiving edges)
const SETUP_SPEED = 900; // px/s gliding to the middle
const SERVE_SPEED = 620; // px/s
const SERVE_ANGLE = [12, 30]; // degrees off horizontal
const SPEEDUP = 1.09; // speed multiplier per paddle hit
const MAX_SPEED = 1500; // px/s
const MAX_BOUNCE = 55; // degrees: hitting the very end of a paddle
const AI_SPEED = 430; // px/s top speed of the AI paddle
const YOU_LABEL_FOR = 1.5; // seconds after "GO!" before the "YOU" label fades out
const YOU_LABEL_FADE = 0.6; // seconds the fade takes
const AI_ERROR_BASE = 40; // px of aiming error per rally hit...
const AI_ERROR_PER_SPEED = 0.09; // ...plus this much per px/s of ball speed
const SPIN_PER_SPEED = 1 / 120; // rad/s of spin per px/s of speed
const WIN_REWARD = 7; // starbits he bursts out when you win

const LINES = {
  start: lineBag(["pong? i'll be the ball!", 'ooh, pong! bonk me across!', "boing boing! let's play pong"]),
  hit: lineBag(['boing!', 'bonk!', 'wheee!', 'whoa!', 'ping!']),
  // (Never mention "AI" in what he says: the other side is just "the other paddle".)
  userWon: lineBag(['you got me past the other paddle! you win ✦', 'woo! point to you! you win', 'nice shot! you win ✦']),
  aiWon: lineBag(['aw, you missed me! the other paddle wins', 'whoops! point to the other paddle', 'so close! the other paddle gets this one']),
  foul: lineBag(['hey! no grabbing the ball!', "you can't hold the ball! game over"]),
  dizzy: lineBag(['too dizzy to be a ball...', '@_@ game over...']),
};

// ---- State (reset every start) ----
let endGame = null;
let phase = 'setup'; // 'setup' | 'ready' | 'play'
let vx = 0;
let vy = 0;
let leftY = 0; // paddle centers (y)
let rightY = 0;
let aiTargetY = 0;
let aiError = 0;
let hits = 0;
let scored = null; // 'user' | 'ai', set in update when he gets past a paddle; acted on at the tick
let spin = 0; // his spin angle as the ball (radians). Kept here and written to pet.rotation every
// frame, because drag.js resets pet.rotation to 0 each frame while he isn't held.
let els = null; // { left, right, youLabel }
const ready = createReady();

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const ballX = (pet) => pet.x + pet.size / 2;
const ballY = (pet) => pet.y + pet.size / 2;
const setBall = (pet, x, y) => { pet.x = x - pet.size / 2; pet.y = y - pet.size / 2; };
const leftFace = (a) => a.left + PADDLE_INSET + PADDLE_W; // the side the ball hits
const rightFace = (a) => a.right - PADDLE_INSET - PADDLE_W;
const clampPaddle = (a, y) => clamp(y, a.top + PADDLE_H / 2, a.bottom - PADDLE_H / 2);

// ---- Paddles (plain DOM) ----
function injectStyles() {
  if (document.getElementById('pong-styles')) return;
  const style = document.createElement('style');
  style.id = 'pong-styles';
  style.textContent = `
    .pong-paddle {
      position: absolute; left: 0; top: 0; width: ${PADDLE_W}px; height: ${PADDLE_H}px;
      box-sizing: border-box; background: #2b2b3a; border: 2px solid #ffffff; border-radius: 7px;
      pointer-events: none; display: none; will-change: transform;
    }
    .pong-label {
      position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%);
      font: 800 20px "Segoe UI", system-ui, sans-serif; color: #2b2b3a; background: rgba(255,255,255,0.95);
      border: 2px solid #2b2b3a; border-radius: 8px; padding: 3px 12px; white-space: nowrap; margin-bottom: 10px;
      letter-spacing: 1px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); /* big + shadowed: readable at any resolution */
      transition: opacity ${YOU_LABEL_FADE}s ease-out;
    }
  `;
  document.head.appendChild(style);
}

function buildPaddles(stage) {
  injectStyles();
  const make = () => {
    const el = document.createElement('div');
    el.className = 'pong-paddle';
    stage.appendChild(el);
    return el;
  };
  const left = make();
  const youLabel = document.createElement('div'); // only your paddle is labelled
  youLabel.className = 'pong-label';
  youLabel.textContent = 'YOU';
  left.appendChild(youLabel);
  return { left, right: make(), youLabel };
}

function drawPaddles(ctx) {
  const a = areaOf(ctx);
  const lx = a.left + PADDLE_INSET;
  const rx = rightFace(a);
  els.left.style.transform = `translate(${Math.round(lx)}px, ${Math.round(leftY - PADDLE_H / 2)}px)`;
  els.right.style.transform = `translate(${Math.round(rx)}px, ${Math.round(rightY - PADDLE_H / 2)}px)`;
}

function showPaddles(show) {
  if (!els) return;
  els.left.style.display = show ? 'block' : 'none';
  els.right.style.display = show ? 'block' : 'none';
}

// ---- Ball ----
function serve(ctx) {
  const a = (rand(...SERVE_ANGLE) * Math.PI) / 180 * (Math.random() < 0.5 ? 1 : -1);
  vx = -Math.cos(a) * SERVE_SPEED; // toward you first
  vy = Math.sin(a) * SERVE_SPEED;
  hits = 0;
  aiError = 0;
  ctx.log('pong-serve', {});
}

// He hit a paddle at height `y`: bounce away, angled by where on the paddle he hit, a bit faster.
function bounceOff(ctx, side, y, paddleY) {
  const { pet } = ctx;
  const speed = Math.min(MAX_SPEED, Math.hypot(vx, vy) * SPEEDUP);
  const rel = clamp((y - paddleY) / (PADDLE_H / 2 + BALL_R * HIT_GRACE), -1, 1);
  const angle = (rel * MAX_BOUNCE * Math.PI) / 180;
  const dir = side === 'left' ? 1 : -1;
  vx = Math.cos(angle) * speed * dir;
  vy = Math.sin(angle) * speed;
  hits++;
  pet.squash = 0.72; // squish on impact (eased back each frame)
  if (side === 'left') aiError = rand(-1, 1) * (AI_ERROR_BASE + speed * AI_ERROR_PER_SPEED); // AI misjudges this one
  ctx.log('pong-hit', { side, speed: Math.round(speed) });
  if (hits % 3 === 1) chat(ctx, LINES.hit(), 700, { gap: 1.5 });
}

// Where the ball will cross x = targetX, following bounces off the top/bottom edges.
function predictY(a, bx, by, targetX) {
  if (vx <= 0) return null;
  const t = (targetX - bx) / vx;
  const lo = a.top + BALL_R;
  const hi = a.bottom - BALL_R;
  const span = hi - lo;
  if (span <= 0) return by;
  let y = by + vy * t - lo; // fold the straight path back into [lo, hi]
  const period = span * 2;
  y = ((y % period) + period) % period;
  return lo + (y > span ? period - y : y);
}

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'pong',
  category: 'games',
  priority: 10,

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false; // being held / thrown
    return readyToPlay(ctx, reason); // right after a game: "i'm tired"
  },

  start(ctx, end) {
    const { pet } = ctx;
    endGame = end;
    phase = 'setup';
    vx = 0;
    vy = 0;
    scored = null;
    spin = 0;
    const a = areaOf(ctx);
    leftY = clampPaddle(a, (a.top + a.bottom) / 2);
    rightY = leftY;
    aiTargetY = rightY;
    els = els || buildPaddles(ctx.stage);
    els.youLabel.style.opacity = '1'; // shown again for each new game
    drawPaddles(ctx);
    showPaddles(true);
    pet.mode = 'pong'; // behaviors stand down
    cancelJump();
    requestMood(ctx, 'playful', 'pong');
  },

  onTick(ctx) {
    const { pet } = ctx;

    // Something else took over.
    if (pet.mode !== 'pong') {
      if (pet.mode === 'drag' && phase === 'play') {
        ctx.say(LINES.foul(), 2200);
        finish('foul');
      } else {
        finish(`interrupted:${pet.mode}`);
      }
      return;
    }
    if (pet.mood !== 'playful' && pet.mood !== 'happy') {
      if (pet.mood === 'dizzy') ctx.say(LINES.dizzy(), 2000);
      finish(`mood:${pet.mood}`);
      return;
    }

    const a = areaOf(ctx);

    // ---- setup: glide to the middle ----
    if (phase === 'setup') {
      const cx = (a.left + a.right) / 2;
      const cy = (a.top + a.bottom) / 2;
      if (Math.hypot(ballX(pet) - cx, ballY(pet) - cy) < 4) {
        phase = 'ready';
        ready.start();
        startJump({ height: rand(14, 20), air: 0.3 });
        ctx.say(LINES.start(), ready.pause * 1000);
        ctx.log('pong-ready', {});
      }
      return;
    }

    // ---- ready: "3... 2... 1... GO!" ----
    if (phase === 'ready') {
      if (ready.tick(ctx)) {
        phase = 'play';
        serve(ctx);
        // You know which paddle is yours by now: fade the "YOU" label out.
        const label = els.youLabel;
        ctx.after(YOU_LABEL_FOR, () => { label.style.opacity = '0'; }, 'pong: hide YOU label');
      }
      return;
    }

    // ---- play ----
    if (scored) {
      // ONE POINT WINS.
      if (scored === 'user') {
        ctx.say(LINES.userWon(), 2500);
        burstStarbits(ctx, WIN_REWARD);
        finish('user-won');
      } else {
        ctx.say(LINES.aiWon(), 2500);
        reclaimStarbits(ctx);
        finish('ai-won');
      }
      return;
    }

    // AI: aim at where he'll arrive (plus its misjudgement), or drift back to the middle.
    const predicted = predictY(a, ballX(pet), ballY(pet), rightFace(a) - BALL_R);
    aiTargetY = predicted !== null ? predicted + aiError : (a.top + a.bottom) / 2;
  },

  update(ctx, dt) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'pong' || !els) return;
    const a = areaOf(ctx);

    // Paddles: yours follows the mouse; the AI's chases its target at a capped speed.
    if (cursor.y > -1000) leftY = clampPaddle(a, approach(leftY, cursor.y, dt, PADDLE_FOLLOW));
    const step = AI_SPEED * dt;
    rightY = clampPaddle(a, rightY + clamp(aiTargetY - rightY, -step, step));
    drawPaddles(ctx);

    updateJump(pet, dt);
    pet.squash = approach(pet.squash, 1, dt, 10);

    if (phase === 'setup') {
      const cx = (a.left + a.right) / 2;
      const cy = (a.top + a.bottom) / 2;
      const dx = cx - ballX(pet);
      const dy = cy - ballY(pet);
      const d = Math.hypot(dx, dy);
      const s = Math.min(d, SETUP_SPEED * dt);
      if (d > 0.5) setBall(pet, ballX(pet) + (dx / d) * s, ballY(pet) + (dy / d) * s);
      if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
      return;
    }
    if (phase !== 'play' || scored) return;

    // ---- Ball physics ----
    const px = ballX(pet);
    const py = ballY(pet);
    let bx = px + vx * dt;
    let by = py + vy * dt;

    // Top / bottom edges of the usable area.
    if (by - BALL_R < a.top) { by = a.top + BALL_R; vy = Math.abs(vy); }
    if (by + BALL_R > a.bottom) { by = a.bottom - BALL_R; vy = -Math.abs(vy); }

    // Paddles: check whether he crossed a paddle's face this frame (no tunnelling at speed).
    const reach = PADDLE_H / 2 + BALL_R * HIT_GRACE;
    const lf = leftFace(a);
    if (vx < 0 && px - BALL_R >= lf && bx - BALL_R <= lf) {
      const t = (px - BALL_R - lf) / ((px - bx) || 1);
      const yAt = py + (by - py) * t;
      if (Math.abs(yAt - leftY) <= reach) {
        bx = lf + BALL_R;
        bounceOff(ctx, 'left', yAt, leftY);
      }
    }
    const rf = rightFace(a);
    if (vx > 0 && px + BALL_R <= rf && bx + BALL_R >= rf) {
      const t = (rf - (px + BALL_R)) / ((bx - px) || 1);
      const yAt = py + (by - py) * t;
      if (Math.abs(yAt - rightY) <= reach) {
        bx = rf - BALL_R;
        bounceOff(ctx, 'right', yAt, rightY);
      }
    }

    // Past a paddle? He bonks into the screen edge behind it and the point is scored.
    if (bx - BALL_R <= a.left) { bx = a.left + BALL_R; scored = 'ai'; }
    if (bx + BALL_R >= a.right) { bx = a.right - BALL_R; scored = 'user'; }
    if (scored) {
      vx = 0;
      vy = 0;
      pet.squash = 0.7;
      ctx.log('pong-point', { to: scored, hits });
    }

    setBall(pet, bx, by);
    pet.facing = vx >= 0 ? 1 : -1;
    spin += Math.hypot(vx, vy) * SPIN_PER_SPEED * dt * (vx >= 0 ? 1 : -1); // spinning ball
    pet.rotation = spin;
    pet.bob = 0;
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    showPaddles(false);
    if (pet.mode === 'pong') pet.mode = 'idle'; // hand him back (grabbed → stays 'drag')
    const played = phase === 'play'; // got past "GO!"
    if (played) markPlayed(ctx); // shared rest between games (./games.js)
    if (pet.mood === 'happy' || pet.mood === 'playful') requestMood(ctx, 'playful', 'pong over');
  },
};
