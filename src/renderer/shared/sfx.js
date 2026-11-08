// Sound effects: the team's clips in assets/sounds/, played at the volume chosen in Settings
// (settingsStore.sfxVolume 0–100, sfxMuted 1 = silent). Any renderer window can use it:
//
//   import { sfx } from '../shared/sfx.js';
//   sfx.play('chat');              // one clip
//   sfx.play('collect-starbit');   // a group: picks one of collect-starbit-1/2/3 at random
//
// Volume and mute follow Settings live (every window gets 'settings:changed'), so callers never
// check them. Clips overlap freely: each play() uses a fresh copy of the preloaded clip.
//
// Where each sound is played (keep this list current when hooking up new ones):
//   chat             pet/bubble.js say(): he says something that needs no answer (not dreams)
//   prompt           pet/dialogue/dialogue.js showNode(): dialogue tree steps + event questions
//   collect-starbit  pet/behaviors/starbits.js collect(): one of the 3 clips at random
//   launch           pet/events/intro.js showTitle(): the title card at app launch
//   exit             pet/behaviors/goodbye.js: quitting (exclusive, so his bye line is quiet)
//
// SOUND names (add a new file to assets/sounds/ and list it here):
const SOUNDS = {
  chat: ['chat'],
  'collect-starbit': ['collect-starbit-1', 'collect-starbit-2', 'collect-starbit-3'],
  exit: ['exit'],
  launch: ['launch'],
  prompt: ['prompt'],
};

// Resolved from this file, so it works from any window (pet, shop, settings...).
const url = (file) => new URL(`../../../assets/sounds/${file}.mp3`, import.meta.url).href;

const clips = new Map(); // file → preloaded <audio>
function clip(file) {
  if (!clips.has(file)) {
    const audio = new Audio(url(file));
    audio.preload = 'auto';
    clips.set(file, audio);
  }
  return clips.get(file);
}

let volume = 0.7; // 0–1, after mute
function applySettings(settings) {
  if (!settings) return;
  const v = Number(settings.sfxVolume);
  const pct = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70;
  volume = Number(settings.sfxMuted) === 1 ? 0 : pct / 100;
}

const api = typeof window !== 'undefined' ? window.sprite : null;
// Sounds asked for before the saved volume arrives (e.g. launch.mp3 right at startup) wait for
// it, so a muted user never hears a blip at the default volume.
let settingsLoaded = false;
const settingsReady = (api?.getSettings?.() ?? Promise.resolve(null))
  .then(applySettings)
  .catch(() => {})
  .finally(() => { settingsLoaded = true; });
api?.onSettingsChanged?.(applySettings);

// While an `exclusive` sound plays (exit.mp3 during the goodbye), other sounds are skipped,
// e.g. the chat blip of his goodbye line.
let exclusiveUntil = 0;

function start(name, files, scale, exclusive) {
  if (volume <= 0) return;
  const now = performance.now();
  if (now < exclusiveUntil) return;
  const file = files[Math.floor(Math.random() * files.length)];
  const audio = clip(file).cloneNode();
  audio.volume = Math.max(0, Math.min(1, volume * scale));
  if (exclusive) {
    exclusiveUntil = now + 3000; // until we know the clip's real length
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) exclusiveUntil = now + audio.duration * 1000;
    }, { once: true });
  }
  audio.play().catch(() => { /* e.g. file missing: stay silent rather than throw */ });
}

export const sfx = {
  /**
   * Play a sound by name (see SOUNDS). Unknown names and blocked playback are ignored.
   * opts.volume: 0–1 extra scale for this play. opts.exclusive: no other sound until it ends.
   */
  play(name, { volume: scale = 1, exclusive = false } = {}) {
    const files = SOUNDS[name];
    if (!files) return;
    if (settingsLoaded) start(name, files, scale, exclusive);
    else settingsReady.then(() => start(name, files, scale, exclusive));
  },
  /** Preload some (or all) sounds so the first play has no delay. */
  preload(names = Object.keys(SOUNDS)) {
    for (const name of names) for (const file of SOUNDS[name] || []) clip(file);
  },
  /** For Settings: apply a volume right away (before the save round-trips). */
  setVolume(pct, muted = false) { applySettings({ sfxVolume: pct, sfxMuted: muted ? 1 : 0 }); },
  names: Object.keys(SOUNDS),
};
