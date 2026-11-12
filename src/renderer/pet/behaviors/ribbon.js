// RAINBOW RIBBON (shop → Trails → "Rainbow ribbon", shopCatalog.js accessory-ribbontrail): while he
// wears it and moves, a flat rainbow ribbon (six bands: red, orange, yellow, green, blue, purple)
// streams out behind him along the path he took, thin but long. Every part lasts
// LIFE seconds and then disappears (no fading), so the tail shortens piece by piece from the end.
// It lasts much longer than the copy-of-Starby trails. No wobble: it follows his path exactly.
// In the shop he stands still in the display box, so there the ribbon flows out sideways
// (SHOP_DRIFT) so you can see it before buying.
//
// ART RULE EXCEPTION (approved by the team on 2026-11-12): CLAUDE.md says code never draws art.
// This ribbon is the one approved exception: plain rainbow bands drawn by code, because it's a
// flat-color effect with no hand-drawn look to match. Don't use it as precedent for drawing
// other art in code.
//
// One full-window canvas in the stage, inserted BEFORE #pet (always behind him), pointer-events:
// none (never blocks clicks). Redrawn every frame from a list of points along his path.
const VALUE = 'ribbontrail'; // the shop item's value (in pet.look.accessories while worn)
const BANDS = ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'];
const LIFE = 0.5; // seconds each part of the ribbon lasts before it disappears (= how long the ribbon is)
const ALPHA = 0.9; // opacity of the whole ribbon
const WIDTH = 0.3; // ribbon width, in Starby sizes (thin)
const STEP = 3; // px he has to move before a new point is added
const SHOP_DRIFT = -150; // px/s: in the shop the ribbon flows out this way (left)

let on = false;
let canvas = null;
let g = null;
let dpr = 1;
let points = []; // { x, y, t } oldest first, in css px

function makeCanvas(ctx) {
  canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
  canvas.style.opacity = String(ALPHA);
  ctx.stage.insertBefore(canvas, ctx.petEl);
  g = canvas.getContext('2d');
  fit();
}

function fit() {
  if (!canvas) return;
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}

function removeCanvas() {
  canvas?.remove();
  canvas = null;
  g = null;
  points = [];
}

// Unit normal (perpendicular) of the path at point i.
function normalAt(i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

// Each band is ONE filled shape along the whole path (its two edges are the path pushed sideways
// along its normal), so there are no seams or gaps between pieces. Drawn solid; the whole layer's
// opacity is ALPHA (canvas style), so overlaps where the path crosses itself don't get darker.
// No fading: points simply expire after LIFE (update), so the tail shortens piece by piece.
function draw(size) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  if (points.length < 2) return;
  const bandW = (WIDTH * size) / BANDS.length;
  const half = (BANDS.length * bandW) / 2;
  const normals = points.map((_, i) => normalAt(i));
  const at = (i, off) => [points[i].x + normals[i].x * off, points[i].y + normals[i].y * off];
  for (let b = 0; b < BANDS.length; b++) {
    // A hair of overlap into the next band, so no background shows between colors.
    const o1 = -half + b * bandW - (b > 0 ? 0.5 : 0);
    const o2 = -half + (b + 1) * bandW;
    g.fillStyle = BANDS[b];
    g.beginPath();
    for (let i = 0; i < points.length; i++) {
      const [x, y] = at(i, o1);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let i = points.length - 1; i >= 0; i--) g.lineTo(...at(i, o2));
    g.closePath();
    g.fill('nonzero');
  }
}

export default {
  name: 'ribbon',

  init() {
    window.addEventListener('resize', fit);
  },

  update(ctx, dt) {
    const { pet } = ctx;
    const want = pet.look.accessories.includes(VALUE);
    if (want !== on) {
      on = want;
      if (on) makeCanvas(ctx);
      else removeCanvas();
    }
    if (!on || !canvas) return;
    const now = performance.now() / 1000;
    // His middle (the ribbon comes out from behind him).
    const here = { x: pet.x + pet.size / 2, y: pet.y + (pet.bob || 0) + pet.size * 0.55, t: now };
    const lastP = points[points.length - 1];
    if (pet.mode === 'shop') {
      // Display box: flow out sideways from where he stands.
      for (const p of points) p.x += SHOP_DRIFT * dt;
      points.push(here);
    } else if (pet.mode === 'goodbye' || pet.mode === 'intro') {
      // no new ribbon
    } else if (lastP && Math.hypot(here.x - lastP.x, here.y - lastP.y) > pet.size * 5) {
      points = [here]; // he jumped (Find Starby, a reset): start a new ribbon, don't streak across
    } else if (!lastP || Math.hypot(here.x - lastP.x, here.y - lastP.y) >= STEP) {
      points.push(here);
    } else {
      lastP.x = here.x; // standing still: keep the front end under him
      lastP.y = here.y;
    }
    // Drop points older than LIFE: the tail disappears piece by piece.
    while (points.length && now - points[0].t > LIFE) points.shift();
    draw(pet.size);
  },
};
