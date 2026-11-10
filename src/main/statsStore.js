// LIFETIME STATS: totals that only ever go up, plus the best win streak. Shown in Settings → Stats.
//
// Kept separate from the game state (store.js / shared/stateSchema.js, Person 4's save format) and
// from settings: its own stats.json in Electron's per-app data folder, next to state.json. That
// folder belongs to this app only; nothing is written anywhere else.
// "Reset progress" (starbits + shop) does NOT touch these: lifetime means lifetime.
//
// Who counts what:
//   starbitsCollected            ipc.js 'starbits:collect' (every pickup, as it's saved)
//   starbitsSpent, itemsBought   ipc.js 'shop:buy'
//   daysVisited, firstMet        here, when the app starts (and when a day rolls over while open)
//   everything else              renderer/pet/behaviors/stats.js, from the pet's event log:
//                                'stats:add' (counters), 'stats:game', 'stats:time'
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Counters: only go up by what's added.
const COUNTERS = [
  'starbitsCollected', 'starbitsSpent', 'itemsBought',
  'gamesPlayed', 'gamesWon',
  'throws', 'slingshots', 'wallHits', 'pokes',
  'timesDizzy', 'timesMad', 'naps', 'dances',
  'secondsTogether', 'daysVisited',
];
const GAME_NAME = /^[a-z][a-z0-9-]{0,31}$/; // event names, e.g. 'hide-seek'
const MAX_STEP = 100000; // sanity cap on a single add
const MAX_TIME_STEP = 600; // seconds: one time report can't add more than this

const defaults = () => ({
  ...Object.fromEntries(COUNTERS.map((k) => [k, 0])),
  winStreak: 0, // games won in a row right now (a loss resets it)
  bestWinStreak: 0, // the longest winStreak ever
  firstMet: null, // ISO date of the first launch with stats (set once)
  lastDay: null, // local YYYY-MM-DD of the last day counted in daysVisited
  games: {}, // per game: { [name]: { played, won } }
});

let stats = null;
let filePath = null;
let saveTimer = null;

const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load() {
  filePath = path.join(app.getPath('userData'), 'stats.json');
  stats = defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const k of [...COUNTERS, 'winStreak', 'bestWinStreak']) stats[k] = count(saved[k]);
    if (typeof saved.firstMet === 'string') stats.firstMet = saved.firstMet;
    if (typeof saved.lastDay === 'string') stats.lastDay = saved.lastDay;
    for (const [name, g] of Object.entries(saved.games || {})) {
      if (GAME_NAME.test(name)) stats.games[name] = { played: count(g?.played), won: count(g?.won) };
    }
  } catch {
    // missing or corrupt file → start from zero
  }
  // This launch: first met (once ever), and a new day visited?
  if (!stats.firstMet) stats.firstMet = new Date().toISOString();
  countDay();
  save();
}

// A new local day → one more day visited. Called at launch and with each time report, so a day
// that starts while Starby is open counts too.
function countDay() {
  const d = today();
  if (stats.lastDay === d) return false;
  stats.lastDay = d;
  stats.daysVisited += 1;
  return true;
}

function get() {
  if (!stats) load();
  return stats;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${filePath}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(stats, null, 2));
    fs.renameSync(tmp, filePath);
  }, 500);
}

// Things can come in quickly (throws, wall hits): update and broadcast right away, write the file
// once things settle.
function changed() {
  save();
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('stats:changed', stats);
  return stats;
}

/** Add to counters, e.g. add({ throws: 1 }). Unknown keys and negative amounts are ignored. */
function add(patch) {
  get();
  for (const k of COUNTERS) {
    if (k === 'secondsTogether' || k === 'daysVisited') continue; // (only time() / launches)
    const n = Math.min(MAX_STEP, count(patch && patch[k]));
    if (n) stats[k] += n;
  }
  return changed();
}

/** A game: outcome 'start' (played +1), 'won' (won +1, streak +1) or 'lost' (streak back to 0). */
function game(name, outcome) {
  get();
  if (typeof name !== 'string' || !GAME_NAME.test(name)) return stats;
  const g = (stats.games[name] ||= { played: 0, won: 0 });
  if (outcome === 'start') {
    g.played += 1;
    stats.gamesPlayed += 1;
  } else if (outcome === 'won') {
    g.won += 1;
    stats.gamesWon += 1;
    stats.winStreak += 1;
    stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.winStreak);
  } else if (outcome === 'lost') {
    stats.winStreak = 0;
  } else {
    return stats;
  }
  return changed();
}

/** Time spent together: the pet window reports every minute or so. Also rolls the day over. */
function time(seconds) {
  get();
  stats.secondsTogether += Math.min(MAX_TIME_STEP, count(seconds));
  countDay();
  return changed();
}

module.exports = { get, add, game, time };
