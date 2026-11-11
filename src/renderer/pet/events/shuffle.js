// ASTEROID SHUFFLE — a chill game (a "shell game"): Starby hides behind one of 3 asteroids, they
// shuffle around, and you pick the one he's behind.
//
//   setup    he glides to the middle of the usable screen; 3 asteroids appear, hovering above 3 spots
//            in a row (he's on the middle one's spot, so you can see which one he'll be under).
//   hide     the box says "Starby will hide behind an asteroid. Keep your eyes on him!" The
//            asteroids drop onto their spots: the middle one covers him.
//   shuffle  SWAPS times, two asteroids swap places along little arcs (one over the top, one under),
//            SWAP_FOR seconds each, a touch quicker as it goes (SPEED_UP), never so fast you can't
//            follow. He stays hidden behind his asteroid and moves with it.
//   pick     the box: "Which asteroid is Starby hiding behind? Click one!" Click an asteroid
//            (PICK_FOR seconds); it lifts to show what's behind it. (No hover glow on them.)
//
// CHAT IS OFF FOR THE WHOLE GAME (from the start until it ends): pet.hushed is set, so he says
// nothing at all (no speech bubble, no chatter), and pet.hiding makes the right-click dialogue
// ignore right-clicks (../dialogue/dialogue.js) and stops starbit drops / the mood label.
//   result   right → the box: "You found Starby!" and REWARD starbits burst out. Wrong / too slow → his
//            asteroid lifts too, to show where he was ("Nope! Starby was behind that one."). Then
//            the game ends.
//
// THE BOX: every message is in an on-screen box above the asteroids, in the chat theme (the team's
// purple button art, Sour Gummy in the app's yellow): never his speech bubble, which would sit
// under the hovering asteroids and give away where he's hiding.
//
// The asteroids are `.hit` elements during the pick, so clicks reach them (the rest of the screen
// stays click-through); clicks are recorded on mousedown and judged at the next tick.
// Starts like the other games: his invite ("wanna play asteroid shuffle?", ./invite.js via the games
// timer), the dialogue's Chill games, the tray menu ("Play asteroid shuffle"), starby.startEvent('shuffle').
// Shares the rest between games (./games.js). Owns the star via pet.mode = 'shuffle'.
// ART: there's no asteroid art yet, so the asteroids are a PLACEHOLDER: the team's moon PNG
// (assets/events/moon.png). Swap ASTEROID_ART when asteroid art exists. Nothing is drawn by code.
import { rand, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
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
// Every message in the game is shown in the on-screen box (never his speech bubble: the asteroids
// hover right where it would be, and it would give away where he's hiding).
const TEXT = {
  intro: 'Starby will hide behind an asteroid. Keep your eyes on him!',
  pick: 'Which asteroid is Starby hiding behind? Click one!',
  right: "You found Starby!", // (the starbits just burst out; the box doesn't say how many)
  wrong: 'Nope! Starby was behind that one.',
  slow: "Time's up! Starby was behind that one.",
};
const PROMPT_ART = '../../../assets/menuIcons/button-hover.png'; // chat-theme frame (like the dialogue's boxes)


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
let hushedByUs = false; // we set pet.hushed (so only we clear it)
let promptEl = null;
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
    .shuffle-rock.pickable { cursor: pointer; } /* (no hover glow: it shouldn't hint at anything) */
    /* The "pick one" popup: the chat theme (purple button art as a border-image, Sour Gummy, yellow). */
    .shuffle-prompt {
      position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 320px;
      padding: 10px 18px 11px; text-align: center; white-space: normal; pointer-events: none;
      font-family: 'Sour Gummy', 'Segoe UI', system-ui, sans-serif; font-size: 17px; font-weight: 700; line-height: 1.25;
      color: #ffe8a3; border: 12px solid transparent;
      border-image: url('${PROMPT_ART}') 120 fill / 12px stretch;
      filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.3));
    }
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

// The game's message box, centered above the row of asteroids (never above HIM: that'd give him
// away). `lifted`: the asteroids are hovering / lifted, so it sits higher.
function showPrompt(ctx, text, lifted = false) {
  injectStyles();
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.className = 'shuffle-prompt';
  }
  promptEl.textContent = text;
  promptEl.style.left = `${slots[1].x}px`;
  promptEl.style.top = `${slots[1].y - SIZE / 2 - 24 - (lifted ? HOVER : 0)}px`;
  if (!promptEl.parentNode) ctx.stage.appendChild(promptEl);
  promptEl.style.display = '';
}

function hidePrompt() {
  if (promptEl) promptEl.style.display = 'none';
}

// Hidden: no speech at all (pet.hushed, see pet.js ctx.say) so nothing pops up over his asteroid.
function hush(ctx, on) {
  const { pet } = ctx;
  if (on && !pet.hushed) { pet.hushed = true; hushedByUs = true; }
  if (!on && hushedByUs) { pet.hushed = false; hushedByUs = false; }
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
    // Chat is off for the whole game: he says nothing (no speech bubble under the hovering asteroids,
    // nothing to give him away) and right-clicking him doesn't open the dialogue (pet.hiding, see
    // ../dialogue/dialogue.js). The game talks through its own box instead (showPrompt).
    hush(ctx, true);
    pet.hiding = true;
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
      if (phaseLeft <= 0) { phase = 'shuffle'; played = true; hidePrompt(); nextSwap(); }
    } else if (phase === 'pick') {
      phaseLeft -= TICK_SECONDS;
      if (picked !== null || phaseLeft <= 0) {
        setPickable(false);
        hidePrompt();
        if (picked === null) outcome = 'slow';
        else outcome = picked === starRock ? 'right' : 'wrong';
        if (picked !== null) lift(ctx, picked);
        if (outcome !== 'right') ctx.after(0.45, () => lift(ctx, starRock), 'shuffle: show where he was');
        // The result goes in the box too (above the lifted asteroids), once the right one has lifted.
        if (outcome === 'right') {
          ctx.after(LIFT_FOR, () => {
            showPrompt(ctx, TEXT.right, true);
            burstStarbits(ctx, REWARD);
            requestMood(ctx, 'happy', 'found in asteroid shuffle');
          }, 'shuffle: reward');
        } else {
          ctx.after(0.5 + LIFT_FOR, () => showPrompt(ctx, outcome === 'slow' ? TEXT.slow : TEXT.wrong, true), 'shuffle: show where');
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
        showPrompt(ctx, TEXT.intro, true); // above the hovering asteroids
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
          showPrompt(ctx, TEXT.pick); // in the box, not a line from him (that'd show where he is)
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
    hush(ctx, false);
    hidePrompt();
    removeRocks();
    swap = null;
    lifts = [];
    if (pet.mode === 'shuffle') pet.mode = 'idle';
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
