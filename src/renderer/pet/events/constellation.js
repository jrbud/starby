// CONSTELLATION QUIZ — a game: Starby draws a constellation out of starbits and quizzes you on it.
//
//   intro   "quiz time! guess my constellation!"
//   place   he throws one starbit per star, every PLACE_EVERY seconds; each flies to its spot and
//           stays there (placeStarbit in ../behaviors/starbits.js: held, can't be collected yet)
//   lines   the constellation's lines draw in, one after another (LINE_FOR seconds each)
//   ask     "which constellation is this? (20s)" in a talkbox, with 4 answers bursting out around him
//           (the same menu as the right-click dialogue, showMenu): the right one and 3 others
//           from CONSTELLATIONS (./constellations.js), shuffled. ANSWER_FOR seconds to choose.
//   result  right       → "yes!! it's Orion!" and every starbit in it is released: they float like
//                          normal drops, yours to collect by hovering (releaseStarbits)
//           wrong / no answer → "nope! it was Orion" and he takes them all back: they fly into him
//                          (reclaimStarbits(ctx, list); nothing is taken from your count)
//           then the lines fade out and the game ends.
//
// Starts like the other games: his "wanna do a star quiz?" invite (./invite.js, via the games timer),
// the "Play a game?" buttons, the right-click menu ("Play constellation quiz"), or
// starby.startEvent('constellation'). Shares the rest between games (./games.js).
//
// THE LINES are the team's hand-drawn stroke (assets/menuIcons/line.png), one per connection, laid
// from star to star and stretched to fit, in the app's theme: yellow (LINE_COLOR) with the dark
// purple outline (OUTLINE_COLOR). line.png is a single dark stroke and the file isn't changed: its
// shape is used twice through CSS masks (a purple copy behind, a slightly thinner yellow copy on
// top), like the pong paddles. Each line draws in by being revealed from one star to the next
// (clip-path), so the stroke never squashes. The stars are the team's starbit PNGs.
//
// Owns the star via pet.mode = 'quiz' (he stays put, faces the drawing, hops now and then).
// Decisions (timers, answers) on ticks; the line drawing and the popup position every frame.
import { rand, chance, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { placeStarbit, releaseStarbits, reclaimStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { showMenu, setMenuLine, closeMenu } from '../dialogue/dialogue.js';
import { readyToPlay, markPlayed } from './games.js';
import { CONSTELLATIONS } from './constellations.js';

// ---- Tuning ----
const INTRO_FOR = 1.5; // seconds of "quiz time!" before the first star
const PLACE_EVERY = 0.3; // seconds between stars
const SETTLE_FOR = 0.6; // seconds after the last star (it's still flying) before the lines
const LINE_FOR = 0.3; // seconds to draw each line
const ANSWER_FOR = 20; // seconds to pick an answer
const RESULT_FOR = 2.5; // seconds the result shows before the lines fade and the game ends
const LINE_FADE = 0.8; // seconds for the lines to fade out
const BOX = [260, 400]; // px: the drawing's longest side (fraction of the screen, clamped to this)
const BOX_OF_SCREEN = 0.32; // ...as a fraction of the usable screen's smaller side
const GAP = 60; // px between him and the drawing
const MARGIN = 70; // px kept clear around the drawing inside the usable screen (top: room for his bubble)
const CHOICES = 4;
const LINE_COLOR = '#ffe8a3'; // the app's yellow (shop.css --yellow)
const OUTLINE_COLOR = '#2d2335'; // the app's dark purple outline (the colour of line.png / the buttons' edges)
const LINE_THICK = 9; // px: each line's thickness (outline included)
const LINE_OUTLINE = 2; // px of purple showing around the yellow
const LINE_ART = '../../../assets/menuIcons/line.png'; // team art; relative to src/renderer/pet/index.html
const LINE_PNG = [1853, 164]; // the PNG's size...
const LINE_BOX = [65, 44, 1783, 121]; // ...and where the stroke sits in it (left, top, right, bottom)

const LINES = {
  intro: lineBag(['quiz time! guess my constellation!', 'watch this! i\'ll draw you a constellation', 'star quiz! ready?']),
  ask: lineBag(['which constellation is this?', 'what\'s this one called?', 'do you know this one?']),
  right: (name) => lineBag([`yes!! it's ${name}! they're all yours`, `${name}! you got it! grab them!`, `correct, it's ${name}! take the starbits!`])(),
  wrong: (name) => lineBag([`nope! it was ${name}. i'm keeping these!`, `wrong! that's ${name}. mine now!`, `hehe, no! it's ${name}. all mine!`])(),
  timeout: (name) => `too slow! it was ${name}. mine!`,
};

// ---- State ----
let endGame = null;
let phase = 'done'; // intro | place | settle | lines | ask | result | done
let phaseLeft = 0;
let shape = null; // entry of CONSTELLATIONS
let lastShape = null;
let points = []; // [{x, y}] screen positions of the stars
let held = []; // starbit handles from placeStarbit (null when spawning is off)
let placed = 0;
let linesEl = null; // the layer holding the lines (behind the starbits)
let lineEls = []; // one element per shape line (purple outline + yellow fill), drawn in order
let drawing = 0; // index of the line being drawn
let drawT = 0; // seconds into the current line
let answer = null; // name picked in the popup (acted on at the next tick)
let outcome = null; // 'right' | 'wrong' | 'timeout'
let played = false; // got as far as asking (counts for the rest between games)
let askLine = ''; // his question this round; the menu shows it with the seconds left
let shownSecs = -1;
let left = 0;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function pickShape() {
  const choices = CONSTELLATIONS.length > 1 ? CONSTELLATIONS.filter((c) => c !== lastShape) : CONSTELLATIONS;
  return choices[Math.floor(Math.random() * choices.length)];
}

// Where the drawing goes: beside him on the roomier side, scaled to fit, inside the usable screen.
function layout(ctx, c) {
  const a = areaOf(ctx);
  const { pet } = ctx;
  const longest = Math.max(BOX[0], Math.min(BOX[1], Math.min(a.right - a.left, a.bottom - a.top) * BOX_OF_SCREEN));
  const xs = c.stars.map((s) => s[0]);
  const ys = c.stars.map((s) => s[1]);
  const minX = Math.min(...xs); const spanX = Math.max(...xs) - minX || 1;
  const minY = Math.min(...ys); const spanY = Math.max(...ys) - minY || 1;
  const scale = longest / Math.max(spanX, spanY);
  const w = spanX * scale;
  const h = spanY * scale;
  const cx = pet.x + pet.size / 2;
  const cy = pet.y + pet.size / 2;
  const roomRight = a.right - (pet.x + pet.size);
  const roomLeft = pet.x - a.left;
  let x = roomRight >= roomLeft ? pet.x + pet.size + GAP : pet.x - GAP - w;
  let y = cy - h / 2;
  x = Math.max(a.left + MARGIN, Math.min(a.right - MARGIN - w, x));
  y = Math.max(a.top + MARGIN, Math.min(a.bottom - MARGIN - h, y));
  pet.facing = x + w / 2 >= cx ? 1 : -1;
  return c.stars.map(([sx, sy]) => ({ x: x + (sx - minX) * scale, y: y + (sy - minY) * scale }));
}

// CSS for a copy of line.png's stroke (LINE_BOX) stretched to exactly fill a w × h box.
function lineMask(w, h) {
  const sx = w / (LINE_BOX[2] - LINE_BOX[0]);
  const sy = h / (LINE_BOX[3] - LINE_BOX[1]);
  return {
    maskImage: `url('${LINE_ART}')`, maskRepeat: 'no-repeat',
    maskSize: `${(LINE_PNG[0] * sx).toFixed(2)}px ${(LINE_PNG[1] * sy).toFixed(2)}px`,
    maskPosition: `${(-LINE_BOX[0] * sx).toFixed(2)}px ${(-LINE_BOX[1] * sy).toFixed(2)}px`,
  };
}

function buildLines(ctx) {
  if (!linesEl) {
    linesEl = document.createElement('div');
    linesEl.className = 'constellation-lines';
    Object.assign(linesEl.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  }
  // Behind the starbits: insert before the first child so the stars sit on top of the lines.
  if (!linesEl.parentNode) ctx.stage.insertBefore(linesEl, ctx.stage.firstChild || null);
  linesEl.style.transition = '';
  linesEl.style.opacity = '1';
  for (const el of lineEls) el.remove();
  lineEls = shape.lines.map(([i, j]) => {
    const a = points[i];
    const b = points[j];
    const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    // One line: starts at star a, as long as the gap to star b, turned to point at it.
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute', left: `${a.x}px`, top: `${a.y - LINE_THICK / 2}px`, width: `${len}px`, height: `${LINE_THICK}px`,
      transformOrigin: `0 ${LINE_THICK / 2}px`, transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
      clipPath: 'inset(0 100% 0 0)', // hidden; growLine reveals it from star a to star b
    });
    const outline = document.createElement('div'); // purple, full size
    Object.assign(outline.style, { position: 'absolute', inset: '0', background: OUTLINE_COLOR, ...lineMask(len, LINE_THICK) });
    const fillW = Math.max(1, len - 2 * LINE_OUTLINE);
    const fillH = LINE_THICK - 2 * LINE_OUTLINE;
    const fill = document.createElement('div'); // yellow, a bit smaller: the purple shows around it
    Object.assign(fill.style, {
      position: 'absolute', left: `${LINE_OUTLINE}px`, top: `${LINE_OUTLINE}px`, width: `${fillW}px`, height: `${fillH}px`,
      background: LINE_COLOR, ...lineMask(fillW, fillH),
    });
    el.append(outline, fill);
    linesEl.appendChild(el);
    return el;
  });
}

// Reveal line `index` from its first star to `k` (0…1) of the way to the second.
function growLine(index, k) {
  const el = lineEls[index];
  if (!el) return;
  el.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
}

function fadeLines(ctx) {
  if (!linesEl) return;
  linesEl.style.transition = `opacity ${LINE_FADE}s ease-in`;
  linesEl.style.opacity = '0';
  const mine = linesEl;
  ctx.after(LINE_FADE, () => { if (phase === 'done' && mine === linesEl) clearLines(); }, 'constellation: lines faded');
}

function clearLines() {
  for (const el of lineEls) el.remove();
  lineEls = [];
  linesEl?.remove();
}

function showQuestion(ctx) {
  const wrong = shuffle(CONSTELLATIONS.filter((c) => c !== shape)).slice(0, CHOICES - 1);
  const options = shuffle([shape, ...wrong]);
  askLine = LINES.ask();
  shownSecs = Math.ceil(ANSWER_FOR);
  showMenu(ctx, {
    line: `${askLine} (${shownSecs}s)`,
    options: options.map((c) => ({ label: c.name, onPick: () => { if (phase === 'ask' && !answer) answer = c.name; } })),
    onCancel: () => { if (phase === 'ask' && !answer) left = 0; }, // clicked away: gives up ("nope! it was...")
  });
}

function finishGame(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'constellation',
  category: 'games',
  priority: 10, // a game: same level as the others

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (!CONSTELLATIONS.length) return false;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    shape = pickShape();
    lastShape = shape;
    points = [];
    held = [];
    placed = 0;
    answer = null;
    outcome = null;
    played = false;
    drawing = 0;
    drawT = 0;
    phase = 'intro';
    phaseLeft = INTRO_FOR;
    pet.mode = 'quiz'; // behaviors stand down; he stays put
    cancelJump();
    startJump({ height: rand(10, 14), air: 0.26 });
    requestMood(ctx, 'playful', 'constellation quiz');
    ctx.say(LINES.intro(), INTRO_FOR * 1000 + 400);
    ctx.log('constellation-start', { reason, shape: shape.name });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (phase === 'done') return;
    if (pet.mode !== 'quiz') { // grabbed, thrown...: he takes the stars back
      finishGame(`interrupted:${pet.mode}`);
      return;
    }

    if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        points = layout(ctx, shape);
        phase = 'place';
        phaseLeft = 0;
      }
    } else if (phase === 'place') {
      phaseLeft -= TICK_SECONDS;
      while (phaseLeft <= 0 && placed < points.length) {
        held.push(placeStarbit(ctx, points[placed].x, points[placed].y));
        placed++;
        phaseLeft += PLACE_EVERY;
        if (!isJumping() && chance(0.5, 1)) startJump({ height: rand(5, 9), air: 0.2 }); // a little toss-hop
      }
      if (placed >= points.length) { phase = 'settle'; phaseLeft = SETTLE_FOR; }
    } else if (phase === 'settle') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        buildLines(ctx);
        phase = 'lines';
        drawing = 0;
        drawT = 0;
      }
    } else if (phase === 'lines') {
      if (drawing >= lineEls.length) {
        phase = 'ask';
        played = true;
        left = ANSWER_FOR;
        showQuestion(ctx); // his question goes in the menu's talkbox
        ctx.log('constellation-ask', { shape: shape.name });
      }
    } else if (phase === 'ask') {
      left -= TICK_SECONDS;
      const secs = Math.max(0, Math.ceil(left));
      if (secs !== shownSecs) { shownSecs = secs; setMenuLine(ctx, `${askLine} (${secs}s)`); }
      if (answer || left <= 0) {
        outcome = !answer ? 'timeout' : answer === shape.name ? 'right' : 'wrong';
        closeMenu(ctx);
        const real = held.filter(Boolean);
        if (outcome === 'right') {
          ctx.say(LINES.right(shape.name), RESULT_FOR * 1000);
          releaseStarbits(ctx, real);
          requestMood(ctx, 'happy', 'constellation right');
          startJump({ height: rand(16, 22), air: 0.3 }); // happy hop
        } else {
          ctx.say(outcome === 'timeout' ? LINES.timeout(shape.name) : LINES.wrong(shape.name), RESULT_FOR * 1000);
          reclaimStarbits(ctx, real);
        }
        held = [];
        ctx.log('constellation-answer', { shape: shape.name, answer, outcome, starbits: real.length });
        phase = 'result';
        phaseLeft = RESULT_FOR;
      } else if (!isJumping() && chance(0.15, TICK_SECONDS)) {
        startJump({ height: rand(5, 8), air: 0.2 }); // waiting, bouncy
      }
    } else if (phase === 'result') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) finishGame(outcome);
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'quiz' || phase === 'done') return;
    updateJump(pet, dt);
    if (phase === 'lines' && drawing < lineEls.length) {
      drawT += dt;
      growLine(drawing, Math.min(1, drawT / LINE_FOR));
      if (drawT >= LINE_FOR) { drawing++; drawT = 0; }
    }
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endGame = null;
    const leftover = held.filter(Boolean);
    if (leftover.length) reclaimStarbits(ctx, leftover); // ended early: he takes the stars back
    held = [];
    closeMenu(ctx);
    phase = 'done';
    fadeLines(ctx);
    if (pet.mode === 'quiz') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    ctx.log('constellation-end', { result });
  },
};
