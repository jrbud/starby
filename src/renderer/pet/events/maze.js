// MAZE — an action game ("operation" style): drag Starby through a maze without touching the walls.
//
//   setup   a new random maze (COLS × ROWS = 12 × 7 cells, fewer on a small screen) appears in the middle and he
//           flies to its entrance on the left. "drag me through the maze! don't touch the walls!"
//   play    LEFT-click and drag him: he follows the cursor (never jumping through a wall: he moves in
//           small steps and each step is checked). Let go and he waits where he is; grab him again.
//           GAME_FOR seconds on the moon timer (./countdown.js).
//   walls   touching one = a ZAP: "bzzt!", he shakes, flies back to the entrance and you lose a zap
//           (ZAPS in all). Out of zaps → game over.
//   bonus   BONUS starbits are scattered inside the maze: drag him over one to collect it. You keep
//           those whatever happens.
//   end     out the exit on the right (marked by the starbit cluster) → "you made it!" + WIN_REWARD
//           + the bonus starbits. Out of zaps / time → just the bonus starbits.
//
// The walls are the team's hand-drawn stroke (assets/menuIcons/line.png), one per straight run of
// wall, in the app's theme: yellow with the dark purple outline. line.png is a single dark stroke and
// the file isn't changed: its shape is used twice through CSS masks (a purple copy behind, a thinner
// yellow copy on top), like the pong paddles and the constellation lines. The bonus starbits and the
// exit are the team's starbit PNGs. Nothing is drawn by code.
//
// MOUSE: during the game a window CAPTURE listener catches presses on him before drag.js, so a left
// press drags him through the maze instead of picking him up (which would let you fling him over the
// walls), and the right-click menu / dialogue stays shut. Click-through is pinned off while dragging
// (ctx.setPinned) so the release isn't lost. Outside the game it does nothing.
//
// Starts like the other games: his invite ("wanna try my maze?", ./invite.js via the games timer),
// the dialogue's Action games, the tray menu ("Play maze"), starby.startEvent('maze').
// DevTools: starby.mazeInfo() returns the current maze.
// Shares the rest between games (./games.js). Owns the star via pet.mode = 'maze'.
import { rand, cancelJump, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createCountdown } from './countdown.js';
import { readyToPlay, markPlayed } from './games.js';
import { STARBIT_COLORS, starbitImage } from '../../shared/starbitArt.js';
import { sfx } from '../../shared/sfx.js';

// ---- Tuning ----
const COLS = 12; // maze size in cells (fewer if the screen is small): big and winding
const ROWS = 7;
const CELL = 92; // px per cell: with HIT_R that leaves ~12px of wiggle room each side, so it's tight
const WALL = 12; // px: wall thickness (outline included)
const WALL_OUTLINE = 2; // px of purple showing around the yellow
const HIT_R = 28; // px: his collision radius (a bit smaller than his drawn body, so it still feels fair)
const STEP = 4; // px per collision-checked step while following the cursor
const GAME_FOR = 90; // seconds (a bigger maze needs longer)
const ZAPS = 3; // touches before game over
const BONUS = 8; // bonus starbits in the maze
const BONUS_SIZE = 26; // px
const BONUS_R = 30; // px: his center this close to a bonus starbit collects it
const GOAL_SIZE = 46; // px: the exit marker (starbit cluster)
const RETURN_SPEED = 900; // px/s flying back to the entrance after a zap
const ZAP_FOR = 0.5; // seconds he shakes after a zap
const INTRO_FOR = 2.2; // seconds before you can start
const RESULT_FOR = 2.6; // seconds the result shows before the game ends
const WIN_REWARD = 15; // a bigger, harder maze: a bigger reward
const YELLOW = '#ffe8a3'; // the app's yellow
const OUTLINE = '#2d2335'; // the app's dark purple outline
const LINE_ART = '../../../assets/menuIcons/line.png'; // team art; relative to src/renderer/pet/index.html
const LINE_PNG = [1853, 164]; // the PNG's size...
const LINE_BOX = [65, 44, 1783, 121]; // ...and where the stroke sits in it (left, top, right, bottom)
const GOAL_ART = '../../../assets/starbits/cluster.png';

const LINES = {
  intro: lineBag(["drag me through the maze! don't touch the walls!", "get me out of here! careful, the walls zap!", 'maze time! guide me to the starbits at the end!']),
  zap: lineBag(['bzzt! ouch!', 'zap! that tickles!', 'bzzzt!', 'ow! the wall!']),
  lastZap: lineBag(['bzzt! one zap left!', 'careful! last one!']),
  won: lineBag(['you made it! we escaped!', "we're out! great steering!", 'woohoo! out of the maze!']),
  outOfZaps: lineBag(['too many zaps! game over', "bzzt... i'm all zapped out"]),
  timeUp: lineBag(["time's up! so close!", 'aww, out of time!']),
  bonus: (n) => (n === 1 ? 'you got 1 bonus starbit!' : `you got ${n} bonus starbits!`),
};

// ---- State ----
let endGame = null;
let phase = 'done'; // setup | intro | play | zapped | return | result | done
let phaseLeft = 0;
let gameLeft = 0;
let maze = null; // { left, top, cols, rows, cell, walls: [{x1,y1,x2,y2}] }
let start = null; // { x, y } his center at the entrance
let rootEl = null; // layer for walls, bonus starbits and the exit
let bonuses = []; // { el, x, y, got }
let bonusGot = 0;
let zapsLeft = ZAPS;
let dragging = false;
let grabOffset = { x: 0, y: 0 }; // cursor → his center, where you grabbed him
let mouse = { x: 0, y: 0 };
let hitWall = false; // spotted in update, acted on at the tick
let escaped = false;
let outcome = null;
let countdown = null;
let played = false;
let hooked = false;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const active = () => phase !== 'done';

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

// ---- The maze ----
// A random "perfect" maze (exactly one way through) by depth-first search with backtracking.
function generate(cols, rows) {
  // walls[r][c] = { t, r, b, l } (true = wall there)
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ t: true, r: true, b: true, l: true, seen: false })));
  const stack = [[0, 0]];
  cells[0][0].seen = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r - 1, c, 't', 'b'], [r, c + 1, 'r', 'l'], [r + 1, c, 'b', 't'], [r, c - 1, 'l', 'r']]
      .filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].seen);
    if (!next.length) { stack.pop(); continue; }
    const [nr, nc, wall, back] = next[Math.floor(Math.random() * next.length)];
    cells[r][c][wall] = false;
    cells[nr][nc][back] = false;
    cells[nr][nc].seen = true;
    stack.push([nr, nc]);
  }
  cells[0][0].l = false; // the entrance (top left, on the left side)
  cells[rows - 1][cols - 1].r = false; // the exit (bottom right, on the right side)
  return cells;
}

// The walls as straight runs (merged where they line up), in screen px.
function wallSegments(cells, left, top, cell) {
  const rows = cells.length;
  const cols = cells[0].length;
  const segs = [];
  // Horizontal lines: y = top + r*cell for r = 0..rows (a cell's top wall, or the last row's bottom).
  for (let r = 0; r <= rows; r++) {
    let runStart = null;
    for (let c = 0; c <= cols; c++) {
      const wall = c < cols && (r < rows ? cells[r][c].t : cells[rows - 1][c].b);
      if (wall && runStart === null) runStart = c;
      if (!wall && runStart !== null) { segs.push({ x1: left + runStart * cell, y1: top + r * cell, x2: left + c * cell, y2: top + r * cell }); runStart = null; }
    }
  }
  // Vertical lines: x = left + c*cell for c = 0..cols (a cell's left wall, or the last column's right).
  for (let c = 0; c <= cols; c++) {
    let runStart = null;
    for (let r = 0; r <= rows; r++) {
      const wall = r < rows && (c < cols ? cells[r][c].l : cells[r][cols - 1].r);
      if (wall && runStart === null) runStart = r;
      if (!wall && runStart !== null) { segs.push({ x1: left + c * cell, y1: top + runStart * cell, x2: left + c * cell, y2: top + r * cell }); runStart = null; }
    }
  }
  return segs;
}

// Distance from point (px, py) to the segment s.
function distToSeg(px, py, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
}
const touchesWall = (x, y) => maze.walls.some((s) => distToSeg(x, y, s) < HIT_R + WALL / 2);
// Where he may be at all: inside the maze, the little pocket at the entrance, or the exit pocket.
// (Otherwise you could drag him AROUND the outside of the maze.) Elsewhere he's just blocked, no zap.
function allowed(x, y) {
  const { left, top, cols, rows, cell } = maze;
  const right = left + cols * cell;
  const bottom = top + rows * cell;
  const inMaze = x >= left && x <= right && y >= top && y <= bottom;
  const entrance = x >= left - cell && x < left && y >= top && y <= top + cell;
  const exit = x > right && x <= right + cell && y >= bottom - cell && y <= bottom;
  return inMaze || entrance || exit;
}

// ---- Drawing (team art only) ----
function lineMask(w, h) {
  const sx = w / (LINE_BOX[2] - LINE_BOX[0]);
  const sy = h / (LINE_BOX[3] - LINE_BOX[1]);
  return {
    maskImage: `url('${LINE_ART}')`, maskRepeat: 'no-repeat',
    maskSize: `${(LINE_PNG[0] * sx).toFixed(2)}px ${(LINE_PNG[1] * sy).toFixed(2)}px`,
    maskPosition: `${(-LINE_BOX[0] * sx).toFixed(2)}px ${(-LINE_BOX[1] * sy).toFixed(2)}px`,
  };
}

function wallEl(s) {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + WALL; // a little past each end so corners join
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute', left: `${s.x1 - WALL / 2}px`, top: `${s.y1 - WALL / 2}px`, width: `${len}px`, height: `${WALL}px`,
    transformOrigin: `${WALL / 2}px ${WALL / 2}px`, transform: `rotate(${Math.atan2(s.y2 - s.y1, s.x2 - s.x1)}rad)`,
  });
  const outline = document.createElement('div');
  Object.assign(outline.style, { position: 'absolute', inset: '0', background: OUTLINE, ...lineMask(len, WALL) });
  const fw = len - 2 * WALL_OUTLINE;
  const fh = WALL - 2 * WALL_OUTLINE;
  const fill = document.createElement('div');
  Object.assign(fill.style, { position: 'absolute', left: `${WALL_OUTLINE}px`, top: `${WALL_OUTLINE}px`, width: `${fw}px`, height: `${fh}px`, background: YELLOW, ...lineMask(fw, fh) });
  el.append(outline, fill);
  return el;
}

function imgEl(src, x, y, size) {
  const el = document.createElement('img');
  el.src = src;
  el.alt = '';
  el.draggable = false;
  Object.assign(el.style, {
    position: 'absolute', left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`,
    objectFit: 'contain', transition: 'transform 220ms ease-out, opacity 220ms ease-out',
    filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))',
  });
  return el;
}

function build(ctx) {
  const a = areaOf(ctx);
  // Fit the maze in the usable screen (fewer cells on a small screen), centered, with room on the
  // left for him to wait at the entrance and on the right for the exit marker.
  const cols = Math.max(4, Math.min(COLS, Math.floor((a.right - a.left - 2 * CELL - 40) / CELL)));
  const rows = Math.max(3, Math.min(ROWS, Math.floor((a.bottom - a.top - 160) / CELL)));
  const left = Math.round((a.left + a.right) / 2 - (cols * CELL) / 2);
  const top = Math.round(Math.max(a.top + 110, (a.top + a.bottom) / 2 - (rows * CELL) / 2));
  const cells = generate(cols, rows);
  maze = { left, top, cols, rows, cell: CELL, walls: wallSegments(cells, left, top, CELL) };
  start = { x: left - CELL * 0.55, y: top + CELL / 2 }; // just outside the entrance

  removeAll();
  rootEl = document.createElement('div');
  rootEl.className = 'maze-layer';
  Object.assign(rootEl.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  for (const s of maze.walls) rootEl.appendChild(wallEl(s));
  // The exit marker, just outside the exit.
  rootEl.appendChild(imgEl(GOAL_ART, left + cols * CELL + CELL * 0.5, top + (rows - 0.5) * CELL, GOAL_SIZE));
  // Bonus starbits in random cells (not the entrance or exit cell, one per cell), in random colours.
  const free = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!(r === 0 && c === 0) && !(r === rows - 1 && c === cols - 1)) free.push([r, c]);
  bonuses = [];
  for (let i = 0; i < BONUS && free.length; i++) {
    const [r, c] = free.splice(Math.floor(Math.random() * free.length), 1)[0];
    const x = left + (c + 0.5) * CELL;
    const y = top + (r + 0.5) * CELL;
    const color = STARBIT_COLORS[Math.floor(Math.random() * STARBIT_COLORS.length)];
    const el = imgEl(starbitImage(color, 1 + Math.floor(Math.random() * 4)), x, y, BONUS_SIZE);
    rootEl.appendChild(el);
    bonuses.push({ el, x, y, got: false });
  }
  // Under him (he's drawn on top of the maze).
  if (ctx.petEl.parentNode === ctx.stage) ctx.stage.insertBefore(rootEl, ctx.petEl);
  else ctx.stage.appendChild(rootEl);
}

function removeAll() {
  rootEl?.remove();
  rootEl = null;
  bonuses = [];
}

// ---- Mouse ----
function hookMouse(ctx) {
  if (hooked) return;
  hooked = true;
  const { petEl } = ctx;
  const onHim = (e) => e.target === petEl || petEl.contains?.(e.target);
  // Presses on him go to the maze (not drag.js); the right-click menu / dialogue stays shut.
  window.addEventListener('mousedown', (e) => {
    if (!active() || !onHim(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (phase !== 'play' || e.button !== 0) return;
    const c = centerOf(ctx.pet);
    mouse = { x: e.clientX, y: e.clientY };
    grabOffset = { x: c.x - e.clientX, y: c.y - e.clientY };
    dragging = true;
    ctx.setPinned(true); // keep getting the mouse when it leaves him
  }, true);
  window.addEventListener('contextmenu', (e) => {
    if (!active()) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  window.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !dragging) return;
    dragging = false;
    ctx.setPinned(false);
  });
}

function letGo(ctx) {
  if (dragging) ctx.setPinned(false);
  dragging = false;
}

function endWith(ctx, result, line) {
  outcome = result;
  letGo(ctx);
  phase = 'result';
  phaseLeft = RESULT_FOR;
  countdown?.hide();
  const bonusLine = bonusGot ? ` ${LINES.bonus(bonusGot)}` : '';
  ctx.say(`${line}${bonusLine}`, RESULT_FOR * 1000);
  const reward = (result === 'escaped' ? WIN_REWARD : 0) + bonusGot;
  if (reward) burstStarbits(ctx, reward);
  if (result === 'escaped') requestMood(ctx, 'happy', 'escaped the maze');
  ctx.log('maze-end', { result, bonus: bonusGot, zapsLeft });
}

export default {
  name: 'maze',
  category: 'games',
  priority: 10, // a game: same level as the others

  init() {
    // DevTools: starby.mazeInfo() → the current maze (cells, walls, entrance) for debugging.
    if (typeof window !== 'undefined' && window.starby) window.starby.mazeInfo = () => (maze ? { ...maze, start } : null);
  },

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    hookMouse(ctx);
    build(ctx);
    countdown = countdown || createCountdown(ctx.stage, () => (ctx.area ? ctx.area() : null));
    gameLeft = GAME_FOR;
    zapsLeft = ZAPS;
    bonusGot = 0;
    dragging = false;
    hitWall = false;
    escaped = false;
    outcome = null;
    played = false;
    phase = 'setup';
    pet.mode = 'maze'; // behaviors stand down
    pet.rotation = 0;
    cancelJump();
    requestMood(ctx, 'playful', 'maze');
    ctx.say(LINES.intro(), INTRO_FOR * 1000 + 600);
    ctx.log('maze-start', { reason, cols: maze.cols, rows: maze.rows });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endGame || phase === 'done') return;
    if (pet.mode !== 'maze') { finish(`interrupted:${pet.mode}`); return; }

    if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) { phase = 'play'; played = true; countdown.show('Maze', gameLeft); }
      return;
    }
    if (phase === 'result') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) finish(outcome);
      return;
    }
    if (phase === 'play' || phase === 'zapped' || phase === 'return') {
      gameLeft -= TICK_SECONDS;
      countdown?.set(gameLeft);
    }
    if (escaped) { endWith(ctx, 'escaped', LINES.won()); return; }
    if (hitWall) {
      hitWall = false;
      zapsLeft--;
      letGo(ctx);
      ctx.log('maze-zap', { zapsLeft });
      if (zapsLeft <= 0) { endWith(ctx, 'zapped-out', LINES.outOfZaps()); return; }
      ctx.say(zapsLeft === 1 ? LINES.lastZap() : LINES.zap(), 1500);
      phase = 'zapped';
      phaseLeft = ZAP_FOR;
      return;
    }
    if (gameLeft <= 0) { endWith(ctx, 'time', LINES.timeUp()); return; }
    if (phase === 'zapped') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) phase = 'return';
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'maze' || phase === 'done') return;
    updateJump(pet, dt);
    pet.bob = 0;
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
    const toStart = () => {
      const tx = start.x - pet.size / 2;
      const ty = start.y - pet.size / 2;
      const dx = tx - pet.x;
      const dy = ty - pet.y;
      const d = Math.hypot(dx, dy);
      const step = RETURN_SPEED * dt;
      if (d <= step || d < 0.5) { pet.x = tx; pet.y = ty; return true; }
      pet.x += (dx / d) * step;
      pet.y += (dy / d) * step;
      return false;
    };

    if (phase === 'setup') {
      pet.rotation = 0;
      if (toStart()) { phase = 'intro'; phaseLeft = INTRO_FOR; }
      return;
    }
    if (phase === 'zapped') {
      pet.rotation = Math.sin(phaseLeft * 60) * 0.25; // shaking from the zap
      return;
    }
    pet.rotation = 0;
    if (phase === 'return') {
      if (toStart()) phase = 'play';
      return;
    }
    if (phase !== 'play' || !dragging || hitWall || escaped) return;

    // Follow the cursor in small steps, checking each one, so he can't skip through a wall.
    const c = centerOf(pet);
    const target = { x: mouse.x + grabOffset.x, y: mouse.y + grabOffset.y };
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / STEP));
    let x = c.x;
    let y = c.y;
    for (let i = 1; i <= steps; i++) {
      const nx = c.x + (dx * i) / steps;
      const ny = c.y + (dy * i) / steps;
      if (!allowed(nx, ny)) break; // outside the maze: blocked (no zap)
      if (touchesWall(nx, ny)) { hitWall = true; break; }
      x = nx;
      y = ny;
    }
    pet.x = x - pet.size / 2;
    pet.y = y - pet.size / 2;
    if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
    if (hitWall) pet.squash = 0.8;

    // Bonus starbits he touches.
    for (const b of bonuses) {
      if (b.got || Math.hypot(b.x - x, b.y - y) > BONUS_R) continue;
      b.got = true;
      bonusGot++;
      b.el.style.transform = 'scale(1.6)';
      b.el.style.opacity = '0';
      sfx.play('collect-starbit', { volume: 0.6 });
      ctx.log('maze-bonus', { got: bonusGot });
    }
    // Out the exit on the right.
    const exitX = maze.left + maze.cols * maze.cell;
    if (x > exitX + HIT_R) escaped = true;
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    phase = 'done';
    letGo(ctx);
    removeAll();
    countdown?.hide();
    pet.rotation = 0;
    if (pet.mode === 'maze') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
