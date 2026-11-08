// COPYCAT — Starby copies your movement, without asking.
//
// Out of nowhere he says "hehe, i'm copying you!" and from then on every move your cursor makes,
// he makes too: the same distance in the same direction, from wherever he is (he mirrors your
// motion; he doesn't follow the cursor). Big sudden jumps (the cursor leaving and re-entering the
// screen) are ignored, and he moves no faster than MAX_SPEED.
//
// Ends:
//   bored  after COPY_FOR seconds: "ok i'm bored now" → 'bored'
//   wall   you make him walk into the edge of the usable screen (a copied move would push him more
//          than WALL_PUSH px past it): he SMACKS into it (wall-hit effects via a 'slam' log, which
//          fx.js plays without the thrown-wall starbit drop; a squish, a little bounce back, a dazed
//          face), then "oof! you tricked me!" → 'wall'
//   grabbed / thrown → interrupted
//
// ITS OWN CATEGORY ('copycat'), like dance: not a game (not on the game buttons, not in the games
// timer, no shared rest). Its own timer (watch, below): COPYCAT_EVERY seconds (3 minutes) after the
// last copycat ended (or after launch), he tries to start one. Only when nothing else is running,
// he's relaxed (idle/walking) and happy/playful, and you're moving the mouse (moved in the last
// USER_AROUND seconds: there has to be something to copy). Not a good moment → he tries again
// every RETRY seconds. Priority 3: just above dance, so sky events, invites and games take over.
// Also: tray menu → Developer → "Start copycat now", or starby.startEvent('copycat').
// No reward: it's just him being silly.
//
// Owns the star via pet.mode = 'copycat'. Decisions (timer, ending) on ticks; copying every frame.
import { rand, clamp, petBounds, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { TICK_SECONDS } from '../core/clock.js';
import { strikePose } from '../behaviors/mood.js';

// ---- Tuning ----
const COPY_FOR = 30; // seconds before he gets bored
const MAX_SPEED = 1400; // px/s: fastest he copies (a faster flick just takes him a moment longer)
const JUMP_IGNORE = 250; // px: a cursor jump bigger than this in one frame isn't "movement"
const WALL_PUSH = 4; // px past the edge a copied move has to push before it counts as "into the wall"
const SMACK_SPEED = 1700; // how hard fx.js shows the smack (px/s scale of the wall-hit effects)
const SMACK_BOUNCE = 0.12; // star-sizes he bounces back off the wall
const STEP_PX = 26; // px travelled per little step-bob
const STEP_BOB = 3; // px high
const COPYCAT_EVERY = 180; // seconds between copycats (from the end of the last one)
const RETRY = 15; // seconds: not a good moment → try again this soon
const USER_AROUND = 3; // seconds since the cursor last moved, to count as "you're moving it"

const LINES = {
  start: lineBag(["hehe, i'm copying you!", 'copycat!', 'whatever you do, i do!', "i'm you now!"]),
  bored: lineBag(["ok i'm bored now", 'copying is boring now...', 'ok, you win. i stop.', 'yawn. done copying!']),
  wall: lineBag(['oof! you tricked me!', 'ow!! who put that wall there?', 'ouch... okay, you got me', "bonk! i didn't see that coming"]),
};

// ---- State ----
let endGame = null;
let left = 0;
let lastCursor = null; // { x, y } last frame
let pending = { x: 0, y: 0 }; // copied movement not done yet (when he's slower than you)
let hitWall = null; // side he got pushed into (spotted every frame, acted on at the tick)
let stepPhase = 0; // walking-bob phase, advanced by distance travelled
let nextAt = null; // session seconds when the timer next tries to start a copycat
let lastCursorSeen = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

const cursorOn = (c) => c.x > -1000 && c.y > -1000; // pet.js parks it far off screen when it leaves

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'copycat',
  category: 'copycat', // its own category, with its own timer (like dance)
  priority: 3, // above dance (2); sky events (14), games (10) and invites (5) take over

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    if (!cursorOn(cursor)) return false; // nothing to copy
    if (reason === 'timer') {
      // His own timer: only when he's in the mood and you're moving the mouse.
      const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
      const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
      return relaxed && goodMood && ctx.clock.seconds - cursorMovedAt <= USER_AROUND;
    }
    return true; // menu / DevTools
  },

  // Every tick, even when not running: notice the cursor moving, and run the copycat timer.
  watch(ctx) {
    const now = ctx.clock.seconds;
    const { cursor } = ctx;
    if (cursor.x !== lastCursorSeen.x || cursor.y !== lastCursorSeen.y) {
      lastCursorSeen = { x: cursor.x, y: cursor.y };
      cursorMovedAt = now;
    }
    if (nextAt === null) nextAt = now + COPYCAT_EVERY;
    if (endGame || now < nextAt) return;
    if (!ctx.activeEvent() && ctx.startEvent('copycat', 'timer')) return; // started (stop() sets the next time)
    nextAt = now + RETRY; // not a good moment: try again soon
  },

  start(ctx, end, reason) {
    const { pet, cursor } = ctx;
    endGame = end;
    left = COPY_FOR;
    lastCursor = { x: cursor.x, y: cursor.y };
    pending = { x: 0, y: 0 };
    hitWall = null;
    stepPhase = 0;
    pet.mode = 'copycat'; // behaviors stand down
    cancelJump();
    startJump({ height: rand(10, 14), air: 0.25 }); // perk up
    ctx.say(LINES.start(), 2500);
    ctx.log('copycat-start', { reason });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endGame) return;
    if (pet.mode !== 'copycat') { finish(`interrupted:${pet.mode}`); return; }
    left -= TICK_SECONDS;
    if (hitWall) {
      ctx.say(LINES.wall(), 2800);
      ctx.log('copycat-wall', { side: hitWall });
      finish('wall');
    } else if (left <= 0) {
      ctx.say(LINES.bored(), 2500);
      finish('bored');
    }
  },

  update(ctx, dt) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'copycat' || !endGame) return;
    updateJump(pet, dt);
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);

    // Copy this frame's cursor movement.
    if (cursorOn(cursor)) {
      if (lastCursor) {
        const dx = cursor.x - lastCursor.x;
        const dy = cursor.y - lastCursor.y;
        if (Math.hypot(dx, dy) <= JUMP_IGNORE) { pending.x += dx; pending.y += dy; }
      }
      lastCursor = { x: cursor.x, y: cursor.y };
    } else {
      lastCursor = null; // cursor left the screen: wait for it to come back
    }

    const want = Math.hypot(pending.x, pending.y);
    if (want < 0.01) {
      if (!isJumping()) pet.bob += (0 - pet.bob) * Math.min(1, dt * 12); // settle when you stop
      return;
    }
    const k = Math.min(1, (MAX_SPEED * dt) / want);
    const stepX = pending.x * k;
    const stepY = pending.y * k;
    pending.x -= stepX;
    pending.y -= stepY;

    // Into a wall? (moving toward an edge and the move would go past it)
    const b = petBounds(ctx);
    const nx = pet.x + stepX;
    const ny = pet.y + stepY;
    if (nx < b.minX - WALL_PUSH && stepX < 0) hitWall = 'left';
    else if (nx > b.maxX + WALL_PUSH && stepX > 0) hitWall = 'right';
    else if (ny < b.minY - WALL_PUSH && stepY < 0) hitWall = 'top';
    else if (ny > b.maxY + WALL_PUSH && stepY > 0) hitWall = 'bottom';
    pet.x = clamp(nx, b.minX, b.maxX); // right up against the edge
    pet.y = clamp(ny, b.minY, b.maxY);
    if (hitWall) {
      pending = { x: 0, y: 0 };
      // SMACK: wall-hit effects, a squish, a little bounce back off the wall, a dazed look.
      ctx.log('slam', { side: hitWall, speed: SMACK_SPEED });
      cancelJump();
      pet.squash = 0.68;
      const back = SMACK_BOUNCE * pet.size;
      if (hitWall === 'left') pet.x += back;
      else if (hitWall === 'right') pet.x -= back;
      else if (hitWall === 'top') pet.y += back;
      else pet.y -= back;
      strikePose(ctx, 'dizzy', 1.5);
      return;
    }

    if (Math.abs(stepX) > 0.3) pet.facing = stepX > 0 ? 1 : -1;
    // A little step-bob while he's moving, so it reads as him walking along with you.
    if (!isJumping()) {
      stepPhase += Math.hypot(stepX, stepY) / STEP_PX * Math.PI;
      pet.bob = -Math.abs(Math.sin(stepPhase)) * STEP_BOB;
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    pending = { x: 0, y: 0 };
    lastCursor = null;
    pet.bob = 0;
    pet.squash = 1;
    if (pet.mode === 'copycat') pet.mode = 'idle';
    nextAt = ctx.clock.seconds + COPYCAT_EVERY; // the next one, 3 minutes after this one ended
  },
};
