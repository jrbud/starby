// LIFETIME STATS (counting side): watches the session event log and reports to the main process,
// which keeps everything in stats.json (src/main/statsStore.js) for Settings → Stats.
// Counted in the main process instead: starbits collected / spent, items bought, days visited.
//
//   throws        'toss' (drag.js) released at ≥ THROW_MIN_SPEED: a real throw, not setting him down
//   slingshots    'slingshot' (slingshot.js): every release
//   wallHits      'impact' (drag.js): every bounce off a screen edge
//   pokes         'click' (drag.js): a click on him
//   timesDizzy / timesMad / naps   'mood' changing TO dizzy / mad / sleepy (mood.js)
//   dances        'event-start' of the dance event (a dance burst; a long song can have several)
//   games         'event-start' of a game in ../events/games.js GAMES → played;
//                 'event-end' with a result in PLAYER_WINS → won (win streak +1),
//                 in PLAYER_LOSSES → lost (win streak back to 0). Anything else (interrupted,
//                 stopped from the menu...) leaves the streak alone.
//   time together reported every TIME_EVERY seconds while the app is open.
//
// Read-only: it never changes what Starby does. Nothing here touches the game files.
import { GAMES } from '../events/games.js';

const THROW_MIN_SPEED = 300; // px/s "hand" speed (same line mood.js uses for "thrown awake")
const TIME_EVERY = 60; // seconds between "time together" reports (up to this much is lost on quit)

// The `result` each game ends with when YOU won / lost (from the games' finish() calls). Results
// ending in '*' match by prefix. A game missing here still counts as played, never won or lost.
// Add new games here when they're added to GAMES.
const PLAYER_WINS = {
  tag: ['user-won'], // tagged him in time
  pong: ['user-won'],
  'hide-seek': ['found'],
  catch: ['caught'],
  'starby-says': ['won'],
  'hoop-shot': ['scored'],
  maze: ['escaped'],
  shuffle: ['right'], // found the right asteroid
  memory: ['won'],
  constellation: ['right'], // guessed the constellation
};
const PLAYER_LOSSES = {
  tag: ['star-won', 'foul'],
  pong: ['ai-won', 'foul'],
  'hide-seek': ['star-won'],
  catch: ['out', 'cheater'],
  'starby-says': ['lost'],
  'hoop-shot': ['time'],
  maze: ['zapped-out', 'time'],
  shuffle: ['wrong', 'slow'],
  memory: ['lost-set-*'],
  constellation: ['wrong', 'timeout'],
};
const matches = (list, result) =>
  typeof result === 'string' && (list || []).some((r) => (r.endsWith('*') ? result.startsWith(r.slice(0, -1)) : r === result));

const GAME_NAMES = new Set(GAMES.map((g) => g.name));

export default {
  name: 'stats',

  init(ctx) {
    const api = ctx.api || {};
    if (!api.addStats || !api.recordGame) return; // (older preload: nothing to report to)
    const add = (patch) => api.addStats(patch);

    ctx.events.onEntry((e) => {
      const d = e.data || {};
      switch (e.type) {
        case 'toss':
          if (d.speed >= THROW_MIN_SPEED) add({ throws: 1 });
          break;
        case 'slingshot':
          add({ slingshots: 1 });
          break;
        case 'impact':
          add({ wallHits: 1 });
          break;
        case 'click':
          add({ pokes: 1 });
          break;
        case 'mood':
          if (d.to === 'dizzy') add({ timesDizzy: 1 });
          else if (d.to === 'mad') add({ timesMad: 1 });
          else if (d.to === 'sleepy') add({ naps: 1 });
          break;
        case 'event-start':
          if (d.name === 'dance') add({ dances: 1 });
          else if (GAME_NAMES.has(d.name)) api.recordGame(d.name, 'start');
          break;
        case 'event-end':
          if (!GAME_NAMES.has(d.name)) break;
          if (matches(PLAYER_WINS[d.name], d.result)) api.recordGame(d.name, 'won');
          else if (matches(PLAYER_LOSSES[d.name], d.result)) api.recordGame(d.name, 'lost');
          break;
        default:
          break;
      }
    });

    // Time together: a report every TIME_EVERY seconds of real time while he's open.
    ctx.every(TIME_EVERY, () => api.addTimeTogether?.(TIME_EVERY), 'stats: time together');
  },
};
