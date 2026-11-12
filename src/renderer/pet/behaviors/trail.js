// TRAILS (shop → Trails; shopCatalog.js): while he wears one (bought, or tried on in the shop) and
// moves (walking, thrown, dragged, slingshotted...), copies of him trail behind and fade out.
//   rainbowtrail  "Rainbow trail": lots of copies, each the next color of the rainbow, smooth fade
//   neontrail     "Neon trail": neon green, CHOPPY on purpose: fewer copies with gaps between them,
//                 and they blink out in a few hard steps instead of fading smoothly
//   blurtrail     "Motion blur": a smooth streak of untinted copies (one almost every frame), each
//                 fading out and getting a little blurrier as it goes (a CSS blur on his own art)
// (The rainbow RIBBON trail is a different thing, drawn by code: ./ribbon.js.)
// Both are in the shop's Trails category, so he wears at most one. A new trail = one entry in
// STYLES plus its shop item (value = the STYLES key, category 'trails').
//
// The copies are HIS OWN current frame (the #sprite canvas pet.js draws, accessories included),
// copied and tinted by code: no new art is drawn, the team's art is just recolored (like shop color
// variants). Each copy is a canvas in the stage, inserted BEFORE #pet so it's always behind him,
// pointer-events: none so it never blocks clicks. It copies the sprite canvas's size, position and
// transform (squash, spin, slingshot stretch) at the moment it was made.
// In the shop he stands still in the display box, so there the copies drift out sideways instead
// (SHOP_DRIFT), so you can see a trail before buying it.

const STYLES = {
  rainbowtrail: {
    count: 10, // copies on screen at most (a pool, reused oldest-first)
    every: 0.035, // seconds between copies while moving
    life: 0.4, // seconds a copy lasts
    alpha: 0.6, // starting opacity
    steps: 0, // 0 = smooth fade; N = drops in N hard steps (choppy)
    tint: 0.6, // how strongly a copy is tinted (0 = his own colors, 1 = flat color)
    color: (i) => `hsl(${(i * 36) % 360}, 100%, 60%)`, // i = copy number: 10 copies = the whole rainbow
    shopEvery: 0.07, // seconds between copies in the shop preview
  },
  neontrail: {
    count: 5,
    every: 0.11, // far apart: gaps between the copies
    life: 0.5,
    alpha: 0.5, // half see-through
    steps: 3, // blinks down 50% → 33% → 17% → gone, no smooth fade
    tint: 0.85,
    color: () => '#39ff14', // neon green
    shopEvery: 0.16,
  },
  blurtrail: {
    count: 18, // lots of copies, one almost every frame: a smooth streak
    every: 0.016,
    life: 0.3,
    alpha: 0.5,
    steps: 0, // smooth fade
    tint: 0, // his own colors, untinted
    color: () => '#000',
    blur: 3, // px of blur a copy reaches as it fades (starts sharp)
    shopEvery: 0.03,
  },
};
const MIN_SPEED = 60; // px/s: slower than this = standing still, no new copies
const SHOP_DRIFT = -140; // px/s: in the shop, copies drift this way (left) from where he stands

let style = null; // the STYLES entry he's wearing (null = no trail)
let ghosts = []; // { wrap, canvas, g, age, drift, base }
let next = 0; // pool index of the next copy to use
let made = 0; // copies made (for the rainbow's color order)
let sinceCopy = 0;
let last = null; // his last position, for his speed

function makeGhosts(ctx) {
  ghosts = Array.from({ length: style.count }, () => {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', display: 'none' });
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    wrap.append(canvas);
    ctx.stage.insertBefore(wrap, ctx.petEl); // behind him
    return { wrap, canvas, g: canvas.getContext('2d'), age: Infinity, drift: 0, base: '' };
  });
  next = 0;
}

function clearGhosts() {
  for (const gh of ghosts) gh.wrap.remove();
  ghosts = [];
  last = null;
}

// Copy his current frame into the next ghost, tinted with the style's color. `drift`: px/s it
// slides sideways while fading (the shop preview); 0 = stays where he was.
function copy(ctx, sprite, drift = 0) {
  const gh = ghosts[next];
  next = (next + 1) % ghosts.length;
  const { canvas, g } = gh;
  if (canvas.width !== sprite.width || canvas.height !== sprite.height) {
    canvas.width = sprite.width;
    canvas.height = sprite.height;
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(sprite, 0, 0);
  if (style.tint > 0) {
    g.globalCompositeOperation = 'source-atop'; // color only where he is
    g.globalAlpha = style.tint;
    g.fillStyle = style.color(made++);
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalAlpha = 1;
  }
  // Same place and pose as him right now.
  const s = sprite.style;
  Object.assign(canvas.style, {
    left: s.left, top: s.top, width: s.width, height: s.height,
    transform: s.transform, transformOrigin: s.transformOrigin,
  });
  gh.base = ctx.petEl.style.transform;
  gh.drift = drift;
  gh.wrap.style.transform = gh.base;
  gh.wrap.style.opacity = String(style.alpha);
  gh.wrap.style.filter = '';
  gh.wrap.style.display = 'block';
  gh.age = 0;
}

// Opacity for a copy this old: smooth, or in hard steps for a choppy trail.
function opacityAt(age) {
  const k = Math.max(0, 1 - age / style.life);
  if (!style.steps) return style.alpha * k;
  return style.alpha * (Math.ceil(k * style.steps) / style.steps);
}

export default {
  name: 'trail',

  update(ctx, dt) {
    const { pet } = ctx;
    // Which trail he's wearing (pet.look.accessories includes shop try-ons).
    const key = Object.keys(STYLES).find((k) => pet.look.accessories.includes(k));
    const want = key ? STYLES[key] : null;
    if (want !== style) {
      clearGhosts();
      style = want;
      if (style) makeGhosts(ctx);
    }
    if (!style || !ghosts.length) return;
    // Fade the copies out (shop preview copies also slide sideways).
    for (const gh of ghosts) {
      if (gh.age >= style.life) continue;
      gh.age += dt;
      const a = opacityAt(gh.age);
      gh.wrap.style.opacity = String(a);
      if (style.blur) gh.wrap.style.filter = `blur(${((style.blur * gh.age) / style.life).toFixed(2)}px)`; // softer as it fades
      if (gh.drift) gh.wrap.style.transform = `translateX(${gh.drift * gh.age}px) ${gh.base}`;
      if (a <= 0) gh.wrap.style.display = 'none';
    }
    const sprite = document.getElementById('sprite');
    if (!sprite || !sprite.width) return;
    sinceCopy += dt;
    // In the shop's display box: a steady stream drifting out to the side.
    if (pet.mode === 'shop') {
      last = null;
      if (sinceCopy < style.shopEvery) return;
      sinceCopy = 0;
      copy(ctx, sprite, SHOP_DRIFT);
      return;
    }
    // New copies while he's moving.
    const now = { x: pet.x, y: pet.y + (pet.bob || 0) };
    const moved = last ? Math.hypot(now.x - last.x, now.y - last.y) : 0;
    const speed = dt > 0 ? moved / dt : 0;
    const jumped = moved > pet.size * 5; // teleport, not motion
    last = now;
    if (speed < MIN_SPEED || jumped || sinceCopy < style.every) return;
    if (pet.mode === 'goodbye' || pet.mode === 'intro') return;
    sinceCopy = 0;
    copy(ctx, sprite);
  },
};
