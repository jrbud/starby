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
//           - he starts happy (mood.js skips the "user away" yawn in focus mode)
//           - mostly still, on the 'calm' face (frames.js: idle-1 only, arms down). Every
//             IDLE_EVERY seconds a short idle animation (IDLE_ANIMS): arms up and down, looking
//             left and right, bopping on the spot, sparkly eyes, or a wink
//           - his MOOD still shows: mad, sad, playful... (MOOD_FACES) use mood.js's face for it,
//             and the idle animations wait until he's happy again
//           - pet.hushed = true (QUIET_AFTER_LANDING), so he says nothing at all, except a
//             clicked study line or chatter after "Talk to me" (see the focus menu below)
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
// FOCUS MENU: right-clicking him while focusing opens his own menu (../dialogue/tree.js 'focus'):
//   Stretch your legs / Stay still   wandering on/off: he strolls to random spots along the bottom
//                                    of the screen (WANDER_*), pausing between walks; dragging works
//                                    the same. "Stay still" stops him right where he is.
//   Start a timer / Let's set goals! not built yet (TODO in tree.js)
//   Talk to me / Quiet please        idle chatter on/off (speech.js chats while pet.focusTalk)
//   Okay, I'm done focusing!         ends focus
// Both toggles start off every time focus starts.
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
// Parked idle animations: after IDLE_EVERY seconds of standing calm, one of these plays, then calm
// again. weight = how often it's picked; for = seconds.
const IDLE_EVERY = [5, 12];
const IDLE_ANIMS = [
  { kind: 'arms', weight: 3, for: 2.4 }, // arms up and down (frames.js 'happy': idle-1 ↔ idle-2)
  { kind: 'look', weight: 3, for: 2.4 }, // looks left, right, left, right ('left' / 'right')
  { kind: 'bop', weight: 3, for: 2.4 }, // bops up and down on the spot
  { kind: 'glisten', weight: 1, for: 2.4 }, // sparkly eyes (frames.js 'glistening')
  { kind: 'wink', weight: 1, for: 0.7 },
];
const LOOK_EVERY = 0.6; // seconds per glance while looking around
const BOP_HEIGHT = 0.05; // star-sizes
const BOP_RATE = 2.5; // bops per second
// Moods whose face beats the focus face (mood.js's own face for them: mad, sad, ...). He stops his
// idle animations while he's feeling one of these.
const MOOD_FACES = ['mad', 'sad', 'playful', 'dizzy', 'yawning', 'sleepy'];
// "Stretch your legs": he walks to a random spot along the bottom, pauses, walks again.
const WANDER_SPEED = 70; // px/s (an unhurried stroll)
const WANDER_PAUSE = [3, 15]; // seconds standing still between walks (idle animations play then)
const WANDER_MIN = 0.75; // star-sizes: shortest walk
const STEP_RATE = 2; // steps per second (the bob while walking)
const STEP_HEIGHT = 0.035; // star-sizes
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
  study: lineBag(['stay focused!', 'keep  up to good work!', 'you shine bright!', 'wow so focused :o', 'me when i\'m focused', 'you\'re doing great :3', 'ok studious!', '*hums*', 'la la laa~', 'i like seeing your progress :)', 'maybe i\'ll work too... jk']),
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
let unhushUntil = 0; // clock seconds: a clicked study line is showing, keep the hush off
let wandering = false; // "Stretch your legs": walking along the bottom of the screen
let wanderTo = null; // x he's walking to, or null while pausing
let wanderPauseUntil = 0; // parkedFor when the next walk starts
let walkPhase = 0; // for the step bob
let talkative = false; // "Talk to me": idle chatter allowed
let idleAnim = null; // { kind, start, until } (parkedFor seconds) while an idle animation plays
let nextIdleAt = 0; // parkedFor of the next idle animation

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

// Feeling something (mad, sad...): mood.js's face for it should show, not the focus face.
const feelingIt = (pet) => MOOD_FACES.includes(pet.mood);

function pickIdleAnim() {
  let r = Math.random() * IDLE_ANIMS.reduce((sum, a) => sum + a.weight, 0);
  for (const a of IDLE_ANIMS) {
    r -= a.weight;
    if (r < 0) return a;
  }
  return IDLE_ANIMS[0];
}

/**
 * While parked: calm, and every IDLE_EVERY seconds an idle animation (arms, look around, bop,
 * glisten, wink). → { face, bob } (bob in px, negative = up).
 */
function parkedIdle(S) {
  if (idleAnim && parkedFor >= idleAnim.until) idleAnim = null;
  if (!idleAnim && parkedFor >= nextIdleAt) {
    const a = pickIdleAnim();
    idleAnim = { kind: a.kind, start: parkedFor, until: parkedFor + a.for };
    nextIdleAt = idleAnim.until + rand(...IDLE_EVERY);
  }
  if (!idleAnim) return { face: 'calm', bob: 0 };
  const u = parkedFor - idleAnim.start; // seconds into it
  switch (idleAnim.kind) {
    case 'arms': return { face: 'happy', bob: 0 };
    case 'look': return { face: Math.floor(u / LOOK_EVERY) % 2 === 0 ? 'left' : 'right', bob: 0 };
    case 'bop': return { face: 'calm', bob: -Math.abs(Math.sin(Math.PI * BOP_RATE * u)) * BOP_HEIGHT * S };
    case 'glisten': return { face: 'glistening', bob: 0 };
    case 'wink': return { face: 'wink', bob: 0 };
    default: return { face: 'calm', bob: 0 };
  }
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
// The hush has to stay OFF for as long as the line shows: pet.js hides the bubble on every frame
// while pet.hushed is on, so just un-hushing around ctx.say() made it vanish a frame later.
function onClick(ctx) {
  if (!endFocus) return;
  unhushUntil = ctx.clock.seconds + STUDY_LINE_DELAY + STUDY_LINE_MS / 1000;
  ctx.after(STUDY_LINE_DELAY, () => {
    if (!endFocus) return;
    ctx.pet.hushed = false; // (the parked step keeps it off until unhushUntil)
    ctx.say(LINES.study(), STUDY_LINE_MS);
  }, 'focus study line');
}

// "Stretch your legs" / "Stay still" (the focus menu in ../dialogue/tree.js).
function setWander(ctx, on) {
  const { pet } = ctx;
  wandering = on;
  pet.focusWander = on; // tree.js reads this to pick the menu label
  wanderTo = null;
  wanderPauseUntil = parkedFor + 0.4; // set off almost right away
  if (!on && target) target = { x: pet.x, y: target.y }; // stay right where he is
}

// "Talk to me" / "Quiet please": idle chatter on or off (speech.js chats in focus mode while
// pet.focusTalk is on), and no hush.
function setTalk(ctx, on) {
  talkative = on;
  ctx.pet.focusTalk = on;
  if (on) ctx.pet.hushed = false;
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
  idleAnim = null;
  nextIdleAt = rand(...IDLE_EVERY);
  wanderTo = null; // wandering (if on) picks up again from here after a short breather
  wanderPauseUntil = 1.2;
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
    // The focus menu (../dialogue/tree.js) calls these through its 'starby:<fn>:<arg>' actions.
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.focusWander = (arg) => { if (endFocus) setWander(ctx, arg !== 'off'); };
      window.starby.focusTalk = (arg) => { if (endFocus) setTalk(ctx, arg !== 'off'); };
    }
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
    // Every focus starts parked in one spot and quiet (the focus menu turns these on).
    wandering = false;
    talkative = false;
    pet.focusWander = false;
    pet.focusTalk = false;
    unhushUntil = 0;
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
    // Just let go: our own throw (gravity, no glide). startDrop() reads `held` (the speed he was
    // let go with), so only clear it AFTER this check.
    if (pet.mode === 'toss') { startDrop(ctx); return; }
    held = null;
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

    // Parked: calm face with idle animations (talking face if he's mid-line); strolling along the
    // bottom if "Stretch your legs" is on.
    parkedFor += dt;
    // Quiet, unless "Talk to me" is on or a clicked study line is showing (see onClick()).
    pet.hushed = parkedFor >= QUIET_AFTER_LANDING && !talkative && ctx.clock.seconds >= unhushUntil;
    if (pet.dialogueHold) {
      // The right-click dialogue moved him out of the corner to fit its boxes; it owns where he is.
      pet.rotation = 0;
      pet.bob = 0;
      pet.squash = approach(pet.squash, 1, dt, 10);
      pet.faceOverride = null;
      return;
    }
    // "Stretch your legs": move his spot (target) along the bottom, a step at a time.
    let walkDir = 0;
    if (wandering) {
      const b = petBounds(ctx);
      target.y = b.maxY;
      if (wanderTo == null && parkedFor >= wanderPauseUntil) {
        const lo = b.minX + EDGE;
        const hi = Math.max(lo, b.maxX - EDGE);
        let x = rand(lo, hi);
        // Too short a walk looks like a twitch: go at least WANDER_MIN, the other way if needed.
        if (Math.abs(x - target.x) < WANDER_MIN * S) x = target.x + (x < target.x ? 1 : -1) * WANDER_MIN * S;
        wanderTo = Math.max(lo, Math.min(hi, x));
        idleAnim = null; // (a walk interrupts an idle animation)
      }
      if (wanderTo != null) {
        const dx = wanderTo - target.x;
        const step = WANDER_SPEED * dt;
        if (Math.abs(dx) <= step) {
          target.x = wanderTo;
          wanderTo = null;
          wanderPauseUntil = parkedFor + rand(...WANDER_PAUSE);
          nextIdleAt = Math.max(nextIdleAt, parkedFor + 1); // a beat before any idle animation
        } else {
          target.x += Math.sign(dx) * step;
          walkDir = Math.sign(dx);
        }
      }
    }
    // Back to (and staying on) his spot: a quick glide if the dialogue had moved him.
    pet.x = approach(pet.x, target.x, dt, 9);
    pet.y = approach(pet.y, target.y, dt, 9);
    tilt = approach(tilt, 0, dt, 10); // (a thrown landing can leave him tilted)
    pet.rotation = tilt;
    pet.squash = approach(pet.squash, 1, dt, 10);
    if (walkDir) {
      // Walking: little steps, facing the way he's going (his mood's face if he's feeling one).
      walkPhase += dt * STEP_RATE * Math.PI;
      pet.bob = -Math.abs(Math.sin(walkPhase)) * STEP_HEIGHT * S;
      pet.faceOverride = feelingIt(pet) || ctx.isSpeaking?.() ? null : walkDir < 0 ? 'left' : 'right';
      return;
    }
    if (feelingIt(pet)) {
      // Mad, sad, playful...: let mood.js show that face (faceOverride beats mood faces there),
      // and hold still instead of doing idle animations.
      pet.faceOverride = null;
      pet.bob = approach(pet.bob, 0, dt, 12);
      return;
    }
    const idle = parkedIdle(pet.size);
    pet.bob = idle.bob;
    pet.faceOverride = ctx.isSpeaking?.() ? null : idle.face; // (talking face while he's mid-line)
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endFocus = null;
    idleAnim = null;
    wandering = false;
    talkative = false;
    pet.focusWander = false;
    pet.focusTalk = false;
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
