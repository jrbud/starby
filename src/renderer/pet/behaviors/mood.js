// Emotions (Person 3). Owns pet.mood and works out pet.face every frame.
//
// Three layers, so emotions don't need new pet.mode values:
//   pet.mode  what the body is doing (Person 1): idle | walk | follow | flee | drag | toss
//   pet.mood  how he feels (this file):          happy | mad | playful | dizzy | yawning | sleepy
//   pet.face  which PNG frames to show (see "Face" below and ../frames.js)
//   pet.goal  { x, y } a mood wants him to walk to (yawning → his nap spot on the taskbar), or null.
//             idle.js walks there once Person 1 hooks it up (Phase 2).
// Other behaviors don't check mood names; they read the rules in ./moods.js.
//
// Transitions (all numbers are tuning knobs, below):
//   happy/playful → mad       POKES_TO_MAD (5) clicks within POKE_WINDOW (10s); speech.js warns him off
//                             on the pokes before (escalating). Every further click restarts the 5s timer.
//   happy/playful → playful   thrown (released at ≥500px/s). Each throw / edge hit restarts the 5s timer.
//   happy/playful/mad → dizzy spun 3+ turns (drag.js logs 'dizzy'), 3 throws within 20s, or the
//                             cursor circling him 3 times within 6s. Lasts 5s, then back to
//                             playful (if he was playful) or happy.
//   happy → yawning           1 min without interaction, or the system 'idle' event.
//                             Interaction = click, grab, throw, edge hit, flinch, starbits pickup,
//                             or the cursor within 120px.
//   yawning → happy           any interaction
//   yawning → sleepy          reached his nap spot in pet.goal: sitting on the taskbar (below him,
//                             kept away from the screen edges so his thought cloud / bubbles fit)
//   any → sad                 said no to a game (events/tag.js calls requestMood). Lasts 5s, or
//                             one click cheers him up early. Then back to happy.
//   happy → playful           the cursor rests on him for HOVER_FOR seconds; staying there keeps
//                             him playful.
//   sleepy                    asleep: he doesn't talk at all (../talkbox.js setSpeechGate), only dreams.
//                             Only on the taskbar: asleep anywhere else, he drifts down to it (sinkToNapSpot)
//   sleepy → happy            picked up and shaken, or THROWN (released at ≥WAKE_THROW_SPEED; a
//                             real throw then also makes him playful). Clicks, the cursor or just
//                             setting him down don't wake him; he keeps sleeping where he lands.
//   A SLINGSHOT (slingshot.js logs 'slingshot' { speed }) counts as a throw everywhere above:
//   it wakes him, makes him playful, and counts toward the 3 throws that make him dizzy.
//
// Everything is logged as 'mood' { from, to, reason }. In DevTools: starby.setMood('sleepy').
import { chat, lineBag } from './chatter.js';
import { MOODS } from './moods.js';
import { petBounds, CORNER_WALK_SPEED, startJump, isJumping } from './motion.js';
import { setSpeechGate } from '../talkbox.js';

// ---- Tuning ----
// Exported: speech.js warns on the pokes leading up to it ("one more poke and i'm gonna be mad!").
export const POKES_TO_MAD = 5; // clicks...
export const POKE_WINDOW = 10; // ...within this many seconds
const MAD_FOR = 5; // seconds after the last poke
const PLAYFUL_SPEED = 500; // px/s release speed that counts as a throw
const WAKE_THROW_SPEED = 300; // px/s: a throw at least this fast wakes a sleeping star (not a gentle drop)
const PLAYFUL_FOR = 5; // seconds after the last throw (shown as a countdown on the mood label)
const DIZZY_FOR = 5;
const SAD_FOR = 5; // seconds; a click cheers him up sooner
const HOVER_FOR = 0.8; // seconds the cursor rests on a happy star before he turns playful
// PETTING: rub the cursor slowly back and forth over him → sparkly eyes, a tiny happy hop, a line.
// (Fast circles still make him dizzy, see trackCircle.) A grumpy (mad) star calms down when petted.
const RUB_TURNS = 3; // direction changes...
const RUB_WINDOW = 2.5; // ...within this many seconds, while over him...
const RUB_SPEED = [30, 900]; // ...at a gentle speed (px/s)
const PET_COOLDOWN = 20; // seconds
const TICK_DT = 0.1; // onTick runs 10x a second
const PET_LINES = lineBag(['hehe, that\'s nice', 'aww, pets!', '*happy twinkle*', 'more pets please', 'ooh, right there']);
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
  calmDown: lineBag(['hmph. fine.', "ok... i'm not mad anymore", 'we\'re good.']),
  cheerUp: lineBag(["ok, i'm feeling better!", 'i\'m all good now!', 'maybe next time!']),
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
// His nap spot: straight down onto the taskbar, but not too close to a screen edge: his dream
// cloud floats up and to his LEFT (behaviors/dream.js), and speech bubbles need room either side,
// so nothing gets pushed sideways by the edge.
const NAP_ROOM_LEFT = 140; // px kept clear on his left (the thought cloud)
const NAP_ROOM_RIGHT = 100; // px on his right
const SINK_SPEED = 150; // px/s: asleep somewhere else (dropped, thrown...) → he drifts down onto the taskbar
function napSpot(ctx) {
  const { pet } = ctx;
  const b = petBounds(ctx);
  const lo = Math.min(b.minX + NAP_ROOM_LEFT, b.maxX);
  const hi = Math.max(lo, b.maxX - NAP_ROOM_RIGHT);
  return { x: Math.max(lo, Math.min(hi, pet.x)), y: b.maxY };
}

// He only sleeps ON THE TASKBAR: asleep anywhere else (dropped or thrown while sleeping, put to
// sleep up high...) he slowly drifts down to his nap spot, still asleep.
function sinkToNapSpot(ctx, dt) {
  const { pet } = ctx;
  if (pet.mood !== 'sleepy' || pet.mode !== 'idle') return;
  const spot = napSpot(ctx);
  const dx = spot.x - pet.x;
  const dy = spot.y - pet.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return;
  const step = Math.min(d, SINK_SPEED * dt);
  pet.x += (dx / d) * step;
  pet.y += (dy / d) * step;
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
  pet.goal = mood === 'yawning' ? napSpot(ctx) : null;
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
// pet.gameFocus (set by a game that ASKS you to poke / grab / throw / spin him, e.g. Starby Says):
// those interactions don't change his mood (no getting mad from pokes, playful from throws or dizzy
// from spins), they only count as "someone's here" (no yawning). The game is in charge of his mood.
const GAME_INTERACTIONS = ['click', 'grab', 'swat', 'toss', 'slingshot', 'impact', 'land', 'dizzy'];
let focusSeenAt = -Infinity; // session seconds of the last game-focus interaction

/**
 * Quick pokes so far (clicks within POKE_WINDOW), not counting any made during a pet.gameFocus game:
 * tapping him for Starby Says shouldn't make the first poke after it count as the 5th.
 * Used here (getting mad) and by speech.js (the poke warnings).
 */
export function recentPokes(ctx) {
  const window = Math.min(POKE_WINDOW, ctx.clock.seconds - focusSeenAt);
  return window > 0 ? ctx.events.count('click', window) : 0;
}

function onEntry(ctx, e) {
  const { pet } = ctx;
  if (pet.gameFocus && GAME_INTERACTIONS.includes(e.type)) {
    lastInteraction = ctx.clock.seconds;
    focusSeenAt = ctx.clock.seconds;
    return;
  }
  switch (e.type) {
    case 'click':
      interacted(ctx, 'click');
      // A click cheers a sad star up (speech.js then answers it with a happy line).
      if (pet.mood === 'sad') enter(ctx, 'happy', 'cheered up by a click');
      else if (pet.mood === 'mad') enter(ctx, 'mad', 'poked again');
      else if (CAN_GET_MAD.includes(pet.mood) && recentPokes(ctx) >= POKES_TO_MAD) {
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
    case 'slingshot': // slingshot.js: a slingshot counts as a throw ({ speed } on the same scale)
      // Thrown while asleep: wakes him up (then the throw counts like any other, so a real
      // throw also makes him playful).
      if (pet.mood === 'sleepy' && e.data.speed >= WAKE_THROW_SPEED && setMood(ctx, 'happy', 'thrown awake')) {
        ctx.say(LINES.wake(), 2500);
      }
      interacted(ctx, e.type);
      if (CAN_GET_PLAYFUL.includes(pet.mood) && e.data.speed >= PLAYFUL_SPEED) enter(ctx, 'playful', 'thrown');
      break;
    case 'impact': // drag.js: hit a screen edge during a throw { side, speed }
      interacted(ctx, 'impact');
      if (pet.mood === 'playful') enter(ctx, 'playful', 'hit the edge');
      break;
    case 'land':
      // Throws and slingshots both count.
      if (ctx.events.count('toss', DIZZY_TOSS_WINDOW) + ctx.events.count('slingshot', DIZZY_TOSS_WINDOW) >= DIZZY_TOSSES) {
        getDizzy(ctx, 'thrown too much', true);
      }
      break;
    case 'dizzy': // drag.js: spun 3+ turns; it already said its own dizzy line
      getDizzy(ctx, 'spun', false);
      break;
    case 'event-end': {
      const wins = STARBY_WINS[e.data.name];
      if (wins && wins.includes(e.data.result)) strikePose(ctx, 'spittle', SPITTLE_FOR); // he won!
      break;
    }
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
      // (Not in focus mode, events/focus.js: he stays happy and still while you work.)
      if (e.data.type === 'idle' && pet.mood === 'happy' && pet.mode !== 'focus') enter(ctx, 'yawning', 'user away');
      // You're back (unlocked, or the PC woke up): wakes a yawning star.
      if (e.data.type === 'unlock' || e.data.type === 'wake') interacted(ctx, e.data.type);
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
    enter(ctx, 'playful', 'still hovered'); // restarts the playful timer
    hoverRefreshedAt = now;
  }
}

// ---- Petting: a slow back-and-forth rub over him (checked per tick) ----
let rubLastX = null;
let rubDir = 0;
const rubTurns = [];
let pettedAt = -Infinity;
function trackRub(ctx, now) {
  const { pet, cursor } = ctx;
  const free = pet.mode === 'idle' || pet.mode === 'walk' || pet.mode === 'follow' || pet.mode === 'fidget';
  const over = free && pet.mood !== 'sleepy' && cursor.x >= pet.x && cursor.x <= pet.x + pet.size
    && cursor.y >= pet.y && cursor.y <= pet.y + pet.size;
  if (!over) { rubLastX = null; rubDir = 0; return; }
  if (rubLastX !== null) {
    const dx = cursor.x - rubLastX;
    const speed = Math.abs(dx) / TICK_DT;
    const dir = Math.sign(dx);
    if (dir && speed >= RUB_SPEED[0] && speed <= RUB_SPEED[1]) {
      if (rubDir && dir !== rubDir) rubTurns.push(now);
      rubDir = dir;
    }
  }
  rubLastX = cursor.x;
  while (rubTurns.length && now - rubTurns[0] > RUB_WINDOW) rubTurns.shift();
  if (rubTurns.length < RUB_TURNS || now - pettedAt < PET_COOLDOWN) return;
  rubTurns.length = 0;
  pettedAt = now;
  if (pet.mood === 'mad') setMood(ctx, 'happy', 'petted'); // pets fix grumpiness
  strikePose(ctx, 'glistening', 1.8);
  if (!isJumping() && (pet.mode === 'idle' || pet.mode === 'walk')) startJump({ height: 0.12 * pet.size, air: 0.3 });
  ctx.say(PET_LINES(), 2200);
  ctx.log('petted', {});
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
//   glistening / wink / spittle (a random moment now and then; spittle is rare) > happy.
// Spittle (frames.js: the team's spittle.gif, an excited spit-laugh) also plays as a pose when
// Starby WINS a game (STARBY_WINS below, read from 'event-end').
// Everything after "playful" only happens in his normal (happy) mood.
const MOVE_SPEED = 20; // px/s sideways before he counts as walking left/right
const LOOK_RANGE = 220; // px: cursor this far above/below (at most) makes him look up/down
const LOOK_SIDE = 0.6; // ...and within this many star-widths sideways of his middle
const LOOK_MIN = 0.45; // ...but not right on top of him (star-heights)
const FLOURISH_EVERY = [15, 35]; // seconds between random glistening/wink moments
const GLISTEN_CHANCE = 0.6; // otherwise a wink
const GLISTEN_FOR = 2.4; // seconds
const WINK_FOR = 0.7;
const SPITTLE_CHANCE = 0.08; // of each random flourish (~once every 5 min of standing around)
const SPITTLE_FOR = 1.92; // seconds: the GIF's 12 frames x 80ms, twice
// Game results where Starby won ('event-end' { name, result }) → spittle laugh.
const STARBY_WINS = {
  tag: ['star-won'], // you didn't tag him in time
  pong: ['ai-won'], // he beat you
  'hide-seek': ['star-won'], // you didn't find him
  'starby-says': ['lost'], // you fell for it / were too slow
  catch: ['out'], // you missed him too many times
};

let lastX = null;
let moveVX = 0; // smoothed sideways speed while walking, px/s
let flourish = null; // { face, until } for a random glistening/wink moment
let nextFlourishAt = 0;
let pose = null; // { face, until }: a deliberate pose (e.g. a wink for a screenshot), see strikePose

/**
 * Strike a pose: show `face` (a frames.js face, e.g. 'wink') for `seconds`, over talking,
 * looking and walking faces (moods like mad/asleep/dizzy still win). For reactions like
 * "say cheese!" when you take a screenshot.
 */
export function strikePose(ctx, face, seconds) {
  pose = { face, until: ctx.clock.seconds + seconds };
  ctx.log('pose', { face });
}

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
  // An event can ask for a specific face for a moment (e.g. catch: 'left' while he walks back).
  if (pet.faceOverride) return pet.faceOverride;
  if (pet.mood === 'dizzy' || pet.mood === 'yawning' || pet.mood === 'mad' || pet.mood === 'sad') return pet.mood;
  if (pose && ctx.clock.seconds < pose.until) return pose.face; // strikePose (e.g. screenshot wink)
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
  if (Math.random() < SPITTLE_CHANCE) {
    flourish = { face: 'spittle', until: now + SPITTLE_FOR }; // rare: a little spit-laugh
  } else {
    const glisten = Math.random() < GLISTEN_CHANCE;
    flourish = { face: glisten ? 'glistening' : 'wink', until: now + (glisten ? GLISTEN_FOR : WINK_FOR) };
  }
  ctx.log('flourish', { face: flourish.face });
}

export default {
  name: 'mood',

  init(ctx) {
    const { pet } = ctx;
    pet.mood = 'happy';
    pet.face = 'happy';
    // Asleep = no talking at all (his dreams still show: behaviors/dream.js). Waking up changes
    // the mood BEFORE the wake-up line, so "huh? i'm up!" still shows.
    // Also silent once his goodbye line is up (behaviors/goodbye.js: nothing may talk over it).
    setSpeechGate(() => pet.mood === 'sleepy' || pet.goodbyeSaid === true);
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
      // Dialogue → Settings → "feeling sleepy?": "yeah..." and straight into the sleepy walk to his nap spot on
      // the taskbar (no waiting for a random rest first); he falls asleep when he gets there.
      window.starby.getSleepy = () => {
        if (pet.mood === 'sleepy') return 'already asleep';
        const active = ctx.activeEvent();
        if (active === 'intro' || active === 'goodbye') return 'not now';
        if (active) ctx.stopEvent('feeling sleepy');
        if (pet.mode === 'drag' || pet.mode === 'toss') return 'being held';
        ctx.say(['yeah... *yawn*', 'yeah... kinda...', 'mmm... yeah... nap time'][Math.floor(Math.random() * 3)], 2500);
        setMood(ctx, 'yawning', 'feeling sleepy (settings)'); // sets pet.goal = his nap spot
        const [lo, hi] = CORNER_WALK_SPEED;
        Object.assign(pet, {
          targetX: pet.goal.x, targetY: pet.goal.y, walkSpeed: lo + Math.random() * (hi - lo), walkKind: 'to-corner', mode: 'walk',
        });
        return 'sleepy';
      };
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
    trackRub(ctx, now);
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
    sinkToNapSpot(ctx, dt);
    ctx.pet.face = faceFor(ctx);
  },
};
