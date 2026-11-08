// Shared bits for the games (tag, pong):
//   - the "Play a game?" button that pops up next to Starby when you click him: one button per
//     game; pressing one asks him to play it
//   - the rest between games: after ANY game he needs GAME_REST seconds before he'll play again
//     when asked ("give me a little, i'm tired", escalating if you keep asking); the button shows
//     the time left ("resting… 0:42")
//   - mood answers: mad / dizzy → he says no; asleep → no button
//   - GAMES: the list of games (also used by ./invite.js when he asks you to play)
//   - createReady(): the "3...", "2...", "1...", "GO!" countdown before a game
//
// DevTools / Developer menu: starby.skipRest() ends the rest early.
//
// THE GAMES TIMER (category: games). Every GAMES_TIMER.every seconds there's a GAMES_TIMER.chance
// roll (at most once per GAMES_TIMER.cooldown) to start a game on his own, picked at random from
// GAMES (never the same one twice in a row): games he announces get an invite ("wanna play
// pong?", ./invite.js); games with invite: false (hide and seek) just start, silently. Only when
// nothing else is running and you're around (the cursor moved in the last USER_AROUND seconds);
// each game's / the invite's canStart(ctx, 'random') adds its own checks (mood, rested, ...).
//
// Not an event itself: events/index.js runs `gamesMenu` as a helper (init / watch / watchFrame
// every tick/frame), and each game imports what it needs:
//   canStart(ctx, reason) { if (!readyToPlay(ctx, reason)) return false; ... }
//   stop(ctx)             { if (played) markPlayed(ctx); ... }
import { lineBag } from '../behaviors/chatter.js';
import { rand, startJump, isJumping } from '../behaviors/motion.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createPrompt } from './prompt.js';

export const GAME_REST = 60; // seconds after a game before he'll play again when asked
const CHIP_FOR = 4; // seconds the game buttons stay up after clicking him

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
  { name: 'starby-says', label: 'Starby Says', ask: ['wanna play starby says?', "starby says: play with me! hehe", 'hey! play starby says with me?'] },
  { name: 'hoop-shot', label: 'Hoop Shot', ask: ['wanna play hoop shot? shoot me into the hoop!', 'slingshot me into a hoop?', 'hey! hoop shot? i\'ll be the ball!'] },
  { name: 'copycat', label: 'Copycat', invite: false }, // starts silently: he just starts copying you
  { name: 'constellation', label: 'Star Quiz', ask: ['wanna do a star quiz?', "quiz time? i'll draw you a constellation!", 'hey! guess my constellation?'] },
];

const LINES = {
  tired: lineBag(["give me a little, i'm tired", 'phew... let me catch my breath first', 'need a little break first!']),
  veryTired: lineBag(["i'm tired! ask me in a bit", '*pant pant* not yet!', 'still resting!']),
  mad: lineBag(['hmph. not playing with a poker.', "no games. i'm mad."]),
  notNow: lineBag(['too dizzy right now @_@', 'wait... the room is spinning']),
};

let lastPlayedEndAt = -Infinity; // session seconds when the last actual game ended

// Games timer
const GAMES_TIMER = { every: 60, chance: 0.2, cooldown: 240 }; // seconds, chance per roll, seconds
const USER_AROUND = 10; // seconds since the cursor last moved, to count as "you're there"
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

// Every tick: maybe start a game on his own (see THE GAMES TIMER above).
function rollGamesTimer(ctx) {
  const now = ctx.clock.seconds;
  if (nextRollAt === null) nextRollAt = now + GAMES_TIMER.every;
  if (now < nextRollAt) return;
  nextRollAt = now + GAMES_TIMER.every;
  if (!GAMES.length || ctx.activeEvent()) return;
  if (now - lastTimerStartAt < GAMES_TIMER.cooldown || now - cursorMovedAt > USER_AROUND) return;
  if (Math.random() >= GAMES_TIMER.chance) return;
  const choices = GAMES.length > 1 ? GAMES.filter((g) => g.name !== lastPicked) : GAMES;
  const game = choices[Math.floor(Math.random() * choices.length)];
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
let chip = null; // the game buttons (a prompt with one button per game)
let chipLeft = 0;
let chipPressed = null; // name of the game whose button was pressed; acted on at the next tick

const mmss = (s) => {
  const whole = Math.ceil(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** Seconds of rest he still needs after the last game (0 = ready to play). */
export function restLeft(ctx) {
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

const chipText = (ctx) => (restLeft(ctx) > 0 ? `resting… ${mmss(restLeft(ctx))}` : 'Play a game?');

// Clicked him: offer the game buttons for a few seconds.
function showChip(ctx) {
  const { pet } = ctx;
  if (ctx.activeEvent()) return; // already playing / asking
  if (pet.mood === 'sleepy') return; // asleep: can't ask him anything
  if (pet.mode === 'drag' || pet.mode === 'toss') return;
  chipLeft = CHIP_FOR;
  chipPressed = null;
  chip.show({
    text: chipText(ctx),
    buttons: GAMES.map((g) => ({ label: g.label, onClick: () => { chipPressed = g.name; } })),
  });
  chip.place(pet, ctx.area?.());
}

function hideChip() {
  chipLeft = 0;
  chipPressed = null;
  chip?.hide();
}

// The user asked to play `name`.
function askToPlay(ctx, name) {
  const { pet } = ctx;
  hideChip();
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
    chip = createPrompt(ctx.stage);
    ctx.petEl.addEventListener('pet:clicked', () => showChip(ctx));
    // DevTools / Developer menu: forget the last game, so he'll play again right away.
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.skipRest = () => { lastPlayedEndAt = -Infinity; return 'rested'; };
    }
  },

  // Every tick: the games timer; act on a pressed button, keep the rest countdown live, hide when
  // done/busy.
  watch(ctx) {
    trackCursor(ctx);
    rollGamesTimer(ctx);
    if (!chip || chipLeft <= 0) return;
    const { pet } = ctx;
    if (chipPressed) { askToPlay(ctx, chipPressed); return; }
    chipLeft -= TICK_SECONDS;
    const busy = ctx.activeEvent() || pet.mode === 'drag' || pet.mode === 'toss' || pet.mood === 'sleepy';
    if (chipLeft <= 0 || busy) { hideChip(); return; }
    chip.setText(chipText(ctx));
  },

  // Every frame: keep the buttons next to him while he walks.
  watchFrame(ctx) {
    if (chipLeft > 0) chip.place(ctx.pet, ctx.area?.());
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
