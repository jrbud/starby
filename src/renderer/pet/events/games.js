// Shared bits for the games (tag, pong):
//   - requestGame(ctx, name): you asked him to play, from the right-click dialogue's "Do you
//     want to play a game?" answers (../dialogue/). Left-click used to pop up game buttons; it's
//     just a poke now.
//   - the rest between games: after ANY game he needs GAME_REST seconds before he'll play again
//     when asked ("give me a little, i'm tired", escalating if you keep asking); the dialogue
//     shows the time left
//   - mood answers: mad / dizzy → he says no
//   - GAMES: the list of games (also used by ./invite.js when he asks you to play)
//   - createReady(): the "3...", "2...", "1...", "GO!" countdown before a game
//
// DevTools / Developer menu: starby.skipRest() ends the rest early; starby.noRest(5) turns it off
// for 5 minutes.
//
// THE GAMES TIMER (category: games). Every GAMES_TIMER.every seconds there's a GAMES_TIMER.chance
// roll (at most once per GAMES_TIMER.cooldown) to start a game on his own, picked at random from
// GAMES (never the same one twice in a row): games he announces get an invite ("wanna play
// pong?", ./invite.js); games with invite: false (hide and seek) just start, silently. Only when
// nothing else is running and you're around (the cursor moved in the last USER_AROUND seconds);
// each game's / the invite's canStart(ctx, 'random') adds its own checks (mood, rested, ...).
//
// NO MATTER WHAT: if MUST_ASK_AFTER seconds (4 minutes) pass without any game or invite starting
// (from the buttons, menu, timer, anything; counted from launch at first), he ASKS you to play,
// skipping the chance roll and all the usual checks (mood, you being around, the rest between
// games, the 10 min after a "no"). Always an invite (never a silent hide and seek), with reason
// 'due'. It only waits while another event is already running (a game, the shop, a call...) or
// you're holding / throwing him, and then asks the moment he's free.
//
// Not an event itself: events/index.js runs `gamesMenu` as a helper (init / watch / watchFrame
// every tick/frame), and each game imports what it needs:
//   canStart(ctx, reason) { if (!readyToPlay(ctx, reason)) return false; ... }
//   stop(ctx)             { if (played) markPlayed(ctx); ... }
import { lineBag } from '../behaviors/chatter.js';
import { rand, startJump, isJumping } from '../behaviors/motion.js';
import { TICK_SECONDS } from '../core/clock.js';

export const GAME_REST = 60; // seconds after a game before he'll play again when asked

// THE GAMES. Every game here is on the "Play a game?" buttons AND can be offered when Starby asks
// you to play on his own (./invite.js picks one at random). `name` = the event name in
// events/index.js; `ask` = what he says when he invites you to it.
// To add a game: write its event, register it in events/index.js, add it here.
// invite: false = never offered in his "wanna play?" invites (hide and seek: he doesn't announce it).
export const GAMES = [
  { name: 'tag', label: 'Tag', ask: ['wanna play tag?', 'hey! play tag with me?', 'tag? pleeease?'] },
  { name: 'pong', label: 'Pong', ask: ['wanna play pong? i can be the ball!', 'pong? pleeease?', 'hey! bonk me around in pong?'] },
  { name: 'hide-seek', label: 'Hide & Seek', invite: false },
  { name: 'catch', label: 'Catch', ask: ["wanna play catch? i'll throw myself!", 'catch? i throw, you catch!', 'hey! play catch with me?'] },
  // weight: how likely the games timer picks it (default 1). Starby Says is his favorite.
  { name: 'starby-says', label: 'Starby Says', weight: 3, ask: ['wanna play starby says?', "starby says: play with me! hehe", 'hey! play starby says with me?'] },
  { name: 'hoop-shot', label: 'Hoop Shot', ask: ['wanna play hoop shot? shoot me into the hoop!', 'slingshot me into a hoop?', 'hey! hoop shot? i\'ll be the ball!'] },
  { name: 'constellation', label: 'Star Quiz', ask: ['wanna do a star quiz?', "quiz time? i'll draw you a constellation!", 'hey! guess my constellation?'] },
];

const LINES = {
  tired: lineBag(["give me a little, i'm tired", 'phew... let me catch my breath first', 'need a little break first!']),
  veryTired: lineBag(["i'm tired! ask me in a bit", '*pant pant* not yet!', 'still resting!']),
  mad: lineBag(['hmph. not playing with a poker.', "no games. i'm mad."]),
  notNow: lineBag(['too dizzy right now @_@', 'wait... the room is spinning']),
};

let lastPlayedEndAt = -Infinity; // session seconds when the last actual game ended
let noRestUntil = -Infinity; // session seconds: no rest between games before this (starby.noRest)

// Games timer
const GAMES_TIMER = { every: 30, chance: 0.3, cooldown: 120 }; // seconds, chance per roll, seconds (≈ a game every 3–4 min)
const USER_AROUND = 10; // seconds since the cursor last moved, to count as "you're there"
const MUST_ASK_AFTER = 240; // seconds without a game/invite → he asks no matter what
let lastGameAt = null; // session seconds when the last game or invite started (null = not started yet)
let nextRollAt = null;
let lastTimerStartAt = -Infinity;
let lastPicked = null;
let invitePick = null; // game the timer wants the invite to offer (taken by invite.js)
let lastCursor = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

/** For ./invite.js: the game the games timer picked for this invite (or null). */
export function takeInviteGame() {
  const name = invitePick;
  invitePick = null;
  return name;
}

function trackCursor(ctx) {
  const { cursor } = ctx;
  if (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y) {
    lastCursor = { x: cursor.x, y: cursor.y };
    cursorMovedAt = ctx.clock.seconds;
  }
}

// It's been MUST_ASK_AFTER seconds with no game: ask now, no matter what (see above).
function askIfDue(ctx) {
  const now = ctx.clock.seconds;
  if (lastGameAt === null) lastGameAt = now; // counted from launch
  if (now - lastGameAt < MUST_ASK_AFTER || ctx.activeEvent()) return false;
  const { pet } = ctx;
  if (pet.mode === 'drag' || pet.mode === 'toss') return false; // let go of him first
  const invitable = GAMES.filter((g) => g.invite !== false);
  if (!invitable.length) return false;
  const choices = invitable.length > 1 ? invitable.filter((g) => g.name !== lastPicked) : invitable;
  const game = choices[Math.floor(Math.random() * choices.length)];
  invitePick = game.name;
  if (!ctx.startEvent('invite', 'due')) { invitePick = null; return false; } // e.g. cursor off screen: next tick
  lastPicked = game.name;
  lastTimerStartAt = now;
  nextRollAt = now + GAMES_TIMER.every;
  ctx.log('games-timer', { game: game.name, how: 'due' });
  return true;
}

// Every tick: maybe start a game on his own (see THE GAMES TIMER above).
function rollGamesTimer(ctx) {
  const now = ctx.clock.seconds;
  if (askIfDue(ctx)) return;
  if (nextRollAt === null) nextRollAt = now + GAMES_TIMER.every;
  if (now < nextRollAt) return;
  nextRollAt = now + GAMES_TIMER.every;
  if (!GAMES.length || ctx.activeEvent()) return;
  if (now - lastTimerStartAt < GAMES_TIMER.cooldown || now - cursorMovedAt > USER_AROUND) return;
  if (Math.random() >= GAMES_TIMER.chance) return;
  const choices = GAMES.length > 1 ? GAMES.filter((g) => g.name !== lastPicked) : GAMES;
  // Weighted pick (a game's `weight`, default 1): Starby Says comes up more often.
  const total = choices.reduce((sum, g) => sum + (g.weight || 1), 0);
  let roll = Math.random() * total;
  const game = choices.find((g) => (roll -= g.weight || 1) < 0) || choices[choices.length - 1];
  lastPicked = game.name;
  let started;
  if (game.invite === false) {
    started = ctx.startEvent(game.name, 'random'); // e.g. hide and seek: he just goes, silently
  } else {
    invitePick = game.name;
    started = ctx.startEvent('invite', 'random'); // "wanna play ...?"
    if (!started) invitePick = null;
  }
  if (started) {
    lastTimerStartAt = now;
    ctx.log('games-timer', { game: game.name, how: game.invite === false ? 'silent' : 'invite' });
  }
}

/** Seconds of rest he still needs after the last game (0 = ready to play). */
export function restLeft(ctx) {
  if (ctx.clock.seconds < noRestUntil) return 0; // rest turned off for a while (Developer menu)
  return Math.max(0, lastPlayedEndAt + GAME_REST - ctx.clock.seconds);
}

/** Call when a game actually got played (past "GO!"): starts the rest. */
export function markPlayed(ctx) {
  lastPlayedEndAt = ctx.clock.seconds;
}

// Asked to play while still resting: tired, and a bit more insistent each time you ask.
function sayTired(ctx) {
  const asked = ctx.events.count('game-tired', GAME_REST);
  const left = Math.ceil(restLeft(ctx));
  let line;
  if (asked === 0) line = LINES.tired();
  else if (asked === 1) line = `still tired... give me ${left}s`;
  else line = LINES.veryTired();
  ctx.say(line, 2500);
  ctx.log('game-tired', { left });
}

/**
 * For a game's canStart: user requests (button / menu) during the rest get "i'm tired" and
 * return false. Random starts and DevTools aren't affected (random starts have their own cooldown).
 */
export function readyToPlay(ctx, reason) {
  if (reason === 'random' || reason === 'devtools') return true;
  if (restLeft(ctx) > 0) {
    sayTired(ctx);
    return false;
  }
  return true;
}

/** The user asked to play `name` (right-click dialogue). Mood and rest answers come from here. */
export function requestGame(ctx, name) {
  const { pet } = ctx;
  ctx.log('game-request', { game: name, mood: pet.mood });
  if (ctx.activeEvent()) return;
  if (pet.mood === 'mad') { ctx.say(LINES.mad(), 2000); return; }
  if (pet.mood === 'dizzy') { ctx.say(LINES.notNow(), 2000); return; }
  ctx.startEvent(name, 'request'); // the game's canStart says "i'm tired" if he still needs a rest
}

/** Helper module run by events/index.js (not an event: it never "starts"). */
export const gamesMenu = {
  name: 'games-menu',

  init(ctx) {
    // Any game or invite starting (however it was started) resets the "ask no matter what" clock.
    const gameNames = new Set([...GAMES.map((g) => g.name), 'invite']);
    ctx.events.onEntry((e) => {
      if (e.type === 'event-start' && gameNames.has(e.data.name)) lastGameAt = ctx.clock.seconds;
    });
    // DevTools / Developer menu: forget the last game, so he'll play again right away.
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.skipRest = () => { lastPlayedEndAt = -Infinity; return 'rested'; };
      // Dialogue → Developer stuff → "No game rest (5 min)": no rest between games for N minutes.
      window.starby.noRest = (minutes = 5) => {
        noRestUntil = ctx.clock.seconds + Number(minutes) * 60;
        lastPlayedEndAt = -Infinity;
        return `no game rest for ${minutes} min`;
      };
    }
  },

  // Every tick: the games timer.
  watch(ctx) {
    trackCursor(ctx);
    rollGamesTimer(ctx);
  },
};

/**
 * "3...", "2...", "1...", "GO!": call start() when the game is agreed (after the game's own
 * "let's play" line), then tick(ctx) every tick until it returns true (the tick it says "GO!").
 */
export function createReady({ from = 3, step = 1, pause = 1.2 } = {}) {
  let count = 0;
  let wait = 0;
  return {
    pause,
    start() {
      count = from;
      wait = pause;
    },
    tick(ctx) {
      wait -= TICK_SECONDS;
      if (wait > 1e-6) return false; // (tolerance: ten 0.1s ticks don't add up to exactly 1.0)
      wait = step;
      if (count > 0) {
        ctx.say(`${count}...`, step * 1000);
        if (!isJumping()) startJump({ height: rand(6, 10), air: 0.22 }); // little bounce per count
        count--;
        return false;
      }
      ctx.say('GO!', 900);
      return true;
    },
  };
}
