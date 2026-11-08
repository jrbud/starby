// COPYCAT — Starby copies your movement, without asking.
//
// Out of nowhere he says "hehe, i'm copying you!" and from then on every move your cursor makes,
// he makes too: the same distance in the same direction, from wherever he is (he mirrors your
// motion; he doesn't follow the cursor). Big sudden jumps (the cursor leaving and re-entering the
// screen) are ignored, and he moves no faster than MAX_SPEED.
//
// Ends:
//   bored  after COPY_FOR seconds: "ok i'm bored now" → 'bored'
//   wall   you try to make him walk into the edge of the usable screen (a copied move would push
//          him more than WALL_PUSH px past it): he stops short, "hey! i'm not walking into a wall!"
//          → 'wall'
//   grabbed / thrown → interrupted
//
// A game that starts silently (invite: false in ./games.js, like hide and seek): the games timer
// starts it on his own (canStart(ctx, 'random'): relaxed, happy/playful, rested), or the
// "Play a game?" buttons, the right-click menu ("Play copycat"), starby.startEvent('copycat').
// No reward: it's just him being silly. Shares the rest between games.
//
// Owns the star via pet.mode = 'copycat'. Decisions (timer, ending) on ticks; copying every frame.
import { rand, clamp, petBounds, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed, restLeft } from './games.js';

// ---- Tuning ----
const COPY_FOR = 30; // seconds before he gets bored
const MAX_SPEED = 1400; // px/s: fastest he copies (a faster flick just takes him a moment longer)
const JUMP_IGNORE = 250; // px: a cursor jump bigger than this in one frame isn't "movement"
const WALL_PUSH = 4; // px past the edge a copied move has to push before it counts as "into the wall"
const STEP_PX = 26; // px travelled per little step-bob
const STEP_BOB = 3; // px high

const LINES = {
  start: lineBag(["hehe, i'm copying you!", 'copycat!', 'whatever you do, i do!', "i'm you now!"]),
  bored: lineBag(["ok i'm bored now", 'copying is boring now...', 'ok, you win. i stop.', 'yawn. done copying!']),
  wall: lineBag(["hey! i'm not walking into a wall!", 'nice try! no walls for me', 'nope, not falling for that!', "you can't trick me into the wall!"]),
};

// ---- State ----
let endGame = null;
let left = 0;
let lastCursor = null; // { x, y } last frame
let pending = { x: 0, y: 0 }; // copied movement not done yet (when he's slower than you)
let hitWall = null; // side he got pushed into (spotted every frame, acted on at the tick)
let stepPhase = 0; // walking-bob phase, advanced by distance travelled
let played = false;

const cursorOn = (c) => c.x > -1000 && c.y > -1000; // pet.js parks it far off screen when it leaves

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'copycat',
  category: 'games',
  priority: 10, // a game: same level as the others

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    if (!cursorOn(cursor)) return false; // nothing to copy
    if (reason === 'random') {
      // The games timer starts it on his own: only when he's in the mood and rested.
      const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
      const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
      return relaxed && goodMood && restLeft(ctx) === 0;
    }
    return readyToPlay(ctx, reason);
  },

  start(ctx, end, reason) {
    const { pet, cursor } = ctx;
    endGame = end;
    left = COPY_FOR;
    lastCursor = { x: cursor.x, y: cursor.y };
    pending = { x: 0, y: 0 };
    hitWall = null;
    stepPhase = 0;
    played = true;
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
    pet.x = clamp(nx, b.minX, b.maxX); // he stops short of the edge
    pet.y = clamp(ny, b.minY, b.maxY);
    if (hitWall) { pending = { x: 0, y: 0 }; return; }

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
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
