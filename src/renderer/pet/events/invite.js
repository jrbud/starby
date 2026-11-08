// INVITE — Starby asks you to play a game (any game in GAMES, ./games.js).
//
// Every so often (the runner rolls AUTO) he picks a game at random, stops, faces you and asks:
// "wanna play pong?" plus a "Play Pong with Starby? [Yes] [No]" popup next to him (./prompt.js).
//   Yes       → that game starts (its 3-2-1-GO countdown first)
//   No        → he gets sad (mood.js 'sad') and won't ask again on his own for DECLINED_COOLDOWN
//   no answer → "...maybe later then", no hard feelings
//
// Random invites only happen when he's relaxed (idle/walking), happy or playful, rested after the
// last game, and you're around (the cursor moved in the last USER_AROUND seconds).
// New games join automatically: add them to GAMES in ./games.js (with ask lines).
// DevTools: starby.invite() or starby.invite('pong').
//
// Owns the star via pet.mode = 'invite' while asking (behaviors stand down).
import { rand, chance, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createPrompt } from './prompt.js';
import { GAMES, restLeft } from './games.js';

// ---- Tuning ----
const INVITE_FOR = 12; // seconds to answer the popup
const DECLINED_COOLDOWN = 600; // after a "no", don't ask again on his own for this long (seconds)
// Random invite (the runner rolls this): every 60s, 20% chance, at most once per 4 minutes.
const AUTO = { every: 60, chance: 0.2, cooldown: 240 };
const USER_AROUND = 10; // seconds since the cursor last moved, to count as "you're there"

const LINES = {
  declined: lineBag(['oh... ok.', 'aw... nevermind then', '*sniff* ok...']),
  ignored: lineBag(['...maybe later then', "oh, you're busy. ok!"]),
};
// Games he can invite you to (hide and seek is never announced) and their ask lines.
const INVITABLE = GAMES.filter((g) => g.invite !== false);
const ASK = Object.fromEntries(INVITABLE.map((g) => [g.name, lineBag(g.ask)]));

// ---- State ----
let endInvite = null;
let game = null; // the game being offered (an entry of GAMES)
let pendingGame = null; // name chosen by starby.invite('pong'), used by the next start
let lastGame = null; // name of the last game offered (so it doesn't offer the same one every time)
let answer = null; // 'yes' | 'no', set by the popup buttons, acted on at the next tick
let left = 0;
let prompt = null;
let declinedAt = -Infinity;
let lastCursor = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

function trackCursor(ctx) {
  const { cursor } = ctx;
  if (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y) {
    lastCursor = { x: cursor.x, y: cursor.y };
    cursorMovedAt = ctx.clock.seconds;
  }
}

// A random game, avoiding the one offered last time when there's a choice.
function pickGame() {
  const choices = INVITABLE.length > 1 ? INVITABLE.filter((g) => g.name !== lastGame) : INVITABLE;
  return choices[Math.floor(Math.random() * choices.length)];
}

function finish(result) {
  const end = endInvite;
  endInvite = null;
  end?.(result);
}

export default {
  name: 'invite',
  priority: 5, // below the games, so an invite never interrupts one
  auto: AUTO,

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.invite = (name) => {
        if (name && !INVITABLE.some((g) => g.name === name)) return `can't invite to that; try: ${INVITABLE.map((g) => g.name).join(', ')}`;
        pendingGame = name || null;
        return ctx.startEvent('invite', 'devtools');
      };
    }
  },

  watch: trackCursor, // every tick, so random invites know whether you're around

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (!INVITABLE.length || cursor.x < -1000) return false;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    if (reason !== 'random') return true;
    const now = ctx.clock.seconds;
    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
    return relaxed && goodMood
      && now - cursorMovedAt <= USER_AROUND
      && now - declinedAt >= DECLINED_COOLDOWN
      && restLeft(ctx) === 0;
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endInvite = end;
    game = INVITABLE.find((g) => g.name === pendingGame) || pickGame();
    pendingGame = null;
    lastGame = game.name;
    answer = null;
    left = INVITE_FOR;
    prompt = prompt || createPrompt(ctx.stage);

    pet.mode = 'invite'; // behaviors stand down; he stays put while asking
    cancelJump();
    startJump({ height: rand(8, 12), air: 0.25 }); // perk up
    ctx.say(ASK[game.name](), INVITE_FOR * 1000);
    ctx.log('game-invite', { game: game.name, reason });
    prompt.show({
      text: `Play ${game.label} with Starby?`,
      yes: 'Yes!',
      no: 'No',
      onYes: () => { answer = 'yes'; },
      onNo: () => { answer = 'no'; },
    });
    prompt.place(pet, ctx.area?.());
  },

  onTick(ctx) {
    const { pet, cursor } = ctx;
    if (pet.mode !== 'invite') { // grabbed, etc.
      finish(`interrupted:${pet.mode}`);
      return;
    }
    left -= TICK_SECONDS;
    if (cursor.x > -1000) pet.facing = cursor.x >= pet.x + pet.size / 2 ? 1 : -1; // looks at you, hopeful

    if (answer === 'yes') {
      ctx.log('game-answer', { game: game.name, answer: 'yes' });
      const name = game.name;
      finish('yes');
      ctx.startEvent(name, 'invite'); // the game takes over from here
    } else if (answer === 'no') {
      declinedAt = ctx.clock.seconds;
      ctx.log('game-answer', { game: game.name, answer: 'no' });
      finish('declined');
      requestMood(ctx, 'sad', `said no to ${game.name}`);
      ctx.say(LINES.declined(), 2500);
    } else if (left <= 0) {
      ctx.log('game-answer', { game: game.name, answer: 'none' });
      finish('ignored');
      ctx.say(LINES.ignored(), 2000);
    } else if (!isJumping() && chance(0.3, TICK_SECONDS)) {
      startJump({ height: rand(6, 10), air: 0.22 }); // bouncing on the spot, waiting
    }
  },

  update(ctx, dt) {
    if (ctx.pet.mode !== 'invite') return;
    updateJump(ctx.pet, dt);
    prompt?.place(ctx.pet, ctx.area?.());
  },

  stop(ctx) {
    endInvite = null;
    answer = null;
    prompt?.hide();
    if (ctx.pet.mode === 'invite') ctx.pet.mode = 'idle';
  },
};
