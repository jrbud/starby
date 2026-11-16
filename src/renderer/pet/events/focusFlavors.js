// FOCUS FLAVORS: what Starby is up to while he sits in focus mode (./focus.js), depending on what
// you're doing. Plain focus = calm, quiet, idle animations. A flavor swaps in:
//   face     a frames.js face shown while he's parked (until its art exists, frames.js falls back
//            to 'calm', so it already works with no new PNGs)
//   start    what he says when this flavor STARTS focus by itself (e.g. you opened a game)
//   click    his answer when you left-click him (instead of the study lines)
//   murmur   now and then, unprompted, even though he's hushed (every MURMUR_EVERY seconds)
//   when(s)  is it on? s = { inCall, fullscreen, gaming, category, key } (see ./focus.js)
// The first flavor in FLAVORS whose when() is true wins; none → plain focus. Flavors are checked
// live, so if you fullscreen a YouTube video while in a focus you started, he grabs his popcorn.
//
// TO ADD A FLAVOR: add an entry here + its face in ../frames.js FACES (with `fallback: 'calm'`).
// If it needs a new kind of app/site, add its key in src/main/systemReads/activeWindow.js
// (APP_KEYS for programs, SITE_KEYS for browser tabs).
import { lineBag } from '../behaviors/chatter.js';

export const MURMUR_EVERY = [90, 180]; // seconds between unprompted lines while flavored ([] = never)

// activeWindow.js keys that mean "a video": sites (browser tab title) and video player apps.
const VIDEO_KEYS = [
  'youtube', 'netflix', 'twitch', 'disneyplus', 'primevideo', 'hulu', 'crunchyroll',
  'vlc', 'mpc', 'mpv', 'potplayer', 'movies', 'mediaplayer',
];
// Game launchers are category 'game' too, but opening Steam isn't playing yet.
export const LAUNCHER_KEYS = ['steam', 'epic', 'battlenet', 'riot', 'league-client'];

export const FLAVORS = {
  // A fullscreen video: he settles in with popcorn.
  watching: {
    face: 'watching', // frames.js: watching-1 / watching-2 (popcorn)
    when: (s) => !s.inCall && s.fullscreen && VIDEO_KEYS.includes(s.key),
    start: lineBag(['ooh, movie time! where did i put my popcorn...']), // (fullscreen starts silently, so rarely heard)
    click: lineBag(['shh, it\'s getting good', '*munch* ...hm?', 'want some popcorn?', 'no spoilers!', '*crunch crunch*']),
    murmur: lineBag([
      'mmmmmm...', 'wow...', 'interesting...', '*munch munch*', 'ooh, plot twist?', "who's that?",
      '*crunch*', "i saw that coming. i've seen everything.", 'this is the best part', 'oooh...',
    ]),
  },
  // A game window (fullscreen or not): he grabs a controller and "plays along".
  gamer: {
    face: 'gaming', // frames.js: gamer-1 / gamer-2 (controller in hand)
    when: (s) => !s.inCall && s.gaming,
    start: lineBag(['game time? lemme grab my controller!', 'ooh, gaming! player two, ready!', "game on! i'll be over here, playing too"]),
    click: lineBag(["shh, i'm in the zone", 'not now, boss fight!', "i'm player two!", 'pause? no? okay', 'did i win?']),
    murmur: lineBag([
      'yo, is my controller unplugged?', 'wait, which one am i?', "i'm pressing all the buttons and nothing's happening",
      "you're so good at this!", 'ooh, nice move!', "i think my controller's broken... or i'm just bad",
      "i'm helping! ...i think", 'wait, are we winning?', 'can i be player one next?',
    ]),
  },
};

/** The flavor (FLAVORS entry, with its `name`) for this state, or null for plain focus. */
export function flavorFor(state) {
  for (const [name, f] of Object.entries(FLAVORS)) {
    if (f.when(state)) return { name, ...f };
  }
  return null;
}
