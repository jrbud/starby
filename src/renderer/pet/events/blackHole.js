// BLACK HOLE — a sky event (./happenings.js): a black hole opens and pulls Starby in. Save him!
//
//   spawn    a black hole opens somewhere on screen, at least SPAWN_AWAY px from him. "uh oh... a black
//            hole!! help!" It lasts LAST_FOR (10–15) seconds.
//   pull     every frame he's pulled toward it, harder the closer he is (PULL_*). Walking, throws and
//            slingshots fight it, so a throw only gets him so far before he drifts back in.
//   grab     you can grab him (drag.js, as usual), but only for GRIP_FOR seconds: then it's too strong
//            and he slips out of your hand (a gentle launch() away), so you keep grabbing and dragging.
//   saved    time's up and he's still out → the hole collapses: "phew, thank you... i'm not a fan of
//            being spaghetti" + SAVE_REWARD starbits.
//   gone     he reaches the middle → he spins and shrinks into it, it closes, and he's GONE for GONE_FOR
//            seconds (hushed, can't be clicked). Then it opens somewhere else and spits him out
//            (launch(), flying): "oh wow... it's been years" (time dilation).
//
// He isn't taken over while it pulls (no pet.mode of its own) so grabbing and throwing work as usual;
// only while he's swallowed does it own him (pet.mode = 'swallowed'). High priority like the other
// sky events (interrupts a dance; the sky timer waits for games). Decisions on ticks, the pull every
// frame (events run after behaviors, so the pull is added on top of walking / flying).
// ART: there's no black hole art yet, so it's a PLACEHOLDER: the team's moon PNG
// (assets/events/moon.png), darkened with a purple glow and slowly spinning (CSS effects on the PNG).
// Swap HOLE_ART (and drop HOLE_FILTER) when black hole art exists. Nothing is drawn by code.
// DevTools: starby.happening('black-hole'), or tray menu → Developer → "Start black hole now".
import { rand } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { launch } from '../behaviors/drag.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const HOLE_ART = '../../../assets/events/moon.png'; // PLACEHOLDER black hole; relative to src/renderer/pet/index.html
const HOLE_FILTER = 'grayscale(1) brightness(0.18) drop-shadow(0 0 14px rgba(150, 100, 255, 0.95)) drop-shadow(0 0 32px rgba(110, 60, 220, 0.6))';
const HOLE_SIZE = 150; // px
const LAST_FOR = [10, 15]; // seconds the black hole stays open
const SPAWN_AWAY = 380; // px: opens at least this far from him
const SPAWN_MARGIN = 110; // px kept from the edges of the usable screen
const PULL_BASE = 90; // px/s pull when far away...
const PULL_NEAR = 60000; // ...plus this / distance (so it gets much stronger up close)
const PULL_MAX = 900; // px/s
const GRIP_FOR = 1.2; // seconds you can hold him before he slips
const SLIP_SPEED = 260; // px/s he's nudged away from the hole when he slips (a little help)
const SWALLOW_R = 34; // px: his center this close to the hole's center = sucked in
const SHRINK_FOR = 0.6; // seconds spinning into the hole
const GONE_FOR = 5; // seconds he's gone
const SPIT_SPEED = 900; // px/s he's spat out at
const OPEN_FOR = 0.4; // seconds for the hole to open / close
const SAVE_REWARD = 5;

const LINES = {
  start: lineBag(['uh oh... a black hole!! help!', 'a black hole! hold on to me!', "help! it's pulling me in!"]),
  slip: lineBag(["it's too strong!", 'aaah, i slipped!', "grab me again!", 'heeelp!']),
  saved: lineBag(["phew, thank you... i'm not a fan of being spaghetti", 'phew! you saved me! no spaghetti today', "that was close! thanks... spaghettification is not my thing"]),
  back: lineBag(["oh wow... it's been years", "how long was i gone? it felt like years!", "i'm back! is it still the same year?"]),
};

// ---- State ----
let endIt = null;
let phase = 'done'; // open | pull | shrink | gone | spit | closing | done
let phaseLeft = 0;
let lastLeft = 0; // seconds the hole stays open
let hole = null; // { x, y } center
let holeEl = null;
let grip = 0; // seconds he's been held this grab
let slipped = false; // spotted in update, said at the tick
let swallowed = false; // spotted in update, acted on at the tick
let hushedByUs = false;
let styled = false;
let spinAngle = 0; // his spin while being sucked in (kept here: drag.js straightens him every frame)

const areaOf = (ctx) => (ctx.area ? ctx.area() : { left: 0, top: 0, right: ctx.stageWidth(), bottom: ctx.groundY() + ctx.pet.size });
const centerOf = (pet) => ({ x: pet.x + pet.size / 2, y: pet.y + pet.size / 2 });
const PULLED_MODES = ['idle', 'walk', 'follow', 'flee', 'toss', 'dialogue'];

function injectStyles() {
  if (styled || document.getElementById('black-hole-styles')) return;
  styled = true;
  const style = document.createElement('style');
  style.id = 'black-hole-styles';
  style.textContent = `
    .black-hole {
      position: absolute; left: 0; top: 0; width: ${HOLE_SIZE}px; height: ${HOLE_SIZE}px; pointer-events: none;
      transition: scale ${OPEN_FOR}s cubic-bezier(0.3, 1.4, 0.5, 1); scale: 0;
    }
    .black-hole.open { scale: 1; }
    .black-hole img {
      width: 100%; height: 100%; object-fit: contain; filter: ${HOLE_FILTER};
      animation: black-hole-spin 2.4s linear infinite;
    }
    @keyframes black-hole-spin { to { rotate: 360deg; } }
  `;
  document.head.appendChild(style);
}

function finish(result) {
  const end = endIt;
  endIt = null;
  end?.(result);
}

// Somewhere on screen, at least SPAWN_AWAY from him (or as far as the screen allows).
function pickSpot(ctx, awayFrom) {
  const a = areaOf(ctx);
  let best = null;
  for (let i = 0; i < 30; i++) {
    const p = { x: rand(a.left + SPAWN_MARGIN, a.right - SPAWN_MARGIN), y: rand(a.top + SPAWN_MARGIN, a.bottom - SPAWN_MARGIN) };
    const d = Math.hypot(p.x - awayFrom.x, p.y - awayFrom.y);
    if (!best || d > best.d) best = { ...p, d };
    if (d >= SPAWN_AWAY) return p;
  }
  return best;
}

function showHole(ctx, at) {
  injectStyles();
  hole = at;
  if (!holeEl) {
    holeEl = document.createElement('div');
    holeEl.className = 'black-hole';
    const img = document.createElement('img');
    img.src = HOLE_ART;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => console.warn(`[black-hole] missing art: ${HOLE_ART}`);
    holeEl.appendChild(img);
  }
  // Placed with left/top, NOT transform: translate. The open/close animation uses the CSS `scale`
  // property, which the browser applies on top of `transform`, so it scaled the translate too: closing,
  // the hole slid off toward the screen's top-left corner instead of collapsing in on itself.
  holeEl.style.left = `${hole.x - HOLE_SIZE / 2}px`;
  holeEl.style.top = `${hole.y - HOLE_SIZE / 2}px`;
  // Behind him, so he's drawn in front of it until he's swallowed.
  if (!holeEl.parentNode) {
    if (ctx.petEl.parentNode === ctx.stage) ctx.stage.insertBefore(holeEl, ctx.petEl);
    else ctx.stage.appendChild(holeEl);
  }
  holeEl.classList.remove('open');
  void holeEl.offsetWidth; // so the open animation plays again
  holeEl.classList.add('open');
}

function closeHole() {
  holeEl?.classList.remove('open');
}

function hush(ctx, on) {
  const { pet } = ctx;
  if (on && !pet.hushed) { pet.hushed = true; hushedByUs = true; }
  if (!on && hushedByUs) { pet.hushed = false; hushedByUs = false; }
}

// Hide / show him (while swallowed he can't be seen or clicked).
function setVisible(ctx, on) {
  ctx.petEl.style.opacity = on ? '' : '0';
  ctx.petEl.style.pointerEvents = on ? '' : 'none';
}

export default {
  name: 'black-hole',
  category: 'sky',
  priority: 14, // high: beats dancing, invites and games; below hush (15), so a call silences it

  start(ctx, end) {
    const { pet } = ctx;
    endIt = end;
    lastLeft = rand(...LAST_FOR);
    grip = 0;
    slipped = false;
    swallowed = false;
    showHole(ctx, pickSpot(ctx, centerOf(pet)));
    phase = 'pull';
    ctx.say(LINES.start(), 2800);
    ctx.log('black-hole', { lasts: Math.round(lastLeft * 10) / 10 });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (!endIt || phase === 'done') return;

    if (phase === 'pull') {
      lastLeft -= TICK_SECONDS;
      if (slipped) { slipped = false; ctx.say(LINES.slip(), 1400); }
      if (swallowed) {
        swallowed = false;
        phase = 'shrink';
        phaseLeft = SHRINK_FOR;
        pet.mode = 'swallowed'; // it owns him now (behaviors and drag.js leave him alone)
        spinAngle = pet.rotation || 0;
        ctx.log('black-hole-swallow', {});
        return;
      }
      if (lastLeft <= 0) { // he made it: the hole collapses
        closeHole();
        phase = 'closing';
        phaseLeft = OPEN_FOR + 0.1;
        ctx.say(LINES.saved(), 3500);
        burstStarbits(ctx, SAVE_REWARD);
        requestMood(ctx, 'happy', 'saved from the black hole');
        ctx.log('black-hole-end', { result: 'saved' });
      }
    } else if (phase === 'shrink') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        setVisible(ctx, false);
        hush(ctx, true); // gone: not a word
        closeHole();
        phase = 'gone';
        phaseLeft = GONE_FOR;
      }
    } else if (phase === 'gone') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        // It opens somewhere else and spits him out.
        showHole(ctx, pickSpot(ctx, hole));
        phase = 'spit';
        phaseLeft = OPEN_FOR;
      }
    } else if (phase === 'spit') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) {
        pet.x = hole.x - pet.size / 2;
        pet.y = hole.y - pet.size / 2;
        pet.squash = 1;
        pet.rotation = 0;
        setVisible(ctx, true);
        hush(ctx, false);
        pet.mode = 'idle'; // (launch() makes him fly)
        const a = Math.random() * Math.PI * 2;
        launch(ctx, { vx: Math.cos(a) * SPIT_SPEED, vy: Math.sin(a) * SPIT_SPEED - 200, spin: rand(-9, 9) });
        ctx.say(LINES.back(), 3500);
        closeHole();
        phase = 'closing';
        phaseLeft = OPEN_FOR + 0.1;
        ctx.log('black-hole-end', { result: 'spat-out' });
      }
    } else if (phase === 'closing') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) finish('done');
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (phase === 'shrink') { // spinning into the hole
      const k = Math.max(0, phaseLeft) / SHRINK_FOR; // 1 → 0
      const c = centerOf(pet);
      pet.x += (hole.x - c.x) * Math.min(1, dt * 12);
      pet.y += (hole.y - c.y) * Math.min(1, dt * 12);
      spinAngle += dt * 20;
      pet.rotation = spinAngle;
      ctx.petEl.style.opacity = String(k);
      pet.squash = 0.5 + 0.5 * k;
      return;
    }
    if (phase !== 'pull') return;

    // Held: you can only hold on for GRIP_FOR seconds, then he slips (a little nudge away from it).
    if (pet.mode === 'drag') {
      grip += dt;
      if (grip >= GRIP_FOR) {
        grip = 0;
        const c = centerOf(pet);
        const d = Math.hypot(c.x - hole.x, c.y - hole.y) || 1;
        launch(ctx, { vx: ((c.x - hole.x) / d) * SLIP_SPEED, vy: ((c.y - hole.y) / d) * SLIP_SPEED, spin: rand(-4, 4) });
        ctx.setPinned(false);
        ctx.petEl.classList.remove('dragging');
        slipped = true;
      }
      return; // no pull while you're holding him
    }
    grip = 0;
    if (!PULLED_MODES.includes(pet.mode)) return;

    // Pulled toward the hole, harder the closer he is (on top of whatever he's doing).
    const c = centerOf(pet);
    const dx = hole.x - c.x;
    const dy = hole.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= SWALLOW_R) { swallowed = true; return; }
    const speed = Math.min(PULL_MAX, PULL_BASE + PULL_NEAR / d);
    const step = Math.min(d, speed * dt);
    pet.x += (dx / d) * step;
    pet.y += (dy / d) * step;
    if (Math.abs(dx) > 2 && pet.mode !== 'toss') pet.facing = dx > 0 ? 1 : -1; // looking at it, worried
  },

  stop(ctx) {
    const { pet } = ctx;
    endIt = null;
    closeHole();
    setVisible(ctx, true);
    hush(ctx, false);
    ctx.petEl.style.opacity = '';
    if (pet.mode === 'swallowed') pet.mode = 'idle';
    pet.squash = 1;
    phase = 'done';
  },
};
