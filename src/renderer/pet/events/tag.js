// TAG — a high-priority event. The star asks if you want to play; if you do, he gets playful,
// zooms over and tags your cursor, then runs away much faster than normal while a countdown
// runs in the top-right corner.
//
//   0. invite    he stops and asks: a Yes / No popup next to him (./prompt.js), up to INVITE_FOR s
//                Yes → the game starts. No → he gets sad (mood.js 'sad') and won't ask again for
//                a while. No answer → "maybe later", no hard feelings.
//                (starby.startEvent('tag') in DevTools skips the question.)
//   1. approach  he races to the cursor (up to APPROACH_FOR seconds; gives up if you dodge)
//   2. tagged    touching the cursor: "tag! you're it!", the countdown starts
//   3. run       he dodges away from the cursor at high speed, taunting from a distance; when
//                the cursor gets really close he jukes: a quick sideways dash
//   end          you touch him or grab him → you win ('caught')
//                the countdown runs out → he wins ('star-won')
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
import { TICK_SECONDS } from '../core/clock.js';
import { createCountdown } from './countdown.js';
import { createPrompt } from './prompt.js';

// ---- Tuning ----
const INVITE_FOR = 12; // seconds to answer the popup
const DECLINED_COOLDOWN = 600; // after a "no", don't ask again on his own for this long (seconds)
const TAG_SECONDS = 20; // countdown length
const APPROACH_FOR = 6; // seconds to reach the cursor before giving up
const APPROACH_SPEED = 560; // px/s (his fastest normal walk is ~160)
const RUN_SPEED = [450, 780]; // px/s: cruising ... sprinting away from a close cursor
const JUKE_RADIUS = 120; // cursor this close → juke
const JUKE_SPEED = 1150; // px/s burst
const JUKE_FOR = 0.3; // seconds
const JUKE_COOLDOWN = 0.9; // seconds between jukes
const TAG_TOUCH = 30; // px, star center to cursor: he tagged you
const CATCH_RADIUS = 30; // px, star center to cursor: you caught him
const HEAD_START = 1.2; // seconds after tagging when touching him doesn't count yet
const DODGE_RADIUS = 240; // cursor closer than this → sprint directly away
const KEEP_AWAY = [260, 460]; // px from the cursor he likes to hang around at while it's far
const MOOD_SWAP = [1.5, 3]; // seconds between playful ↔ happy
const HOP_PER_SEC = 0.5;
const TAUNT_GAP = 3; // seconds of quiet before a taunt

// Random start (the runner rolls this): every 60s, 20% chance, at most once per 4 minutes.
const AUTO = { every: 60, chance: 0.2, cooldown: 240 };
const USER_AROUND = 10; // seconds since the cursor last moved, to count as "you're there"

const LINES = {
  ask: lineBag(['wanna play tag?', 'hey! play tag with me?', 'tag? pleeease?']),
  start: lineBag(["yay! let's play!", 'hehe... tag time!', "yesss! ok, here i come!"]),
  declined: lineBag(['oh... ok.', 'aw... nevermind then', '*sniff* ok...']),
  ignored: lineBag(['...maybe later then', 'oh, you\'re busy. ok!']),
  tag: lineBag(["tag! you're it!", 'tag! ✦ catch me!', "you're it! bye!"]),
  taunt: lineBag(['nyah nyah~', 'too slow!', 'over here!', "can't catch me!", 'catch me if you can ✦']),
  close: lineBag(['eep!', 'nope!', 'whoa, close!']),
  caught: lineBag(['aw, you got me!', 'no fair! ...ok, fair', "caught! you're good at this"]),
  grabbed: lineBag(['hey! caught red-handed', 'oof, got me!', 'no grabbing! ...fine, you win']),
  starWon: lineBag(["time's up! i win ✦", 'too fast for you!', "you're still it! hehe"]),
  missed: lineBag(['hey, hold still!', 'aw, you dodged me', "fine, you're too quick"]),
  dizzy: lineBag(['too dizzy to play...', '@_@ game over...']),
};

// ---- State (reset every start) ----
let endGame = null;
let phase = 'approach';
let timeLeft = 0;
let approachLeft = 0;
let headStart = 0;
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
let prompt = null;
let answer = null; // 'yes' | 'no', set by the popup buttons, acted on at the next tick
let inviteLeft = 0;
let declinedAt = -Infinity; // session seconds of the last "no" (kept between games)

// Cursor-presence tracking for random starts (updated even when tag isn't running).
let lastCursor = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const toTopLeft = (pet, c) => ({ x: c.x - pet.size / 2, y: c.y - pet.size / 2 });

function trackCursor(ctx) {
  const { cursor } = ctx;
  if (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y) {
    lastCursor = { x: cursor.x, y: cursor.y };
    cursorMovedAt = ctx.clock.seconds;
  }
}

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

// Yes! (or DevTools): get playful and go tag the cursor.
function beginGame(ctx) {
  phase = 'approach';
  approachLeft = APPROACH_FOR;
  speedTarget = APPROACH_SPEED;
  moodSwapIn = rand(...MOOD_SWAP);
  requestMood(ctx, 'playful', 'tag');
  cancelJump();
  startJump({ height: rand(14, 22), air: 0.3 }); // excited hop
  ctx.say(LINES.start(), 1500);
}

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

export default {
  name: 'tag',
  priority: 10,
  auto: AUTO,

  watch: trackCursor, // every tick, so random starts know whether you're around

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (cursor.x < -1000) return false; // no cursor to tag yet
    if (pet.mode === 'drag' || pet.mode === 'toss') return false; // being held / thrown
    if (reason !== 'random') return true; // asked for (menu / DevTools): just play
    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
    const userAround = ctx.clock.seconds - cursorMovedAt <= USER_AROUND;
    const notJustRefused = ctx.clock.seconds - declinedAt >= DECLINED_COOLDOWN;
    return relaxed && goodMood && userAround && notJustRefused;
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    timeLeft = TAG_SECONDS;
    headStart = 0;
    speedNow = 0;
    speedTarget = 0;
    accel = 8;
    jukeLeft = 0;
    jukeCooldown = 0;
    wasClose = false;
    answer = null;
    target = { x: pet.x, y: pet.y }; // stay put while asking
    countdown = countdown || createCountdown(ctx.stage);
    prompt = prompt || createPrompt(ctx.stage);

    pet.mode = 'tag'; // behaviors stand down
    cancelJump();
    if (reason === 'devtools') {
      beginGame(ctx);
      return;
    }

    // ---- 0. Ask first ----
    phase = 'invite';
    inviteLeft = INVITE_FOR;
    startJump({ height: rand(8, 12), air: 0.25 }); // perk up
    ctx.say(LINES.ask(), INVITE_FOR * 1000);
    ctx.log('tag-invite', { reason });
    prompt.show({
      text: 'Play tag with Starby?',
      yes: 'Yes!',
      no: 'No',
      onYes: () => { answer = 'yes'; },
      onNo: () => { answer = 'no'; },
    });
    prompt.place(pet);
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;

    // Something else took over.
    if (pet.mode !== 'tag') {
      if (pet.mode === 'drag' && phase === 'run') {
        ctx.say(LINES.grabbed(), 2000);
        finish('caught');
      } else {
        finish(`interrupted:${pet.mode}`);
      }
      return;
    }

    // ---- 0. Waiting for an answer ----
    if (phase === 'invite') {
      inviteLeft -= TICK_SECONDS;
      if (cursor.x > -1000) pet.facing = cursor.x >= centerOf(pet).x ? 1 : -1; // looks at you, hopeful
      if (answer === 'yes') {
        prompt.hide();
        ctx.log('tag-answer', { answer: 'yes' });
        beginGame(ctx);
      } else if (answer === 'no') {
        prompt.hide();
        declinedAt = ctx.clock.seconds;
        ctx.log('tag-answer', { answer: 'no' });
        requestMood(ctx, 'sad', 'said no to tag');
        ctx.say(LINES.declined(), 2500);
        finish('declined');
      } else if (inviteLeft <= 0) {
        prompt.hide();
        ctx.log('tag-answer', { answer: 'none' });
        ctx.say(LINES.ignored(), 2000);
        finish('ignored');
      } else if (!isJumping() && chance(0.3, TICK_SECONDS)) {
        startJump({ height: rand(6, 10), air: 0.22 }); // bouncing on the spot, waiting
      }
      return;
    }

    if (pet.mood !== 'playful' && pet.mood !== 'happy') {
      if (pet.mood === 'dizzy') ctx.say(LINES.dizzy(), 2000);
      finish(`mood:${pet.mood}`);
      return;
    }

    // Excited: flip between playful and happy.
    moodSwapIn -= TICK_SECONDS;
    if (moodSwapIn <= 0) {
      moodSwapIn = rand(...MOOD_SWAP);
      requestMood(ctx, pet.mood === 'playful' ? 'happy' : 'playful', 'tag');
    }

    if (cursor.x < -1000) return;
    const c = centerOf(pet);
    const dist = Math.hypot(cursor.x - c.x, cursor.y - c.y);

    // ---- 1. Race to the cursor ----
    if (phase === 'approach') {
      approachLeft -= TICK_SECONDS;
      const spot = toTopLeft(pet, cursor);
      target = clampToScreen(ctx, spot.x, spot.y);
      if (dist <= TAG_TOUCH) {
        phase = 'run';
        headStart = HEAD_START;
        timeLeft = TAG_SECONDS;
        target = awayFrom(ctx, cursor, rand(...KEEP_AWAY));
        speedTarget = RUN_SPEED[1];
        cancelJump();
        startJump({ height: rand(16, 24), air: 0.28 });
        ctx.say(LINES.tag(), 1500);
        countdown.show('TAG', timeLeft, "you're it! catch the star");
        ctx.log('tag-it', {});
      } else if (approachLeft <= 0) {
        ctx.say(LINES.missed(), 2000);
        finish('missed');
      }
      return;
    }

    // ---- 3. Run! ----
    timeLeft -= TICK_SECONDS;
    headStart -= TICK_SECONDS;
    jukeLeft -= TICK_SECONDS;
    jukeCooldown -= TICK_SECONDS;
    countdown.set(timeLeft);

    if (timeLeft <= 0) {
      ctx.say(LINES.starWon(), 2500);
      finish('star-won');
      return;
    }
    if (headStart <= 0 && dist <= CATCH_RADIUS) {
      ctx.say(LINES.caught(), 2500);
      finish('caught');
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
    prompt?.place(pet); // the yes/no popup follows him (only visible while asking)

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
    answer = null;
    prompt?.hide();
    countdown?.hide();
    if (pet.mode === 'tag') pet.mode = 'idle'; // hand him back (grabbed → stays 'drag')
    // After an actual game he stays playful for a bit (not after a "no" or no answer).
    const played = phase !== 'invite';
    if (played && (pet.mood === 'happy' || pet.mood === 'playful')) requestMood(ctx, 'playful', 'tag over');
  },
};
