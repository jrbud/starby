// INTRO — the launch animation, played once when the app starts.
//
//   1. The "Starby" title (team art, assets/title/title-frame-1..4.png) SLAMS onto the middle of
//      the screen, then boils by swapping frames in the order 1-2-3-4-3-2 (looping).
//   2. The title fades out while Starby is flung onto the screen from the top-left corner, always
//      at Fling power LAUNCH_POWER (whatever the Settings slider says). He flies, bounces off the screen
//      edges and lands using the normal throw physics (launch() in ../behaviors/drag.js).
//   3. Once he's landed he says hello: an introduction the very first time, otherwise a
//      "welcome back" picked by how long you've been away (see GREETINGS).
//
// It starts itself on the first tick (init), so pet.js doesn't need to know about it. Starby
// doesn't exist on screen until he's flung: from the moment this file loads until the launch,
// everything on the stage except the title is hidden (his body, accessories/floaters, the mood
// label, ...), via the `intro-prelaunch` class on the stage (pet.css).
// Replay it from the pet's DevTools: starby.startEvent('intro').
//
// "Last seen" is remembered in this window's localStorage (it lives in the app's own data
// folder and survives restarts). With no record yet, the save file decides: someone who already
// has starbits isn't greeted like a stranger.
//
// Title art is 8138×4096; each frame is shrunk ONCE to the size it's shown at (like frames.js),
// so we never keep ~130MB per full-size frame around. The files themselves are never changed.
import { launch } from '../behaviors/drag.js';
import { petBounds, rand } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { sfx } from '../../shared/sfx.js';

// ---- Tuning ----
const TITLE_DIR = '../../../assets/title'; // relative to src/renderer/pet/index.html
const TITLE_FILES = [1, 2, 3, 4].map((n) => `${TITLE_DIR}/title-frame-${n}.png`);
const TITLE_ASPECT = 4096 / 8138; // height / width of the art
const TITLE_WIDTH = 0.55; // of the usable screen width…
const TITLE_MAX_WIDTH = 1000; // …but never wider than this (px)
const FRAME_ORDER = [0, 1, 2, 3, 2, 1]; // 1-2-3-4-3-2
const FRAME_SECONDS = 0.1; // per frame of the boil
const SLAM_MS = 260; // drop-in from big to normal size
const HOLD_SECONDS = 1.6; // title on screen (after the slam) before it fades
const FADE_MS = 600;
const LOAD_TIMEOUT_MS = 4000; // art not ready by then → skip the title, just launch him
// Flung from the top-left, toward the lower right, with a little spin (rad/s). Speeds are the
// "hand" speed of the throw (px/s); like a real throw they're scaled by the fling power.
const LAUNCH_POWER = 75; // Fling power for the launch, fixed (ignores the Settings slider)
const LAUNCH_VX = [700, 1000];
const LAUNCH_VY = [250, 450];
const LAUNCH_SPIN = [4, 7];
const LAND_TIMEOUT = 25; // seconds: greet anyway if he's still bouncing around by then
const SPAWN_QUIET = 1; // seconds after he's flung on screen before he may say anything (pet.quietUntil)
const LAUNCH_SOUND_LEAD_MS = 200; // launch.mp3 starts this long before the title slams in
const GREETING_MS = 2800;

// ---- Greetings ----
const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const FIRST_TIME = ["hi! i'm starby!", 'i live on your screen now :)', 'catch the starbits i drop!'];
const GREETINGS = [
  // [away for less than (seconds), lines]
  [10 * MIN, lineBag(['back already?', 'oh! hi again!', 'that was quick!', 'hi hi!'])],
  [6 * HOUR, lineBag(['welcome back!', 'hiya!', 'missed me?', 'yay, you\'re here!'])],
  [2 * DAY, lineBag(['hey, you\'re back!', 'good to see you again!', 'there you are!', 'morning? evening? hi!'])],
  [7 * DAY, lineBag(['long time no see!', 'i missed you!', 'where\'d you go?!'])],
  [Infinity, lineBag(['long time no see!!', 'it\'s been forever!', 'i thought you forgot about me...'])],
];
const SEEN_KEY = 'starby:lastSeenAt';
const SEEN_EVERY = 60; // seconds between "still here" saves

// ---- Remembering when you last saw him (per-viewer convenience; safe if storage is off) ----
const readLastSeen = () => {
  try { const v = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};
const writeLastSeen = () => {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* ignore */ }
};

// Hide him (and everything that follows him) right away: this module loads before the first
// frame is drawn, so nothing of his shows at his start spot before he's flung.
const stageEl = document.getElementById('stage');
const hideStarby = (hide) => stageEl?.classList.toggle('intro-prelaunch', hide);
hideStarby(true);

let endIntro = null;
let phase = 'idle'; // 'loading' | 'title' | 'flying' | 'done'
let flyingSince = 0;
let title = null; // { el, canvas, g, frames: ImageBitmap[], w, h, t, fadeStarted }
let lastSeenBeforeThisRun = undefined; // read once at startup, before we overwrite it
let hasSave = false; // the save file shows they've played before

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

// Load the 4 title frames one at a time, each shrunk to w×h right away.
async function loadTitleFrames(w, h) {
  const frames = [];
  for (const src of TITLE_FILES) {
    const img = await loadImage(src);
    frames.push(await createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }));
  }
  return frames;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function showTitle(ctx, frames, w, h) {
  const a = ctx.area();
  const el = document.createElement('div');
  el.className = 'intro-title'; // see pet.css; NOT .hit, so clicks pass through
  el.style.left = `${(a.left + a.right) / 2 - w / 2}px`;
  el.style.top = `${(a.top + a.bottom) / 2 - h / 2}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  el.append(canvas);
  // Behind Starby: first in the stage, so he flies in front of the fading title.
  ctx.stage.prepend(el);
  const g = canvas.getContext('2d');
  g.drawImage(frames[0], 0, 0);
  // The slam: drop in from big and see-through to full size, with a squash on impact.
  el.animate(
    [
      { transform: 'scale(2.6)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1.06, 0.9)', offset: 0.85 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: SLAM_MS, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  );
  return { el, canvas, g, frames, w, h, t: 0, shown: -1, fadeStarted: false };
}

function removeTitle() {
  if (!title) return;
  title.el.remove();
  for (const f of title.frames) f.close?.();
  title = null;
}

// Top-left corner of the screen, then fling toward the lower right.
function launchStarby(ctx) {
  const { pet } = ctx;
  const b = petBounds(ctx);
  pet.x = b.minX;
  pet.y = b.minY;
  pet.rotation = 0;
  pet.facing = 1; // looking the way he flies (right)
  hideStarby(false); // he appears now, as he's flung
  pet.quietUntil = ctx.clock.seconds + SPAWN_QUIET; // ctx.say (pet.js) stays silent until then
  launch(ctx, {
    vx: rand(...LAUNCH_VX),
    vy: rand(...LAUNCH_VY),
    spin: rand(...LAUNCH_SPIN),
    power: LAUNCH_POWER,
  });
  phase = 'flying';
  flyingSince = ctx.clock.seconds;
  ctx.log('intro-launch', {});
}

function greet(ctx) {
  // Landed within his first second on screen: hold the hello until he may talk (SPAWN_QUIET).
  const wait = (ctx.pet.quietUntil || 0) - ctx.clock.seconds;
  if (wait > 0) {
    ctx.after(wait + 0.05, () => greet(ctx), 'intro greeting (after spawn quiet)');
    return;
  }
  const firstTime = lastSeenBeforeThisRun == null && !hasSave;
  if (firstTime) {
    // A little introduction, one line after another.
    FIRST_TIME.forEach((line, i) => {
      if (i === 0) ctx.say(line, GREETING_MS);
      else ctx.after(i * (GREETING_MS / 1000 + 0.3), () => ctx.say(line, GREETING_MS), 'intro greeting');
    });
  } else {
    const away = lastSeenBeforeThisRun == null ? Infinity : (Date.now() - lastSeenBeforeThisRun) / 1000;
    const pick = GREETINGS.find(([under]) => away < under)[1];
    ctx.say(pick(), GREETING_MS);
  }
  ctx.log('intro-greeting', { firstTime });
}

function finish(result) {
  const end = endIntro;
  endIntro = null;
  end?.(result);
}

export default {
  name: 'intro',
  category: 'system',
  priority: 100, // nothing interrupts the intro

  init(ctx) {
    // Read "last seen" once, before this run overwrites it; then keep it fresh while running.
    if (lastSeenBeforeThisRun === undefined) lastSeenBeforeThisRun = readLastSeen();
    writeLastSeen();
    ctx.every(SEEN_EVERY, writeLastSeen, 'remember last seen');
    window.addEventListener('pagehide', writeLastSeen);
    ctx.api.getState().then((s) => { hasSave = Boolean(s && s.starbits > 0); }).catch(() => {});
    ctx.startEvent('intro', 'launch');
  },

  async start(ctx, end) {
    endIntro = end;
    phase = 'loading';
    ctx.pet.mode = 'intro'; // behaviors stand down for modes they don't know
    ctx.pet.quietUntil = Infinity; // not on screen yet: silent until launchStarby() sets the real time
    hideStarby(true);
    const a = ctx.area();
    const w = Math.round(Math.min(TITLE_MAX_WIDTH, (a.right - a.left) * TITLE_WIDTH));
    const h = Math.round(w * TITLE_ASPECT);
    try {
      const frames = await withTimeout(loadTitleFrames(w, h), LOAD_TIMEOUT_MS);
      if (phase !== 'loading') { frames.forEach((f) => f.close?.()); return; } // stopped meanwhile
      // launch.mp3 leads the title by LAUNCH_SOUND_LEAD_MS so its hit lands with the slam.
      sfx.play('launch');
      await new Promise((r) => setTimeout(r, LAUNCH_SOUND_LEAD_MS));
      if (phase !== 'loading') { frames.forEach((f) => f.close?.()); return; } // stopped meanwhile
      title = showTitle(ctx, frames, w, h);
      phase = 'title';
    } catch (err) {
      console.warn('[intro] title art not shown:', err.message);
      if (phase === 'loading') launchStarby(ctx); // no title: just launch him
    }
  },

  update(ctx, dt) {
    if (phase === 'title' && title) {
      title.t += dt;
      // Boil: 1-2-3-4-3-2, looping, once the slam is done.
      const boilT = Math.max(0, title.t - SLAM_MS / 1000);
      const idx = FRAME_ORDER[Math.floor(boilT / FRAME_SECONDS) % FRAME_ORDER.length];
      if (idx !== title.shown) {
        title.g.clearRect(0, 0, title.w, title.h);
        title.g.drawImage(title.frames[idx], 0, 0);
        title.shown = idx;
      }
      if (!title.fadeStarted && title.t >= SLAM_MS / 1000 + HOLD_SECONDS) {
        title.fadeStarted = true;
        const t = title;
        t.el.style.transition = `opacity ${FADE_MS}ms ease-out, transform ${FADE_MS}ms ease-out`;
        t.el.style.opacity = '0';
        t.el.style.transform = 'scale(1.08)';
        ctx.after(FADE_MS / 1000 + 0.05, () => { if (title === t) removeTitle(); }, 'intro title cleanup');
        launchStarby(ctx); // he flies in as the title fades
      }
      // Keep boiling while it fades.
    } else if (title && title.fadeStarted) {
      title.t += dt;
      const boilT = Math.max(0, title.t - SLAM_MS / 1000);
      const idx = FRAME_ORDER[Math.floor(boilT / FRAME_SECONDS) % FRAME_ORDER.length];
      if (idx !== title.shown) {
        title.g.clearRect(0, 0, title.w, title.h);
        title.g.drawImage(title.frames[idx], 0, 0);
        title.shown = idx;
      }
    }

    if (phase === 'flying') {
      const { mode } = ctx.pet;
      const landed = mode !== 'toss' && mode !== 'drag' && mode !== 'intro';
      if (landed || ctx.clock.seconds - flyingSince > LAND_TIMEOUT) {
        phase = 'done';
        greet(ctx);
        finish('done');
      }
    }
  },

  stop(ctx) {
    endIntro = null;
    removeTitle();
    hideStarby(false);
    if (phase === 'loading' || phase === 'title') {
      // Stopped early: put him back in play (and let him talk: he never got launched).
      if (ctx.pet.mode === 'intro') ctx.pet.mode = 'idle';
      ctx.pet.quietUntil = 0;
    }
    phase = 'idle';
  },
};
