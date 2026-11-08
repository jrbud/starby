// Accessories: hand-drawn PNGs in assets/accessories/ (art by the team; code only places them).
// Every accessory is drawn on the same 2048×2048 canvas as Starby's frames, so all numbers here
// are in that "art" space. Used by the pet window (pet.js, floaters.js) and the shop previews.
//
// Three kinds:
//   worn       drawn INTO his canvas right after his frame (hats, bow, halo, shoes, boots, tie,
//              lollipop), so they spin, squash and swing with him. Each sits on an ANCHOR
//              (a body point), overlapping him a little, never his face.
//   float      the balloon: floats above him on a string tied to his hand (./floaters.js)
//   companion  the UFO: flies around near him, always behind him (./floaters.js)
//   trail      the star trail: trails behind whichever way he's moving (./floaters.js)
//
// ANCHORS follow his pose: POSES below says where his head, hands, chest and feet are in every
// frame file, measured from the art (largest-blob analysis, checked by eye). Most frames are the
// same body with a different face, so they use IDLE; only real pose changes are listed.
// "lhand"/"rhand" are SCREEN left/right: he faces you, so rhand is HIS left hand.
//
// To place a worn accessory:  translate to the anchor → rotate with the anchor (head lean) →
// move by `at` → rotate by `rot` → scale → put the accessory's own `pivot` point there.
// If an anchor is busy in a frame (null, e.g. his left hand covers his mouth when yawning),
// the accessory moves to `fallback` (mirrored), e.g. the lollipop changes hands.
import { FEET_PADDING, alignFor } from './frames.js';

const ART = 2048;
const FEET_SHIFT = ART * FEET_PADDING; // frames are drawn this far down (feet on the canvas bottom)
const ART_DIR = '../../../assets/accessories'; // relative to src/renderer/<pet|shop>/index.html

// ---- Where his body is, per frame file (raw art coords, before frame alignment) ----
// head: [x, y, lean°] = tip of his top point. chest: just below his mouth (tie knot).
const IDLE = {
  head: [1003, 160, 0],
  lhand: [156, 1223],
  rhand: [1840, 1144],
  chest: [1013, 1150],
  lfoot: [832, 1896],
  rfoot: [1230, 1900],
};
const POSES = {
  'idle-2': { lhand: [72, 878], rhand: [1928, 890] }, // both arms up
  'talk-1': { rhand: [1928, 890] }, // waving with his left hand
  'talk-2': { rhand: [1928, 890] },
  'yawn-1': { rhand: null }, // his left hand covers his mouth
  'yawn-2': { rhand: null },
  'asleep-1': { head: [1004, 188, 0], lhand: [256, 1313], rhand: [1792, 1264], chest: [1004, 1190] },
  'asleep-2': { head: [1003, 165, 0], lhand: [256, 1313], rhand: [1792, 1264], chest: [1004, 1180] },
  'dizzy-1': { head: [1047, 164, 4], lhand: [148, 1172], rhand: [1832, 1183], lfoot: [781, 1880], rfoot: [1175, 1912] },
  'dizzy-2': { head: [970, 160, -4], lhand: [168, 1257], rhand: [1848, 1113], lfoot: [868, 1904], rfoot: [1268, 1884] },
  down: { head: [989, 252, 0], lhand: [112, 1174], rhand: [1880, 1113], chest: [1007, 1190] },
  'up-1': { head: [997, 80, 0], lhand: [212, 1241], rhand: [1788, 1179], chest: [1009, 1110] },
  left: { head: [1165, 128, 12], lhand: [356, 1222], rhand: [1820, 1088], chest: [1060, 1120], lfoot: [1048, 1876], rfoot: [1345, 1864] },
  right: { head: [1011, 128, -12], lhand: [356, 1088], rhand: [1820, 1222], chest: [1110, 1120], lfoot: [831, 1864], rfoot: [1128, 1876] },
};

/**
 * An anchor in FRAME space: art units from the top-left of his 2048 frame box, after the frame's
 * alignment shift and feet shift (i.e. exactly where it is on the drawn frame).
 * → { x, y, rot } (rot in degrees), or null if that body part is busy in this frame.
 */
export function anchorAt(file, name) {
  const pose = POSES[file] || {};
  const raw = name in pose ? pose[name] : IDLE[name];
  if (!raw) return null;
  const [dx, dy] = alignFor(file);
  return { x: raw[0] + dx, y: raw[1] + dy + FEET_SHIFT, rot: raw[2] || 0 };
}

// ---- The accessories ----
// rect: part of the art to draw (default: whole canvas). pivot: point of the accessory that
// sits on the anchor. at: offset from the anchor (art units). scale/rot: size and tilt.
export const ACCESSORIES = {
  // Hats: brim/cap bottom sits just above his eyes, covering the top of his point.
  tophat: {
    kind: 'worn', file: 'top hat',
    parts: [{ anchor: 'head', pivot: [1000, 840], at: [0, 250], scale: 0.78 }],
  },
  propeller: {
    kind: 'worn', file: 'propeller hat',
    parts: [{ anchor: 'head', pivot: [972, 870], at: [0, 215], scale: 0.72 }],
  },
  bow: {
    kind: 'worn', file: 'bow', // perched on the top-left of his point, tilted
    parts: [{ anchor: 'head', pivot: [784, 330], at: [-70, 130], scale: 0.56, rot: -22 }],
  },
  halo: {
    kind: 'worn', file: 'halo', bob: 30, // bobs ever so slightly above his head
    parts: [{ anchor: 'head', pivot: [994, 214], at: [0, -30], scale: 0.62 }],
  },
  // Shoes: one per foot (so each follows its own foot), soles level with his foot tips,
  // covering the ends of his legs.
  sneakers: {
    kind: 'worn', file: 'basketball shoes',
    parts: [
      { anchor: 'lfoot', rect: [466, 1504, 553, 493], pivot: [742, 1990], at: [-26, 8], scale: 0.84 },
      { anchor: 'rfoot', rect: [1019, 1506, 553, 447], pivot: [1295, 1946], at: [26, 8], scale: 0.84 },
    ],
  },
  boots: {
    kind: 'worn', file: 'boots',
    parts: [
      { anchor: 'lfoot', rect: [440, 1456, 575, 557], pivot: [727, 2006], at: [-26, 8], scale: 0.84 },
      { anchor: 'rfoot', rect: [1015, 1468, 575, 521], pivot: [1302, 1982], at: [26, 8], scale: 0.84 },
    ],
  },
  tie: {
    kind: 'worn', file: 'tie', // knot just below his mouth
    parts: [{ anchor: 'chest', pivot: [1067, 950], at: [0, 10], scale: 0.55 }],
  },
  lollipop: {
    kind: 'worn', file: 'lollipop', // in HIS left hand (screen right); switches hands when that one is busy
    parts: [{ anchor: 'rhand', fallback: 'lhand', pivot: [990, 1420], at: [-10, 20], scale: 0.55, rot: 18 }],
  },
  balloon: {
    kind: 'float', file: 'balloon', hand: 'lhand', fallbackHand: 'rhand',
    crop: [1136, 142, 743, 1061], knot: [1560, 1196], scale: 1.1,
  },
  ufo: {
    kind: 'companion', file: 'ufo',
    crop: [164, 592, 1691, 1013], scale: 0.75,
  },
  startail: {
    kind: 'trail', file: 'startail',
    crop: [34, 970, 929, 703], attach: [962, 1330], scale: 1.3, // attach = the trail's front end
  },
};

export const accessoryDef = (value) => ACCESSORIES[value] || null;

// ---- Loading ----
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** Loads accessory art, shrunk once to `px` per 2048 (like frames.js). */
export function createAccessoryArt(px) {
  const cache = new Map(); // file → image | null | Promise
  async function load(file) {
    if (!cache.has(file)) {
      cache.set(file, loadImage(`${ART_DIR}/${encodeURIComponent(file)}.png`)
        .then(async (img) => {
          try {
            return await createImageBitmap(img, { resizeWidth: px, resizeHeight: px, resizeQuality: 'high' });
          } catch {
            return img; // full size still works, just slower to draw
          }
        })
        .then((im) => { cache.set(file, im); return im; })
        .catch(() => { cache.set(file, null); return null; }));
    }
    return cache.get(file);
  }
  return {
    async loadAll() {
      for (const def of Object.values(ACCESSORIES)) await load(def.file); // one at a time (memory)
    },
    load,
    get(file) {
      const v = cache.get(file);
      return v && !(v instanceof Promise) ? v : null;
    },
  };
}

// ---- Drawing worn accessories ----
const rad = (deg) => (deg * Math.PI) / 180;

/** Draw part of a 2048-space image (`rect` in art units) at art coords on `g`. */
function drawArt(g, img, rect) {
  const s = img.width / ART;
  const [x, y, w, h] = rect || [0, 0, ART, ART];
  g.drawImage(img, x * s, y * s, w * s, h * s, x, y, w, h);
}

/**
 * Draw the worn accessories among `values` (e.g. ['tophat']) for frame `file`.
 * `g` must already be in FRAME art space (1 unit = 1 art px, origin = his frame box top-left).
 * `t` = seconds, for the halo's bob.
 */
export function drawWorn(g, art, values, file, t) {
  for (const value of values) {
    const def = ACCESSORIES[value];
    if (!def || def.kind !== 'worn') continue;
    const img = art.get(def.file);
    if (!img) continue;
    const bob = def.bob ? Math.sin(t * 2.2) * def.bob : 0;
    for (const part of def.parts) {
      let a = anchorAt(file, part.anchor);
      let mirror = 1;
      if (!a && part.fallback) {
        a = anchorAt(file, part.fallback);
        mirror = -1; // the other hand: mirror the offset and the art
      }
      if (!a) continue;
      g.save();
      g.translate(a.x, a.y);
      g.rotate(rad(a.rot));
      g.translate(part.at[0] * mirror, part.at[1] + bob);
      g.rotate(rad((part.rot || 0) * mirror));
      g.scale(part.scale * mirror, part.scale);
      g.translate(-part.pivot[0], -part.pivot[1]);
      drawArt(g, img, part.rect);
      g.restore();
    }
  }
}

// How far (art units) worn accessories may stick out of his 2048 frame box, so the canvas can
// leave room: the lollipop in a raised hand pokes out the side, hats/halo a bit over the top.
export const OVERHANG = { top: 160, side: 280, bottom: 60 };

// ---- Still previews (shop) ----
const STRING_COLOR = '#3a2219'; // same as floaters.js

function drawCrop(g, img, crop, x, y, scale) {
  const k = img.width / ART;
  const [cx, cy, cw, ch] = crop;
  g.drawImage(img, cx * k, cy * k, cw * k, ch * k, x, y, cw * scale, ch * scale);
}

/**
 * Starby (idle-1, in `colorSet`) wearing `accessory`, fitted into `canvas`. Floating ones are
 * shown in a still pose: balloon on its string, UFO up beside him, trail streaming behind.
 * @param frames  createFrames(...) instance   @param art  createAccessoryArt(...) instance
 */
export function drawPreview(canvas, frames, art, { colorSet = 'sunny', accessory = 'none' } = {}) {
  const def = ACCESSORIES[accessory];
  const floating = def && def.kind !== 'worn';
  // What part of art space to show: floating ones need room around him.
  const view = floating ? { x: -800, y: -900, w: 3550, h: 3100 } : { x: -320, y: -160, w: 2688, h: 2280 };
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  const k = Math.min(canvas.width / view.w, canvas.height / view.h);
  g.setTransform(k, 0, 0, k, (canvas.width - view.w * k) / 2 - view.x * k, (canvas.height - view.h * k) / 2 - view.y * k);

  const img = frames.byFile(colorSet, 'idle-1') || frames.byFile('sunny', 'idle-1');
  const accImg = def ? art.get(def.file) : null;
  const center = anchorAt('idle-1', 'chest');
  // Floating ones sit behind him: draw them first.
  if (floating && accImg) {
    if (def.kind === 'float') {
      const hand = anchorAt('idle-1', def.hand);
      const knot = { x: hand.x - 380, y: hand.y - 1150 };
      g.strokeStyle = STRING_COLOR;
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hand.x, hand.y);
      g.quadraticCurveTo(hand.x - 120, hand.y - 500, knot.x, knot.y);
      g.stroke();
      const [cx, cy] = def.crop;
      drawCrop(g, accImg, def.crop, knot.x - (def.knot[0] - cx) * def.scale, knot.y - (def.knot[1] - cy) * def.scale, def.scale);
    } else if (def.kind === 'companion') {
      const [, , cw, ch] = def.crop;
      drawCrop(g, accImg, def.crop, 2250 - (cw * def.scale) / 2, -350 - (ch * def.scale) / 2, def.scale);
    } else if (def.kind === 'trail') {
      const [cx, cy] = def.crop;
      const ax = center.x - 360;
      const ay = center.y + 120;
      drawCrop(g, accImg, def.crop, ax - (def.attach[0] - cx) * def.scale, ay - (def.attach[1] - cy) * def.scale, def.scale);
    }
  }
  if (img) g.drawImage(img, 0, 0, ART, ART);
  if (def && !floating) drawWorn(g, art, [accessory], 'idle-1', 0);
}
