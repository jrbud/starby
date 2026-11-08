// Emotions (Person 3). Owns pet.mood and works out pet.face every frame.
//
// Three layers, so emotions don't need new pet.mode values:
//   pet.mode  what the body is doing (Person 1): idle | walk | follow | flee | drag | toss
//   pet.mood  how he feels (this file):          happy | mad | playful | dizzy | yawning | sleepy
//   pet.face  which PNG frames to show (see "Face" below and ../frames.js)
//   pet.goal  { x, y } a mood wants him to walk to (yawning → nearest top corner), or null.
//             idle.js walks there once Person 1 hooks it up (Phase 2).
// Other behaviors don't check mood names; they read the rules in ./moods.js.
//
// Transitions (all numbers are tuning knobs, below):
//   happy/playful → mad       4 clicks within 8s. Every further click restarts the 20s timer.
//   happy/playful → playful   thrown (released at ≥500px/s). Each throw / edge hit restarts the 15s timer.
//   happy/playful/mad → dizzy spun 3+ turns (drag.js logs 'dizzy'), 3 throws within 20s, or the
//                             cursor circling him 3 times within 6s. Lasts 5s, then back to
//                             playful (if he was playful) or happy.
//   happy → yawning           1 min without interaction, or the system 'idle' event.
//                             Interaction = click, grab, throw, edge hit, flinch, starbits pickup,
//                             or the cursor within 120px.
//   yawning → happy           any interaction
//   yawning → sleepy          reached the top corner in pet.goal
//   any → sad                 said no to a game (events/tag.js calls requestMood). Lasts 5s, or
//                             one click cheers him up early. Then back to happy.
//   happy → playful           the cursor rests on him for HOVER_FOR seconds; staying there keeps
//                             him playful.
//   sleepy → happy            ONLY picked up and shaken. Clicks, the cursor, throws don't wake him;
//                             dropped or thrown asleep, he keeps sleeping where he lands.
//
// Everything is logged as 'mood' { from, to, reason }. In DevTools: starby.setMood('sleepy').
import { chat, lineBag } from './chatter.js';
import { MOODS } from './moods.js';
import { petBounds } from './motion.js';

// ---- Tuning ----
const MAD_CLICKS = 4; // clicks...
const MAD_WINDOW = 8; // ...within this many seconds
const MAD_FOR = 20; // seconds after the last poke
const PLAYFUL_SPEED = 500; // px/s release speed that counts as a throw
const PLAYFUL_FOR = 15; // seconds after the last throw
const DIZZY_FOR = 5;
const SAD_FOR = 5; // seconds; a click cheers him up sooner
const HOVER_FOR = 0.8; // seconds the cursor rests on a happy star before he turns playful
const DIZZY_TOSSES = 3; // throws...
const DIZZY_TOSS_WINDOW = 20; // ...within this many seconds
const CIRCLE_RADIUS = 200; // cursor must circle within this distance of his center...
const CIRCLE_MIN_RADIUS = 20; // ...but not right on top of him (angles get jumpy)
const CIRCLE_TURNS = 3;
const CIRCLE_WINDOW = 6; // seconds
const YAWN_AFTER = 60; // seconds without interaction
const YAWN_AFTER_NIGHT = 60;
const NEAR_RADIUS = 120; // cursor this close counts as interacting
const CORNER_REACHED = 6; // px from pet.goal
const SHAKE_SPEED = 700; // px/s cursor speed that counts as a shake stroke
const SHAKE_REVERSALS = 4; // direction flips...
const SHAKE_WINDOW = 1.2; // ...within this many seconds wake him up

const TAU = Math.PI * 2;
const CAN_GET_MAD = ['happy', 'playful'];
const CAN_GET_PLAYFUL = ['happy', 'playful'];
const CAN_GET_DIZZY = ['happy', 'playful', 'mad'];

// Lines for mood changes. Click and idle lines per mood live in speech.js.
const LINES = {
  dizzy: lineBag(['@_@ the world is spinning', 'whoa... wobbly...', 'which way is up?']),
  yawning: lineBag(['*yaaawn*', 'getting sleepy...', "think i'll find a nap spot"]),
  sleepy: lineBag(['zzz...', '*snore*', 'zzz... mm... starbits...']),
  wake: lineBag(["huh?! i'm up, i'm up!", 'whoa! good morning?', 'okay okay, no more naps']),
  roused: lineBag(["oh! hi, i'm awake", 'hm? oh, hi!', "i wasn't sleeping!"]),
  calmDown: lineBag(['hmph. fine.', "ok... i'm not mad anymore", 'we good.']),
  cheerUp: lineBag(["ok, i'm feeling better!", 'cheered up ✦', 'maybe next time!']),
};

// ---- State ----
let moodTimer = null; // scheduler id: when the current timed mood ends
let moodEndsAt = null; // session seconds when that timer fires (for moodStatus / the debug label)
let lastInteraction = 0; // session seconds
let isNight = false;
const circle = { prevAngle: null, steps: [] }; // steps: { t, d } angle swept per tick
const shake = { t: 0, prev: null, lastDir: null, reversals: [] };

const center = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });

// Top corners of the usable screen area (below a top taskbar, beside a side one).
function nearestTopCorner(ctx) {
  const { pet } = ctx;
  const b = petBounds(ctx);
  const left = center(pet).x < (b.minX + b.maxX + pet.size) / 2;
  return { x: left ? b.minX : b.maxX, y: b.minY };
}

/** Switch mood. Returns false if it's already that mood (or not a real one). */
function setMood(ctx, mood, reason) {
  const { pet } = ctx;
  if (!MOODS[mood] || pet.mood === mood) return false;
  const from = pet.mood;
  pet.mood = mood;
  ctx.cancel(moodTimer);
  moodTimer = null;
  moodEndsAt = null;
  pet.goal = mood === 'yawning' ? nearestTopCorner(ctx) : null;
  ctx.log('mood', { from, to: mood, reason });
  return true;
}

function endIn(ctx, seconds, fn) {
  ctx.cancel(moodTimer);
  moodEndsAt = ctx.clock.seconds + seconds;
  moodTimer = ctx.after(seconds, () => {
    moodTimer = null;
    moodEndsAt = null;
    fn();
  }, `mood: ${ctx.pet.mood} ends`);
}

/**
 * What's coming next, for the debug label: { endsIn } seconds for timed moods (mad, playful,
 * dizzy), { yawnIn } seconds while happy, or {} for moods that end on an action.
 */
export function moodStatus(ctx) {
  const now = ctx.clock.seconds;
  if (moodEndsAt !== null) return { endsIn: Math.max(0, moodEndsAt - now) };
  if (ctx.pet.mood === 'happy') {
    return { yawnIn: Math.max(0, (isNight ? YAWN_AFTER_NIGHT : YAWN_AFTER) - (now - lastInteraction)) };
  }
  return {};
}

/** Enter a mood and arm its timer. Re-entering mad/playful restarts the timer. */
function enter(ctx, mood, reason) {
  const from = ctx.pet.mood;
  const changed = setMood(ctx, mood, reason);
  if (mood === 'mad') {
    endIn(ctx, MAD_FOR, () => {
      if (setMood(ctx, 'happy', 'calmed down')) chat(ctx, LINES.calmDown(), 2000, { wait: 4 });
    });
  } else if (mood === 'playful') {
    endIn(ctx, PLAYFUL_FOR, () => setMood(ctx, 'happy', 'played out'));
  } else if (mood === 'dizzy' && changed) {
    const back = from === 'playful' ? 'playful' : 'happy';
    endIn(ctx, DIZZY_FOR, () => enter(ctx, back, 'steady again'));
  } else if (mood === 'yawning' && changed) {
    chat(ctx, LINES.yawning(), 3000, { wait: 10 });
  } else if (mood === 'sad') {
    endIn(ctx, SAD_FOR, () => {
      if (setMood(ctx, 'happy', 'cheered up')) chat(ctx, LINES.cheerUp(), 2500, { wait: 6 });
    });
  } else if (mood === 'sleepy' && changed) {
    chat(ctx, LINES.sleepy(), 3000, { wait: 5, ignoreQuiet: true });
  }
  return changed;
}

/**
 * For scripted events (../events/, e.g. tag): switch mood through the normal path, so it's
 * logged and timed like any other change (playful still wears off by itself, etc.).
 */
export function requestMood(ctx, mood, reason) {
  return enter(ctx, mood, reason);
}

function interacted(ctx, kind) {
  lastInteraction = ctx.clock.seconds;
  if (ctx.pet.mood === 'yawning' && setMood(ctx, 'happy', `woke: ${kind}`)) {
    chat(ctx, LINES.roused(), 2000, { wait: 3 });
  }
}

function getDizzy(ctx, reason, sayLine) {
  if (!CAN_GET_DIZZY.includes(ctx.pet.mood)) return;
  if (enter(ctx, 'dizzy', reason) && sayLine) ctx.say(LINES.dizzy(), 2500);
}

// ---- Reacting to what happened (event log) ----
function onEntry(ctx, e) {
  const { pet } = ctx;
  switch (e.type) {
    case 'click':
      interacted(ctx, 'click');
      // A click cheers a sad star up (speech.js then answers it with a happy line).
      if (pet.mood === 'sad') enter(ctx, 'happy', 'cheered up by a click');
      else if (pet.mood === 'mad') enter(ctx, 'mad', 'poked again');
      else if (CAN_GET_MAD.includes(pet.mood) && ctx.events.count('click', MAD_WINDOW) >= MAD_CLICKS) {
        enter(ctx, 'mad', 'poked'); // speech.js answers this click with a mad line
      }
      break;
    case 'grab':
      interacted(ctx, 'grab'); // a sleeping star stays asleep until shaken (see trackShake)
      break;
    case 'swat': // drag.js: tried to pick up a mad star; counts as another poke
      interacted(ctx, 'swat');
      if (pet.mood === 'mad') enter(ctx, 'mad', 'swatted');
      break;
    case 'toss':
      interacted(ctx, 'toss');
      if (CAN_GET_PLAYFUL.includes(pet.mood) && e.data.speed >= PLAYFUL_SPEED) enter(ctx, 'playful', 'thrown');
      break;
    case 'impact': // drag.js: hit a screen edge during a throw { side, speed }
      interacted(ctx, 'impact');
      if (pet.mood === 'playful') enter(ctx, 'playful', 'hit the edge');
      break;
    case 'land':
      if (ctx.events.count('toss', DIZZY_TOSS_WINDOW) >= DIZZY_TOSSES) getDizzy(ctx, 'thrown too much', true);
      break;
    case 'dizzy': // drag.js: spun 3+ turns; it already said its own dizzy line
      getDizzy(ctx, 'spun', false);
      break;
    case 'dance': // events/dance.js: dancing to a song keeps him busy (no yawning mid-playlist)
      lastInteraction = ctx.clock.seconds;
      break;
    case 'flinch':
      interacted(ctx, 'flinch');
      break;
    case 'starbits':
      if (e.data.delta > 0) interacted(ctx, 'starbits');
      break;
    case 'system':
      if (e.data.type === 'time-of-day') isNight = e.data.part === 'night';
      if (e.data.type === 'idle' && pet.mood === 'happy') enter(ctx, 'yawning', 'user away');
      break;
    default:
      break;
  }
}

// ---- Cursor resting on him (checked per tick) ----
// A happy star turns playful after HOVER_FOR seconds; while the cursor stays, playful is kept
// topped up (refreshed once a second, so it doesn't wear off under your cursor).
let hoverSince = null;
let hoverRefreshedAt = 0;
function trackHover(ctx, now) {
  const { pet, cursor } = ctx;
  const free = pet.mode === 'idle' || pet.mode === 'walk' || pet.mode === 'follow';
  const over = free && cursor.x >= pet.x && cursor.x <= pet.x + pet.size
    && cursor.y >= pet.y && cursor.y <= pet.y + pet.size;
  if (!over) {
    hoverSince = null;
    return;
  }
  if (hoverSince === null) hoverSince = now;
  if (now - hoverSince < HOVER_FOR) return;
  if (pet.mood === 'happy') {
    enter(ctx, 'playful', 'hovered');
    hoverRefreshedAt = now;
  } else if (pet.mood === 'playful' && now - hoverRefreshedAt >= 1) {
    enter(ctx, 'playful', 'still hovered'); // restarts the 15s playful timer
    hoverRefreshedAt = now;
  }
}

// ---- Cursor circling him (checked per tick) ----
function trackCircle(ctx, now) {
  const { pet, cursor } = ctx;
  const c = center(pet);
  const dx = cursor.x - c.x;
  const dy = cursor.y - c.y;
  const r = Math.hypot(dx, dy);
  const watching = CAN_GET_DIZZY.includes(pet.mood) && pet.mode !== 'drag' && pet.mode !== 'toss';
  if (cursor.x < -1000 || !watching || r > CIRCLE_RADIUS || r < CIRCLE_MIN_RADIUS) {
    circle.prevAngle = null;
    circle.steps = [];
    return;
  }
  const a = Math.atan2(dy, dx);
  if (circle.prevAngle !== null) {
    let d = a - circle.prevAngle;
    if (d > Math.PI) d -= TAU; // take the short way round
    else if (d < -Math.PI) d += TAU;
    circle.steps.push({ t: now, d });
  }
  circle.prevAngle = a;
  circle.steps = circle.steps.filter((s) => now - s.t <= CIRCLE_WINDOW);
  const swept = circle.steps.reduce((sum, s) => sum + s.d, 0); // signed: back-and-forth cancels out
  if (Math.abs(swept) >= CIRCLE_TURNS * TAU) {
    circle.steps = [];
    getDizzy(ctx, 'cursor circles', true);
  }
}

// ---- Shaking a sleeping star awake (checked per frame: shakes are too fast for ticks) ----
function trackShake(ctx, dt) {
  const { pet, cursor } = ctx;
  shake.t += dt;
  if (pet.mood !== 'sleepy' || pet.mode !== 'drag' || dt <= 0) {
    shake.prev = null;
    shake.lastDir = null;
    shake.reversals = [];
    return;
  }
  if (shake.prev) {
    const vx = (cursor.x - shake.prev.x) / dt;
    const vy = (cursor.y - shake.prev.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed >= SHAKE_SPEED) {
      const dir = { x: vx / speed, y: vy / speed };
      // A fast stroke heading back the way the last fast stroke came = one shake reversal.
      if (shake.lastDir && dir.x * shake.lastDir.x + dir.y * shake.lastDir.y < -0.3) shake.reversals.push(shake.t);
      shake.lastDir = dir;
    }
  }
  shake.prev = { x: cursor.x, y: cursor.y };
  shake.reversals = shake.reversals.filter((t) => shake.t - t <= SHAKE_WINDOW);
  if (shake.reversals.length >= SHAKE_REVERSALS) {
    shake.reversals = [];
    if (setMood(ctx, 'happy', 'shaken awake')) {
      lastInteraction = ctx.clock.seconds;
      ctx.say(LINES.wake(), 2500); // answers the user, so instant
    }
  }
}

// ---- Face ----
// pet.face picks the PNG frames (../frames.js). First match wins:
//   sleepy (even while held: he dangles asleep) > dragged (held) > dizzy > yawning > mad >
//   sad (shown with the mad frames: grumpy, not truly mad) > dancing (events/dance.js) >
//   playful (mood, mid-throw, or tag) >
//   up (an event wants him to look up, e.g. a star shower) > talking >
//   up / down (cursor right above / below him) > left / right (walking that way) >
//   glistening / wink (a random moment now and then) > happy.
// Everything after "playful" only happens in his normal (happy) mood.
const MOVE_SPEED = 20; // px/s sideways before he counts as walking left/right
const LOOK_RANGE = 220; // px: cursor this far above/below (at most) makes him look up/down
const LOOK_SIDE = 0.6; // ...and within this many star-widths sideways of his middle
const LOOK_MIN = 0.45; // ...but not right on top of him (star-heights)
const FLOURISH_EVERY = [15, 35]; // seconds between random glistening/wink moments
const GLISTEN_CHANCE = 0.6; // otherwise a wink
const GLISTEN_FOR = 2.4; // seconds
const WINK_FOR = 0.7;

let lastX = null;
let moveVX = 0; // smoothed sideways speed while walking, px/s
let flourish = null; // { face, until } for a random glistening/wink moment
let nextFlourishAt = 0;

function cursorAboveOrBelow(ctx) {
  const { pet, cursor } = ctx;
  if (cursor.x < -1000) return null;
  const c = center(pet);
  const dx = cursor.x - c.x;
  const dy = cursor.y - c.y;
  if (Math.abs(dx) > pet.size * LOOK_SIDE) return null;
  if (Math.abs(dy) < pet.size * LOOK_MIN || Math.abs(dy) > LOOK_RANGE) return null;
  return dy < 0 ? 'up' : 'down';
}

function trackMovement(ctx, dt) {
  const { pet } = ctx;
  const walking = pet.mode === 'walk' || pet.mode === 'follow' || pet.mode === 'flee';
  const vx = lastX !== null && dt > 0 ? (pet.x - lastX) / dt : 0;
  lastX = pet.x;
  moveVX = walking ? moveVX + (vx - moveVX) * Math.min(1, dt * 10) : 0;
}

function faceFor(ctx) {
  const { pet } = ctx;
  if (pet.mood === 'sleepy') return 'sleepy';
  if (pet.mode === 'drag') return 'dragged';
  if (pet.mood === 'dizzy' || pet.mood === 'yawning' || pet.mood === 'mad' || pet.mood === 'sad') return pet.mood;
  if (pet.mode === 'dance') return 'dancing'; // events/dance.js (only runs while happy/playful)
  if (pet.mood === 'playful' || pet.mode === 'toss' || pet.mode === 'tag') return 'playful';
  if (pet.lookUp) return 'up';
  if (ctx.isSpeaking()) return 'talking';
  const look = cursorAboveOrBelow(ctx);
  if (look) return look;
  if (Math.abs(moveVX) >= MOVE_SPEED) return moveVX < 0 ? 'left' : 'right';
  if (flourish && ctx.clock.seconds < flourish.until) return flourish.face;
  return 'happy';
}

// Now and then, while he's just standing there happy: a sparkly-eyed glistening moment or a wink.
function maybeFlourish(ctx, now) {
  if (now < nextFlourishAt) return;
  nextFlourishAt = now + FLOURISH_EVERY[0] + Math.random() * (FLOURISH_EVERY[1] - FLOURISH_EVERY[0]);
  if (ctx.pet.face !== 'happy') return; // busy: skip this one
  const glisten = Math.random() < GLISTEN_CHANCE;
  flourish = { face: glisten ? 'glistening' : 'wink', until: now + (glisten ? GLISTEN_FOR : WINK_FOR) };
  ctx.log('flourish', { face: flourish.face });
}

export default {
  name: 'mood',

  init(ctx) {
    const { pet } = ctx;
    pet.mood = 'happy';
    pet.face = 'happy';
    pet.goal = null;
    lastInteraction = ctx.clock.seconds;
    nextFlourishAt = ctx.clock.seconds + FLOURISH_EVERY[0];
    ctx.events.onEntry((e) => onEntry(ctx, e));

    // DevTools: starby.setMood('sleepy'), starby.mood()
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.setMood = (mood) => {
        if (!MOODS[mood]) return `unknown mood; try: ${Object.keys(MOODS).join(', ')}`;
        lastInteraction = ctx.clock.seconds; // restart the 2-min yawn clock too
        enter(ctx, mood, 'devtools');
        return pet.mood;
      };
      window.starby.mood = () => ({ mood: pet.mood, face: pet.face, goal: pet.goal });
      // starby.flourish('wink') / starby.flourish('glistening') to see one right now
      window.starby.flourish = (face = 'glistening') => {
        flourish = { face, until: ctx.clock.seconds + (face === 'wink' ? WINK_FOR : GLISTEN_FOR) };
        return face;
      };
    }
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;
    const now = ctx.clock.seconds;

    const c = center(pet);
    if (cursor.x > -1000 && pet.mode !== 'drag' && Math.hypot(cursor.x - c.x, cursor.y - c.y) < NEAR_RADIUS) {
      interacted(ctx, 'cursor');
    }
    trackHover(ctx, now);
    trackCircle(ctx, now);
    maybeFlourish(ctx, now);

    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    if (pet.mood === 'happy' && relaxed && now - lastInteraction >= (isNight ? YAWN_AFTER_NIGHT : YAWN_AFTER)) {
      enter(ctx, 'yawning', isNight ? 'bored (night)' : 'bored');
    }
    if (pet.mood === 'yawning' && pet.goal && pet.mode === 'idle'
      && Math.hypot(pet.x - pet.goal.x, pet.y - pet.goal.y) <= CORNER_REACHED) {
      enter(ctx, 'sleepy', 'reached corner');
    }
  },

  update(ctx, dt) {
    trackShake(ctx, dt);
    trackMovement(ctx, dt);
    ctx.pet.face = faceFor(ctx);
  },
};
