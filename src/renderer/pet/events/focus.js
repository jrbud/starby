// FOCUS: "Sorry, I gotta focus" in the right-click dialogue (../dialogue/tree.js).
// Starby is understanding: he says so, walks to the bottom-left corner of the usable screen
// (standing on the taskbar), and stays there, quiet, until you come back to him.
//
// NOT DISTRACTING is the whole point:
//   - he stays happy (no moping, no yawning off to sleep: mood.js skips the "user away" yawn here)
//   - once parked he doesn't move at all: no bob, no breathing, no rotation
//   - his face holds the 'calm' frame (frames.js: idle-1 only, arms down, no idle-2 arm wave),
//     with a quiet flourish now and then (FLOURISH_EVERY): a wink, or sparkly glistening eyes
//     (both keep his arms down)
//   - pet.hushed = true after his "okay" line, so he says nothing at all (no idle chatter, no
//     system-read comments)
//   - starbit drops, game invites, sky events and dancing are paused: this event outranks them
//     (priority 16), and starbits.js skips drops in 'focus' mode
//
// Ends when you click him or pick him up (he says hi), or you pick "Okay, I'm done focusing!" in
// the dialogue. The shop window (priority 20) also ends it.
// You can still right-click him while he focuses: the dialogue opens and he stays parked.
// Above hush (15): if a call starts while focusing he's already quiet and parked.
// Owns the star via pet.mode = 'focus'; sets pet.faceOverride while parked (mood.js honours it).
// DevTools: starby.startEvent('focus').
import { approach, petBounds, rand } from '../behaviors/motion.js';
import { requestMood } from '../behaviors/mood.js';
import { lineBag } from '../behaviors/chatter.js';

const WALK_SPEED = 120; // px/s to the corner
const EDGE = 8; // px in from the left edge
const QUIET_AFTER = 2.6; // seconds: let his "okay" line finish before he goes silent
const FLOURISH_EVERY = [12, 30]; // seconds between a wink / glistening moment while parked
const GLISTEN_CHANCE = 0.5; // otherwise a wink
const GLISTEN_FOR = 2.4; // seconds of sparkly eyes (frames.js 'glistening')
const WINK_FOR = 0.7; // seconds
// Things you do to him that end focus (event log types).
const WAKE_ON = ['click', 'grab'];

const LINES = {
  okay: lineBag(["okay! i'll be right here!", 'you got this!', "okay, i'll be quiet. good luck!"]),
  back: lineBag(["yay, you're back!", 'all done? hi hi!', 'break time? yay!']),
};

let endFocus = null;
let t = 0;
let nextFlourishAt = 0; // t (seconds into focus) of the next wink/glisten
let flourish = null; // { face, until }

function finish(result) {
  const end = endFocus;
  endFocus = null;
  end?.(result);
}

const corner = (ctx) => {
  const b = petBounds(ctx);
  return { x: b.minX + EDGE, y: b.maxY }; // bottom-left, standing on the taskbar line
};

// The face while parked: calm, with the occasional wink or glistening eyes.
function parkedFace() {
  if (flourish && t < flourish.until) return flourish.face;
  flourish = null;
  if (t >= nextFlourishAt) {
    nextFlourishAt = t + rand(...FLOURISH_EVERY);
    const glisten = Math.random() < GLISTEN_CHANCE;
    flourish = { face: glisten ? 'glistening' : 'wink', until: t + (glisten ? GLISTEN_FOR : WINK_FOR) };
    return flourish.face;
  }
  return 'calm';
}

export default {
  name: 'focus',
  category: 'system',
  priority: 16, // above hush 15, games 10, sky 14, dance 2; below the shop window 20

  init(ctx) {
    ctx.events.onEntry((e) => {
      if (endFocus && WAKE_ON.includes(e.type)) finish('woken');
    });
  },

  start(ctx, end) {
    const { pet } = ctx;
    endFocus = end;
    t = 0;
    flourish = null;
    nextFlourishAt = rand(...FLOURISH_EVERY);
    if (pet.mood !== 'happy') requestMood(ctx, 'happy', 'focus time'); // happy and supportive
    ctx.say(LINES.okay(), QUIET_AFTER * 1000);
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'focus';
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    if (t >= QUIET_AFTER) pet.hushed = true;
    if (pet.mode === 'drag' || pet.mode === 'toss') return; // (grabbing ends focus anyway)
    if (pet.mode !== 'focus') pet.mode = 'focus';
    pet.rotation = 0;

    const c = corner(ctx);
    const dx = c.x - pet.x;
    const dy = c.y - pet.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      // Walking over (normal faces: talking while he says his line).
      const step = Math.min(d, WALK_SPEED * dt);
      pet.x += (dx / d) * step;
      pet.y += (dy / d) * step;
      pet.facing = dx < 0 ? -1 : 1;
      pet.bob = -Math.abs(Math.sin(t * 9)) * 3;
      pet.squash = approach(pet.squash, 1, dt, 10);
      pet.faceOverride = null;
      return;
    }
    // Parked: perfectly still, calm face (talking face still shows if he's mid-line).
    pet.x = c.x;
    pet.y = c.y;
    pet.bob = 0;
    pet.squash = approach(pet.squash, 1, dt, 10);
    pet.faceOverride = ctx.isSpeaking?.() ? null : parkedFace();
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endFocus = null;
    flourish = null;
    pet.hushed = false;
    pet.bob = 0;
    pet.faceOverride = null;
    if (pet.mode === 'focus') pet.mode = 'idle';
    // Came back to him: a happy hello. (A beat later, so speech.js's click answer doesn't cover it.)
    if (result === 'woken' || result === 'done') {
      ctx.after(0.15, () => ctx.say(LINES.back(), 2200), 'focus hello');
    }
  },
};
