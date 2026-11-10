// ASTEROID SHUFFLE — a chill game (a "shell game"): Starby hides behind one of 3 asteroids, they
// shuffle around, and you pick the one he's behind.
//
//   setup    he glides to the middle of the usable screen; 3 asteroids appear, hovering above 3 spots
//            in a row (he's on the middle one's spot, so you can see which one he'll be under).
//   hide     "i'll hide behind one! keep your eyes on me!" The asteroids drop onto their spots:
//            the middle one covers him.
//   shuffle  SWAPS times, two asteroids swap places along little arcs (one over the top, one under),
//            SWAP_FOR seconds each, a touch quicker as it goes (SPEED_UP), never so fast you can't
//            follow. He stays hidden behind his asteroid and moves with it.
//   pick     "where am i?" Click an asteroid (PICK_FOR seconds). It lifts to show what's behind it.
//   result   right → "you found me!" + REWARD starbits. Wrong → his asteroid lifts too, to show where
//            he was. Then the asteroids fly away and the game ends.
//
// The asteroids are `.hit` elements during the pick, so clicks reach them (the rest of the screen
// stays click-through); clicks are recorded on mousedown and judged at the next tick.
// Starts like the other games: his invite ("wanna play asteroid shuffle?", ./invite.js via the games
// timer), the dialogue's Chill games, the tray menu ("Play asteroid shuffle"), starby.startEvent('shuffle').
// Shares the rest between games (./games.js). Owns the star via pet.mode = 'shuffle'; while he's
// hidden pet.hiding is set (no starbit drops or mood label giving him away).
// ART: there's no asteroid art yet, so the asteroids are a PLACEHOLDER: the team's moon PNG
// (assets/events/moon.png). Swap ASTEROID_ART when asteroid art exists. Nothing is drawn by code.
import { rand, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { readyToPlay, markPlayed } from './games.js';

// ---- Tuning ----
const ASTEROID_ART = '../../../assets/events/moon.png'; // PLACEHOLDER asteroid; relative to src/renderer/pet/index.html
const SIZE = 120; // px: each asteroid (big enough to fully hide him)
const SPACING = 190; // px between the asteroids' centers
const HOVER = 110; // px above its spot an asteroid waits before dropping
const DROP_FOR = 0.45; // seconds to drop onto the spots
const SWAPS = 8; // swaps per shuffle
const SWAP_FOR = 0.55; // seconds the first swap takes...
const SPEED_UP = 0.94; // ...each next one takes this × as long (0.55s → ~0.36s by the 8th)
const SWAP_PAUSE = 0.08; // seconds between swaps
const ARC = 70; // px the two swapping asteroids bow up / down
const INTRO_FOR = 2; // seconds of "i'll hide..." before they drop
const BEFORE_SHUFFLE = 0.7; // seconds after the drop before shuffling starts
const PICK_FOR = 12; // seconds to pick before he gives up and shows you
const LIFT = 95; // px an asteroid lifts to reveal
const LIFT_FOR = 0.35; // seconds to lift
const RESULT_FOR = 2.6; // seconds the result shows before the game ends
const REWARD = 8;

const LINES = {
  intro: lineBag(["i'll hide behind one! keep your eyes on me!", 'watch closely... i\'m hiding!', 'follow me if you can!']),
  pick: lineBag(['where am i?', 'which one am i behind?', 'find me!']),
  right: lineBag(['you found me!', 'yay, you got it!', 'how did you keep up?!']),
  wrong: lineBag(['nope! i was over here', 'hehe, wrong one!', 'so close! i was here']),
  slow: lineBag(['too slow! i was here', 'here i am!']),
};

// ---- State ----
let endGame = null;
let phase = 'done'; // setup | intro | drop | wait | shuffle | pick | reveal | result | done
let phaseLeft = 0;
let rocks = []; // { el, x, y (current center), slot } — slot = which spot it's on (0..2)
let slots = []; // [{x, y}] the 3 spots
let starRock = 1; // index into rocks: the asteroid he's behind
let swap = null; // { a, b, t, dur, from: [{x,y},{x,y}] } the swap in progress
let swapsLeft = 0;
let swapDur = SWAP_FOR;
let picked = null; // rock index clicked (judged at the tick)
let lifts = []; // { rock, t } asteroids lifting
let outcome = null;
let hopped = false; // the happy hop when you find him (once)
let played = false;
let styled = false;

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2); // ease in-out

function injectStyles() {
  if (styled || document.getElementById('shuffle-styles')) return;
  styled = true;
  const style = document.createElement('style');
  style.id = 'shuffle-styles';
  style.textContent = `
    .shuffle-rock {
      position: absolute; left: 0; top: 0; width: ${SIZE}px; height: ${SIZE}px; object-fit: contain;
      will-change: transform; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
    }
    .shuffle-rock.pickable { cursor: pointer; }
    .shuffle-rock.pickable:hover { filter: drop-shadow(0 0 10px rgba(255, 232, 163, 0.9)) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35)); }
  `;
  document.head.appendChild(style);
}

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

function place(rock) {
  rock.el.style.transform = `translate(${(rock.x - SIZE / 2).toFixed(1)}px, ${(rock.y - SIZE / 2).toFixed(1)}px)`;
}

function buildRocks(ctx) {
  injectStyles();
  removeRocks();
  rocks = slots.map((s, i) => {
    const el = document.createElement('img');
    el.className = 'shuffle-rock';
    el.src = ASTEROID_ART;
    el.alt = '';
    el.draggable = false;
    el.onerror = () => console.warn(`[shuffle] missing asteroid art: ${ASTEROID_ART}`);
    const index = i;
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (phase === 'pick' && picked === null) picked = index;
    });
    ctx.stage.appendChild(el); // after him, so they cover him
    const rock = { el, x: s.x, y: s.y - HOVER, slot: i };
    place(rock);
    return rock;
  });
}

function removeRocks() {
  for (const r of rocks) r.el.remove();
  rocks = [];
}

function setPickable(on) {
  for (const r of rocks) {
    r.el.classList.toggle('pickable', on);
    r.el.classList.toggle('hit', on); // .hit: clickable only while you pick
  }
}

// Two different asteroids to swap (any pair; the one he's behind is in it more often, so you have
// to actually follow him rather than just watch one spot).
function nextSwap() {
  let a;
  let b;
  if (Math.random() < 0.6) {
    a = starRock;
    do { b = Math.floor(Math.random() * rocks.length); } while (b === a);
  } else {
    a = Math.floor(Math.random() * rocks.length);
    do { b = Math.floor(Math.random() * rocks.length); } while (b === a);
  }
  swap = { a, b, t: 0, dur: swapDur, from: [{ x: rocks[a].x, y: rocks[a].y }, { x: rocks[b].x, y: rocks[b].y }] };
  swapDur *= SPEED_UP;
}

function lift(ctx, index) {
  if (lifts.some((l) => l.rock === index)) return;
  lifts.push({ rock: index, t: 0, baseY: rocks[index].y });
  if (index === starRock) ctx.pet.hiding = false; // he's showing now
}

export default {
  name: 'shuffle',
  category: 'games',
  priority: 10, // a game: same level as the others

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endGame = end;
    const a = areaOf(ctx);
    const cx = (a.left + a.right) / 2;
    // In the middle, low enough for the asteroids to hover above (and his speech bubble above that).
    const cy = Math.max(a.top + HOVER + SIZE + 90, Math.min(a.bottom - SIZE, (a.top + a.bottom) / 2 + 40));
    slots = [-1, 0, 1].map((k) => ({ x: cx + k * SPACING, y: cy }));
    starRock = 1; // he hides behind the middle one
    swap = null;
    swapsLeft = SWAPS;
    swapDur = SWAP_FOR;
    picked = null;
    lifts = [];
    outcome = null;
    hopped = false;
    played = false;
    phase = 'setup';
    pet.mode = 'shuffle'; // behaviors stand down
    cancelJump();
    requestMood(ctx, 'playful', 'asteroid shuffle');
    ctx.log('shuffle-start', { reason });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endGame || phase === 'done') return;
    if (pet.mode !== 'shuffle') { finish(`interrupted:${pet.mode}`); return; } // grabbed, etc.

    if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) { phase = 'drop'; phaseLeft = DROP_FOR; }
    } else if (phase === 'wait') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) { phase = 'shuffle'; played = true; nextSwap(); }
    } else if (phase === 'pick') {
      phaseLeft -= TICK_SECONDS;
      if (picked !== null || phaseLeft <= 0) {
        setPickable(false);
        if (picked === null) outcome = 'slow';
        else outcome = picked === starRock ? 'right' : 'wrong';
        if (picked !== null) lift(ctx, picked);
        if (outcome !== 'right') ctx.after(0.45, () => lift(ctx, starRock), 'shuffle: show where he was');
        if (outcome === 'right') {
          ctx.say(LINES.right(), RESULT_FOR * 1000);
          ctx.after(LIFT_FOR, () => { burstStarbits(ctx, REWARD); requestMood(ctx, 'happy', 'found in asteroid shuffle'); }, 'shuffle: reward');
        } else {
          ctx.after(0.5, () => ctx.say(outcome === 'slow' ? LINES.slow() : LINES.wrong(), RESULT_FOR * 1000), 'shuffle: say where');
        }
        ctx.log('shuffle-pick', { picked, star: starRock, outcome });
        phase = 'result';
        phaseLeft = RESULT_FOR + 0.5;
      }
    } else if (phase === 'result') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) finish(outcome);
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'shuffle' || phase === 'done') return;
    updateJump(pet, dt);
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
    pet.rotation = 0;

    if (phase === 'setup') {
      // Glide onto the middle spot, then the asteroids appear above the spots.
      const tx = slots[1].x - pet.size / 2;
      const ty = slots[1].y - pet.size / 2;
      const dx = tx - pet.x;
      const dy = ty - pet.y;
      const d = Math.hypot(dx, dy);
      const step = 900 * dt;
      if (d <= step || d < 0.5) {
        pet.x = tx;
        pet.y = ty;
        buildRocks(ctx);
        ctx.say(LINES.intro(), INTRO_FOR * 1000 + 300);
        if (!isJumping()) startJump({ height: rand(10, 14), air: 0.25 });
        phase = 'intro';
        phaseLeft = INTRO_FOR;
      } else {
        pet.x += (dx / d) * step;
        pet.y += (dy / d) * step;
        if (Math.abs(dx) > 1) pet.facing = dx > 0 ? 1 : -1;
      }
      return;
    }

    if (phase === 'drop') {
      phaseLeft -= dt;
      const k = ease(1 - Math.max(0, phaseLeft) / DROP_FOR);
      rocks.forEach((r, i) => { r.x = slots[i].x; r.y = slots[i].y - HOVER * (1 - k); place(r); });
      if (phaseLeft <= 0) {
        pet.hiding = true; // covered: no starbit drops / mood label giving him away
        phase = 'wait';
        phaseLeft = BEFORE_SHUFFLE;
      }
    } else if (phase === 'shuffle' && swap) {
      swap.t += dt;
      const k = Math.min(1, swap.t / swap.dur);
      const e = ease(k);
      const [fa, fb] = swap.from;
      const bow = Math.sin(Math.PI * e) * ARC;
      // a goes to b's spot over the top, b goes to a's spot underneath.
      const A = rocks[swap.a];
      const B = rocks[swap.b];
      A.x = fa.x + (fb.x - fa.x) * e; A.y = fa.y + (fb.y - fa.y) * e - bow;
      B.x = fb.x + (fa.x - fb.x) * e; B.y = fb.y + (fa.y - fb.y) * e + bow;
      place(A);
      place(B);
      if (k >= 1) {
        swap = null;
        swapsLeft--;
        if (swapsLeft <= 0) {
          phase = 'pick';
          phaseLeft = PICK_FOR;
          picked = null;
          setPickable(true);
          ctx.say(LINES.pick(), 3000);
        } else {
          ctx.after(SWAP_PAUSE, () => { if (phase === 'shuffle') nextSwap(); }, 'shuffle: next swap');
        }
      }
    } else if (phase === 'reveal' || phase === 'result') {
      for (const l of lifts) {
        l.t += dt;
        const r = rocks[l.rock];
        if (!r) continue;
        r.y = l.baseY - LIFT * ease(Math.min(1, l.t / LIFT_FOR));
        place(r);
      }
    }

    // He stays behind his asteroid wherever it goes (until it lifts and shows him).
    const mine = rocks[starRock];
    if (mine && phase !== 'intro' && phase !== 'setup') {
      const liftedMine = lifts.some((l) => l.rock === starRock);
      if (!liftedMine) {
        pet.x = mine.x - pet.size / 2;
        pet.y = mine.y - pet.size / 2;
        pet.bob = 0;
      } else if (outcome === 'right' && !hopped && !isJumping()) {
        hopped = true;
        startJump({ height: rand(14, 20), air: 0.3 }); // a happy hop when you find him
      }
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endGame = null;
    phase = 'done';
    pet.hiding = false;
    removeRocks();
    swap = null;
    lifts = [];
    if (pet.mode === 'shuffle') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
