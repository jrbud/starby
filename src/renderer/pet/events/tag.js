// TAG — a high-priority event. He counts down and you play real tag against a 15s clock
// (top-right): tags go back and forth, and whoever is "it" when time runs out loses. He moves
// much faster than normal the whole time.
//
//   STARTING: Starby asking you (./invite.js picks tag or another game; Yes starts it), the
//              "Play a game? [Tag] [Pong]" buttons when you click him, the right-click menu
//              ("Play tag"), or starby.startEvent('tag'). The rest between games, the tired /
//              mad / dizzy answers and the 3-2-1 countdown are shared, in ./games.js.
//   ½. ready     once a game is agreed he stays put, faces you and counts down in his bubble:
//                "3...", "2...", "1...", "GO!" (one per second), so you can get ready
//   1. play      "GO!" starts the GAME_SECONDS clock. Starby starts as "it".
//                Starby is it: he chases the cursor (aiming a little ahead of it) and pounces
//                when he gets close. Touching it = tag: now you're it, and you can't tag
//                straight back for HEAD_START seconds.
//                You're it: he runs, dodging and juking (quick sideways dashes) when you get
//                close. Touch him = tag: now he's it; he stands still for TAGGED_FREEZE seconds
//                ("aw! my turn"), then chases you.
//   end          clock runs out: whoever is it loses ('star-won' if you're it, 'user-won' if he is)
//                you win → he shoots out WIN_REWARD starbits for you to collect
//                you lose → no reward, and he takes back any starbits still on screen
//                grabbing him during the game is cheating: game over ('foul')
//                something else takes over (made dizzy, etc.) → ends quietly
//
// Throughout, his mood flips between playful and happy every couple of seconds (through
// mood.js's requestMood, so it's logged and timed like any other mood change). Afterwards he
// stays playful, which wears off on its own.
//
// He owns the star via pet.mode = 'tag': every behavior stands down for modes it doesn't know.
// Decisions run on ticks (session clock); movement runs every frame.
import { rand, clamp, approach, chance, clampToScreen, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { chat, lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits, reclaimStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createCountdown } from './countdown.js';
import { readyToPlay, markPlayed, createReady } from './games.js';

// ---- Tuning ----
const GAME_SECONDS = 15; // the game clock, from "GO!"
const WIN_REWARD = 7; // starbits he shoots out when you win
const CHASE_SPEED = [700, 900]; // px/s while he's it: close ... far (his fastest normal walk is ~160)
const CHASE_LEAD = 0.12; // seconds: aims where the cursor is heading, not where it is
const POUNCE_RADIUS = 160; // cursor this close while he's it → pounce
const POUNCE_SPEED = 1350; // px/s lunge
const POUNCE_FOR = 0.25; // seconds
const POUNCE_LEAD = 0.25; // seconds: lunges at where the cursor will be
const POUNCE_COOLDOWN = 0.8; // seconds between pounces
const TAGGED_FREEZE = 1.0; // seconds he stands still after you tag him (fair head start for you)
const RUN_SPEED = [450, 780]; // px/s: cruising ... sprinting away from a close cursor
const JUKE_RADIUS = 120; // cursor this close → juke
const JUKE_SPEED = 1150; // px/s burst
const JUKE_FOR = 0.3; // seconds
const JUKE_COOLDOWN = 0.9; // seconds between jukes
const TAG_TOUCH = 30; // px, star center to cursor: he tagged you
const CATCH_RADIUS = 30; // px, star center to cursor: you caught him
const HEAD_START = 1.2; // seconds after he tags you when touching him doesn't count yet (no tag-backs)
const DODGE_RADIUS = 240; // cursor closer than this → sprint directly away
const KEEP_AWAY = [260, 460]; // px from the cursor he likes to hang around at while it's far
const MOOD_SWAP = [1.5, 3]; // seconds between playful ↔ happy
const HOP_PER_SEC = 0.5;
const TAUNT_GAP = 3; // seconds of quiet before a taunt

const LINES = {
  start: lineBag(["yay! let's play!", 'hehe... tag time!', "yesss! ok, here i come!"]),
  accept: lineBag(["ooh, yes! let's play!", 'you wanna play? yay!', 'tag time! ✦']),
  tag: lineBag(["tag! you're it!", 'tag! ✦ catch me!', "you're it! bye!"]),
  tagged: lineBag(["aw! you got me... my turn!", "no fair! ok, i'm it", "hey! ok... here i come!"]),
  chase: lineBag(["i'm gonna get you!", 'here i come!', 'you can\'t hide!']),
  userWon: lineBag(["aw, i'm still it... you win!", "nooo, time's up! you win", 'you win! rematch later?']),
  foul: lineBag(['hey! no grabbing in tag!', "grabbing's cheating! game over", 'no fair! no grabbing!']),
  taunt: lineBag(['nyah nyah~', 'too slow!', 'over here!', "can't catch me!", 'catch me if you can ✦']),
  close: lineBag(['eep!', 'nope!', 'whoa, close!']),
  starWon: lineBag(["time's up! you're it, i win ✦", "hehe, you're still it! i win", 'too slow! i win ✦']),
  dizzy: lineBag(['too dizzy to play...', '@_@ game over...']),
};

// ---- State (reset every start) ----
let endGame = null;
let phase = 'play';
let it = 'star'; // who's it: 'star' | 'user'
let timeLeft = 0;
let headStart = 0;
let freezeLeft = 0;
let pounceLeft = 0;
let pounceCooldown = 0;
let touched = false; // star and cursor touched on some frame since the last tick (see update)
let prevCursor = null; // for the cursor's velocity (chase lead)
let moodSwapIn = 0;
let target = { x: 0, y: 0 }; // top-left position to head for
let speedTarget = 0;
let speedNow = 0;
let accel = 8; // how quickly speedNow catches up with speedTarget
let jukeLeft = 0;
let jukeCooldown = 0;
let hopT = 0;
let wasClose = false;
let countdown = null;
const ready = createReady(); // "3... 2... 1... GO!" (./games.js)

const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const toTopLeft = (pet, c) => ({ x: c.x - pet.size / 2, y: c.y - pet.size / 2 });

// Somewhere `dist` px from the cursor in roughly the "away" direction. If a screen edge is in
// the way (cornered), try angling off to the sides and take whichever gets furthest.
function awayFrom(ctx, from, dist) {
  const { pet } = ctx;
  const c = centerOf(pet);
  const base = Math.atan2(c.y - from.y, c.x - from.x);
  let best = null;
  for (const offset of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
    const a = base + offset + rand(-0.2, 0.2);
    const want = toTopLeft(pet, { x: c.x + Math.cos(a) * dist, y: c.y + Math.sin(a) * dist });
    const spot = clampToScreen(ctx, want.x, want.y);
    const spotC = centerOf({ ...pet, ...spot });
    const gap = Math.hypot(spotC.x - from.x, spotC.y - from.y); // how far from the cursor it ends up
    if (!best || gap > best.gap) best = { ...spot, gap };
    if (gap >= dist * 0.8) break;
  }
  return best;
}

// Yes! (or asked by the user / DevTools): get playful and go tag the cursor.
function beginGame(ctx, line = LINES.start) {
  const { pet } = ctx;
  // Get ready: he stays put and counts down before racing in (see onTick, phase 'ready').
  phase = 'ready';
  ready.start();
  target = { x: pet.x, y: pet.y };
  speedTarget = 0;
  moodSwapIn = rand(...MOOD_SWAP);
  requestMood(ctx, 'playful', 'tag');
  cancelJump();
  startJump({ height: rand(14, 22), air: 0.3 }); // excited hop
  ctx.say(line(), ready.pause * 1000);
  ctx.log('tag-ready', {});
}

// "GO!": start the clock. Starby is it first.
function startPlay(ctx) {
  phase = 'play';
  it = 'star';
  timeLeft = GAME_SECONDS;
  headStart = 0;
  freezeLeft = 0;
  pounceLeft = 0;
  pounceCooldown = 0;
  touched = false;
  prevCursor = null;
  speedTarget = CHASE_SPEED[0];
  accel = 10;
  cancelJump();
  startJump({ height: rand(16, 24), air: 0.3 });
  countdown.show('TAG', timeLeft, "Starby's it, run!");
  ctx.log('tag-go', { seconds: GAME_SECONDS });
}

// He touched the cursor: you're it, he runs.
function starTagsUser(ctx) {
  it = 'user';
  headStart = HEAD_START;
  target = awayFrom(ctx, ctx.cursor, rand(...KEEP_AWAY));
  speedTarget = RUN_SPEED[1];
  accel = 14;
  cancelJump();
  startJump({ height: rand(16, 24), air: 0.28 });
  ctx.say(LINES.tag(), 1500);
  countdown.show('TAG', timeLeft, "you're it! tag Starby back");
  ctx.log('tag-it', { it: 'user', timeLeft: Math.round(timeLeft * 10) / 10 });
}

// You touched him: he's it. He stands still for a moment, then chases.
function userTagsStar(ctx) {
  const { pet } = ctx;
  it = 'star';
  freezeLeft = TAGGED_FREEZE;
  jukeLeft = 0;
  pounceLeft = 0;
  target = { x: pet.x, y: pet.y };
  speedTarget = 0;
  cancelJump();
  startJump({ height: rand(8, 12), air: 0.22 });
  ctx.say(LINES.tagged(), 1500);
  countdown.show('TAG', timeLeft, "Starby's it, run!");
  ctx.log('tag-it', { it: 'star', timeLeft: Math.round(timeLeft * 10) / 10 });
}

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'tag',
  category: 'games',
  priority: 10,
  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (cursor.x < -1000) return false; // no cursor to tag yet
    if (pet.mode === 'drag' || pet.mode === 'toss') return false; // being held / thrown
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    timeLeft = GAME_SECONDS;
    headStart = 0;
    speedNow = 0;
    speedTarget = 0;
    accel = 8;
    jukeLeft = 0;
    jukeCooldown = 0;
    wasClose = false;
    target = { x: pet.x, y: pet.y };
    countdown = countdown || createCountdown(ctx.stage, () => ctx.area ? ctx.area() : null);

    pet.mode = 'tag'; // behaviors stand down
    cancelJump();
    // You asked (button) → "ooh, yes!"; he asked and you said yes / menu / DevTools → "yay!"
    beginGame(ctx, reason === 'request' ? LINES.accept : LINES.start);
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;

    // Something else took over.
    if (pet.mode !== 'tag') {
      if (pet.mode === 'drag' && phase === 'play') {
        ctx.say(LINES.foul(), 2200); // grabbing isn't tagging
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

    // ---- ½. Get ready: "3... 2... 1... GO!" ----
    if (phase === 'ready') {
      if (cursor.x > -1000) pet.facing = cursor.x >= centerOf(pet).x ? 1 : -1; // eyes on you
      if (ready.tick(ctx)) startPlay(ctx); // says the numbers, then "GO!"
      return;
    }

    // Excited: flip between playful and happy.
    moodSwapIn -= TICK_SECONDS;
    if (moodSwapIn <= 0) {
      moodSwapIn = rand(...MOOD_SWAP);
      requestMood(ctx, pet.mood === 'playful' ? 'happy' : 'playful', 'tag');
    }

    // ---- 1. Play ----
    timeLeft -= TICK_SECONDS;
    headStart -= TICK_SECONDS;
    freezeLeft -= TICK_SECONDS;
    jukeLeft -= TICK_SECONDS;
    jukeCooldown -= TICK_SECONDS;
    pounceLeft -= TICK_SECONDS;
    pounceCooldown -= TICK_SECONDS;
    countdown.set(timeLeft);
    // Touches are spotted every frame (fast moves can pass each other between ticks) and
    // acted on here, at the tick.
    const touchedSinceLastTick = touched;
    touched = false;

    if (timeLeft <= 0) {
      // Whoever is it when the clock runs out loses.
      if (it === 'user') {
        // You lose: no reward, and he takes back any starbits lying around.
        ctx.say(LINES.starWon(), 2500);
        reclaimStarbits(ctx);
        finish('star-won');
      } else {
        // You win: he bursts out starbits for you to sweep up.
        ctx.say(LINES.userWon(), 2500);
        cancelJump();
        startJump({ height: rand(16, 22), air: 0.3 });
        burstStarbits(ctx, WIN_REWARD);
        finish('user-won');
      }
      return;
    }

    if (cursor.x < -1000) return;
    const c = centerOf(pet);
    const dist = Math.hypot(cursor.x - c.x, cursor.y - c.y);
    const vel = prevCursor
      ? { x: (cursor.x - prevCursor.x) / TICK_SECONDS, y: (cursor.y - prevCursor.y) / TICK_SECONDS }
      : { x: 0, y: 0 };
    prevCursor = { x: cursor.x, y: cursor.y };

    if (it === 'star') {
      // ---- Starby is it: chase ----
      if (freezeLeft > 0) return; // just got tagged: standing still for a moment
      if (dist <= TAG_TOUCH || touchedSinceLastTick) {
        starTagsUser(ctx);
        return;
      }
      if (pounceLeft > 0) {
        // Mid-pounce: keep lunging where the pounce pointed.
      } else if (dist < POUNCE_RADIUS && pounceCooldown <= 0) {
        // Close: pounce at where the cursor is about to be.
        const aim = toTopLeft(pet, { x: cursor.x + vel.x * POUNCE_LEAD, y: cursor.y + vel.y * POUNCE_LEAD });
        target = clampToScreen(ctx, aim.x, aim.y);
        speedTarget = POUNCE_SPEED;
        accel = 22;
        pounceLeft = POUNCE_FOR;
        pounceCooldown = POUNCE_COOLDOWN;
      } else {
        // Aim a little ahead of where the cursor is heading.
        const aim = toTopLeft(pet, { x: cursor.x + vel.x * CHASE_LEAD, y: cursor.y + vel.y * CHASE_LEAD });
        target = clampToScreen(ctx, aim.x, aim.y);
        speedTarget = dist > 300 ? CHASE_SPEED[1] : CHASE_SPEED[0];
        accel = 12;
      }
      if (dist > 250) chat(ctx, LINES.chase(), 1100, { gap: TAUNT_GAP });
    } else {
      // ---- You're it: run ----
      if (headStart <= 0 && (dist <= CATCH_RADIUS || touchedSinceLastTick)) {
        userTagsStar(ctx);
        return;
      }
      if (jukeLeft > 0) {
        // Mid-juke: keep dashing where the juke pointed.
      } else if (dist < JUKE_RADIUS && jukeCooldown <= 0) {
        // Really close: juke — a quick dash off to one side instead of straight away, which a
        // chasing cursor overshoots.
        const away = Math.atan2(c.y - cursor.y, c.x - cursor.x);
        const side = Math.random() < 0.5 ? 1 : -1;
        const a = away + side * rand(1.0, 1.4); // ~60-80° off the straight-away line
        const spot = toTopLeft(pet, { x: c.x + Math.cos(a) * 240, y: c.y + Math.sin(a) * 240 });
        target = clampToScreen(ctx, spot.x, spot.y);
        if (Math.hypot(target.x - pet.x, target.y - pet.y) < 80) target = awayFrom(ctx, cursor, 240); // wall in the way
        speedTarget = JUKE_SPEED;
        accel = 20;
        jukeLeft = JUKE_FOR;
        jukeCooldown = JUKE_COOLDOWN;
        wasClose = true;
      } else if (dist < DODGE_RADIUS) {
        // Too close: sprint straight away (angling off if cornered).
        target = awayFrom(ctx, cursor, rand(...KEEP_AWAY));
        speedTarget = RUN_SPEED[1];
        accel = 14;
        if (!wasClose && Math.random() < 0.35) chat(ctx, LINES.close(), 900, { gap: 1.5 });
        wasClose = true;
      } else {
        wasClose = false;
        // Far enough: hang around at a teasing distance, re-picking a spot once he gets there.
        const tc = centerOf({ ...pet, ...target });
        const arrived = Math.hypot(pet.x - target.x, pet.y - target.y) < 12;
        const targetGap = Math.hypot(tc.x - cursor.x, tc.y - cursor.y);
        if (arrived || targetGap < KEEP_AWAY[0] * 0.8) {
          const angle = rand(0, Math.PI * 2);
          const d = rand(...KEEP_AWAY);
          const spot = toTopLeft(pet, { x: cursor.x + Math.cos(angle) * d, y: cursor.y + Math.sin(angle) * d });
          target = clampToScreen(ctx, spot.x, spot.y);
          speedTarget = RUN_SPEED[0];
          accel = 8;
        }
        if (dist > KEEP_AWAY[0]) chat(ctx, LINES.taunt(), 1200, { gap: TAUNT_GAP });
      }
    }
    if (!isJumping() && chance(HOP_PER_SEC, TICK_SECONDS)) startJump({ height: rand(10, 18), air: 0.25 });
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'tag') return;
    const jumping = updateJump(pet, dt);

    const dx = target.x - pet.x;
    const dy = target.y - pet.y;
    const d = Math.hypot(dx, dy);
    speedNow = approach(speedNow, d < 2 ? 0 : speedTarget, dt, accel);
    const step = speedNow * dt;
    if (d > 0.5) {
      if (step >= d) {
        pet.x = target.x;
        pet.y = target.y;
      } else {
        pet.x += (dx / d) * step;
        pet.y += (dy / d) * step;
      }
      if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
    }
    const kept = clampToScreen(ctx, pet.x, pet.y);
    pet.x = kept.x;
    pet.y = kept.y;

    // Spot touches every frame; onTick turns them into tags (with the head-start rules).
    if (phase === 'play' && ctx.cursor.x > -1000) {
      const cx = pet.x + pet.size / 2;
      const cy = pet.y + pet.size / 2;
      if (Math.hypot(ctx.cursor.x - cx, ctx.cursor.y - cy) <= Math.max(TAG_TOUCH, CATCH_RADIUS)) touched = true;
    }

    // Quick scampering hop cycle (the jump owns bob/squash while a hop is in the air).
    if (!jumping) {
      hopT += dt * clamp(speedNow / 70, 0, 3) * 8;
      const p = Math.abs(Math.sin(hopT));
      pet.bob = -p * 7;
      pet.squash = approach(pet.squash, 0.92 + p * 0.14, dt, 15);
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    countdown?.hide();
    if (pet.mode === 'tag') pet.mode = 'idle'; // hand him back (grabbed → stays 'drag')
    // After an actual game he stays playful for a bit (not if grabbed mid-countdown), and
    // needs a rest before the next one.
    const played = phase === 'play'; // got past "GO!" (not a "no", or grabbed mid-count)
    if (played) markPlayed(ctx); // starts the rest between games (./games.js)
    if (played && (pet.mood === 'happy' || pet.mood === 'playful')) requestMood(ctx, 'playful', 'tag over');
  },
};
