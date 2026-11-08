// CONSTELLATION QUIZ — a game: Starby draws a constellation out of starbits and quizzes you on it.
//
//   intro   "quiz time! guess my constellation!" while he glides to the middle of the screen
//   place   he throws one starbit per star, every PLACE_EVERY seconds; each flies to its spot and
//           stays there (placeStarbit in ../behaviors/starbits.js: held, can't be collected yet)
//   lines   the constellation's lines draw in, one after another (LINE_FOR seconds each), while he
//           glides out of the way to the roomier side, so his question never covers the drawing
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
// THE LINES are drawn by code: thin white lines (LINE_COLOR) with a dark outline under them
// (OUTLINE_COLOR) so they show on any wallpaper, the team-approved
// "supplementary lines" exception in CLAUDE.md (plain lines connecting existing art). The stars
// themselves are the team's starbit PNGs. No other shapes are drawn.
//
// Owns the star via pet.mode = 'quiz' (only this event moves him; faces the drawing, hops now and then).
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
const MARGIN = 70; // px kept clear around the drawing inside the usable screen (top: room for his bubble)
const GLIDE_RATE = 4.5; // how snappily he glides to the middle / out of the way (approach rate)
const ARRIVED = 3; // px: close enough to his spot
const STAR_PAD = 24; // px around the stars (half a starbit) when finding the free space beside the drawing
const CHOICES = 4;
const LINE_COLOR = '#ffffff'; // white, like a star chart
const LINE_WIDTH = 2.5;
const OUTLINE_COLOR = '#3a2219'; // dark outline under the white line (Starby's outline brown), so it
const OUTLINE_WIDTH = 5; //        shows on light wallpapers too (px, total width under the line)
const SVG_NS = 'http://www.w3.org/2000/svg';

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
let svg = null;
let lineEls = []; // <g> per shape line (dark outline <line> + white <line>), drawn in order
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

// WHERE HE STANDS: the drawing goes in the middle of the screen, so first he glides there and puts
// the stars down around himself; then, while the lines draw, he glides out of the way into the
// middle of the roomier free space beside it, so his question + answer boxes never cover it.
let target = null; // { x, y } his top-left he's gliding to, or null

function middleSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  return { x: (a.left + a.right) / 2 - S / 2, y: (a.top + a.bottom) / 2 - S / 2 };
}

function asideSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - STAR_PAD; const maxX = Math.max(...xs) + STAR_PAD;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const roomLeft = minX - a.left;
  const roomRight = a.right - maxX;
  const cx = roomRight >= roomLeft ? (maxX + a.right) / 2 : (a.left + minX) / 2;
  const y = Math.max(a.top + MARGIN * 2, Math.min(a.bottom - S - MARGIN, midY - S / 2));
  return { x: cx - S / 2, y };
}

const arrived = () => !target;

// Every frame: glide toward `target`, facing where he's going; once there, face the drawing.
function glide(ctx, dt) {
  if (!target) return;
  const { pet } = ctx;
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  if (Math.hypot(dx, dy) <= ARRIVED) {
    pet.x = target.x; pet.y = target.y;
    target = null;
    if (points.length) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      pet.facing = cx >= pet.x + pet.size / 2 ? 1 : -1;
    }
    return;
  }
  const k = 1 - Math.exp(-GLIDE_RATE * dt);
  if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
  pet.x += dx * k;
  pet.y += dy * k;
}

// Where the drawing goes: centered on the middle of the usable screen (where he's standing),
// scaled to fit.
function layout(ctx, c) {
  const a = areaOf(ctx);
  const longest = Math.max(BOX[0], Math.min(BOX[1], Math.min(a.right - a.left, a.bottom - a.top) * BOX_OF_SCREEN));
  const xs = c.stars.map((s) => s[0]);
  const ys = c.stars.map((s) => s[1]);
  const minX = Math.min(...xs); const spanX = Math.max(...xs) - minX || 1;
  const minY = Math.min(...ys); const spanY = Math.max(...ys) - minY || 1;
  const scale = longest / Math.max(spanX, spanY);
  const w = spanX * scale;
  const h = spanY * scale;
  let x = (a.left + a.right) / 2 - w / 2;
  let y = (a.top + a.bottom) / 2 - h / 2;
  x = Math.max(a.left + MARGIN, Math.min(a.right - MARGIN - w, x));
  y = Math.max(a.top + MARGIN, Math.min(a.bottom - MARGIN - h, y));
  return c.stars.map(([sx, sy]) => ({ x: x + (sx - minX) * scale, y: y + (sy - minY) * scale }));
}

function buildLines(ctx) {
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
    svg.setAttribute('class', 'constellation-lines');
  }
  // Behind the starbits: insert before the first child so the stars sit on top of the lines.
  if (!svg.parentNode) ctx.stage.insertBefore(svg, ctx.stage.firstChild || null);
  svg.style.transition = '';
  svg.style.opacity = '1';
  for (const el of lineEls) el.remove();
  const makeLine = (i, color, width) => {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', points[i].x); el.setAttribute('y1', points[i].y);
    el.setAttribute('x2', points[i].x); el.setAttribute('y2', points[i].y); // grows toward j
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', width);
    el.setAttribute('stroke-linecap', 'round');
    return el;
  };
  lineEls = shape.lines.map(([i]) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.appendChild(makeLine(i, OUTLINE_COLOR, OUTLINE_WIDTH)); // underneath
    g.appendChild(makeLine(i, LINE_COLOR, LINE_WIDTH)); // on top
    g.style.display = 'none';
    svg.appendChild(g);
    return g;
  });
}

function growLine(index, k) {
  const el = lineEls[index];
  if (!el) return;
  const [i, j] = shape.lines[index];
  const a = points[i];
  const b = points[j];
  el.style.display = '';
  for (const line of el.children) { // outline + white line grow together
    line.setAttribute('x2', a.x + (b.x - a.x) * k);
    line.setAttribute('y2', a.y + (b.y - a.y) * k);
  }
}

function fadeLines(ctx) {
  if (!svg) return;
  svg.style.transition = `opacity ${LINE_FADE}s ease-in`;
  svg.style.opacity = '0';
  const mine = svg;
  ctx.after(LINE_FADE, () => { if (phase === 'done' && mine === svg) clearLines(); }, 'constellation: lines faded');
}

function clearLines() {
  for (const el of lineEls) el.remove();
  lineEls = [];
  svg?.remove();
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
    pet.mode = 'quiz'; // behaviors stand down; he only moves when this event moves him
    target = middleSpot(ctx); // glide to the middle of the screen during "quiz time!"
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
      if (phaseLeft <= 0 && arrived()) {
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
        target = asideSpot(ctx); // out of the way while the lines draw
        phase = 'lines';
        drawing = 0;
        drawT = 0;
      }
    } else if (phase === 'lines') {
      if (drawing >= lineEls.length && arrived()) {
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
    glide(ctx, dt);
    if (phase === 'lines' && drawing < lineEls.length) {
      drawT += dt;
      growLine(drawing, Math.min(1, drawT / LINE_FOR));
      if (drawT >= LINE_FOR) { drawing++; drawT = 0; }
    }
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endGame = null;
    target = null;
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
