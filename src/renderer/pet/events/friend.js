// A FRIEND COMES TO VISIT — another Starby, in a different colour with a different accessory, hops in.
//
//   arrive   the friend hops in from a screen edge to near Starby and says "hi!"
//   ask      Starby: "my friend came to visit! wanna meet them?" with Yes / No (an event menu, like
//            his game invites; ../dialogue/dialogue.js showMenu). ASK_FOR seconds to answer.
//   yes      Starby: "this is my ROLE, NAME, from PLACE, and they're a JOB!" (random picks from the
//            lists below). The friend hangs around for VISIT_FOR (2–5 minutes): wanders, hops, says
//            things now and then. Click them and they say something; RIGHT-click them to ask them
//            to leave early. When it's time: "i've got things to do! bye!" and they hop off screen.
//   no       Starby: "yeah, they're not that cool anyway" and THROWS them: they bounce off the
//            screen edges BOUNCES times, then fly out past the edge.
//   no answer → the friend shrugs, waves and hops off.
//
// Only one friend at a time (it's one event). While they're visiting the event stays active at
// priority 14, so his games, invites, dances and copycat don't start (a game picked from the
// dialogue is refused too); a call (hush, 15) still wins and the friend just leaves. Starby himself
// isn't taken over: he wanders, can be dragged and thrown as usual.
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
import { createFrames } from '../frames.js';
import { ACCESSORIES, OVERHANG, createAccessoryArt, drawWorn } from '../accessories.js';
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

const FRIEND_LINES = {
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
let bounces = 0;
let chatLeft = 0;
let visitLeft = 0;
let face = 'happy';
let faceSince = 0;
let answer = null; // 'yes' | 'no' (from the menu), acted on at the tick
let leaveAsked = false;
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
    if (e.button === 0 && phase === 'visit') friendSay(ctx, FRIEND_LINES.clicked());
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (phase === 'visit' && !leaveAsked) askToLeave(ctx);
  });
  ctx.stage.appendChild(el);
}

function drawFriend(ctx, now) {
  if (!el) return;
  const S = ctx.pet.size;
  el.style.transform = `translate(${fx.toFixed(1)}px, ${(fy + bob).toFixed(1)}px)`;
  canvas.style.transform = `translateY(${-S / 2}px) rotate(${rot}rad) translateY(${S / 2}px)`;
  const picked = frames.pick(face, friend.set, (now - faceSince) / 1000);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!picked) return; // (frames still loading)
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
function friendSay(ctx, text, ms = SAY_MS) {
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
  setFace('talking');
  placeBubble(ctx);
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
    // Hop in from the side further from Starby, toward a spot next to him.
    const fromLeft = pet.x + S / 2 > (a.left + a.right) / 2;
    fx = fromLeft ? a.left - S * 1.5 : a.right + S * 0.5;
    fy = Math.max(a.top + 90, Math.min(a.bottom - S, pet.y));
    const side = fromLeft ? -1 : 1;
    target = { x: Math.max(a.left + 20, Math.min(a.right - S - 20, pet.x + side * S * 1.6)), y: Math.max(a.top + 90, Math.min(a.bottom - S, pet.y)) };
    vx = 0; vy = 0; rot = 0; spin = 0; bob = 0; hopT = 0; bounces = 0;
    answer = null;
    leaveAsked = false;
    face = 'happy';
    faceSince = performance.now();
    buildFriend(ctx);
    phase = 'arrive';
    ctx.log('friend-arrive', { ...friend, reason });
  },

  onTick(ctx) {
    if (!endIt || phase === 'done') return;
    if (phase === 'ask') {
      phaseLeft -= TICK_SECONDS;
      if (answer === 'yes') {
        answer = null;
        closeMenu(ctx);
        ctx.say(STARBY_LINES.intro(friend), 5000);
        phase = 'intro';
        phaseLeft = 3;
        ctx.log('friend-meet', { name: friend.name });
      } else if (answer === 'no') {
        answer = null;
        closeMenu(ctx);
        ctx.say(STARBY_LINES.no(), 3000);
        // Starby throws them: away from him, up and out, bouncing around.
        const S = ctx.pet.size;
        const dir = fx + S / 2 >= ctx.pet.x + S / 2 ? 1 : -1;
        const ang = rand(0.35, 0.9);
        vx = dir * Math.cos(ang) * THROW_SPEED;
        vy = -Math.sin(ang) * THROW_SPEED;
        spin = dir * 14;
        bounces = 0;
        phase = 'thrown';
        setFace('playful');
        friendSay(ctx, FRIEND_LINES.thrown(), 1500);
        ctx.log('friend-thrown', { name: friend.name });
      } else if (phaseLeft <= 0) { // no answer
        closeMenu(ctx);
        startLeaving(ctx, FRIEND_LINES.shrug());
      }
    } else if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
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
    if (phase === 'arrive') {
      hopBob(dt);
      if (moveToward(target.x, target.y, HOP_SPEED, dt)) {
        bob = 0;
        setFace('happy');
        friendSay(ctx, FRIEND_LINES.hi(), 2400);
        phase = 'ask';
        phaseLeft = ASK_FOR;
        showMenu(ctx, {
          line: STARBY_LINES.ask(friend.name),
          options: [{ label: 'Yes!', onPick: () => { answer = 'yes'; } }, { label: 'No', onPick: () => { answer = 'no'; } }],
        });
      }
    } else if (phase === 'visit') {
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
        if (fx < a.left) { fx = a.left; vx = Math.abs(vx) * BOUNCE_KEEP; bounces++; }
        if (fx > a.right - S) { fx = a.right - S; vx = -Math.abs(vx) * BOUNCE_KEEP; bounces++; }
        if (fy < a.top) { fy = a.top; vy = Math.abs(vy) * BOUNCE_KEEP; bounces++; }
        if (fy > a.bottom - S) { fy = a.bottom - S; vy = -Math.max(Math.abs(vy) * BOUNCE_KEEP, 700); bounces++; }
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
    if (phase === 'ask' || leaveAsked) closeMenu(ctx);
    phase = 'done';
    removeFriend();
    nextVisitAt = ctx.clock.seconds + rand(...VISIT_GAP); // the next visit, 20–40 minutes from now
  },
};
