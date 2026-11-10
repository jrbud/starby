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
// PICKING HIM UP doesn't end focus. Let go and he keeps the momentum you gave him (drop phase):
// he arcs down under gravity, bouncing off the screen edges, then slides to a stop on the taskbar
// line and parks THERE (not back in the corner) until focus ends. Let go while still, and he just
// falls straight down. (Not drag.js's toss: that glides with no gravity and ends wherever it stops.)
// LEFT-CLICKING him doesn't end it either: he says a study line (LINES.study, see the TODO there),
// even while hushed.
//
// Ends when you pick "Okay, I'm done focusing!" in the dialogue (he says hi), or a call /
// fullscreen focus ends. The shop window (priority 20) also ends it.
//
// CALLS + FULLSCREEN also put him in focus mode (they used to use ./hush.js):
//   call starts (src/main/systemReads/calls.js)   "i'll be quiet for now!" then the usual slingshot
//   fullscreen app/video (activeWindow.js)        a quick, silent flip into focus (no line, no wait)
//   ...and the moment the call / fullscreen ends he leaves focus and walks back to where he was.
// Clicking or grabbing him doesn't end it (same as above). A focus YOU chose (the dialogue)
// isn't ended by a call or fullscreen ending.
// No dialogue until he's landed (pet.noDialogue): right-clicking him mid-slingshot would open the
// boxes and then he'd fly off and scramble them.
// You can still right-click him while he focuses: the dialogue flies him out of the corner so its
// boxes fit (pet.dialogueHold: we let go of him meanwhile), and he flies back when it closes.
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
const EDGE = 90; // px in from the left edge: room for his speech bubbles (they'd get pushed sideways at the very edge)
const FLOURISH_EVERY = [12, 30]; // seconds between a wink / glistening moment while parked
const GLISTEN_CHANCE = 0.5; // otherwise a wink
const GLISTEN_FOR = 2.4; // seconds of sparkly eyes (frames.js 'glistening')
const WINK_FOR = 0.7; // seconds
// Dropped after being picked up: falls straight down, speeding up.
// Let go while focusing: he keeps the momentum your hand gave him and arcs down under gravity,
// bouncing off the screen edges, then slides to a stop on the taskbar line.
const DROP_GRAVITY = 4200; // px/s²
const DROP_MAX_SPEED = 2600; // px/s, falling
const THROW_MAX_SPEED = 3000; // px/s, cap on the release speed
const AIR_DRAG = 0.6; // per second: horizontal speed lost in the air
const WALL_BOUNCE = 0.45; // share of speed kept off a side wall / the ceiling
const FLOOR_BOUNCE = 0.3; // share of the falling speed kept bouncing off the floor
const FLOOR_FRICTION = 6; // per second: sliding along the floor slows down this fast
const SETTLE_SPEED = 60; // px/s: slower than this on the floor = he's landed
const SPIN_DRAG = 1.2; // per second: spin dies down in the air
const MAX_SPIN = 18; // rad/s, cap on the release spin
const DROP_SLAM_MIN = 700; // px/s: hitting an edge at least this fast plays fx.js's crash
const STUDY_LINE_DELAY = 0.15; // seconds after a click (after speech.js's own click answer)
const STUDY_LINE_MS = 2600;

const CALL_TALK_FOR = 1.4; // seconds of his "i'll be quiet" line before a call slingshot
const RETURN_SPEED = 420; // px/s walking back after a call / fullscreen

const LINES = {
  call: lineBag(["i'll be quiet for now!", "shh, call time! i'll be quiet", "ooh, a call! i'll go sit over here"]),
  callOver: lineBag(['call over? hi again!', "all done talking? i'm back!"]),
  okay: lineBag(["okay! i'll be right here!", 'you got this! i believe in you!', "okay, i'll be quiet. good luck!", 'go get it! i\'ll wait over here!']),
  back: lineBag(["yay, you're back!", 'all done? hi hi!', 'break time? yay!']),
  // Said when you left-click him while he's focusing (see onClick()).
  // TODO(team): write the study dialogue here, replacing the placeholder. Things to keep in mind:
  //   - Keep lines short (about 2–8 words) and lowercase, like his other lines: the bubble is
  //     small and he must stay NOT DISTRACTING. Long lines also need a bigger STUDY_LINE_MS.
  //   - Supportive, never nagging or guilt-tripping ("you got this!", not "stop clicking me").
  //   - lineBag() won't repeat a line until the rest have been said, so more lines = less repetition.
  //   - The same lines also show for CALL / FULLSCREEN focus (reason 'call' | 'fullscreen'), where
  //     "study" talk may not fit. If you want different lines there, check `reason` in onClick().
  //   - Clicks still count as pokes in mood.js: several fast clicks can make him mad (then he swats
  //     instead of being picked up, and his click lines turn mad). Decide if that's OK in focus.
  //   - A click line from speech.js may flash first (only before he's fully hushed, right after
  //     landing); this one replaces it STUDY_LINE_DELAY later.
  //   - Text only; no emoji that the bubble font can't show, and no new art (CLAUDE.md art rule).
  study: lineBag(['study dialogue here']),
};

let endFocus = null;
let reason = null; // 'dialogue' | 'call' | 'fullscreen' | 'devtools'...
let inCall = false;
let fullscreen = false;
let returnTo = null; // { x, y } where he was before a call / fullscreen focus
let talkFor = TALK_FOR;
let phase = 'talk'; // talk | aim | fly | drop | parked
let dropVel = { x: 0, y: 0 }; // px/s while dropping
let spin = 0; // rad/s while dropping
// His angle while dropping / settling, kept HERE: behaviors update before events each frame, and
// drag.js sets pet.rotation back to 0 whenever he isn't held or tossed, so pet.rotation can't
// carry the angle from one frame to the next. We set pet.rotation = tilt every frame instead.
let tilt = 0;
// While he's held, his motion is measured here (drag.js keeps its own throw speed private), so a
// let-go knows how fast and which way he was going, and how fast he was spinning.
let held = null; // { x, y, rotation, vx, vy, omega } last frame
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

// Let go of him (after a drag, or a swat): drop straight down from where he is.
function startDrop(ctx) {
  const { pet } = ctx;
  pet.mode = 'focus'; // take him back from drag.js's toss: no sideways throw
  pet.noDialogue = true; // until he lands
  pet.faceOverride = null;
  // Keep the momentum he was let go with (capped).
  let vx = held?.vx || 0;
  let vy = held?.vy || 0;
  const speed = Math.hypot(vx, vy);
  if (speed > THROW_MAX_SPEED) {
    vx *= THROW_MAX_SPEED / speed;
    vy *= THROW_MAX_SPEED / speed;
  }
  dropVel = { x: vx, y: vy };
  spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, held?.omega || 0));
  tilt = pet.rotation; // the angle he was let go at
  held = null;
  setPhase('drop');
}

// Measure his motion while drag.js holds him (smoothed, like drag.js's own throw speed).
function trackHeld(pet, dt) {
  if (!held || dt <= 0) {
    held = { x: pet.x, y: pet.y, rotation: pet.rotation, vx: 0, vy: 0, omega: 0 };
    return;
  }
  const k = Math.min(1, dt * 20);
  held.vx += ((pet.x - held.x) / dt - held.vx) * k;
  held.vy += ((pet.y - held.y) / dt - held.vy) * k;
  held.omega += ((pet.rotation - held.rotation) / dt - held.omega) * k;
  held.x = pet.x;
  held.y = pet.y;
  held.rotation = pet.rotation;
}

// Turn angle into -π..π, so easing him upright takes the short way round.
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A left-click while focusing: a study line, even though he's hushed while parked.
function onClick(ctx) {
  if (!endFocus) return;
  ctx.after(STUDY_LINE_DELAY, () => {
    if (!endFocus) return;
    const { pet } = ctx;
    const wasHushed = pet.hushed;
    pet.hushed = false; // ctx.say shows nothing while hushed
    ctx.say(LINES.study(), STUDY_LINE_MS);
    pet.hushed = wasHushed;
  }, 'focus study line');
}

function land(ctx, hit) {
  const { pet } = ctx;
  pet.x = target.x;
  pet.y = target.y;
  pet.rotation = 0;
  tilt = 0;
  pet.bob = 0;
  if (hit) {
    pet.squash = 0.65; // landing squish (eases back in 'parked')
    ctx.log('slam', { side: 'left', speed: IMPACT_SPEED.left });
    ctx.log('slam', { side: 'bottom', speed: IMPACT_SPEED.bottom });
  }
  pet.noDialogue = false; // landed: right-click works again
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
      if (e.type === 'system' && e.data.type === 'call') inCall = Boolean(e.data.active);
      if (e.type === 'system' && e.data.type === 'fullscreen') fullscreen = Boolean(e.data.active);
    });
    ctx.petEl.addEventListener('pet:clicked', () => onClick(ctx));
  },

  // Every tick: a call / fullscreen starts focus mode (if it isn't on already).
  watch(ctx) {
    if (!(inCall || fullscreen) || ctx.activeEvent() === 'focus') return;
    if (ctx.pet.mode === 'drag' || ctx.pet.mode === 'toss' || ctx.pet.mode === 'goodbye') return;
    ctx.startEvent('focus', inCall ? 'call' : 'fullscreen');
  },

  start(ctx, end, why) {
    const { pet } = ctx;
    endFocus = end;
    reason = why;
    returnTo = why === 'call' || why === 'fullscreen' ? { x: pet.x, y: pet.y } : null;
    setPhase('talk');
    if (pet.mood !== 'happy') requestMood(ctx, 'happy', 'focus time'); // happy and supportive
    if (why === 'fullscreen') {
      talkFor = 0; // fullscreen: flip into focus right away, silently
    } else if (why === 'call') {
      talkFor = CALL_TALK_FOR;
      ctx.say(LINES.call(), CALL_TALK_FOR * 1000 + 300);
    } else {
      talkFor = TALK_FOR;
      ctx.say(LINES.okay(), TALK_FOR * 1000 + 300);
    }
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'focus';
    pet.faceOverride = null;
    pet.noDialogue = true; // until he lands (see land())
  },

  // A call / fullscreen focus ends the moment that call / fullscreen does.
  onTick() {
    if ((reason === 'call' || reason === 'fullscreen') && !inCall && !fullscreen) finish('over');
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    if (pet.mode === 'drag') { trackHeld(pet, dt); return; } // held: drag.js moves him
    held = null;
    if (pet.mode === 'toss') { startDrop(ctx); return; } // just let go: our own throw (gravity, no glide)
    if (pet.mode !== 'focus') pet.mode = 'focus';
    const S = pet.size;

    if (phase === 'drop') {
      const b = petBounds(ctx);
      // Ballistic: gravity pulls down, the air slows him sideways a little.
      dropVel.y = Math.min(DROP_MAX_SPEED, dropVel.y + DROP_GRAVITY * dt);
      dropVel.x *= Math.exp(-AIR_DRAG * dt);
      pet.x += dropVel.x * dt;
      pet.y += dropVel.y * dt;
      // Bounce off the side walls and the top. Loud hits use fx.js's crash ('slam', not 'impact':
      // 'impact' would make starbits.js drop starbits, and focus is meant to be quiet).
      const bump = (side, into) => {
        if (into >= DROP_SLAM_MIN) ctx.log('slam', { side, speed: Math.round(into) });
        spin = -spin * 0.6 + (Math.random() - 0.5) * 2;
      };
      if (pet.x < b.minX || pet.x > b.maxX) {
        const side = pet.x < b.minX ? 'left' : 'right';
        pet.x = Math.max(b.minX, Math.min(b.maxX, pet.x));
        bump(side, Math.abs(dropVel.x));
        dropVel.x = -dropVel.x * WALL_BOUNCE;
      }
      if (pet.y < b.minY) {
        pet.y = b.minY;
        bump('top', Math.abs(dropVel.y));
        dropVel.y = Math.abs(dropVel.y) * WALL_BOUNCE;
      }
      // Floor (the taskbar line): bounce a little, then slide to a stop.
      let onFloor = false;
      if (pet.y >= b.maxY) {
        pet.y = b.maxY;
        onFloor = true;
        if (dropVel.y > 0) {
          if (dropVel.y >= DROP_SLAM_MIN) { ctx.log('slam', { side: 'bottom', speed: Math.round(dropVel.y) }); pet.squash = 0.75; }
          dropVel.y = dropVel.y * FLOOR_BOUNCE > SETTLE_SPEED * 2 ? -dropVel.y * FLOOR_BOUNCE : 0;
        }
        dropVel.x *= Math.exp(-FLOOR_FRICTION * dt);
      }
      // Spin: dies down in the air; on the floor he rocks back upright.
      if (onFloor && dropVel.y === 0) {
        spin = 0;
        tilt = approach(wrapAngle(tilt), 0, dt, 10);
      } else {
        spin *= Math.exp(-SPIN_DRAG * dt);
        tilt += spin * dt;
      }
      pet.rotation = tilt;
      pet.squash = approach(pet.squash, onFloor ? 1 : 1.06, dt, 10);
      pet.bob = 0;
      if (onFloor && dropVel.y === 0 && Math.abs(dropVel.x) < SETTLE_SPEED) {
        target = { x: pet.x, y: b.maxY }; // he rests HERE now, not back in the corner
        const rot = wrapAngle(tilt);
        const squash = pet.squash;
        land(ctx, false);
        tilt = rot; // parked eases the rest of the way upright
        pet.rotation = rot;
        pet.squash = squash;
      }
      return;
    }

    if (phase === 'talk') {
      pet.rotation = 0;
      pet.bob = 0;
      pet.squash = approach(pet.squash, 1, dt, 10);
      if (t < talkFor) return;
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
    if (pet.dialogueHold) {
      // The right-click dialogue moved him out of the corner to fit its boxes; it owns where he is.
      pet.rotation = 0;
      pet.bob = 0;
      pet.squash = approach(pet.squash, 1, dt, 10);
      pet.faceOverride = null;
      return;
    }
    // Back to (and staying in) the corner: a quick glide if the dialogue had moved him.
    pet.x = approach(pet.x, target.x, dt, 9);
    pet.y = approach(pet.y, target.y, dt, 9);
    tilt = approach(tilt, 0, dt, 10); // (a thrown landing can leave him tilted)
    pet.rotation = tilt;
    pet.bob = 0;
    pet.squash = approach(pet.squash, 1, dt, 10);
    pet.faceOverride = ctx.isSpeaking?.() ? null : parkedFace();
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endFocus = null;
    flourish = null;
    pet.hushed = false;
    pet.dialogueHold = false;
    pet.noDialogue = false;
    pet.bob = 0;
    pet.rotation = 0;
    pet.faceOverride = null;
    if (pet.mode === 'focus') pet.mode = 'idle';
    // Came back to him: a happy hello. (A beat later, so speech.js's click answer doesn't cover it.)
    if (result === 'done') {
      ctx.after(0.15, () => ctx.say(LINES.back(), 2200), 'focus hello');
    }
    // A call / fullscreen ended: straight out of focus, and he walks back to where he was.
    if (result === 'over' && returnTo && pet.mode === 'idle') {
      if (reason === 'call') ctx.after(0.15, () => ctx.say(LINES.callOver(), 2200), 'focus call over');
      Object.assign(pet, { targetX: returnTo.x, targetY: returnTo.y, walkSpeed: RETURN_SPEED, walkKind: 'wander', mode: 'walk' });
    }
    returnTo = null;
    reason = null;
  },
};
