// A FRIEND COMES TO VISIT — another Starby, in a different colour with a different accessory, hops in.
//
//   arrive   Starby stops and turns to look. The friend hops in from a screen edge, saying something
//            as they come on screen ("hiii! i made it!"), right up to Starby, and they HOLD HANDS:
//            the friend's hand is locked onto Starby's (accessories.js hand anchors, every frame), so
//            they're joined at the hand. While holding, NEITHER raises a hand on their own: both
//            show arms-down faces (no talking frames: those wave a hand), and the only time hands go
//            up is TOGETHER ('armsUp', both at once: a little "yay!" when they meet, and on "Yes").
//   ask      once the friend's line is gone (no overlap), Starby: "my friend came to visit! wanna
//            meet them?" with Yes / No (an event menu, like his game invites; ../dialogue/dialogue.js
//            showMenu: he freezes, centered between the answers). ASK_FOR seconds to answer.
//   yes      both raise their arms together, and Starby: "this is my ROLE, NAME, from PLACE, and they're
//            a JOB!" (random picks from the lists below). Then they let go. The friend hangs around for VISIT_FOR (2–5 minutes): wanders, hops, says
//            things now and then. Click them and they say something; RIGHT-click them to ask them
//            to leave early. DRAG them around like Starby (left-click and drag), and let go to throw
//            them: they glide, slow down and bounce off the screen edges, then carry on wandering.
//            They always stay inside the usable screen (walls = its edges). When it's time: "i've got things to do! bye!" and they hop off screen.
//   no       still holding hands: Starby: "yeah, they're not that cool anyway". Once his bubble is
//            gone, the friend: "uhhh... whattt?". Once THAT's gone, Starby SPINS on the spot, faster
//            and faster, swinging the friend around by the hand, and lets go (when they're heading
//            up): they fly off spinning, bounce off the screen edges BOUNCES times, then fly out past
//            the edge. Starby spins down to a stop.
//   no answer → they let go; the friend shrugs, waves and hops off.
//
// Only one friend at a time (it's one event). While they're visiting the event stays active at
// priority 14, so his games, invites, dances and copycat don't start (a game picked from the
// dialogue is refused too); a call (hush, 15) still wins and the friend just leaves. Starby is
// owned (pet.mode = 'friend') from the arrival until they let go of each other; after that he
// wanders, can be dragged and thrown as usual. Picking him up while they hold hands breaks the
// hold (the friend shrugs and leaves).
//
// Its own timer (watch): a friend visits every VISIT_GAP (20–40 minutes), only when nothing else is
// running and you're around. DevTools / tray menu → Developer → "A friend visits now",
// starby.startEvent('friend').
//
// ART: the friend is drawn exactly like Starby (frames.js + accessories.js): one of the other colour
// sets in assets/sprite/<set>/ and a worn accessory from assets/accessories/, both team art. Their
// speech uses the team's talkbox art (../talkbox.js). Nothing is drawn by code.
import { rand } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createFrames, FACES } from '../frames.js';
import { ACCESSORIES, OVERHANG, createAccessoryArt, drawWorn, anchorAt } from '../accessories.js';
import { createTalkbox, loadTalkbox } from '../talkbox.js';
import { showMenu, closeMenu } from '../dialogue/dialogue.js';

// ---- Who they are (random picks) ----
const ROLES = ['best friend', 'cousin', 'space buddy', 'old classmate', 'neighbor', 'pen pal', 'twin from another galaxy', 'travel buddy'];
const NAMES = ['Twinkle', 'Comet', 'Nova', 'Orbit', 'Pip', 'Sparky', 'Luna', 'Glimmer', 'Astro', 'Dot', 'Blink', 'Cosmo'];
const PLACES = ['the Milky Way', 'Andromeda', 'the Moon', "Saturn's rings", 'the Big Dipper', 'Pluto', 'a faraway nebula', 'the North Star'];
const JOBS = ['professional stargazer', 'comet tour guide', 'moon baker', 'asteroid miner', 'space DJ', 'meteor shower forecaster', 'constellation designer', 'black hole lifeguard'];
const COLOR_SETS = ['sunny', 'bubblegum', 'sky']; // assets/sprite/<set>/ (the friend gets one Starby isn't wearing)

// ---- Tuning ----
const VISIT_GAP = [20 * 60, 40 * 60]; // seconds between visits (own timer)
const RETRY = 60; // seconds: not a good moment → try again
const USER_AWAY = 120; // seconds without cursor movement = nobody's around
const ASK_FOR = 15; // seconds to answer "wanna meet them?"
const VISIT_FOR = [120, 300]; // seconds they stay (2–5 minutes)
const HOP_SPEED = 260; // px/s hopping in / off
const WALK_SPEED = 110; // px/s wandering
const PAUSE_FOR = [1.5, 4]; // seconds standing still between wanders
const CHAT_EVERY = [12, 25]; // seconds between their remarks while visiting
const THROW_SPEED = 1500; // px/s when Starby throws them
const BOUNCES = 3; // edge bounces before they fly off
const BOUNCE_KEEP = 0.85; // speed kept per bounce
const SAY_MS = 2600;
const CLICK_SLOP = 6; // px of movement before a press counts as a drag, not a click
const FLY_DRAG = 2.2; // 1/s: how quickly a thrown friend slows down (space-like glide, like Starby)
const FLY_STOP = 30; // px/s: slower than this and they've landed
const FLY_MAX = 2200; // px/s: fastest throw
const WALL_KEEP = 0.6; // speed kept bouncing off a screen edge
const UPRIGHT_SPEED = 8; // 1/s: tipping back upright after landing
const IMPACT_FX_SPEED = 350; // px/s into an edge: at least this hard → the wall-hit effect (behaviors/fx.js)
// Holding hands
const ARRIVE_SAY_MS = 2600; // their line as they hop on screen
const TOGETHER_FOR = 0.8; // seconds both hold their arms up together ("yay!")
const ASK_BEAT = 0.35; // seconds after the friend's line is gone (and the "yay") before Starby asks
const DISS_MIN = 1.2; // seconds of "they're not that cool anyway" at least (then: once his bubble is gone)
const WHAT_MS = 1800; // the friend's "uhhh... whattt?"
const SPIN_BEAT = 0.15; // seconds after "whattt?" is gone before the spin starts
const SPIN_W0 = 3; // rad/s: the spin starts slow...
const SPIN_ACCEL = 16; // rad/s²: ...speeds up...
const SPIN_WMAX = 17; // rad/s: ...up to this
const SPIN_MIN_TURNS = 1; // full turns before he lets go (then: as soon as they're heading up)
const SPIN_SETTLE = 0.45; // seconds for Starby to spin down upright after letting go
const TAU = Math.PI * 2;

const FRIEND_LINES = {
  arrive: lineBag(['hiii! i made it!', "surprise! it's meee!", 'knock knock! hehe', 'heyyy, there you are!']),
  what: lineBag(['uhhh... whattt?', 'wait... what?', 'excuse me??']),
  hi: lineBag(['hi!!', 'hiya!', 'hello hello!', 'hey there!']),
  visiting: lineBag(['nice place you got here!', '*looks around*', 'ooh, cozy desktop', 'what are you working on?', 'this is fun!', "i love visiting!", 'so many windows!']),
  clicked: lineBag(['hehe, hi!', 'boop!', "that's me!", 'nice to meet you!']),
  bye: lineBag(["i've got things to do! bye!", 'gotta go! see you!', 'bye bye! this was fun!']),
  shrug: lineBag(['oh... ok, bye!', 'guess not! bye!']),
  thrown: lineBag(['wheeeee!', 'heyyy!', 'whoaaa!']),
};
const STARBY_LINES = {
  ask: (name) => `my friend came to visit! wanna meet them?`,
  intro: (f) => `this is my ${f.role}, ${f.name}, from ${f.place}, and they're a ${f.job}!`,
  no: lineBag(["yeah, they're not that cool anyway", "eh, they're not that cool anyway", "fine, they're not that cool anyway"]),
  leaveEarly: (name) => `aww ok, bye ${name}!`,
};

// ---- State ----
let endIt = null;
let phase = 'done'; // arrive | ask | intro | visit | leave | thrown | done
let phaseLeft = 0;
let friend = null; // { role, name, place, job, set, accessory }
let fx = 0; // friend's top-left (css px), facing, motion
let fy = 0;
let vx = 0;
let vy = 0;
let target = null;
let pauseLeft = 0;
let hopT = 0;
let bob = 0;
let rot = 0;
let spin = 0;
let squash = 1; // squashed on a hard wall hit, eased back (like Starby's)
let bounces = 0;
let chatLeft = 0;
let visitLeft = 0;
let face = 'happy';
let faceSince = 0;
let answer = null; // 'yes' | 'no' (from the menu), acted on at the tick
let leaveAsked = false;
// Holding hands with Starby
let holding = false; // their hands are joined (the friend's position follows Starby's hand)
let hands = { starby: 'rhand', friend: 'lhand' }; // which hand each holds with (accessories.js anchors)
let friendFile = 'idle-1'; // the friend's frame file on screen (for their hand anchor)
let arriveSaid = false;
let phaseT = 0; // seconds into the current hold phase
let togetherLeft = 0; // seconds left of both arms up together
let starbyFace = 'calm'; // Starby's face while we own him
let spinTheta = 0; // the spin: angle so far (rad, clockwise)...
let spinW = 0; // ...speed (rad/s)...
let spinOff = null; // ...and the friend's middle relative to Starby's middle at the start
let settle = null; // { from, to, t } Starby spinning down after letting go
// Dragging / throwing them (like Starby): held → flying → back to wandering.
let held = null; // { offX, offY, moved, startX, startY } while the mouse button is down on them
let flying = false; // let go mid-drag: gliding with friction, bouncing off the edges
let mouseHist = []; // recent [t, x, y] while held, for the throw speed
let windowHooked = false; // the window mousemove / mouseup listeners are added once
let el = null;
let canvas = null;
let g = null;
let bubble = null; // { tb (talkbox) | plain el, hideAt }
let frames = null;
let art = null;
let nextVisitAt = null;
let lastCursor = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

const PX = Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function finish(result) {
  const end = endIt;
  endIt = null;
  end?.(result);
}

// ---- The friend sprite (drawn like Starby: a frame + a worn accessory) ----
function buildFriend(ctx) {
  const S = ctx.pet.size;
  if (!frames) {
    frames = createFrames(Math.round(150 * PX));
    art = createAccessoryArt(Math.round(150 * PX));
  }
  frames.loadEssentials(friend.set).then(() => frames.loadAll(friend.set));
  art.load(ACCESSORIES[friend.accessory].file);
  const pad = { top: (OVERHANG.top * S) / 2048, side: (OVERHANG.side * S) / 2048, bottom: (OVERHANG.bottom * S) / 2048 };
  el = document.createElement('div');
  el.className = 'friend hit'; // clickable (click: they talk; right-click: ask them to leave)
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: `${S}px`, height: `${S}px`, cursor: 'pointer', willChange: 'transform' });
  canvas = document.createElement('canvas');
  canvas.width = Math.round((S + 2 * pad.side) * PX);
  canvas.height = Math.round((S + pad.top + pad.bottom) * PX);
  Object.assign(canvas.style, {
    position: 'absolute', left: `${-pad.side}px`, top: `${-pad.top}px`, width: `${S + 2 * pad.side}px`,
    height: `${S + pad.top + pad.bottom}px`, pointerEvents: 'none', transformOrigin: `${pad.side + S / 2}px ${pad.top + S}px`,
  });
  canvas.__pad = pad;
  g = canvas.getContext('2d');
  el.appendChild(canvas);
  el.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.button !== 0 || phase !== 'visit') return; // (not while holding Starby's hand)
    held = { offX: e.clientX - fx, offY: e.clientY - fy, moved: false, startX: e.clientX, startY: e.clientY };
    mouseHist = [[performance.now(), e.clientX, e.clientY]];
    ctx.setPinned(true); // keep getting the mouse when it leaves them (see ../clickThrough.js)
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (phase === 'visit' && !leaveAsked) askToLeave(ctx);
  });
  if (windowHooked) { ctx.stage.appendChild(el); return; } // (the window listeners are added once)
  windowHooked = true;
  window.addEventListener('mousemove', (e) => {
    if (!held) return;
    if (!held.moved && Math.hypot(e.clientX - held.startX, e.clientY - held.startY) > CLICK_SLOP) {
      held.moved = true;
      flying = false;
      target = null;
      bob = 0;
      setFace('playful');
    }
    if (!held.moved) return;
    const now = performance.now();
    mouseHist.push([now, e.clientX, e.clientY]);
    while (mouseHist.length > 2 && now - mouseHist[0][0] > 100) mouseHist.shift(); // last ~0.1s
    keepInside(ctx, e.clientX - held.offX, e.clientY - held.offY); // carried, but never through a wall
  });
  window.addEventListener('mouseup', (e) => {
    if (!held || e.button !== 0) return;
    const wasDrag = held.moved;
    held = null;
    ctx.setPinned(false);
    if (!wasDrag) { if (phase === 'visit') friendSay(ctx, FRIEND_LINES.clicked()); return; } // just a click
    // Let go: thrown at the speed the mouse was moving.
    const [t0, x0, y0] = mouseHist[0];
    const [t1, x1, y1] = mouseHist[mouseHist.length - 1];
    const dt = Math.max(0.016, (t1 - t0) / 1000);
    vx = (x1 - x0) / dt;
    vy = (y1 - y0) / dt;
    const sp = Math.hypot(vx, vy);
    if (sp > FLY_MAX) { vx *= FLY_MAX / sp; vy *= FLY_MAX / sp; }
    spin = vx / 150;
    flying = true;
    ctx.log('friend-thrown-by-you', { speed: Math.round(Math.min(sp, FLY_MAX)) });
  });
  ctx.stage.appendChild(el);
}

function drawFriend(ctx, now) {
  if (!el) return;
  const S = ctx.pet.size;
  el.style.transform = `translate(${fx.toFixed(1)}px, ${(fy + bob).toFixed(1)}px)`;
  canvas.style.transform = `translateY(${-S / 2}px) rotate(${rot}rad) translateY(${S / 2}px) scale(${1 / Math.sqrt(squash)}, ${squash})`;
  const picked = frames.pick(face, friend.set, (now - faceSince) / 1000);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!picked) return; // (frames still loading)
  friendFile = picked.file;
  const pad = canvas.__pad;
  const res = Math.round(S * PX);
  const ox = pad.side * PX;
  const oy = pad.top * PX;
  g.drawImage(picked.img, ox, oy, res, res);
  const u = res / 2048; // accessories are placed in art units
  g.setTransform(u, 0, 0, u, ox, oy);
  drawWorn(g, art, [friend.accessory], picked.file, now / 1000);
}

function setFace(name) {
  if (name !== face) { face = name; faceSince = performance.now(); }
}

// ---- The friend's speech (the team's talkbox art, above their head) ----
// faceWhile: their face while it shows ('talking'; while holding hands an arms-down face instead,
// since the talking frames wave a hand).
function friendSay(ctx, text, ms = SAY_MS, faceWhile = 'talking') {
  if (!bubble) {
    loadTalkbox();
    const tb = createTalkbox({ fontSize: 14, maxText: 200, padX: 9, padY: 6 });
    Object.assign(tb.el.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '3' });
    const plain = document.createElement('div'); // until the talkbox art has loaded
    Object.assign(plain.style, {
      position: 'absolute', left: '0', top: '0', maxWidth: '200px', padding: '6px 10px', background: '#fff', color: '#372118',
      border: '2px solid #372118', borderRadius: '12px', font: "700 14px 'Sour Gummy', 'Segoe UI', sans-serif",
      textTransform: 'lowercase', pointerEvents: 'none', zIndex: '3', display: 'none',
    });
    ctx.stage.appendChild(tb.el);
    ctx.stage.appendChild(plain);
    bubble = { tb, plain, hideAt: 0, art: false };
  }
  bubble.art = bubble.tb.setText(text);
  bubble.tb.el.style.display = bubble.art ? '' : 'none';
  bubble.plain.style.display = bubble.art ? 'none' : '';
  if (!bubble.art) bubble.plain.textContent = text;
  bubble.hideAt = ctx.clock.seconds + ms / 1000;
  setFace(faceWhile);
  placeBubble(ctx);
}

const friendTalking = (ctx) => Boolean(bubble) && ctx.clock.seconds < bubble.hideAt;

// ---- Holding hands ----
// The frame file a face shows (single-file faces are exact; for 2-frame faces, the one on screen).
// Every face used while holding hands keeps the hands where idle-1 has them, except armsUp (both up).
const starbyFileFor = (pet) => {
  const def = FACES[pet.face];
  return def && def.files.length === 1 ? def.files[0] : pet.frameFile || 'idle-1';
};
const friendFileFor = () => {
  const def = FACES[face];
  return def && def.files.length === 1 ? def.files[0] : friendFile;
};

// Where the friend's box goes so their hand sits exactly on Starby's hand (frame-space anchors,
// scaled to the screen). Files default to idle-1 (the pose they meet in).
function holdSpot(ctx, starbyFile = 'idle-1', theirFile = 'idle-1') {
  const { pet } = ctx;
  const u = pet.size / 2048;
  const a = anchorAt(starbyFile, hands.starby) || anchorAt('idle-1', hands.starby);
  const b = anchorAt(theirFile, hands.friend) || anchorAt('idle-1', hands.friend);
  return { x: pet.x + (a.x - b.x) * u, y: pet.y + (pet.bob || 0) + (a.y - b.y) * u };
}

// Starby is ours from the arrival until they let go (pet.mode 'friend': behaviors stand down).
const ownsStarby = (ctx) => ctx.pet.mode === 'friend';
function letGoOfStarby(ctx) {
  const { pet } = ctx;
  holding = false;
  if (pet.mode === 'friend') pet.mode = 'idle';
  pet.faceOverride = null;
  pet.rotation = 0;
  pet.noDialogue = false;
}

// Both raise their arms TOGETHER for TOGETHER_FOR seconds (the only way hands go up while holding).
function together() {
  togetherLeft = TOGETHER_FOR;
}

function placeBubble(ctx) {
  if (!bubble) return;
  const S = ctx.pet.size;
  if (ctx.clock.seconds >= bubble.hideAt) {
    bubble.tb.el.style.display = 'none';
    bubble.plain.style.display = 'none';
    if (face === 'talking') setFace('happy');
    return;
  }
  const a = areaOf(ctx);
  const node = bubble.art ? bubble.tb.el : bubble.plain;
  const w = bubble.art ? bubble.tb.w : node.offsetWidth || 120;
  const h = bubble.art ? bubble.tb.h : node.offsetHeight || 30;
  let left = fx + S / 2 - (bubble.art ? bubble.tb.tailFrac : 0.5) * w;
  left = Math.max(a.left + 6, Math.min(a.right - 6 - w, left));
  const top = Math.max(a.top + 4, fy + bob - h - 3);
  node.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
}

// ---- Moving around ----
function moveToward(tx, ty, speed, dt) {
  const dx = tx - fx;
  const dy = ty - fy;
  const d = Math.hypot(dx, dy);
  if (d <= speed * dt || d < 0.5) { fx = tx; fy = ty; return true; }
  fx += (dx / d) * speed * dt;
  fy += (dy / d) * speed * dt;
  if (Math.abs(dx) > 1) setFace(dx < 0 ? 'left' : 'right');
  return false;
}

// The usable screen's edges are walls: put them at (x, y) but never past an edge.
function keepInside(ctx, x, y) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  fx = Math.max(a.left, Math.min(a.right - S, x));
  fy = Math.max(a.top, Math.min(a.bottom - S, y));
}

// Hit a screen edge hard enough: the same crash lines / dust / star clouds (and sound) as Starby's
// wall hits, at the friend's box (behaviors/fx.js listens for 'friend-impact'), plus a squash.
function impact(ctx, side, speed) {
  if (speed < IMPACT_FX_SPEED) return;
  ctx.log('friend-impact', { side, speed: Math.round(speed), x: fx, y: fy, size: ctx.pet.size });
  squash = 0.72;
}

// One frame of gliding after a throw: friction, spin, and bouncing off the edges (walls).
// Returns true once they've slowed to a stop.
function flyStep(ctx, dt) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  const k = Math.exp(-FLY_DRAG * dt);
  vx *= k;
  vy *= k;
  fx += vx * dt;
  fy += vy * dt;
  rot += spin * dt;
  spin *= k;
  if (fx < a.left) { impact(ctx, 'left', Math.abs(vx)); fx = a.left; vx = Math.abs(vx) * WALL_KEEP; spin = -spin; }
  if (fx > a.right - S) { impact(ctx, 'right', Math.abs(vx)); fx = a.right - S; vx = -Math.abs(vx) * WALL_KEEP; spin = -spin; }
  if (fy < a.top) { impact(ctx, 'top', Math.abs(vy)); fy = a.top; vy = Math.abs(vy) * WALL_KEEP; }
  if (fy > a.bottom - S) { impact(ctx, 'bottom', Math.abs(vy)); fy = a.bottom - S; vy = -Math.abs(vy) * WALL_KEEP; }
  return Math.hypot(vx, vy) < FLY_STOP;
}

function hopBob(dt, rate = 9) {
  hopT += dt * rate;
  bob = -Math.abs(Math.sin(hopT)) * 10;
}

function randomSpot(ctx) {
  const a = areaOf(ctx);
  const S = ctx.pet.size;
  return { x: rand(a.left + 40, a.right - S - 40), y: rand(a.top + 90, a.bottom - S) };
}

function askToLeave(ctx) {
  leaveAsked = true;
  showMenu(ctx, {
    line: `ask ${friend.name} to leave?`,
    options: [
      { label: 'Yes', onPick: () => { closeMenu(ctx); if (phase === 'visit') { ctx.say(STARBY_LINES.leaveEarly(friend.name), 2200); startLeaving(ctx); } } },
      { label: 'No', onPick: () => { closeMenu(ctx); leaveAsked = false; } },
    ],
    onCancel: () => { leaveAsked = false; },
  });
}

function startLeaving(ctx, line = FRIEND_LINES.bye()) {
  const a = areaOf(ctx);
  phase = 'leave';
  friendSay(ctx, line);
  // Hop off the nearer side.
  target = { x: fx + ctx.pet.size / 2 < (a.left + a.right) / 2 ? a.left - ctx.pet.size * 2 : a.right + ctx.pet.size, y: fy };
  phaseLeft = 1.2; // say bye first
  ctx.log('friend-leave', { name: friend.name });
}

function removeFriend() {
  el?.remove();
  el = null;
  if (bubble) { bubble.tb.el.remove(); bubble.plain.remove(); bubble = null; }
}

// ---- Starby while we own him (arrive → let go) ----
// Standing still on the spot (no bob), on the face we pick, upright unless he's spinning. After
// the spin: spins down to a stop (settle), then he's let go.
function updateStarby(ctx, dt) {
  const { pet } = ctx;
  if (togetherLeft > 0) togetherLeft = Math.max(0, togetherLeft - dt);
  if (!ownsStarby(ctx)) return;
  pet.bob = 0;
  pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
  pet.faceOverride = starbyFace;
  if (settle) {
    settle.t += dt;
    const u = Math.min(1, settle.t / SPIN_SETTLE);
    pet.rotation = settle.from + (settle.to - settle.from) * (1 - (1 - u) ** 3);
    if (u >= 1) { settle = null; letGoOfStarby(ctx); }
  } else if (phase !== 'spin') {
    pet.rotation = 0;
  }
}

// The faces while holding hands. Hands only go up TOGETHER: Starby gets 'armsUp' while
// togetherLeft runs, and the friend copies whatever Starby is showing THIS frame (pet.face), so
// both switch in the very same frame and their joined hands rise as one.
function holdFaces(ctx, starby, theirs) {
  starbyFace = togetherLeft > 0 ? 'armsUp' : starby;
  ctx.pet.faceOverride = starbyFace;
  setFace(ctx.pet.face === 'armsUp' ? 'armsUp' : theirs);
}

// Joined at the hand: the friend's hand sits exactly on Starby's (both frames' hand anchors).
function stickToHand(ctx) {
  if (!holding) return;
  const spot = holdSpot(ctx, starbyFileFor(ctx.pet), friendFileFor());
  fx = spot.x;
  fy = spot.y;
  bob = 0;
  rot = 0;
}

function askToMeet(ctx) {
  phase = 'ask';
  phaseLeft = ASK_FOR;
  showMenu(ctx, { // (he freezes first, centered between the answers: dialogue.js)
    line: STARBY_LINES.ask(friend.name),
    options: [{ label: 'Yes!', onPick: () => { answer = 'yes'; } }, { label: 'No', onPick: () => { answer = 'no'; } }],
  });
}

function startSpin(ctx) {
  const { pet } = ctx;
  const S = pet.size;
  phase = 'spin';
  spinTheta = 0;
  spinW = SPIN_W0;
  spinOff = { x: fx - pet.x, y: fy - pet.y }; // friend's middle from Starby's middle (same box size)
  ctx.log('friend-spin', { name: friend.name, size: S });
}

// Round and round: the pair turns as one around Starby's middle (he spins, they swing on his
// hand), faster and faster; he lets go once they've gone round SPIN_MIN_TURNS and are heading up.
function spinStep(ctx, dt) {
  const { pet } = ctx;
  const S = pet.size;
  spinW = Math.min(SPIN_WMAX, spinW + SPIN_ACCEL * dt);
  spinTheta += spinW * dt;
  const c = Math.cos(spinTheta);
  const s = Math.sin(spinTheta);
  const ox = spinOff.x * c - spinOff.y * s; // (clockwise on screen, like CSS rotate)
  const oy = spinOff.x * s + spinOff.y * c;
  fx = pet.x + ox;
  fy = pet.y + oy;
  rot = spinTheta;
  bob = 0;
  pet.rotation = spinTheta;
  starbyFace = 'playful';
  pet.faceOverride = starbyFace;
  setFace('dragged');
  const tvx = -oy * spinW; // the friend's speed along the circle
  const tvy = ox * spinW;
  const sp = Math.hypot(tvx, tvy) || 1;
  if (spinTheta < SPIN_MIN_TURNS * TAU || tvy > -0.7 * sp) return;
  // Let go! They fly off the way they were swinging (at least THROW_SPEED), still spinning.
  const k = Math.max(sp, THROW_SPEED) / sp;
  vx = tvx * k;
  vy = tvy * k;
  spin = spinW;
  bounces = 0;
  holding = false;
  phase = 'thrown';
  setFace('playful');
  friendSay(ctx, FRIEND_LINES.thrown(), 1500, 'playful');
  settle = { from: spinTheta, to: Math.ceil((spinTheta + 1) / TAU) * TAU, t: 0 }; // he spins down
  ctx.log('friend-thrown', { name: friend.name, size: S });
}

let quietFor = 0; // seconds nobody's line has been up (join → ask, "whattt?" → spin)

// Arriving, holding hands and the spin. Returns true if it handled this frame.
function holdStep(ctx, dt) {
  const { pet } = ctx;
  const S = pet.size;
  if (phase === 'arrive') {
    const a = areaOf(ctx);
    // Their line as they come on screen.
    if (!arriveSaid && fx > a.left - S * 0.3 && fx < a.right - S * 0.7) {
      arriveSaid = true;
      friendSay(ctx, FRIEND_LINES.arrive(), ARRIVE_SAY_MS);
    }
    hopBob(dt);
    const spot = holdSpot(ctx); // the pose they meet in (idle-1, both)
    // Almost there: Starby turns to face you, arms down, ready to take their hand.
    if (Math.hypot(spot.x - fx, spot.y - fy) < S * 0.6) starbyFace = 'calm';
    const there = moveToward(spot.x, spot.y, HOP_SPEED, dt);
    if (friendTalking(ctx)) setFace('talking');
    if (there) {
      bob = 0;
      holding = true;
      quietFor = 0;
      phase = 'join';
      together(); // "yay!": hands up together as they meet
      ctx.log('friend-hold', { name: friend.name });
    }
    return true;
  }
  const talking = friendTalking(ctx);
  // While holding, nobody waves a hand: the friend talks with sparkly eyes, not the talking frames.
  const theirs = (calm) => (talking ? 'glistening' : calm);
  if (phase === 'join') {
    holdFaces(ctx, 'calm', theirs('calm'));
    stickToHand(ctx);
    // Starby asks only once the friend's line is gone (and the "yay" is over): no overlap.
    quietFor = talking || togetherLeft > 0 ? 0 : quietFor + dt;
    if (quietFor >= ASK_BEAT) askToMeet(ctx);
    return true;
  }
  if (phase === 'ask') {
    holdFaces(ctx, 'glistening', theirs('calm'));
    stickToHand(ctx);
    return true;
  }
  if (phase === 'intro') {
    if (!holding) return false;
    holdFaces(ctx, 'glistening', theirs('calm'));
    stickToHand(ctx);
    return true;
  }
  if (phase === 'diss') {
    phaseT += dt;
    holdFaces(ctx, 'playful', 'calm'); // "they're not that cool anyway" (tongue out)
    stickToHand(ctx);
    // Once his bubble is gone: the friend's "uhhh... whattt?"
    if (phaseT >= DISS_MIN && !ctx.isSpeaking()) {
      friendSay(ctx, FRIEND_LINES.what(), WHAT_MS, 'dragged');
      phase = 'what';
      quietFor = 0;
    }
    return true;
  }
  if (phase === 'what') {
    holdFaces(ctx, 'wink', 'dragged'); // he's up to something; they're nervous
    stickToHand(ctx);
    quietFor = talking ? 0 : quietFor + dt;
    if (quietFor >= SPIN_BEAT) startSpin(ctx); // and THEN he spins
    return true;
  }
  if (phase === 'spin') {
    spinStep(ctx, dt);
    return true;
  }
  return false;
}

export default {
  name: 'friend',
  category: 'friend', // its own category, with its own timer
  priority: 14, // games / invites / dances wait while a friend visits; a call (hush, 15) still wins

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.friendVisit = () => { if (ctx.activeEvent()) ctx.stopEvent('dev'); return ctx.startEvent('friend', 'devtools'); };
    }
  },

  // Every tick: the visit timer (and noticing the cursor move).
  watch(ctx) {
    const now = ctx.clock.seconds;
    const { cursor } = ctx;
    if (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y) { lastCursor = { x: cursor.x, y: cursor.y }; cursorMovedAt = now; }
    if (nextVisitAt === null) nextVisitAt = now + rand(...VISIT_GAP);
    if (endIt || now < nextVisitAt) return;
    const away = now - cursorMovedAt > USER_AWAY;
    if (!away && !ctx.activeEvent() && ctx.startEvent('friend', 'timer')) return; // stop() sets the next visit
    nextVisitAt = now + RETRY;
  },

  canStart(ctx) {
    const { pet } = ctx;
    return pet.mode !== 'drag' && pet.mode !== 'toss';
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endIt = end;
    const a = areaOf(ctx);
    const S = pet.size;
    // Who they are: a colour Starby isn't wearing, an accessory he isn't wearing (worn kinds only).
    const mine = pet.look?.colorSet;
    const sets = COLOR_SETS.filter((s) => s !== mine);
    const worn = Object.entries(ACCESSORIES).filter(([k, d]) => d.kind === 'worn' && !(pet.look?.accessories || []).includes(k)).map(([k]) => k);
    friend = { role: pick(ROLES), name: pick(NAMES), place: pick(PLACES), job: pick(JOBS), set: pick(sets), accessory: pick(worn) };
    // Hop in from the side further from Starby, right up to him to hold his hand: on his left they
    // hold HIS left-on-screen hand with their right-on-screen hand, and the other way round.
    const fromLeft = pet.x + S / 2 > (a.left + a.right) / 2;
    hands = fromLeft ? { starby: 'lhand', friend: 'rhand' } : { starby: 'rhand', friend: 'lhand' };
    fx = fromLeft ? a.left - S * 1.5 : a.right + S * 0.5;
    fy = holdSpot(ctx).y;
    target = null; // (arrive: the hand-hold spot, worked out every frame)
    vx = 0; vy = 0; rot = 0; spin = 0; bob = 0; hopT = 0; bounces = 0;
    answer = null;
    leaveAsked = false;
    holding = false;
    arriveSaid = false;
    togetherLeft = 0;
    settle = null;
    // Starby stops and looks at them coming. (No right-click menu until they let go: the friend's
    // own question uses the event menu.)
    pet.mode = 'friend';
    pet.noDialogue = true;
    starbyFace = fromLeft ? 'left' : 'right';
    pet.faceOverride = starbyFace;
    face = 'happy';
    faceSince = performance.now();
    buildFriend(ctx);
    phase = 'arrive';
    ctx.log('friend-arrive', { ...friend, reason });
  },

  onTick(ctx) {
    if (!endIt || phase === 'done') return;
    // Starby picked up (or anything else took him) while they hold hands: the hold breaks.
    const holdPhases = ['join', 'ask', 'intro', 'diss', 'what', 'spin'];
    if (holding && holdPhases.includes(phase) && !ownsStarby(ctx)) {
      holding = false;
      ctx.pet.faceOverride = null;
      ctx.pet.rotation = 0;
      ctx.pet.noDialogue = false;
      if (phase !== 'intro') { closeMenu(ctx); startLeaving(ctx, FRIEND_LINES.shrug()); return; }
    }
    if (phase === 'ask') {
      phaseLeft -= TICK_SECONDS;
      if (answer === 'yes') {
        answer = null;
        closeMenu(ctx);
        together(); // "ta-da!": both arms up, together
        ctx.say(STARBY_LINES.intro(friend), 5000);
        phase = 'intro';
        phaseLeft = 3;
        ctx.log('friend-meet', { name: friend.name });
      } else if (answer === 'no') {
        answer = null;
        closeMenu(ctx);
        // Still holding hands: his line first; the friend answers once it's gone (update: 'diss').
        ctx.say(STARBY_LINES.no(), 2600);
        phase = 'diss';
        phaseT = 0;
        ctx.log('friend-dissed', { name: friend.name });
      } else if (phaseLeft <= 0) { // no answer
        closeMenu(ctx);
        letGoOfStarby(ctx);
        startLeaving(ctx, FRIEND_LINES.shrug());
      }
    } else if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        if (ownsStarby(ctx)) letGoOfStarby(ctx); // they let go; Starby carries on as usual
        holding = false;
        friendSay(ctx, FRIEND_LINES.hi(), 2000);
        phase = 'visit';
        visitLeft = rand(...VISIT_FOR);
        chatLeft = rand(...CHAT_EVERY);
        pauseLeft = rand(...PAUSE_FOR);
        target = null;
      }
    } else if (phase === 'visit') {
      visitLeft -= TICK_SECONDS;
      chatLeft -= TICK_SECONDS;
      if (chatLeft <= 0) { chatLeft = rand(...CHAT_EVERY); friendSay(ctx, FRIEND_LINES.visiting()); }
      if (visitLeft <= 0) { closeMenu(ctx); startLeaving(ctx); }
    } else if (phase === 'leave') {
      phaseLeft -= TICK_SECONDS;
    }
  },

  update(ctx, dt) {
    if (phase === 'done' || !el) return;
    const S = ctx.pet.size;
    const a = areaOf(ctx);
    squash += (1 - squash) * Math.min(1, dt * 10); // ease back after a wall hit
    updateStarby(ctx, dt);
    if (holdStep(ctx, dt)) { // arriving / holding hands / the spin: handled there
      drawFriend(ctx, performance.now());
      placeBubble(ctx);
      return;
    }
    // Held (being carried) or flying after a throw: that's all they do this frame.
    if (held?.moved || flying) {
      if (flying && flyStep(ctx, dt)) {
        flying = false;
        target = null;
        pauseLeft = rand(...PAUSE_FOR);
        if (face !== 'talking') setFace('happy');
      }
      bob = 0;
      drawFriend(ctx, performance.now());
      placeBubble(ctx);
      return;
    }
    // Tip back upright after a throw (to the nearest full turn, no snap).
    if (phase !== 'thrown' && rot !== 0) {
      const upright = Math.round(rot / (2 * Math.PI)) * 2 * Math.PI;
      rot = upright + (rot - upright) * Math.exp(-UPRIGHT_SPEED * dt);
      if (Math.abs(rot - upright) < 0.01) rot = 0;
    }
    if (phase === 'visit') {
      if (target) {
        hopBob(dt, 7);
        if (moveToward(target.x, target.y, WALK_SPEED, dt)) { target = null; bob = 0; pauseLeft = rand(...PAUSE_FOR); if (face !== 'talking') setFace('happy'); }
      } else {
        pauseLeft -= dt;
        if (pauseLeft <= 0) target = randomSpot(ctx);
      }
    } else if (phase === 'leave') {
      if (phaseLeft <= 0) {
        hopBob(dt);
        if (moveToward(target.x, target.y, HOP_SPEED, dt)) { phase = 'done'; finish('left'); return; }
      }
    } else if (phase === 'thrown') {
      vy += 900 * dt; // a bit of gravity while flying around
      fx += vx * dt;
      fy += vy * dt;
      rot += spin * dt;
      const out = bounces >= BOUNCES; // after enough bounces they fly out past the edge
      if (!out) {
        if (fx < a.left) { impact(ctx, 'left', Math.abs(vx)); fx = a.left; vx = Math.abs(vx) * BOUNCE_KEEP; bounces++; }
        if (fx > a.right - S) { impact(ctx, 'right', Math.abs(vx)); fx = a.right - S; vx = -Math.abs(vx) * BOUNCE_KEEP; bounces++; }
        if (fy < a.top) { impact(ctx, 'top', Math.abs(vy)); fy = a.top; vy = Math.abs(vy) * BOUNCE_KEEP; bounces++; }
        if (fy > a.bottom - S) { impact(ctx, 'bottom', Math.abs(vy)); fy = a.bottom - S; vy = -Math.max(Math.abs(vy) * BOUNCE_KEEP, 700); bounces++; }
      } else if (fx < a.left - S * 2 || fx > a.right + S || fy < a.top - S * 2 || fy > a.bottom + S) {
        phase = 'done';
        finish('thrown-out');
        return;
      }
    }
    drawFriend(ctx, performance.now());
    placeBubble(ctx);
  },

  stop(ctx) {
    endIt = null;
    if (held) ctx.setPinned(false);
    held = null;
    flying = false;
    if (ownsStarby(ctx)) letGoOfStarby(ctx);
    holding = false;
    settle = null;
    togetherLeft = 0;
    if (phase === 'ask' || leaveAsked) closeMenu(ctx);
    phase = 'done';
    removeFriend();
    nextVisitAt = ctx.clock.seconds + rand(...VISIT_GAP); // the next visit, 20–40 minutes from now
  },
};
