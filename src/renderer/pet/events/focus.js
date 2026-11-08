// FOCUS: "Sorry, I gotta focus" in the right-click dialogue (../dialogue/tree.js).
// Starby is understanding: he says something nice, then SLINGSHOTS himself into the bottom-left
// corner of the usable screen (standing on the taskbar), slams in with the wall-impact effects,
// and stays there, quiet, until you come back to him.
//
//   talk    TALK_FOR seconds: "okay! i'll be right here!" (standing, talking face)
//   aim     AIM_FOR seconds: he pulls back away from the corner, squashing like a slingshot
//   fly     an arc into the corner (FLY_SPEED, ARC_HEIGHT), spinning; excited 'playful' face
//   land    'slam' logged for the left wall and the floor → behaviors/fx.js plays the crash
//           lines, dust and star clouds; a landing squash. (Not 'impact': a thrown wall hit
//           makes starbits.js drop starbits, and focus is meant to be quiet.)
//   parked  NOT DISTRACTING is the whole point:
//           - he stays happy (mood.js skips the "user away" yawn in focus mode)
//           - no movement at all: no bob, no breathing, no rotation
//           - the 'calm' face (frames.js: idle-1 only, arms down), with a quiet flourish now and
//             then (FLOURISH_EVERY): a wink, or sparkly glistening eyes (both keep his arms down)
//           - pet.hushed = true (QUIET_AFTER_LANDING), so he says nothing at all
//           - starbit drops, game invites, sky events and dancing are paused: this event outranks
//             them (priority 16), and starbits.js skips drops in 'focus' mode
// Already in the corner? He skips the slingshot and just settles.
//
// Ends when you click him or pick him up (he says hi), or you pick "Okay, I'm done focusing!" in
// the dialogue. The shop window (priority 20) also ends it.
// You can still right-click him while he focuses: the dialogue opens and he stays parked.
// Above hush (15): if a call starts while focusing he's already quiet and parked.
// Owns the star via pet.mode = 'focus'; sets pet.faceOverride (mood.js honours it).
// DevTools: starby.startEvent('focus').
import { approach, petBounds, rand } from '../behaviors/motion.js';
import { requestMood } from '../behaviors/mood.js';
import { lineBag } from '../behaviors/chatter.js';

// ---- Tuning ----
const TALK_FOR = 1.6; // seconds of his line before the slingshot
const AIM_FOR = 0.4; // seconds pulling back
const PULL_BACK = 0.35; // star-sizes he pulls back away from the corner
const FLY_SPEED = 1700; // px/s average across the flight...
const FLY_TIME = [0.45, 0.85]; // ...but never quicker / slower than this (seconds)
const ARC_HEIGHT = 0.22; // arc peak, as a share of the flight distance (at most ARC_MAX px)
const ARC_MAX = 220;
const SPIN_TURNS = 1.5; // full turns while flying
const IMPACT_SPEED = { left: 1700, bottom: 1300 }; // how hard fx.js shows the corner hit
const QUIET_AFTER_LANDING = 0.6; // seconds after landing before he goes fully silent
const SKIP_IF_WITHIN = 0.5; // star-sizes: already this close to the corner → no slingshot
const EDGE = 8; // px in from the left edge
const FLOURISH_EVERY = [12, 30]; // seconds between a wink / glistening moment while parked
const GLISTEN_CHANCE = 0.5; // otherwise a wink
const GLISTEN_FOR = 2.4; // seconds of sparkly eyes (frames.js 'glistening')
const WINK_FOR = 0.7; // seconds
// Things you do to him that end focus (event log types).
const WAKE_ON = ['click', 'grab'];

const LINES = {
  okay: lineBag(["okay! i'll be right here!", 'you got this! i believe in you!', "okay, i'll be quiet. good luck!", 'go get it! i\'ll wait over here!']),
  back: lineBag(["yay, you're back!", 'all done? hi hi!', 'break time? yay!']),
};

let endFocus = null;
let phase = 'talk'; // talk | aim | fly | parked
let t = 0; // seconds into the current phase
let parkedFor = 0; // seconds since he landed
let from = null; // { x, y } where the flight starts (after pulling back)
let target = null; // { x, y } the corner
let flyFor = 0;
let arc = 0;
let nextFlourishAt = 0; // parkedFor of the next wink/glisten
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

const setPhase = (p) => { phase = p; t = 0; };

// The face while parked: calm, with the occasional wink or glistening eyes.
function parkedFace() {
  if (flourish && parkedFor < flourish.until) return flourish.face;
  flourish = null;
  if (parkedFor >= nextFlourishAt) {
    nextFlourishAt = parkedFor + rand(...FLOURISH_EVERY);
    const glisten = Math.random() < GLISTEN_CHANCE;
    flourish = { face: glisten ? 'glistening' : 'wink', until: parkedFor + (glisten ? GLISTEN_FOR : WINK_FOR) };
    return flourish.face;
  }
  return 'calm';
}

function land(ctx, hit) {
  const { pet } = ctx;
  pet.x = target.x;
  pet.y = target.y;
  pet.rotation = 0;
  pet.bob = 0;
  if (hit) {
    pet.squash = 0.65; // landing squish (eases back in 'parked')
    ctx.log('slam', { side: 'left', speed: IMPACT_SPEED.left });
    ctx.log('slam', { side: 'bottom', speed: IMPACT_SPEED.bottom });
  }
  parkedFor = 0;
  flourish = null;
  nextFlourishAt = rand(...FLOURISH_EVERY);
  setPhase('parked');
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
    setPhase('talk');
    if (pet.mood !== 'happy') requestMood(ctx, 'happy', 'focus time'); // happy and supportive
    ctx.say(LINES.okay(), TALK_FOR * 1000 + 300);
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'focus';
    pet.faceOverride = null;
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    if (pet.mode === 'drag' || pet.mode === 'toss') return; // (grabbing ends focus anyway)
    if (pet.mode !== 'focus') pet.mode = 'focus';
    const S = pet.size;

    if (phase === 'talk') {
      pet.rotation = 0;
      pet.bob = 0;
      pet.squash = approach(pet.squash, 1, dt, 10);
      if (t < TALK_FOR) return;
      target = corner(ctx);
      const d = Math.hypot(target.x - pet.x, target.y - pet.y);
      if (d < SKIP_IF_WITHIN * S) { land(ctx, false); return; }
      // Pull back: away from the corner.
      from = {
        x: pet.x - ((target.x - pet.x) / d) * PULL_BACK * S,
        y: pet.y - ((target.y - pet.y) / d) * PULL_BACK * S,
      };
      setPhase('aim');
      return;
    }

    if (phase === 'aim') {
      pet.faceOverride = 'playful';
      // Ease back to the pull-back point, squashing down like a loaded slingshot.
      pet.x = approach(pet.x, from.x, dt, 14);
      pet.y = approach(pet.y, from.y, dt, 14);
      pet.squash = approach(pet.squash, 0.78, dt, 14);
      pet.rotation = approach(pet.rotation, (target.x < pet.x ? 1 : -1) * 0.25, dt, 10); // lean back
      if (t < AIM_FOR) return;
      from = { x: pet.x, y: pet.y };
      const d = Math.hypot(target.x - from.x, target.y - from.y);
      flyFor = Math.max(FLY_TIME[0], Math.min(FLY_TIME[1], d / FLY_SPEED));
      arc = Math.min(ARC_MAX, d * ARC_HEIGHT);
      setPhase('fly');
      return;
    }

    if (phase === 'fly') {
      const u = Math.min(1, t / flyFor);
      pet.x = from.x + (target.x - from.x) * u;
      pet.y = from.y + (target.y - from.y) * u - arc * 4 * u * (1 - u); // up, then down into the corner
      pet.rotation = (target.x < from.x ? -1 : 1) * SPIN_TURNS * Math.PI * 2 * (1 - (1 - u) ** 2);
      pet.squash = approach(pet.squash, 1.12, dt, 16); // stretched in flight
      pet.bob = 0;
      if (u >= 1) land(ctx, true);
      return;
    }

    // Parked: perfectly still, calm face (talking face if he's mid-line).
    parkedFor += dt;
    if (parkedFor >= QUIET_AFTER_LANDING) pet.hushed = true;
    pet.x = target.x;
    pet.y = target.y;
    pet.rotation = 0;
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
    pet.rotation = 0;
    pet.faceOverride = null;
    if (pet.mode === 'focus') pet.mode = 'idle';
    // Came back to him: a happy hello. (A beat later, so speech.js's click answer doesn't cover it.)
    if (result === 'woken' || result === 'done') {
      ctx.after(0.15, () => ctx.say(LINES.back(), 2200), 'focus hello');
    }
  },
};
