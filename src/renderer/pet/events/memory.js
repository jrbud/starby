// MEMORY — a chill game: remember the order the starbits light up, then click them in that order.
//
//   setup   "memory game! watch closely..." He glides to the middle of the usable screen and one
//           starbit of EVERY colour (the team's starbit PNGs) pops out into a ring around him.
//   show    he lights starbits up one by one: each grows, glows and gives a little shake for
//           LEVELS[n].on seconds. No clicking yet (clicks are ignored while he shows).
//   input   "your turn!" Click them in the same order. A right one does a little pop (and the
//           starbit pickup sound); you have INPUT_FOR seconds per click.
//   levels  3 sets, harder each time: longer sequences, shown faster (LEVELS). Clearing a set →
//           "set 2!" and the next, longer sequence.
//   end     all 3 sets → "you remembered everything!" + WIN_REWARD starbits.
//           A wrong click (that starbit shakes) or too slow → the right one lights up to show you,
//           "oops!", and you get CLEARED_REWARD starbits for each set you did clear.
//
// The starbits are `.hit` elements during the game, so clicks reach them (the rest of the screen
// stays click-through). Clicks are recorded on mousedown and judged at the next tick.
// Starts like the other games: his invite ("wanna play a memory game?", ./invite.js via the games
// timer), the "Play a game?" buttons, the tray menu ("Play memory"), starby.startEvent('memory').
// Shares the rest between games (./games.js). Owns the star via pet.mode = 'memory'.
// ART: the starbits are the team's PNGs (assets/starbits/<colour>1.png); the glow, grow and shake are
// CSS effects on those images. Nothing is drawn by code.
import { rand, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed } from './games.js';
import { STARBIT_COLORS, starbitImage } from '../../shared/starbitArt.js';
import { sfx } from '../../shared/sfx.js';

// ---- Tuning ----
// The 3 sets: how many starbits in the sequence, seconds each one stays lit, seconds between them.
const LEVELS = [
  { length: 3, on: 0.8, gap: 0.35 },
  { length: 5, on: 0.65, gap: 0.28 },
  { length: 7, on: 0.5, gap: 0.2 },
];
const STAR_SIZE = 46; // px: each starbit
const RING = 130; // px from his middle to each starbit
const GLIDE_SPEED = 900; // px/s to the middle
const INTRO_FOR = 1.6; // seconds before the first sequence
const BETWEEN_SETS = 1.6; // seconds of "set 2!" before the next sequence
const INPUT_FOR = 6; // seconds you have for each click
const RESULT_FOR = 2.5; // seconds the result shows before the game ends
const WIN_REWARD = 12;
const CLEARED_REWARD = 4; // per set cleared, when you don't finish

const LINES = {
  intro: lineBag(['memory game! watch closely...', 'remember the order! watch me...', 'memory time! keep your eyes on the starbits']),
  yourTurn: lineBag(['your turn!', 'now you!', 'go! same order!']),
  nextSet: (n) => `set ${n}! a bit harder...`,
  won: lineBag(['you remembered everything! wow!', 'perfect memory! you win!', 'all 3 sets! amazing!']),
  wrong: lineBag(['oops! not that one', 'oh no, wrong one!', 'hehe, so close!']),
  slow: lineBag(['too slow! it was this one', 'time! it was this one']),
};

// ---- State ----
let endGame = null;
let phase = 'done'; // setup | intro | show | input | between | result | done
let phaseLeft = 0;
let level = 0;
let sequence = []; // indexes into stars
let showIndex = 0; // which step of the sequence is being shown
let lit = false; // showing: the current star is lit (vs the gap after it)
let inputIndex = 0; // which step of the sequence you're on
let inputLeft = 0;
let clicked = null; // index of the star you just pressed (judged at the tick)
let stars = []; // { el, color, x, y }
let center = null; // { x, y } where he sits
let cleared = 0; // sets cleared
let played = false;
let styled = false;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });

function injectStyles() {
  if (styled || document.getElementById('memory-styles')) return;
  styled = true;
  const style = document.createElement('style');
  style.id = 'memory-styles';
  style.textContent = `
    .memory-star {
      position: absolute; left: 0; top: 0; width: ${STAR_SIZE}px; height: ${STAR_SIZE}px; object-fit: contain;
      cursor: pointer; transform: translate(-50%, -50%) scale(0.3); opacity: 0;
      transition: transform 180ms cubic-bezier(0.2, 1.4, 0.4, 1), opacity 180ms ease-out, filter 150ms ease-out;
      filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
    }
    .memory-star.in { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    .memory-star.in:hover { transform: translate(-50%, -50%) scale(1.08); }
    /* Lit up while he shows the order: bigger, glowing, a little shake. */
    .memory-star.lit {
      transform: translate(-50%, -50%) scale(1.5);
      filter: drop-shadow(0 0 10px rgba(255, 245, 200, 0.95)) drop-shadow(0 0 22px rgba(255, 232, 163, 0.8)) brightness(1.25);
      animation: memory-shake 0.18s ease-in-out 3;
    }
    /* A right click: a quick pop. */
    .memory-star.pop { animation: memory-pop 0.25s ease-out; }
    /* A wrong click: a dim shake. */
    .memory-star.wrong { filter: grayscale(0.7) brightness(0.7); animation: memory-shake 0.12s ease-in-out 4; }
    @keyframes memory-shake {
      0%, 100% { translate: 0 0; rotate: 0deg; } 25% { translate: -3px 0; rotate: -10deg; } 75% { translate: 3px 0; rotate: 10deg; }
    }
    @keyframes memory-pop { 0% { scale: 1; } 50% { scale: 1.3; } 100% { scale: 1; } }
  `;
  document.head.appendChild(style);
}

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

// One starbit of every colour, in a ring around where he'll sit, kept on screen.
function buildStars(ctx) {
  injectStyles();
  removeStars();
  stars = STARBIT_COLORS.map((color, i) => {
    const angle = -Math.PI / 2 + (i / STARBIT_COLORS.length) * Math.PI * 2; // starting at the top
    const x = center.x + Math.cos(angle) * RING;
    const y = center.y + Math.sin(angle) * RING;
    const el = document.createElement('img');
    el.className = 'memory-star hit'; // .hit: clickable while the game runs
    el.src = starbitImage(color, 1);
    el.alt = '';
    el.draggable = false;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const index = i;
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (phase === 'input' && clicked === null) clicked = index;
    });
    ctx.stage.appendChild(el);
    return { el, color, x, y };
  });
  // Pop out one after another.
  stars.forEach((s, i) => ctx.after(0.05 * i, () => s.el.classList.add('in'), 'memory: star in'));
}

function removeStars() {
  for (const s of stars) s.el.remove();
  stars = [];
}

function flash(star, cls, seconds, ctx) {
  star.el.classList.remove(cls);
  void star.el.offsetWidth; // restart the animation if it's already running
  star.el.classList.add(cls);
  ctx.after(seconds, () => star.el.classList.remove(cls), `memory: ${cls} off`);
}

// A new random sequence for this set (never the same starbit twice in a row).
function newSequence(n) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    let pick;
    do { pick = Math.floor(Math.random() * stars.length); } while (seq.length && pick === seq[seq.length - 1]);
    seq.push(pick);
  }
  return seq;
}

function startShow(ctx) {
  sequence = newSequence(LEVELS[level].length);
  showIndex = 0;
  lit = false;
  phase = 'show';
  phaseLeft = 0.5; // a beat before the first one lights
  ctx.log('memory-show', { level: level + 1, length: sequence.length });
}

function endWithResult(ctx, won, line) {
  phase = 'result';
  phaseLeft = RESULT_FOR;
  if (won) {
    ctx.say(line, RESULT_FOR * 1000);
    burstStarbits(ctx, WIN_REWARD);
    requestMood(ctx, 'happy', 'won memory');
    startJump({ height: rand(18, 24), air: 0.32 });
  } else {
    ctx.say(line, RESULT_FOR * 1000);
    if (cleared > 0) burstStarbits(ctx, cleared * CLEARED_REWARD);
  }
  ctx.log('memory-end', { won, cleared, level: level + 1 });
}

export default {
  name: 'memory',
  category: 'games',
  priority: 10, // a game: same level as the others

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    const a = areaOf(ctx);
    // Sit in the middle, with room for the ring (and his speech bubble above it).
    const cx = (a.left + a.right) / 2;
    const cy = Math.max(a.top + RING + STAR_SIZE + 70, Math.min(a.bottom - RING - STAR_SIZE, (a.top + a.bottom) / 2));
    center = { x: cx, y: cy };
    level = 0;
    cleared = 0;
    clicked = null;
    played = false;
    phase = 'setup';
    pet.mode = 'memory'; // behaviors stand down
    cancelJump();
    requestMood(ctx, 'playful', 'memory game');
    ctx.say(LINES.intro(), 2500);
    ctx.log('memory-start', { reason });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endGame || phase === 'done' || phase === 'setup') {
      if (endGame && pet.mode !== 'memory') finish(`interrupted:${pet.mode}`);
      return;
    }
    if (pet.mode !== 'memory') { finish(`interrupted:${pet.mode}`); return; } // grabbed, etc.

    if (phase === 'intro' || phase === 'between') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) startShow(ctx);
    } else if (phase === 'show') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft > 1e-6) return;
      const { on, gap } = LEVELS[level];
      if (!lit) {
        if (showIndex >= sequence.length) { // shown them all: your turn
          phase = 'input';
          inputIndex = 0;
          inputLeft = INPUT_FOR;
          played = true;
          ctx.say(LINES.yourTurn(), 1500);
          return;
        }
        flash(stars[sequence[showIndex]], 'lit', on, ctx);
        lit = true;
        phaseLeft = on;
      } else {
        lit = false;
        showIndex++;
        phaseLeft = gap;
      }
    } else if (phase === 'input') {
      inputLeft -= TICK_SECONDS;
      if (clicked !== null) {
        const want = sequence[inputIndex];
        const got = clicked;
        clicked = null;
        if (got === want) {
          flash(stars[got], 'pop', 0.25, ctx);
          sfx.play('collect-starbit', { volume: 0.5 });
          inputIndex++;
          inputLeft = INPUT_FOR;
          if (inputIndex >= sequence.length) { // set cleared
            cleared++;
            if (level + 1 >= LEVELS.length) { endWithResult(ctx, true, LINES.won()); return; }
            level++;
            phase = 'between';
            phaseLeft = BETWEEN_SETS;
            ctx.say(LINES.nextSet(level + 1), BETWEEN_SETS * 1000);
            if (!isJumping()) startJump({ height: rand(10, 14), air: 0.25 });
          }
        } else {
          flash(stars[got], 'wrong', 0.6, ctx);
          flash(stars[want], 'lit', 0.9, ctx); // show which one it was
          endWithResult(ctx, false, LINES.wrong());
        }
      } else if (inputLeft <= 0) {
        flash(stars[sequence[inputIndex]], 'lit', 0.9, ctx); // show which one it was
        endWithResult(ctx, false, LINES.slow());
      }
    } else if (phase === 'result') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) finish(cleared >= LEVELS.length ? 'won' : `lost-set-${level + 1}`);
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'memory' || phase === 'done') return;
    updateJump(pet, dt);
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
    if (phase === 'setup') {
      // Glide to the middle, then the starbits pop out around him.
      const tx = center.x - pet.size / 2;
      const ty = center.y - pet.size / 2;
      const dx = tx - pet.x;
      const dy = ty - pet.y;
      const d = Math.hypot(dx, dy);
      const step = GLIDE_SPEED * dt;
      if (d <= step || d < 0.5) {
        pet.x = tx;
        pet.y = ty;
        buildStars(ctx);
        phase = 'intro';
        phaseLeft = INTRO_FOR;
      } else {
        pet.x += (dx / d) * step;
        pet.y += (dy / d) * step;
        if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
      }
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    phase = 'done';
    removeStars();
    if (pet.mode === 'memory') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
