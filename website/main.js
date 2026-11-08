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

// ---- Starbit field: hover over a starbit to collect it (same rule as the app) ----
(() => {
  const field = document.getElementById('field');
  const countEl = document.getElementById('count');
  if (!field) return;

  const colors = ['yellow', 'pink', 'blue', 'green', 'teal', 'red', 'white'];
  const KEY = 'starby-site-starbits';
  let count = 0;
  try { count = Number(localStorage.getItem(KEY)) || 0; } catch (e) { /* storage blocked: start at 0 */ }
  countEl.textContent = count;

  function spawn() {
    if (field.querySelectorAll('.bit:not(.got)').length >= 9) return;
    const bit = document.createElement('div');
    bit.className = 'bit';
    const c = colors[Math.floor(Math.random() * colors.length)];
    const v = 1 + Math.floor(Math.random() * 4);
    bit.innerHTML = `<img src="${ASSETS}/starbits/${c}${v}.png" alt="">`;
    bit.style.left = `${8 + Math.random() * 84}%`;
    bit.style.top = `${18 + Math.random() * 70}%`;
    bit.style.animationDelay = `${-Math.random() * 2}s`;
    const collect = () => {
      if (bit.classList.contains('got')) return;
      bit.classList.add('got');
      count++;
      countEl.textContent = count;
      try { localStorage.setItem(KEY, String(count)); } catch (e) { /* fine, it just won't remember */ }
      const counter = countEl.parentElement;
      counter.classList.remove('pop');
      void counter.offsetWidth;
      counter.classList.add('pop');
      setTimeout(() => bit.remove(), 400);
    };
    bit.addEventListener('pointerenter', collect);
    bit.addEventListener('touchstart', collect, { passive: true });
    field.appendChild(bit);
  }

  for (let i = 0; i < 6; i++) spawn();
  setInterval(spawn, 1400);
})();

// ---- Copy button on the commands ----
document.querySelectorAll('.copy').forEach((b) => {
  b.addEventListener('click', async () => {
    const txt = document.getElementById(b.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(txt);
      b.textContent = 'Copied!';
    } catch (e) {
      b.textContent = 'Select & copy';
    }
    setTimeout(() => { b.textContent = 'Copy commands'; }, 1500);
  });
});

// ---- Setup checklist: the settings-menu checkbox art ----
document.querySelectorAll('.check').forEach((c) => {
  c.addEventListener('click', () => {
    c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
});
