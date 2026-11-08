// INVITE — Starby asks you to play a game (any game in GAMES, ./games.js).
//
// When the games timer (./games.js) picks a game he announces, he stops, faces you and asks:
// "wanna play pong?" in a talkbox, with [Yes!] [No] bursting out around him: the same menu as the
// right-click dialogue (showMenu in ../dialogue/dialogue.js).
//   Yes       → that game starts (its 3-2-1-GO countdown first)
//   No        → he gets sad (mood.js 'sad') and won't ask again on his own for DECLINED_COOLDOWN
//   no answer → "...maybe later then", no hard feelings
//
// Timer invites only happen when he's relaxed (idle/walking), happy or playful, rested after the
// last game, not just told "no", and you're around (the games timer checks that).
// New games join automatically: add them to GAMES in ./games.js (with ask lines).
// DevTools: starby.invite() or starby.invite('pong').
//
// Owns the star via pet.mode = 'invite' while asking (behaviors stand down).
import { rand, chance, startJump, cancelJump, isJumping, updateJump } from '../behaviors/motion.js';
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { TICK_SECONDS } from '../core/clock.js';
import { showMenu, closeMenu } from '../dialogue/dialogue.js';
import { GAMES, restLeft, takeInviteGame } from './games.js';

// ---- Tuning ----
const INVITE_FOR = 12; // seconds to answer the popup
const DECLINED_COOLDOWN = 600; // after a "no", don't ask again on his own for this long (seconds)

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
let declinedAt = -Infinity;

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
  category: 'games', // part of the games: the games timer (./games.js) starts it
  priority: 5, // below the games, so an invite never interrupts one

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.invite = (name) => {
        if (name && !INVITABLE.some((g) => g.name === name)) return `can't invite to that; try: ${INVITABLE.map((g) => g.name).join(', ')}`;
        pendingGame = name || null;
        if (ctx.activeEvent()) ctx.stopEvent('dev'); // a dev trigger always works: end whatever's running
        return ctx.startEvent('invite', 'devtools');
      };
    }
  },

  canStart(ctx, reason) {
    const { pet, cursor } = ctx;
    if (!INVITABLE.length || cursor.x < -1000) return false;
    if (pet.mode === 'drag' || pet.mode === 'toss') return false;
    if (reason !== 'random') return true;
    const now = ctx.clock.seconds;
    const relaxed = pet.mode === 'idle' || pet.mode === 'walk';
    const goodMood = pet.mood === 'happy' || pet.mood === 'playful';
    return relaxed && goodMood // (the games timer already checked that you're around)
      && now - declinedAt >= DECLINED_COOLDOWN
      && restLeft(ctx) === 0;
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endInvite = end;
    const wanted = pendingGame || takeInviteGame(); // DevTools choice, or the games timer's pick
    game = INVITABLE.find((g) => g.name === wanted) || pickGame();
    pendingGame = null;
    lastGame = game.name;
    answer = null;
    left = INVITE_FOR;

    pet.mode = 'invite'; // behaviors stand down; he stays put while asking
    cancelJump();
    startJump({ height: rand(8, 12), air: 0.25 }); // perk up
    ctx.log('game-invite', { game: game.name, reason });
    // His ask goes in the menu's talkbox (not ctx.say), with the answers around him.
    showMenu(ctx, {
      line: ASK[game.name](),
      options: [
        { label: 'Yes!', onPick: () => { answer = 'yes'; } },
        { label: 'No', onPick: () => { answer = 'no'; } },
      ],
    });
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
  },

  stop(ctx) {
    endInvite = null;
    answer = null;
    closeMenu(ctx);
    if (ctx.pet.mode === 'invite') ctx.pet.mode = 'idle';
  },
};
