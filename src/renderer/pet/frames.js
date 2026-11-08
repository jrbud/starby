// Starby's hand-drawn PNG frames: which files make up each face, how fast they alternate,
// and loading them. pet.js draws whatever pet.face is (mood.js decides that every frame).
//
// Art lives in assets/sprite/<color set>/ with flat file names. Two frames (name-1, name-2)
// alternate like a GIF at the face's `every` interval; single files are held still.
// Color sets: one folder per shop color (sunny = default). A file missing from a color set
// falls back to the same file from sunny, so sets can be filled in gradually.
//
// The art is drawn on a 2048×2048 canvas; Starby is shown at ~64px. Each frame is shrunk ONCE
// when it loads (createImageBitmap, high quality), so we never keep ~370MB of full-size
// images around and never resample 2048px every frame. The files themselves are never changed.
//
// Every effect (squash/stretch, spin, swing, impact freeze, hops) is a CSS transform on the
// canvas in pet.js, so it applies to these PNGs exactly like it did to the old drawn star.

const SPRITE_DIR = '../../../assets/sprite'; // relative to src/renderer/pet/index.html
export const DEFAULT_SET = 'sunny';

// face (pet.face) → files and seconds per frame. Faster for busy faces, slow for sleep.
export const FACES = {
  happy: { files: ['idle-1', 'idle-2'], every: 0.6 }, // default: standing, content
  talking: { files: ['talk-1', 'talk-2'], every: 0.2 }, // mouth flapping
  playful: { files: ['happy-1', 'happy-2'], every: 0.35 }, // playing / thrown / tag (tongue out)
  mad: { files: ['mad-1', 'mad-2'], every: 0.4 },
  sad: { files: ['mad-1', 'mad-2'], every: 0.5 }, // said no to tag: grumpy for a bit, not truly mad
  dizzy: { files: ['dizzy-1', 'dizzy-2'], every: 0.3 },
  yawning: { files: ['yawn-1', 'yawn-2'], every: 0.8 },
  sleepy: { files: ['asleep-1', 'asleep-2'], every: 1.0 }, // slow and peaceful
  glistening: { files: ['kawaii-1', 'kawaii-2'], every: 0.3 }, // random sparkly-eyed moment
  dragged: { files: ['nervousexcited'] },
  wink: { files: ['wink'] }, // random wink
  up: { files: ['up-1'] }, // cursor right above him, or watching a star shower
  down: { files: ['down'] }, // cursor right below him
  left: { files: ['left'] }, // normal and walking left
  right: { files: ['right'] }, // normal and walking right
};

// ---- Lining the frames up ----
// All numbers are in the art's own 2048px canvas, measured from the PNGs (not guessed).
//
// FEET_Y: in the reference frame (idle-1), the bottom of his feet is at y=1900, leaving 147px
// of empty canvas below. Every frame is shifted down by that much, so his feet touch the
// bottom edge of our canvas: squash/stretch pivots from his feet (pet.css), and he stands
// right on the taskbar instead of hovering above it.
const ART_SIZE = 2048;
const FEET_Y = 1900;

// Per-file shifts [dx, dy] so every frame's feet land on the same spot as idle-1's, and
// swapping faces never makes him jump. Most frames are the same body with a different face,
// so they need nothing. Measured: bottom of the feet, and the middle of the legs (lowest 320px).
//   left/right: leaning walk poses, drawn slightly higher and (left) off-center.
//   dizzy: only lined up vertically; the sideways leg sway between the 2 frames IS the animation.
// If the art is redrawn, re-measure (the feet should stay at y=1900, legs centered at x≈1000).
const ALIGN = {
  left: [-150, 21],
  right: [-26, 21],
  'dizzy-1': [0, -15],
  'dizzy-2': [0, -5],
};
export const alignFor = (file) => ALIGN[file] || [0, 0];
export const FEET_PADDING = (ART_SIZE - 1 - FEET_Y) / ART_SIZE;

const allFiles = () => [...new Set(Object.values(FACES).flatMap((f) => f.files))];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

// Shrink once to `px`×`px`, already lined up (ALIGN) and with his feet on the bottom edge
// (FEET_PADDING), so pet.js just draws the result at 0,0. createImageBitmap's high-quality
// resize gives smooth edges on a 2048 → ~128 shrink; drawing straight from the full image is
// the fallback.
async function shrink(img, px, file) {
  const [dx, dy] = alignFor(file);
  const scale = px / ART_SIZE;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const x = dx * scale;
  const y = (dy + ART_SIZE * FEET_PADDING) * scale;
  try {
    const small = await createImageBitmap(img, { resizeWidth: px, resizeHeight: px, resizeQuality: 'high' });
    g.drawImage(small, x, y, px, px);
    small.close?.();
  } catch {
    g.drawImage(img, x, y, px, px);
  }
  return c;
}

/**
 * @param {number} px  size to shrink each frame to (the canvas's internal resolution)
 */
export function createFrames(px) {
  const cache = new Map(); // `${set}/${file}` → image | null (missing) | Promise

  function loadOne(set, file) {
    const key = `${set}/${file}`;
    if (!cache.has(key)) {
      cache.set(key, loadImage(`${SPRITE_DIR}/${set}/${file}.png`)
        .then((img) => shrink(img, px, file))
        .then((frame) => { cache.set(key, frame); return frame; })
        .catch(() => { cache.set(key, null); return null; })); // missing → fall back to sunny
    }
    return cache.get(key);
  }

  // One at a time, so we never hold many full-size 2048px images in memory at once.
  async function loadFiles(set, files) {
    for (const f of files) await loadOne(set, f);
  }

  const ready = (v) => (v && !(v instanceof Promise) ? v : null);
  const getExact = (set, file) => ready(cache.get(`${set}/${file}`));
  const get = (set, file) => getExact(set, file) || getExact(DEFAULT_SET, file);

  return {
    /** Load the default face first (so he can appear right away), then everything else. */
    async loadEssentials(set = DEFAULT_SET) {
      await loadFiles(set, FACES.happy.files);
    },
    async loadAll(set = DEFAULT_SET) {
      await loadFiles(set, allFiles());
    },

    /**
     * The frame to show for `face` after it's been on screen for `elapsed` seconds:
     * { img, file } (file = which PNG, e.g. 'idle-2', so accessories can follow that pose),
     * or null if nothing is loaded yet. Faces whose frames aren't loaded (yet) fall back to happy.
     */
    pick(face, set, elapsed) {
      for (const name of [face, 'happy']) {
        const def = FACES[name];
        if (!def) continue;
        const i = def.every ? Math.floor(elapsed / def.every) % def.files.length : 0;
        // Prefer this color set's own frames: if it's missing one frame of a face (e.g.
        // bubblegum has dizzy-1 but no dizzy-2), hold its other frame rather than flashing a
        // frame from another color. Only then borrow the frame from the default set.
        const tries = [...new Set([def.files[i], ...def.files])];
        for (const file of tries) {
          const img = getExact(set, file);
          if (img) return { img, file };
        }
        for (const file of [def.files[i], def.files[0]]) {
          const img = get(set, file);
          if (img) return { img, file };
        }
      }
      return null;
    },
    /** Just the image (kept for older callers). */
    frameFor(face, set, elapsed) {
      return this.pick(face, set, elapsed)?.img || null;
    },
    /** A specific file's frame (e.g. 'idle-1'), or null. */
    byFile(set, file) {
      return get(set, file);
    },
  };
}
