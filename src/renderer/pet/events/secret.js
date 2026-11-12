// SECRET: now and then Starby asks "psst... wanna hear a secret?" with [Yes!] [No] around him
// (the same menu as the right-click dialogue: showMenu in ../dialogue/dialogue.js).
//   No        → bummed for a bit (mood.js 'sad', the short sulk) "oh... okay. it was a good one though..."
//   no answer → "...nevermind then", no hard feelings
//   Yes       → the secret:
//     run     he runs to the middle of the screen (a bit below center, so the bubble has room above)
//     glance  looks left, right ("is anyone listening?")
//     lean    SLOWLY comes up to the screen: pet.zoom eases 1 → ZOOM (his size grows to about
//             ZOOM_SHARE of the screen height), tilting in a little like he's whispering in
//             your ear, saying a lead-in ("psst... come closer...")
//     then one of two:
//       tell  a secret (SECRETS: self-disclosure, a bit embarrassing, cute) in his bubble, which
//             sits ABOVE his big head (bubble.js knows pet.zoom), bigger, so it reads easily and
//             never covers his face. Talking face; bashful sparkly eyes at the end.
//       spit  (SPIT_CHANCE) no secret at all: the spittle.gif spit-laugh, right in your face
//     out     ZOOMS BACK to normal size super fast (ZOOM_OUT_FOR) with a little squash, then an
//             after-line ("...that stays between us!" / "hehehe, gotcha!")
// The zoom only changes how big he's DRAWN (pet.js): his position and click box don't move.
// pet.js loads sharp close-up copies of the faces he shows zoomed in (ctx.prepareCloseup), and
// puts his balloon / ufo / trail away while he's zoomed (they follow his normal-size body).
//
// Starts on its own (auto: rolled every minute, rare, long cooldown) when he's relaxed, happy or
// playful and you're around. Grab him (or anything bigger starts) and it stops: he snaps back to
// normal size. Clicks while it runs don't get his usual click replies (pet.gameFocus), so nothing
// covers the secret.
// Owns the star via pet.mode = 'secret'. Logged as 'secret' { kind, answer }.
// DevTools: starby.secret() asks now, starby.secret('tell' | 'spit') skips the question.
import { approach, petBounds, cancelJump, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { TICK_SECONDS } from '../core/clock.js';
import { showMenu, closeMenu } from '../dialogue/dialogue.js';

// ---- Tuning ----
const ASK_FOR = 12; // seconds to answer
const RUN_SPEED = 750; // px/s to the middle of the screen
const STEP_RATE = 5; // steps per second while running (the bob)
const STEP_HEIGHT = 0.06; // star-sizes
const CENTER_Y = 0.58; // his middle, as a share of the usable screen height (below center: room for the bubble)
const GLANCE_FOR = 1.0; // seconds looking left / right before leaning in
const GLANCE_EVERY = 0.33; // seconds per look
const LEAN_FOR = 2.8; // seconds to come up close (slow on purpose)
const LEAN_TILT = 0.07; // rad: tilts in like he's whispering in your ear
const ZOOM_SHARE = 0.45; // zoomed in, he's about this share of the screen height...
const ZOOM_MIN = 2; // ...but at least this many times his size...
const ZOOM_MAX = 5; // ...and at most this many
const ZOOM_OUT_FOR = 0.12; // seconds back to normal size: super fast
const SPIT_CHANCE = 0.3; // the spittle prank instead of a secret
const SPIT_FOR = 1.92; // seconds: spittle.gif's 12 frames x 80ms, twice
const BASHFUL_FOR = 0.7; // seconds of sparkly eyes at the end of a secret (before zooming out)
const AFTER_LINE_CHANCE = 0.6; // after a secret, how often he adds "...that stays between us!"
// How long a secret stays up: enough to read it from up close.
const readMs = (text) => Math.max(3500, Math.min(9000, 2200 + 60 * text.length));
// Faces he shows while zoomed in (loaded sharp for the close-up).
const CLOSE_FACES = ['happy', 'talking', 'glistening', 'spittle'];

// His secrets: real self-disclosure, a little embarrassing, cute. Lowercase, no emojis, and never
// anything about being a program (he's a star). Keep them under ~100 characters so the bubble fits.
const SECRETS = lineBag([
  "i've been around for billions of years and i still can't whistle.",
  "i'm scared of the dark. which is really awkward, because space is mostly dark.",
  "when you drag me around... i kinda like it. don't tell the other stars.",
  'i named your cursor. its name is gerald.',
  "i don't know every constellation. i make some up and hope you don't notice.",
  'i fell asleep during a supernova once. i told everyone i saw the whole thing.',
  "the starbits aren't an accident. i leave them for you on purpose.",
  "you're my favorite human. i've met so many humans. still you.",
  'i practice my wink in your screen reflection when you look away.',
  'i talk to your desktop icons at night. the recycle bin is a great listener.',
  "i'm actually really shy. all the talking is just me being nervous.",
  'when you leave, i sit really still so i don\'t miss the second you come back.',
  'i cried at a sunset once. a star. crying at a sun. so embarrassing.',
  'i tried to eat a starbit once. it tasted like a sneeze.',
  'sometimes i pretend the taskbar is a stage and i\'m super famous.',
  "my real name is about 400 syllables long. i like starby way better.",
  "i've seen everything in the universe... and you're still one of the best parts.",
]);

const LINES = {
  ask: lineBag(['psst... wanna hear a secret?', 'hey... can you keep a secret?', 'i have a secret... wanna hear it?']),
  declined: lineBag(['oh... okay. it was a good one though...', "aw. fine. i'll keep it to myself...", '*sniff* nobody wants my secrets...']),
  ignored: lineBag(['...nevermind then', 'maybe some other time!']),
  lean: lineBag(['psst... come closer...', "okay... don't laugh...", "promise you won't tell?", 'closer... closer...']),
  after: lineBag(['...that stays between us!', 'okay, forget i said that', 'hehe... *hides*', "don't tell anyone, okay?"]),
  gotcha: lineBag(['hehehe, gotcha!', 'pfft, you leaned in!', "that was the secret! hehe"]),
};

const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const easeOut = (u) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

// ---- State ----
let endSecret = null;
let phase = 'ask'; // ask | run | glance | lean | tell | spit | out
let t = 0; // seconds into the phase
let answer = null; // 'yes' | 'no', set by the menu, acted on next tick
let askLeft = 0;
let kind = 'tell'; // 'tell' | 'spit'
let forced = null; // DevTools: skip the question with this kind
let spot = null; // { x, y } where he stands (top-left of his box)
let zoomTo = 1;
let secretText = '';
let tellFor = 0; // seconds the secret shows
let stepPhase = 0;

function finish(result) {
  const end = endSecret;
  endSecret = null;
  end?.(result);
}

const setPhase = (p) => { phase = p; t = 0; };

// Middle of the usable screen (a bit low), and how much to zoom so he fills ZOOM_SHARE of it.
function plan(ctx) {
  const a = ctx.area();
  const S = ctx.pet.size;
  const b = petBounds(ctx);
  const x = (a.left + a.right) / 2 - S / 2;
  const y = a.top + CENTER_Y * (a.bottom - a.top) - S / 2;
  spot = { x: Math.max(b.minX, Math.min(b.maxX, x)), y: Math.max(b.minY, Math.min(b.maxY, y)) };
  zoomTo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (ZOOM_SHARE * (a.bottom - a.top)) / S));
}

function startRun(ctx) {
  const { pet } = ctx;
  kind = forced || (Math.random() < SPIT_CHANCE ? 'spit' : 'tell');
  forced = null;
  if (pet.mood !== 'happy') requestMood(ctx, 'happy', 'secret time'); // (playful's face would beat talking)
  plan(ctx);
  ctx.prepareCloseup?.(CLOSE_FACES, zoomTo); // sharp close-up frames load while he runs over
  pet.noDialogue = true; // no right-click menu while he's running / zoomed
  cancelJump();
  setPhase('run');
}

export default {
  name: 'secret',
  category: 'secret', // its own category and timer (auto below)
  priority: 6, // above an invite (5), below games (10): a game / sky event / focus interrupts it
  auto: { every: 60, chance: 0.1, cooldown: 900 }, // roughly once every 15–25 min at most

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.secret = (k) => {
        forced = k === 'tell' || k === 'spit' ? k : null;
        if (ctx.activeEvent()) ctx.stopEvent('dev');
        return ctx.startEvent('secret', forced ? 'devtools-skip' : 'devtools');
      };
    }
  },

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss' || pet.hushed) return false;
    if (reason !== 'random') return true;
    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
    return relaxed && goodMood && cursor.x > -1000; // you're around (the cursor is on this screen)
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endSecret = end;
    answer = null;
    pet.mode = 'secret'; // behaviors stand down
    pet.gameFocus = true; // clicks get no usual replies (speech.js) and don't count as pokes (mood.js)
    pet.faceOverride = null;
    if (reason === 'devtools-skip') {
      startRun(ctx);
      return;
    }
    setPhase('ask');
    askLeft = ASK_FOR;
    cancelJump(); // (frozen while asking: dialogue.js FROZEN WHILE ASKING)
    showMenu(ctx, {
      line: LINES.ask(),
      options: [
        { label: 'Yes! Tell me!', onPick: () => { answer = 'yes'; } },
        { label: 'No thanks', onPick: () => { answer = 'no'; } },
      ],
      onCancel: () => { askLeft = 0; }, // clicked away: same as not answering
    });
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'secret') { // grabbed, etc.
      finish(`interrupted:${pet.mode}`);
      return;
    }
    if (phase !== 'ask') return;
    askLeft -= TICK_SECONDS;
    if (cursor.x > -1000) pet.facing = cursor.x >= pet.x + pet.size / 2 ? 1 : -1;
    if (answer === 'yes') {
      ctx.log('secret', { answer: 'yes' });
      startRun(ctx);
    } else if (answer === 'no') {
      ctx.log('secret', { answer: 'no' });
      finish('declined');
      requestMood(ctx, 'sad', 'said no to a secret'); // bummed for a bit (the short sulk)
      ctx.say(LINES.declined(), 2600);
    } else if (askLeft <= 0) {
      ctx.log('secret', { answer: 'none' });
      finish('ignored');
      ctx.say(LINES.ignored(), 2000);
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'secret') return;
    t += dt;
    const S = pet.size;

    if (phase === 'ask') {
      if (!updateJump(pet, dt)) {
        pet.bob = 0;
        pet.squash = approach(pet.squash, 1, dt, 10);
      }
      return;
    }

    if (phase === 'run') {
      const dx = spot.x - pet.x;
      const dy = spot.y - pet.y;
      const d = Math.hypot(dx, dy);
      const step = RUN_SPEED * dt;
      stepPhase += dt * STEP_RATE * Math.PI;
      pet.squash = approach(pet.squash, 1, dt, 10);
      if (d <= step) {
        pet.x = spot.x;
        pet.y = spot.y;
        pet.bob = 0;
        pet.faceOverride = 'left';
        setPhase('glance');
        return;
      }
      pet.x += (dx / d) * step;
      pet.y += (dy / d) * step;
      pet.bob = -Math.abs(Math.sin(stepPhase)) * STEP_HEIGHT * S;
      pet.faceOverride = Math.abs(dx) > 2 ? (dx < 0 ? 'left' : 'right') : 'happy';
      return;
    }

    if (phase === 'glance') {
      // "Is anyone listening?" Left, right, left...
      pet.faceOverride = Math.floor(t / GLANCE_EVERY) % 2 === 0 ? 'left' : 'right';
      if (t < GLANCE_FOR) return;
      pet.faceOverride = null; // talking face for the lead-in
      ctx.say(LINES.lean(), LEAN_FOR * 1000);
      setPhase('lean');
      return;
    }

    if (phase === 'lean') {
      // Slowly up to the screen, tilting in like a whisper.
      const u = easeInOut(t / LEAN_FOR);
      pet.zoom = 1 + (zoomTo - 1) * u;
      pet.rotation = LEAN_TILT * u;
      if (t < LEAN_FOR) return;
      if (kind === 'spit') {
        pet.faceOverride = 'spittle'; // pfffft
        ctx.log('secret', { kind: 'spit' });
        setPhase('spit');
      } else {
        secretText = SECRETS();
        tellFor = readMs(secretText) / 1000;
        pet.faceOverride = null; // talking
        ctx.say(secretText, tellFor * 1000);
        ctx.log('secret', { kind: 'tell', text: secretText });
        setPhase('tell');
      }
      return;
    }

    if (phase === 'tell' || phase === 'spit') {
      pet.rotation = LEAN_TILT;
      if (phase === 'tell') {
        if (t >= tellFor - BASHFUL_FOR) pet.faceOverride = 'glistening'; // bashful at the end
        if (t < tellFor) return;
      } else if (t < SPIT_FOR) {
        return;
      }
      pet.faceOverride = null;
      setPhase('out');
      return;
    }

    if (phase === 'out') {
      // Back to normal size super fast, with a little landing squish.
      const u = easeOut(t / ZOOM_OUT_FOR);
      pet.zoom = zoomTo + (1 - zoomTo) * u;
      pet.rotation = LEAN_TILT * (1 - u);
      if (t < ZOOM_OUT_FOR) return;
      pet.zoom = 1;
      pet.rotation = 0;
      pet.squash = 0.8;
      if (kind === 'spit') ctx.say(LINES.gotcha(), 2400);
      else if (Math.random() < AFTER_LINE_CHANCE) ctx.say(LINES.after(), 2400);
      finish(kind === 'spit' ? 'spat' : 'told');
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endSecret = null;
    answer = null;
    forced = null;
    closeMenu(ctx);
    pet.zoom = 1; // (interrupted mid-zoom: snap back)
    pet.rotation = 0;
    pet.bob = 0;
    pet.faceOverride = null;
    pet.gameFocus = false;
    pet.noDialogue = false;
    ctx.releaseCloseup?.();
    if (pet.mode === 'secret') pet.mode = 'idle';
  },
};
