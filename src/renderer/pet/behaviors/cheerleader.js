// CHEERLEADER: you've been working in a work app (VS Code, Word, Excel, Google Docs, Notion...)
// for a while → Starby becomes a cheerleader for CHEER_FOR seconds (mood 'cheering', ./mood.js):
// he stays where he is, holds his pom-poms (frames.js 'cheering' face: cheer-1/cheer-2 once the
// art exists, the excited 'playful' face until then) and every CHEER_EVERY seconds hops and
// shouts something encouraging. Then "okay, i'll let you work!" and back to happy.
//
// "A while" = WORK_FOR seconds of work-app time. Short trips elsewhere (looking something up) don't
// reset it; only RESET_AFTER seconds in a row away from work apps does. Time while you're away
// from the PC (system 'idle') doesn't count.
// He only starts when he's free: happy or playful, standing or walking around, no event running.
// A focus YOU chose (dialogue) or any other event → he waits, and cheers once it's over.
// After cheering the work clock starts over, so it can't happen more than once per WORK_FOR.
//
// Which apps count: WORK_CATEGORIES (src/main/systemReads/activeWindow.js categories: editor =
// code editors, writing = Word/Excel/PowerPoint/Notepad/Notion/Obsidian/Google Docs...).
// Logged as 'cheer' { line }. DevTools: starby.cheer() starts it now, starby.workClock() shows
// the work seconds so far.
import { lineBag } from './chatter.js';
import { requestMood } from './mood.js';
import { rand, startJump, isJumping } from './motion.js';
import { TICK_SECONDS } from '../core/clock.js';

// ---- Tuning ----
const WORK_FOR = 20 * 60; // seconds in work apps before he cheers
const RESET_AFTER = 5 * 60; // seconds in a row in other apps that reset the work clock
const WORK_CATEGORIES = ['editor', 'writing'];
const CHEER_EVERY = [6, 10]; // seconds between cheers while cheering
const HOP = { height: 0.3, air: 0.42 }; // a cheer hop: height in star-sizes, seconds in the air

const LINES = {
  start: lineBag(["you've been working so hard! cheer time!", 'ooh, look at you go! gimme a minute, i gotta cheer!', 'okay, this calls for pom-poms!']),
  cheer: lineBag([
    "you're doing great!!",
    'go go go! you got this!',
    "two, four, six, eight! who's working great? you!",
    "you're a star! and i would know",
    "that's some serious focus!",
    'one more push! you got it!',
    'keep going, superstar!',
    'work work work! yay!',
    'i believe in you!',
    "nobody's ever worked this hard. i've seen everything, so i'd know",
    'look at all that progress!',
    "you're shining brighter than me right now!",
  ]),
};

let workSeconds = 0;
let awaySeconds = 0;
let inWorkApp = false;
let userAway = false;
let nextCheerAt = 0;

const free = (ctx) => {
  const { pet } = ctx;
  return (pet.mood === 'happy' || pet.mood === 'playful')
    && (pet.mode === 'idle' || pet.mode === 'walk')
    && !ctx.activeEvent?.()
    && !pet.hushed;
};

function start(ctx) {
  if (!requestMood(ctx, 'cheering', 'worked a while')) return false;
  workSeconds = 0;
  awaySeconds = 0;
  ctx.say(LINES.start(), 3000);
  if (!isJumping()) startJump({ height: HOP.height * ctx.pet.size, air: HOP.air });
  nextCheerAt = ctx.clock.seconds + 3.5;
  return true;
}

function cheer(ctx) {
  const line = LINES.cheer();
  if (!ctx.isSpeaking()) ctx.say(line, 2600);
  if (!isJumping() && (ctx.pet.mode === 'idle' || ctx.pet.mode === 'walk')) {
    startJump({ height: HOP.height * ctx.pet.size, air: HOP.air });
  }
  ctx.log('cheer', { line });
}

export default {
  name: 'cheerleader',

  init(ctx) {
    ctx.events.onEntry((e) => {
      if (e.type !== 'system') return;
      if (e.data.type === 'active-window') inWorkApp = WORK_CATEGORIES.includes(e.data.category);
      if (e.data.type === 'idle') userAway = true;
      if (e.data.type === 'idle-return' || e.data.type === 'unlock') userAway = false;
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.cheer = () => (start(ctx) ? 'cheering' : `can't now (mood: ${ctx.pet.mood})`);
      window.starby.workClock = () => ({ workSeconds: Math.round(workSeconds), needs: WORK_FOR, inWorkApp, userAway });
    }
  },

  onTick(ctx) {
    const dt = TICK_SECONDS;
    const { pet } = ctx;

    // Cheering: a cheer and a hop every few seconds (mood.js ends it after CHEER_FOR).
    if (pet.mood === 'cheering') {
      if (ctx.clock.seconds >= nextCheerAt) {
        nextCheerAt = ctx.clock.seconds + rand(...CHEER_EVERY);
        cheer(ctx);
      }
      return;
    }

    // The work clock.
    if (userAway) return;
    if (inWorkApp) {
      workSeconds += dt;
      awaySeconds = 0;
    } else if ((awaySeconds += dt) >= RESET_AFTER) {
      workSeconds = 0;
    }
    if (workSeconds >= WORK_FOR && free(ctx)) start(ctx);
  },
};
