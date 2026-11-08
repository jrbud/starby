// Starby website: swaps between the team's PNG frames (like the app does) and runs the
// little starbit mini-game. No art is created here; every image comes from ../assets.

const ASSETS = '../assets';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Column edges: the rotated line strips need to be as long as the column is tall ----
(() => {
  const col = document.getElementById('column');
  if (!col) return;
  const fit = () => col.style.setProperty('--col-h', `${col.offsetHeight}px`);
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(col);
  else window.addEventListener('resize', fit);
})();

// ---- Frame-cycling poses: <img class="pose" data-frames="a,b" data-every="ms" data-set="sunny"> ----
document.querySelectorAll('img.pose[data-frames]').forEach((img) => {
  const frames = img.dataset.frames.split(',');
  const set = img.dataset.set || 'sunny';
  const every = Number(img.dataset.every) || 600;
  const srcs = frames.map((f) => `${ASSETS}/sprite/${set}/${f}.png`);
  srcs.forEach((s) => { new Image().src = s; });
  if (frames.length < 2 || reduceMotion) return;
  // data-offset (ms) delays the start so poses with the same frames don't swap in lockstep.
  const offset = Number(img.dataset.offset) || 0;
  let i = 0;
  setTimeout(() => {
    setInterval(() => {
      i = (i + 1) % srcs.length;
      img.src = srcs[i];
    }, every);
  }, offset);
});

// ---- Animated title: 4 boiling frames (big files, so start once they've all loaded) ----
(() => {
  const img = document.getElementById('title-img');
  if (!img || reduceMotion) return;
  const srcs = [1, 2, 3, 4].map((n) => `${ASSETS}/title/title-frame-${n}.png`);
  Promise.all(srcs.map((s) => new Promise((ok) => {
    const im = new Image();
    im.onload = im.onerror = ok;
    im.src = s;
  }))).then(() => {
    let i = 0;
    setInterval(() => { i = (i + 1) % 4; img.src = srcs[i]; }, 180);
  });
})();

// ---- Hero Starby: idle, talks when clicked ----
(() => {
  const btn = document.getElementById('starby');
  const img = document.getElementById('starby-img');
  const box = document.getElementById('talkbox');
  const text = document.getElementById('talkbox-text');
  if (!btn) return;

  const src = (f) => `${ASSETS}/sprite/sunny/${f}.png`;
  ['idle-1', 'idle-2', 'talk-1', 'talk-2', 'happy-1', 'happy-2', 'wink', 'kawaii-1', 'kawaii-2']
    .forEach((f) => { new Image().src = src(f); });

  const lines = [
    'i fell from the sky!!',
    'can i live on your desktop?',
    'wanna play tag?',
    'i promise i\'m not a virus anymore',
    'starbits are my favorite',
    'hehe that tickles',
    'i\'ll be very quiet. mostly.',
    'have you checked your inbox? no? me neither',
    'i\'m made of 100% stardust',
    'take me home!!',
  ];
  let lineIdx = -1;
  let mood = 'idle'; // idle | talk | happy
  let frame = 0;
  let talkTimer = null;
  let pokes = 0;

  // While he talks he plays the team's opensesame.gif (it animates by itself).
  const TALK_GIF = `${ASSETS}/sprite/sunny/opensesame.gif`;
  new Image().src = TALK_GIF;

  const loops = {
    idle: ['idle-1', 'idle-2'],
    happy: ['happy-1', 'happy-2'],
    kawaii: ['kawaii-1', 'kawaii-2'],
  };
  const speed = { idle: 600, happy: 350, kawaii: 300 };
  let last = 0;
  function tick(t) {
    if (mood !== 'talk' && t - last > speed[mood]) {
      last = t;
      frame = (frame + 1) % loops[mood].length;
      img.src = src(loops[mood][frame]);
    }
    requestAnimationFrame(tick);
  }
  if (!reduceMotion) requestAnimationFrame(tick);

  // The bubble art "boils" between its two hand-drawn frames, like in the app.
  if (!reduceMotion) setInterval(() => box.classList.toggle('boil'), 140);

  function say(line, as = 'talk') {
    text.textContent = line;
    mood = as;
    if (as === 'talk') img.src = TALK_GIF;
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => {
      mood = 'idle';
      img.src = src('idle-1');
    }, 2200);
  }

  btn.addEventListener('click', () => {
    pokes++;
    btn.classList.remove('boing');
    void btn.offsetWidth; // restart the squish animation
    btn.classList.add('boing');
    if (pokes % 7 === 0) return say('ok ok you can stop poking me', 'kawaii');
    let n;
    do { n = Math.floor(Math.random() * lines.length); } while (n === lineIdx);
    lineIdx = n;
    say(lines[n], Math.random() < 0.3 ? 'happy' : 'talk');
  });

  // An occasional wink while you're reading.
  setInterval(() => {
    if (mood !== 'idle' || reduceMotion) return;
    img.src = src('wink');
    setTimeout(() => { img.src = src('idle-1'); }, 500);
  }, 7000);
})();

// ---- Sky starbits: float over the galaxy on both sides; hover one to collect it (like the app) ----
// Desktop only: skipped on touch screens (no hover) and when the sides are too narrow to show
// any galaxy. Each starbit drifts slowly inside its side strip, bouncing off the strip's edges;
// collected ones pop and a new one appears somewhere else a moment later. No counter.
(() => {
  const layer = document.getElementById('sky-bits');
  if (!layer || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const COLORS = ['yellow', 'pink', 'blue', 'green', 'teal', 'red', 'white'];
  const PER_SIDE = 6; // starbits on each side
  const SIZE = 46; // px
  const COLUMN = 960; // keep in sync with .column max-width in style.css
  const GAP = 28; // px kept clear next to the column's hand-drawn edge and the screen edge
  const MIN_SIDE = SIZE + GAP * 2; // narrower sides than this: no starbits on that side
  const SPEED = [8, 22]; // px per second
  const RESPAWN_MS = [900, 2200];
  const rand = (a, b) => a + Math.random() * (b - a);

  // Each side's free strip: { x0, x1 } in px (top to bottom is the whole window).
  const strips = () => {
    const side = Math.max(0, (window.innerWidth - COLUMN) / 2);
    if (side < MIN_SIDE) return null;
    return {
      left: { x0: GAP, x1: side - GAP - SIZE },
      right: { x0: window.innerWidth - side + GAP, x1: window.innerWidth - GAP - SIZE },
    };
  };

  const bits = []; // { el, side, x, y, vx, vy, got }

  function place(b, s) {
    b.x = rand(s.x0, s.x1);
    b.y = rand(GAP, window.innerHeight - GAP - SIZE);
    const a = rand(0, Math.PI * 2);
    const v = rand(...SPEED);
    b.vx = Math.cos(a) * v;
    b.vy = Math.sin(a) * v;
  }

  function spawn(side) {
    const s = strips();
    if (!s) return;
    const el = document.createElement('div');
    el.className = 'sky-bit';
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    el.innerHTML = `<img src="${ASSETS}/starbits/${c}${1 + Math.floor(Math.random() * 4)}.png" alt="">`;
    el.firstChild.style.animationDelay = `${-rand(0, 3)}s`;
    const b = { el, side, got: false };
    place(b, s[side]);
    el.addEventListener('pointerenter', () => {
      if (b.got) return;
      b.got = true;
      el.classList.add('got'); // pop (CSS), then a new one elsewhere
      setTimeout(() => {
        el.remove();
        bits.splice(bits.indexOf(b), 1);
        spawn(side);
      }, rand(...RESPAWN_MS));
    });
    layer.appendChild(el);
    bits.push(b);
  }

  for (const side of ['left', 'right']) for (let i = 0; i < PER_SIDE; i++) spawn(side);

  // Drift, bouncing inside the strip. Resizing the window keeps them inside their (new) strip.
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const s = strips();
    layer.style.display = s ? '' : 'none';
    if (s) {
      const yMax = window.innerHeight - GAP - SIZE;
      for (const b of bits) {
        const { x0, x1 } = s[b.side];
        if (!b.got && !reduceMotion) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        if (b.x < x0) { b.x = x0; b.vx = Math.abs(b.vx); }
        if (b.x > x1) { b.x = x1; b.vx = -Math.abs(b.vx); }
        if (b.y < GAP) { b.y = GAP; b.vy = Math.abs(b.vy); }
        if (b.y > yMax) { b.y = yMax; b.vy = -Math.abs(b.vy); }
        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

