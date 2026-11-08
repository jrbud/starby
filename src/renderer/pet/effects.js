// Effects: short hand-drawn animations played on the stage (art in assets/effects/, by the team).
// Each effect is a pair of frames (name1.png / name2.png) swapped quickly, like Starby's own
// frames, fading in at the start and out at the end, then removed.
//
//   const fx = createEffects({ stage, petEl });
//   fx.play('impact', { x, y, size, rotate, mirror, life: 0.45, every: 0.07, front: true });
//   fx.update(dt)   // every frame (behaviors/fx.js calls it)
//
// x, y      where the CENTER of the effect goes (screen px)
// size      width/height of the effect in css px (the art is square, 2048×2048)
// rotate    degrees; mirror: flip horizontally (e.g. an impact drawn for a right-hand wall)
// drift     { x, y } px the effect floats over its life; grow: scale change over its life
// front     drawn in front of Starby (default: behind him)
// Like everything else on the stage, effects never block clicks (pointer-events: none).

const ART = 2048;
const ART_DIR = '../../../assets/effects'; // relative to src/renderer/pet/index.html
const FADE_IN = 0.06; // seconds
const FADE_OUT = 0.4; // fraction of the life spent fading out
const PX = Math.max(2, window.devicePixelRatio || 1);
const RES = 256; // art is shrunk once to this (plenty for effects shown at ~50–150px)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

export function createEffects({ stage, petEl }) {
  const art = new Map(); // 'impact1' → image | null | Promise
  const live = []; // { el, frames, t, life, every, x, y, size, rotate, mirror, drift, grow, shown }

  function load(file) {
    if (!art.has(file)) {
      art.set(file, loadImage(`${ART_DIR}/${file}.png`)
        .then((img) => createImageBitmap(img, { resizeWidth: RES, resizeHeight: RES, resizeQuality: 'high' }).catch(() => img))
        .then((im) => { art.set(file, im); return im; })
        .catch(() => { art.set(file, null); return null; }));
    }
    return art.get(file);
  }
  const ready = (file) => { const v = art.get(file); return v && !(v instanceof Promise) ? v : null; };

  return {
    /** Start loading effects up front so the first one doesn't pop in late. */
    preload(names) {
      for (const n of names) { load(`${n}1`); load(`${n}2`); }
    },

    play(name, { x, y, size, rotate = 0, mirror = false, life = 0.5, every = 0.08, drift = { x: 0, y: 0 }, grow = 0, front = false }) {
      const frames = [`${name}1`, `${name}2`];
      frames.forEach(load);
      const el = document.createElement('canvas');
      el.width = Math.ceil(size * PX);
      el.height = Math.ceil(size * PX);
      Object.assign(el.style, {
        position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size}px`,
        pointerEvents: 'none', opacity: '0', willChange: 'transform, opacity',
      });
      el.className = 'effect';
      el.dataset.fx = name; // which effect (handy in DevTools)
      if (front) stage.appendChild(el);
      else stage.insertBefore(el, petEl); // behind him
      live.push({ el, frames, t: 0, life, every, x, y, size, rotate, mirror, drift, grow, shown: null });
    },

    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const fx = live[i];
        fx.t += dt;
        if (fx.t >= fx.life) {
          fx.el.remove();
          live.splice(i, 1);
          continue;
        }
        // Frame 1 / 2, swapped every `every` seconds.
        const file = fx.frames[Math.floor(fx.t / fx.every) % 2];
        const img = ready(file) || ready(fx.frames[0]);
        if (img && fx.shown !== file) {
          const g = fx.el.getContext('2d');
          g.clearRect(0, 0, fx.el.width, fx.el.height);
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, fx.el.width, fx.el.height);
          fx.shown = file;
        }
        const p = fx.t / fx.life;
        const fadeIn = Math.min(1, fx.t / FADE_IN);
        const fadeOut = p > 1 - FADE_OUT ? (1 - p) / FADE_OUT : 1;
        const scale = 1 + fx.grow * p;
        const cx = fx.x + fx.drift.x * p;
        const cy = fx.y + fx.drift.y * p;
        fx.el.style.opacity = (fadeIn * fadeOut).toFixed(3);
        fx.el.style.transform = `translate(${cx - fx.size / 2}px, ${cy - fx.size / 2}px) `
          + `rotate(${fx.rotate}deg) scale(${(fx.mirror ? -1 : 1) * scale}, ${scale})`;
      }
    },

    /** How many effects are on screen (for tests / debugging). */
    count: () => live.length,
  };
}
