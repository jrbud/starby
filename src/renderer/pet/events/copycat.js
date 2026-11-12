// COPYCAT — Starby follows your cursor around like a duckling following its mom.
//
//   approach  he walks over to your cursor first (APPROACH_SPEED), stopping a little way from it
//   announce  then stops, faces you and says it: "hehe, i'm gonna copy you!" (ANNOUNCE_FOR)
//   copy      for COPY_FOR seconds he follows where your cursor WENT, not where it is: he aims at
//             the cursor's position from a moment ago (DELAY, drifting a little), so he trails your
//             path. And he's not a robot about it:
//               - he moves like a little body (a springy chase: speeds up, slightly overshoots,
//                 settles), never snapping to the cursor, and no faster than MAX_SPEED
//               - his aim wobbles a bit (WOBBLE), like a duckling that can't walk quite straight
//               - now and then he gets distracted (DISTRACT_*): stops, looks around, then hurries
//                 to catch up
//               - he keeps a little gap (GAP) and never sits on top of your cursor
//   ends      bored  after COPY_FOR: "ok i'm bored now" → 'bored'
//             lost   your cursor's been off this screen for LOST_AFTER: "huh? where'd you go?" → 'lost'
//             grabbed / thrown → interrupted
//
// ITS OWN CATEGORY ('copycat'), like dance: not a game (not on the game buttons, not in the games
// timer, no shared rest). Its own timer (watch, below): COPYCAT_EVERY seconds (3 minutes) after the
// last copycat ended (or after launch), he tries to start one. Only when nothing else is running,
// he's relaxed (idle/walking) and happy/playful, and you're moving the mouse (moved in the last
// USER_AROUND seconds: there has to be something to copy). Not a good moment → he tries again
// every RETRY seconds. Priority 3: just above dance, so sky events, invites and games take over.
// Also: Developer window → "Copycat", or starby.startEvent('copycat').
// No reward: it's just him being silly.
//
// Owns the star via pet.mode = 'copycat'. Decisions (timer, ending) on ticks; moving every frame.
import { rand, clamp, petBounds, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const APPROACH_SPEED = 300; // px/s walking over to your cursor first
const APPROACH_MAX = 6; // seconds: can't reach you by then (you keep running off) → announce anyway
const ANNOUNCE_FOR = 1.8; // seconds standing still saying "i'm gonna copy you!"
const COPY_FOR = 25; // seconds of copying before he gets bored
const DELAY = 0.45; // seconds: he aims where your cursor was this long ago...
const DELAY_DRIFT = 0.12; // ...give or take this (slowly changing: sometimes quicker, sometimes slower)
const GAP = 0.9; // star-sizes he keeps between his middle and the cursor (never sits on it)
const SPRING = 26; // how hard he pulls toward where he's aiming...
const DAMPING = 6.5; // ...and how much that's held back (lower = more overshoot / wobble)
const MAX_SPEED = 900; // px/s: fastest he can go
const WOBBLE = 0.12; // star-sizes his aim wanders around (smooth, never jittery)
const DISTRACT_EVERY = [5, 9]; // seconds between chances to get distracted...
const DISTRACT_CHANCE = 0.4; // ...this often...
const DISTRACT_FOR = [0.45, 0.9]; // ...standing there looking around for this long
const LOST_AFTER = 3; // seconds with your cursor off this screen → he gives up
const MOVING = 40; // px/s: faster than this, he faces the way he's going
const STEP_PX = 26; // px travelled per little step-bob
const STEP_BOB = 3; // px high
const COPYCAT_EVERY = 180; // seconds between copycats (from the end of the last one)
const RETRY = 15; // seconds: not a good moment → try again this soon
const USER_AROUND = 3; // seconds since the cursor last moved, to count as "you're moving it"
const HISTORY = 2; // seconds of cursor positions kept

const LINES = {
  start: lineBag(["hehe, i'm gonna copy you!", 'copycat time! whatever you do, i do!', "i'm your shadow now!", "follow the leader! you're the leader!"]),
  bored: lineBag(["ok i'm bored now", 'copying is boring now...', 'ok, you win. i stop.', 'yawn. done copying!']),
  lost: lineBag(["huh? where'd you go?", 'hello? come back!', 'aw, you lost me']),
};

// ---- State ----
let endGame = null;
let phase = 'approach'; // approach | announce | copy
let t = 0; // seconds into the phase
let trail = []; // [{ t, x, y }] cursor positions (session seconds), oldest first
let vel = { x: 0, y: 0 }; // his speed (px/s), middle of the star
let wob = { a: 0, b: 0, c: 0, d: 0 }; // wobble phases
let nextDistractAt = 0;
let distractedUntil = 0;
let lookFace = null; // face while distracted
let offScreenFor = 0;
let stepPhase = 0;
let nextAt = null; // session seconds when the timer next tries to start a copycat
let lastCursorSeen = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

const cursorOn = (c) => c.x > -1000 && c.y > -1000; // pet.js parks it far off screen when it leaves
const middle = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

const setPhase = (p) => { phase = p; t = 0; };

// Where the cursor was `ago` seconds back (interpolated along the trail).
function cursorAgo(now, ago) {
  if (!trail.length) return null;
  const at = now - ago;
  if (at <= trail[0].t) return trail[0];
  for (let i = trail.length - 1; i > 0; i--) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a.t <= at) {
      const u = b.t > a.t ? (at - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return trail[trail.length - 1];
}

// A spot GAP away from the cursor, on his side of it (so he never covers it).
function besideCursor(pet, cursor, aim) {
  const c = middle(pet);
  const gap = GAP * pet.size;
  const dx = aim.x - cursor.x;
  const dy = aim.y - cursor.y;
  if (Math.hypot(dx, dy) >= gap) return aim;
  let ox = c.x - cursor.x;
  let oy = c.y - cursor.y;
  let d = Math.hypot(ox, oy);
  if (d < 1) { ox = 0; oy = 1; d = 1; } // right on it: stand just below
  return { x: cursor.x + (ox / d) * gap, y: cursor.y + (oy / d) * gap };
}

// Move his middle by (dx, dy), kept on screen; little step-bob; face the way he's going.
function moveBy(ctx, dx, dy, dt) {
  const { pet } = ctx;
  const b = petBounds(ctx);
  pet.x = clamp(pet.x + dx, b.minX, b.maxX);
  pet.y = clamp(pet.y + dy, b.minY, b.maxY);
  const speed = Math.hypot(dx, dy) / Math.max(dt, 1e-3);
  if (!isJumping()) {
    stepPhase += Math.hypot(dx, dy) / STEP_PX * Math.PI;
    pet.bob = speed > MOVING ? -Math.abs(Math.sin(stepPhase)) * STEP_BOB : pet.bob * (1 - Math.min(1, dt * 12));
  }
  if (speed > MOVING && Math.abs(dx) > Math.abs(dy) * 0.4) {
    pet.facing = dx > 0 ? 1 : -1;
    pet.faceOverride = dx > 0 ? 'right' : 'left';
  } else if (speed <= MOVING) {
    pet.faceOverride = null; // standing: his usual face (talking, happy...)
  }
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
    const { pet } = ctx;
    endGame = end;
    trail = [];
    vel = { x: 0, y: 0 };
    wob = { a: rand(0, 6), b: rand(0, 6), c: rand(0, 6), d: rand(0, 6) };
    offScreenFor = 0;
    stepPhase = 0;
    lookFace = null;
    pet.mode = 'copycat'; // behaviors stand down
    cancelJump();
    setPhase('approach');
    ctx.log('copycat-start', { reason });
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;
    if (!endGame) return;
    if (pet.mode !== 'copycat') { finish(`interrupted:${pet.mode}`); return; }
    if (phase !== 'copy') return;
    offScreenFor = cursorOn(cursor) ? 0 : offScreenFor + TICK_SECONDS;
    if (offScreenFor >= LOST_AFTER) {
      ctx.say(LINES.lost(), 2500);
      finish('lost');
    } else if (t >= COPY_FOR) {
      ctx.say(LINES.bored(), 2500);
      finish('bored');
    }
  },

  update(ctx, dt) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'copycat' || !endGame) return;
    t += dt;
    const now = ctx.clock.seconds;
    updateJump(pet, dt);
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);

    // Remember where the cursor's been (he copies the path, a moment late).
    if (cursorOn(cursor)) {
      trail.push({ t: now, x: cursor.x, y: cursor.y });
      while (trail.length > 2 && now - trail[0].t > HISTORY) trail.shift();
    }

    if (phase === 'approach') {
      // Walk over to you first (a little way from the cursor), then say what he's up to.
      const c = middle(pet);
      const spot = cursorOn(cursor) ? besideCursor(pet, cursor, c) : c;
      const dx = spot.x - c.x;
      const dy = spot.y - c.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, APPROACH_SPEED * dt);
      if (d > 1) moveBy(ctx, (dx / d) * step, (dy / d) * step, dt);
      if (d <= 2 || t >= APPROACH_MAX) {
        pet.faceOverride = null; // faces you, talking
        pet.bob = 0;
        startJump({ height: rand(8, 12), air: 0.25 }); // a little hop: "hehe!"
        ctx.say(LINES.start(), ANNOUNCE_FOR * 1000 + 600);
        setPhase('announce');
      }
      return;
    }

    if (phase === 'announce') {
      if (!isJumping()) pet.bob *= 1 - Math.min(1, dt * 12);
      if (t >= ANNOUNCE_FOR) {
        vel = { x: 0, y: 0 };
        nextDistractAt = now + rand(...DISTRACT_EVERY);
        distractedUntil = 0;
        setPhase('copy');
      }
      return;
    }

    // ---- copy: the duckling ----
    const c = middle(pet);
    const S = pet.size;
    // Distracted now and then: stops, looks around, then hurries to catch up.
    if (now >= nextDistractAt) {
      nextDistractAt = now + rand(...DISTRACT_EVERY);
      if (Math.random() < DISTRACT_CHANCE) {
        distractedUntil = now + rand(...DISTRACT_FOR);
        lookFace = ['up', 'left', 'right'][Math.floor(Math.random() * 3)];
      }
    }
    let aim;
    if (now < distractedUntil) {
      aim = c; // stays put (slows to a stop on the spring)
    } else {
      lookFace = null;
      const delay = DELAY + DELAY_DRIFT * Math.sin(now * 0.7 + wob.a); // reaction time drifts
      const past = cursorAgo(now, delay) || c;
      // The wobble: two slow waves per axis, so his line wanders without jitter.
      const wx = (Math.sin(now * 1.7 + wob.b) + 0.5 * Math.sin(now * 3.1 + wob.c)) * WOBBLE * S;
      const wy = (Math.sin(now * 1.3 + wob.d) + 0.5 * Math.sin(now * 2.7 + wob.a)) * WOBBLE * S;
      const raw = { x: past.x + wx, y: past.y + wy };
      aim = cursorOn(cursor) ? besideCursor(pet, cursor, raw) : raw;
    }
    // A springy chase: pulled toward the aim, held back by damping (a little overshoot), capped.
    vel.x += (SPRING * (aim.x - c.x) - DAMPING * vel.x) * dt;
    vel.y += (SPRING * (aim.y - c.y) - DAMPING * vel.y) * dt;
    const sp = Math.hypot(vel.x, vel.y);
    if (sp > MAX_SPEED) { vel.x *= MAX_SPEED / sp; vel.y *= MAX_SPEED / sp; }
    moveBy(ctx, vel.x * dt, vel.y * dt, dt);
    if (lookFace) pet.faceOverride = lookFace; // looking around
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    trail = [];
    pet.bob = 0;
    pet.squash = 1;
    pet.faceOverride = null;
    if (pet.mode === 'copycat') pet.mode = 'idle';
    nextAt = ctx.clock.seconds + COPYCAT_EVERY; // the next one, 3 minutes after this one ended
  },
};
