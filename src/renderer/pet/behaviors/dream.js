// DREAMS (Person 3): while Starby is asleep (mood 'sleepy'), every so often he dreams something,
// shown in the team's THOUGHT CLOUD above him (../bubble.js showContent, style 'think'; the cloud's
// little dots trail down to his head; same one-bubble-at-a-time rule as his speech):
//   - an accessory from the shop (top hat, bow, lollipop, ufo...), wiggling and shaking
//   - or a little row of starbits, bouncing and jiggling
// Only the team's existing art (assets/accessories/, assets/starbits/); the empty canvas around
// each item is trimmed at load so it fills the bubble. Nothing is drawn by code.
//
// SLEEP-TALK: about a third of the time, instead of a dream he murmurs something in his speech
// bubble: themed lines ("mmm... starbits...", "zzz... io... io..."), or about what he just dreamed
// ("mmm... top hat..."). It's the only thing he says while asleep: everything else is muted
// (mood.js speech gate), so these go through bubble.say(..., { force: true }).
//
// No dreams while he's being carried, during hush (calls / fullscreen) or while he's speaking.
// Logged as 'dream' { kind, item } / 'sleep-talk' { line }. DevTools: starby.dream() dreams right now
// (even awake), starby.sleepTalk() murmurs.
import { ACCESSORIES } from '../accessories.js';
import { starbitImages } from '../../shared/starbitArt.js';
import { rand } from './motion.js';
import { speechBubble } from '../bubble.js';

// ---- Tuning ----
const FIRST_DREAM = [5, 10]; // seconds after falling asleep
const DREAM_EVERY = [10, 18]; // seconds between dreams (after one ends)
const DREAM_FOR = 4.5; // seconds a dream stays up
const STARBIT_CHANCE = 0.4; // otherwise an accessory
const SLEEP_TALK_CHANCE = 0.35; // each turn: a sleep-talk line instead of a dream
const ABOUT_DREAM_CHANCE = 0.5; // ...and half of those are about the last thing he dreamed
const SLEEP_TALK_FOR = 3; // seconds
const SLEEP_TALK = [
  'mmm... starbits...',
  'zzz... so many starbits...',
  'no... those are MY starbits...',
  'five more minutes... of space...',
  'mmm... io... io...',
  'zzz... the moon is a little dusty...',
  'mmm... martians... party...',
  'wheee... light speed... zzz',
  'shooting star... make a wish... zzz',
];
const ABOUT_DREAM = (thing) => [`mmm... ${thing}...`, `zzz... my ${thing}...`, `so shiny... ${thing}... zzz`];
const ITEM_SIZE = 44; // px: an accessory fits in this square
const STARBIT_SIZE = 18; // px each, three in a row
const ACCESSORY_DIR = '../../../assets/accessories'; // relative to src/renderer/pet/index.html

const ACCESSORY_FILES = [...new Set(Object.values(ACCESSORIES).map((a) => a.file).filter(Boolean))];
const trimmed = new Map(); // url → Promise<canvas | null>

let nextDreamAt = null; // session seconds
let dreamingUntil = 0;
let lastDreamed = null; // what he dreamed last ('top hat', 'starbits'), for sleep-talk

// The shop's name for an accessory art file ('propeller hat' → 'toy hat'), for sleep-talk.
function shopName(ctx, file) {
  const key = Object.keys(ACCESSORIES).find((k) => ACCESSORIES[k].file === file);
  const item = (ctx.catalog || []).find((i) => i.value === key);
  return (item ? item.name : file).toLowerCase();
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Load an image, crop away its transparent margin, and shrink it to fit `size` (css px).
function trimmedArt(url, size) {
  const key = `${url}@${size}`;
  if (!trimmed.has(key)) {
    trimmed.set(key, (async () => {
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch { return null; }
      // Find the art's bounds on a small copy (fast), then crop the full image to them.
      const probe = document.createElement('canvas');
      const P = 256;
      probe.width = P;
      probe.height = P;
      const pg = probe.getContext('2d', { willReadFrequently: true });
      pg.drawImage(img, 0, 0, P, P);
      const { data } = pg.getImageData(0, 0, P, P);
      let l = P; let t = P; let r = -1; let b = -1;
      for (let y = 0; y < P; y++) {
        for (let x = 0; x < P; x++) {
          if (data[(y * P + x) * 4 + 3] > 24) {
            if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
          }
        }
      }
      if (r < 0) return null;
      const k = img.naturalWidth / P;
      const sx = Math.max(0, (l - 1) * k); const sy = Math.max(0, (t - 1) * k);
      const sw = Math.min(img.naturalWidth - sx, (r - l + 3) * k);
      const sh = Math.min(img.naturalHeight - sy, (b - t + 3) * k);
      const scale = size / Math.max(sw, sh);
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const dpr = Math.max(2, window.devicePixelRatio || 1);
      const c = document.createElement('canvas');
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      Object.assign(c.style, { width: `${w}px`, height: `${h}px`, display: 'block' });
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    })());
  }
  return trimmed.get(key);
}

// A copy of a prepared canvas (the cached one may still be in an old bubble).
function copyOf(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.style.cssText = src.style.cssText;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// Wiggle (a slow rock + bob) and a little shake every so often, like it's alive in his dream.
function wiggle(el, phase = 0, strength = 1) {
  el.animate(
    [
      { transform: `rotate(${-10 * strength}deg) translateY(1px)` },
      { transform: `rotate(${10 * strength}deg) translateY(${-3 * strength}px)` },
    ],
    { duration: 620, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', delay: -phase * 620 },
  );
}
function shake(el) {
  el.animate(
    [
      { translate: '0 0', offset: 0 }, { translate: '0 0', offset: 0.72 },
      { translate: '-2px 0', offset: 0.78 }, { translate: '2px -1px', offset: 0.84 },
      { translate: '-2px 1px', offset: 0.9 }, { translate: '1px 0', offset: 0.95 },
      { translate: '0 0', offset: 1 },
    ],
    { duration: 1300, iterations: Infinity },
  );
}

async function dream(ctx, { force = false } = {}) {
  const bubble = speechBubble();
  if (!bubble) return false;
  const box = document.createElement('div');
  Object.assign(box.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' });
  let w;
  let h;
  let kind;
  let item;
  if (Math.random() < STARBIT_CHANCE) {
    kind = 'starbits';
    const urls = [pick(starbitImages()), pick(starbitImages()), pick(starbitImages())];
    const arts = await Promise.all(urls.map((u) => trimmedArt(u, STARBIT_SIZE)));
    if (arts.some((a) => !a)) return false;
    arts.forEach((a, i) => {
      const c = copyOf(a);
      box.appendChild(c);
      wiggle(c, i / 3, 0.8); // each bounces on its own beat
    });
    item = urls.map((u) => u.split('/').pop().replace('.png', '')).join(',');
    w = STARBIT_SIZE * 3 + 8;
    h = STARBIT_SIZE + 6;
  } else {
    kind = 'accessory';
    item = pick(ACCESSORY_FILES);
    const art = await trimmedArt(`${ACCESSORY_DIR}/${item}.png`, ITEM_SIZE);
    if (!art) return false;
    const c = copyOf(art);
    box.appendChild(c);
    wiggle(c);
    w = ITEM_SIZE;
    h = ITEM_SIZE;
  }
  shake(box);
  // Still asleep (and not talking) after loading? Then show it.
  if (!force && (ctx.pet.mood !== 'sleepy' || ctx.isSpeaking())) return false;
  if (!bubble.showContent(box, w, h, DREAM_FOR * 1000, 'think')) return false;
  dreamingUntil = ctx.clock.seconds + DREAM_FOR;
  lastDreamed = kind === 'starbits' ? 'starbits' : shopName(ctx, item);
  ctx.log('dream', { kind, item });
  return true;
}

// A murmur in his sleep (the only speech allowed while he's asleep).
function sleepTalk(ctx) {
  const bubble = speechBubble();
  if (!bubble) return false;
  const pool = lastDreamed && Math.random() < ABOUT_DREAM_CHANCE ? ABOUT_DREAM(lastDreamed) : SLEEP_TALK;
  const line = pick(pool);
  bubble.say(line, SLEEP_TALK_FOR * 1000, { force: true });
  dreamingUntil = ctx.clock.seconds + SLEEP_TALK_FOR;
  ctx.log('sleep-talk', { line });
  return true;
}

export default {
  name: 'dream',

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.dream = () => { dream(ctx, { force: true }); return 'dreaming'; };
      window.starby.sleepTalk = () => { sleepTalk(ctx); return 'mumbling'; };
    }
  },

  onTick(ctx) {
    const { pet } = ctx;
    const now = ctx.clock.seconds;
    if (pet.mood !== 'sleepy') { nextDreamAt = null; lastDreamed = null; return; }
    if (nextDreamAt === null) nextDreamAt = now + rand(...FIRST_DREAM); // just fell asleep
    if (now < nextDreamAt || now < dreamingUntil) return;
    if (pet.mode === 'drag' || pet.mode === 'toss' || pet.hushed || ctx.isSpeaking()) {
      nextDreamAt = now + 2; // try again in a moment
      return;
    }
    nextDreamAt = now + DREAM_FOR + rand(...DREAM_EVERY);
    if (Math.random() < SLEEP_TALK_CHANCE) sleepTalk(ctx);
    else dream(ctx);
  },
};
