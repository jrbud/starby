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
//   chat             pet/bubble.js say(): he says something that needs no answer (not dreams);
//                    one of chat-1..4 at random
//   explode          pet/behaviors/fx.js wallHit(): he hits a wall hard and the impact art plays
//                    (also pong hits, which reuse it); louder the harder he hits
//   throw            pet/behaviors/drag.js mouseup: you throw him (fast enough to be a throw, not a
//                    gentle drag-and-drop); one of throw-1..4 at random
//   sling            pet/behaviors/slingshot.js release() and pet/events/hoopShot.js: you let go of a
//                    slingshot pull (not his own self-slingshot in events/focus.js)
//   prompt           pet/dialogue/dialogue.js showNode(): dialogue tree steps + event questions
//   collect-starbit  pet/behaviors/starbits.js collect(): one of the 3 clips at random
//   launch           pet/events/intro.js showTitle(): the title card at app launch
//   exit             pet/behaviors/goodbye.js: quitting (exclusive, so his bye line is quiet)
//
// SOUND names (add a new file to assets/sounds/ and list it here):
const SOUNDS = {
  chat: ['chat-1', 'chat-2', 'chat-3', 'chat-4'],
  'collect-starbit': ['collect-starbit-1', 'collect-starbit-2', 'collect-starbit-3'],
  exit: ['exit'],
  explode: ['explode'],
  launch: ['launch'],
  prompt: ['prompt'],
  throw: ['throw-1', 'throw-2', 'throw-3', 'throw-4'],
  sling: ['sling'],
};

// Per-sound loudness (1 = as recorded), applied on top of the Settings volume. Tweak here to
// balance clips against each other without re-exporting the files.
// 0 = silent, 0.5 = half as loud, 1 = as recorded.
const GAIN = {
  'collect-starbit': 0.05,
  explode: 0.6,
  chat: 0.1,
  throw: 0.1,
  sling: 0.07,
  startup: 0.1,
  exit: 0.02
};
// Sounds that always share another sound's loudness: change chat above and prompt follows.
GAIN.prompt = GAIN.chat; // his questions sound as loud as his lines
GAIN.launch = GAIN.startup; // `startup` above sets the startup sound (launch.mp3)

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

// CATEGORIES: each gets its own volume slider + on/off toggle in Settings → Sounds (built from
// this list by settings.js), on top of the "All sounds" master volume/mute. A sound plays at
//   master × category × GAIN.
// Settings keys are sfx<Id>Volume (0–200 %) and sfx<Id>On (1/0), e.g. sfxVoiceVolume / sfxVoiceOn
// (defaults in src/main/settingsStore.js). A new sound goes into one category here.
export const SOUND_CATEGORIES = [
  { id: 'Voice', label: 'Voice', hint: 'chatting and questions', sounds: ['chat', 'prompt'], sample: 'chat' },
  { id: 'Starbits', label: 'Starbits', hint: 'collecting starbits', sounds: ['collect-starbit'], sample: 'collect-starbit' },
  { id: 'Action', label: 'Action', hint: 'throws, slingshots, crashes', sounds: ['throw', 'sling', 'explode'], sample: 'throw' },
  { id: 'App', label: 'App', hint: 'startup and goodbye', sounds: ['launch', 'exit'], sample: 'launch' },
].map((c) => ({ ...c, volumeKey: `sfx${c.id}Volume`, onKey: `sfx${c.id}On` }));
const categoryOf = new Map(SOUND_CATEGORIES.flatMap((c) => c.sounds.map((s) => [s, c])));

// Slider ranges (100 = as recorded): the "All sounds" master goes 0–150 % (default 70),
// each category 0–200 % (default 100). Keep in sync with settingsStore RANGES and the sliders.
const MASTER_MAX_PCT = 150;
const MASTER_DEFAULT_PCT = 70;
const CATEGORY_MAX_PCT = 200;
const pctOf = (value, fallback, max) => {
  const v = Number(value);
  return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
};

let volume = MASTER_DEFAULT_PCT / 100; // master, 0–1.5 (0 when muted)
const categoryVolume = new Map(); // category id → 0–2 (0 when switched off)
let lastSettings = {};
function applySettings(settings) {
  if (!settings) return;
  lastSettings = { ...lastSettings, ...settings };
  const s = lastSettings;
  volume = Number(s.sfxMuted) === 1 ? 0 : pctOf(s.sfxVolume, MASTER_DEFAULT_PCT, MASTER_MAX_PCT) / 100;
  for (const c of SOUND_CATEGORIES) {
    const on = s[c.onKey] === undefined || Number(s[c.onKey]) !== 0; // missing = on (older files)
    categoryVolume.set(c.id, on ? pctOf(s[c.volumeKey], 100, CATEGORY_MAX_PCT) / 100 : 0);
  }
}
/** Master × category volume for a sound (0 = silent). Sounds in no category use the master alone. */
const volumeFor = (name) => {
  const c = categoryOf.get(name);
  return volume * (c ? categoryVolume.get(c.id) ?? 1 : 1);
};

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

// STARTUP QUIET: only the startup sound (launch) may play during the first STARTUP_QUIET_MS after
// a window opens, and again for STARTUP_QUIET_MS after launch.mp3 starts, so nothing (e.g. a chat
// blip) plays over the startup sound. Checked when a sound is ASKED for, not when it starts.
const STARTUP_QUIET_MS = 500;
const STARTUP_SOUND = 'launch';
let startupQuietUntil = performance.now() + STARTUP_QUIET_MS;

// LOUDER THAN 100 %: an <audio> element's volume stops at 1 (as recorded). When a sound's total
// level (master × category × GAIN × per-play scale) is above 1, it's routed through a Web Audio
// gain node instead, which can amplify. Below 1 the plain volume is used (no Web Audio needed).
// If Web Audio isn't available, the sound just plays at full volume.
const MAX_LEVEL = 3; // safety cap on the boost (master 150 % × category 200 % = 3×)
let audioCtx = null;
function boost(audio, level) {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(MAX_LEVEL, level);
    audioCtx.createMediaElementSource(audio).connect(gain).connect(audioCtx.destination);
    audio.volume = 1;
    return true;
  } catch {
    return false;
  }
}

// Returns a promise that resolves when the sound has finished (or right away if it didn't play).
function start(name, files, scale, exclusive) {
  const level = volumeFor(name);
  if (level <= 0) return Promise.resolve(); // muted, or its category is off / at 0
  const now = performance.now();
  if (now < exclusiveUntil) return Promise.resolve();
  if (name === STARTUP_SOUND) startupQuietUntil = Math.max(startupQuietUntil, now + STARTUP_QUIET_MS);
  const file = files[Math.floor(Math.random() * files.length)];
  const audio = clip(file).cloneNode();
  const total = Math.max(0, level * (GAIN[name] ?? 1) * scale);
  if (total <= 1 || !boost(audio, total)) audio.volume = Math.min(1, total);
  if (exclusive) {
    exclusiveUntil = now + 3000; // until we know the clip's real length
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) exclusiveUntil = now + audio.duration * 1000;
    }, { once: true });
  }
  return new Promise((done) => {
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.play().catch(done); // e.g. file missing: stay silent rather than throw
  });
}

export const sfx = {
  /**
   * Play a sound by name (see SOUNDS). Unknown names and blocked playback are ignored.
   * opts.volume: 0–1 extra scale for this play. opts.exclusive: no other sound until it ends.
   * Returns a promise for when it has finished playing (resolves at once if it didn't play), so
   * a caller can wait for it, e.g. goodbye.js keeps the window open until exit.mp3 is done.
   */
  play(name, { volume: scale = 1, exclusive = false } = {}) {
    const files = SOUNDS[name];
    if (!files) return Promise.resolve();
    if (name !== STARTUP_SOUND && performance.now() < startupQuietUntil) return Promise.resolve(); // startup quiet
    if (settingsLoaded) return start(name, files, scale, exclusive);
    return settingsReady.then(() => start(name, files, scale, exclusive));
  },
  /** Preload some (or all) sounds so the first play has no delay. */
  preload(names = Object.keys(SOUNDS)) {
    for (const name of names) for (const file of SOUNDS[name] || []) clip(file);
  },
  /** For Settings: apply changed sound settings right away (before the save round-trips). */
  applyNow(patch) { applySettings(patch); },
  names: Object.keys(SOUNDS),
};
