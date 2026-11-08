// STARBY SAYS — a game (like "Simon says"): do what he says, but ONLY if he says "starby says" first.
//
//   intro    "let's play starby says! only do it if i say 'starby says'!" (INTRO_FOR seconds)
//   game     GAME_FOR seconds (countdown top right). He gives commands one after another; each one
//            shows in his bubble and under the countdown, with or without "Starby says" (SAYS_CHANCE).
//              "Starby says spin me!"  → do it within COMMAND_FOR seconds. Done → next command.
//                                        Not done in time → you lose ("too slow!").
//              "spin me!"              → DON'T. Doing it → you lose ("i didn't say starby says!").
//                                        Leave it alone until the next command → safe.
//            Only the CURRENT command's action counts; anything else you do is ignored.
//   end      lasted the whole GAME_FOR seconds without a mistake → you win, WIN_REWARD starbits.
//            A mistake → you lose (no starbits taken).
//
// COMMANDS (each is something the app already logs, so detecting it is just watching the log):
//   tap me                   'click'   (drag.js: pressed and let go without moving)
//   pick me up               'grab'    (drag.js)
//   throw me                 'toss'    (drag.js)
//   throw me into the wall   'impact'  (drag.js: hit a screen edge in flight)
//   spin me                  'spin'    (drag.js: spun fast enough for "wheee!")
//   open the shop            the shop event starting (right-click → Open shop). The shop takes him
//                            over (priority 20), so this command always decides the game right
//                            there: "Starby says open the shop" → you win; without it → you lose.
// After a command is done he waits until he's landed (+ GAP_AFTER) before the next one, so the
// tail of one throw can't trip the next command.
//
// He isn't taken over (no pet.mode of his own) so you can grab, throw and spin him as usual.
// Starts like the other games: his "wanna play starby says?" invite (./invite.js, via the games
// timer), the "Play a game?" buttons, the right-click menu ("Play starby says"), or
// starby.startEvent('starby-says'). Shares the rest between games (./games.js).
// Decisions run on ticks (actions are noted from the event log as they happen).
import { lineBag } from '../behaviors/chatter.js';
import { requestMood } from '../behaviors/mood.js';
import { burstStarbits } from '../behaviors/starbits.js';
import { TICK_SECONDS } from '../core/clock.js';
import { createCountdown } from './countdown.js';
import { readyToPlay, markPlayed } from './games.js';

// ---- Tuning ----
const INTRO_FOR = 2.5; // seconds of explaining before the clock starts
const GAME_FOR = 15; // seconds the game lasts
const COMMAND_FOR = 4; // seconds to do a "starby says" command (and how long a trick command stays up)
const GAP_AFTER = 0.6; // seconds after a done command (once he's landed) before the next
const SAYS_CHANCE = 0.6; // chance a command starts with "Starby says"
const WIN_REWARD = 8;
const SHOP_JUDGE_WINDOW = 0.3; // s: the shop opening this soon after we were interrupted counts

const COMMANDS = [
  { id: 'tap', text: 'tap me', log: 'click' },
  { id: 'grab', text: 'pick me up', log: 'grab' },
  { id: 'toss', text: 'throw me', log: 'toss' },
  { id: 'wall', text: 'throw me into the wall', log: 'impact' },
  { id: 'spin', text: 'spin me', log: 'spin' },
  { id: 'shop', text: 'open the shop', shop: true },
];

const LINES = {
  intro: "let's play starby says! only do it if i say 'starby says'!",
  good: lineBag(['good!', 'nice!', 'yep!', 'ok ok!']),
  trickPassed: lineBag(['hehe, you didn\'t fall for it', 'ooh, careful one', 'good, i didn\'t say it!']),
  tricked: lineBag(["ha! i didn't say starby says!", "gotcha! starby didn't say!", "nope! i never said starby says!"]),
  tooSlow: (text) => `too slow! starby said ${text}!`,
  win: lineBag(['you win! you\'re good at this!', 'you never fell for it! you win!', 'wow, you win!']),
};

// ---- State ----
let endGame = null;
let phase = 'done'; // intro | command | gap | done
let phaseLeft = 0;
let gameLeft = 0;
let command = null; // { ...COMMANDS entry, says: bool }
let lastCommandId = null;
let did = false; // the current command's action happened (noted from the log, judged at the tick)
let countdown = null;
let played = false;
let interruptedWith = null; // { command, at } when something interrupted us (to judge "open the shop")

const flying = (pet) => pet.mode === 'drag' || pet.mode === 'toss';

function finish(result) {
  const end = endGame;
  endGame = null;
  end?.(result);
}

function nextCommand(ctx) {
  // Any command except the one just given.
  const options = COMMANDS.filter((c) => c.id !== lastCommandId);
  const pick = options[Math.floor(Math.random() * options.length)];
  command = { ...pick, says: Math.random() < SAYS_CHANCE };
  lastCommandId = pick.id;
  did = false;
  phase = 'command';
  phaseLeft = COMMAND_FOR;
  const text = command.says ? `Starby says ${command.text}!` : `${command.text}!`;
  ctx.say(text, COMMAND_FOR * 1000);
  countdown?.show('STARBY SAYS', gameLeft, text);
  ctx.log('says-command', { id: command.id, says: command.says });
}

function win(ctx) {
  ctx.say(LINES.win(), 2800);
  burstStarbits(ctx, WIN_REWARD);
  requestMood(ctx, 'happy', 'won starby says');
  ctx.log('says-end', { result: 'won' });
}

function lose(ctx, line, why) {
  ctx.say(line, 2800);
  requestMood(ctx, 'playful', 'won starby says against you');
  ctx.log('says-end', { result: 'lost', why });
}

export default {
  name: 'starby-says',
  category: 'games',
  priority: 10, // a game: same level as the others

  init(ctx) {
    ctx.events.onEntry((e) => {
      // A logged action during a command: note it if it's the command's action.
      if (phase === 'command' && command && !command.shop && e.type === command.log) did = true;
      // The shop opened right after it interrupted us: that decides the game.
      if (e.type === 'event-start' && e.data.name === 'shop' && interruptedWith
        && ctx.clock.seconds - interruptedWith.at <= SHOP_JUDGE_WINDOW) {
        const c = interruptedWith.command;
        interruptedWith = null;
        if (c && c.shop) {
          if (c.says) win(ctx);
          else lose(ctx, LINES.tricked(), 'opened the shop');
        }
      }
    });
  },

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (flying(pet)) return false;
    return readyToPlay(ctx, reason); // asked right after a game: "i'm tired"
  },

  start(ctx, end, reason) {
    endGame = end;
    phase = 'intro';
    phaseLeft = INTRO_FOR;
    gameLeft = GAME_FOR;
    command = null;
    lastCommandId = null;
    did = false;
    played = false;
    interruptedWith = null;
    countdown = countdown || createCountdown(ctx.stage, () => (ctx.area ? ctx.area() : null));
    requestMood(ctx, 'playful', 'starby says');
    ctx.say(LINES.intro, INTRO_FOR * 1000 + 300);
    ctx.log('says-start', { reason });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (phase === 'done' || !endGame) return;

    if (phase === 'intro') {
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) { played = true; nextCommand(ctx); }
      return;
    }

    gameLeft -= TICK_SECONDS;
    countdown?.set(gameLeft);

    if (phase === 'command') {
      phaseLeft -= TICK_SECONDS;
      if (did) {
        if (!command.says) { lose(ctx, LINES.tricked(), command.id); finish('lost'); return; }
        ctx.say(LINES.good(), 900);
        phase = 'gap';
        phaseLeft = GAP_AFTER;
      } else if (gameLeft <= 0) {
        win(ctx); // made it to the end (a command cut off by the clock doesn't count against you)
        finish('won');
        return;
      } else if (phaseLeft <= 0) {
        if (command.says) { lose(ctx, LINES.tooSlow(command.text), `slow:${command.id}`); finish('lost'); return; }
        ctx.say(LINES.trickPassed(), 900);
        phase = 'gap';
        phaseLeft = GAP_AFTER;
      }
    } else if (phase === 'gap') {
      if (gameLeft <= 0) { win(ctx); finish('won'); return; }
      if (flying(pet)) return; // wait until he's landed
      phaseLeft -= TICK_SECONDS;
      if (phaseLeft <= 0) nextCommand(ctx);
    }
  },

  stop(ctx, result) {
    endGame = null;
    // Interrupted (e.g. the shop just opened): remember the command, so init's log listener can
    // judge "open the shop" when the shop's start is logged right after this.
    interruptedWith = result === 'interrupted' && phase === 'command' ? { command, at: ctx.clock.seconds } : null;
    phase = 'done';
    command = null;
    countdown?.hide();
    if (played) markPlayed(ctx); // shared rest between games
    played = false;
  },
};
