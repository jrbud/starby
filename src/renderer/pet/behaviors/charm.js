// CHARM (Person 3): small touches.
//   daily gift      the first launch of each day: "you came back! here's a gift" and he bursts out a
//                   few starbits (once his intro and hello are done). Remembered in this window's
//                   localStorage (lives in the app's own data folder; the save file isn't touched).
//   nice catch      grab him out of the air while he's flying fast (drag.js logs 'grab' midAir):
//                   "nice catch!!", sometimes with a starbit as a reward
//   milestones      every 100 starbits in your total: a burst of star clouds and "100 starbits!!"
// DevTools: starby.dailyGift() gives today's gift again; starby.milestone(300) celebrates 300.
import { lineBag } from './chatter.js';
import { burstStarbits } from './starbits.js';
import { celebrateBurst } from './fx.js';

// ---- Tuning ----
const GIFT_KEY = 'starby.lastGiftDay';
const GIFT_STARBITS = 5;
const GIFT_AFTER_INTRO = 4; // seconds after the intro ends (his hello goes first)
const CATCH_COOLDOWN = 12; // seconds between "nice catch!" lines
const CATCH_REWARD_CHANCE = 0.3;
const MILESTONE_EVERY = 100;

const GIFT_LINES = lineBag(["you came back! here's a gift", 'a new day! starbits for you', "hi again! i saved these for you"]);
const CATCH_LINES = lineBag(['nice catch!!', 'whoa, good reflexes!', 'caught me! no fair', 'woo! what a catch']);
const MILESTONE_LINES = [
  (n) => `${n} starbits!! we're rich!`,
  (n) => `${n} starbits! look at that pile`,
  (n) => `wow, ${n} starbits! you're a star collector`,
];

let catchAt = -Infinity;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
function readGiftDay() { try { return localStorage.getItem(GIFT_KEY); } catch { return null; } }
function saveGiftDay() { try { localStorage.setItem(GIFT_KEY, today()); } catch { /* fine */ } }

function giveGift(ctx) {
  const n = burstStarbits(ctx, GIFT_STARBITS);
  if (n > 0) ctx.say(GIFT_LINES(), 3000);
  saveGiftDay();
  ctx.log('daily-gift', { starbits: n });
}

function celebrate(ctx, n) {
  celebrateBurst(ctx);
  ctx.say(MILESTONE_LINES[Math.floor(Math.random() * MILESTONE_LINES.length)](n), 3200);
  ctx.log('starbits-milestone', { total: n });
}

export default {
  name: 'charm',

  init(ctx) {
    let giftPending = readGiftDay() !== today();
    ctx.events.onEntry((e) => {
      // Daily gift: once the launch intro is over (and he's said hello).
      if (giftPending && e.type === 'event-end' && e.data.name === 'intro') {
        giftPending = false;
        ctx.after(GIFT_AFTER_INTRO, () => giveGift(ctx), 'daily gift');
      }
      // Nice catch.
      if (e.type === 'grab' && e.data.midAir && ctx.clock.seconds - catchAt >= CATCH_COOLDOWN) {
        catchAt = ctx.clock.seconds;
        ctx.say(CATCH_LINES(), 2000);
        if (Math.random() < CATCH_REWARD_CHANCE) burstStarbits(ctx, 1);
        ctx.log('nice-catch', {});
      }
      // Starbit milestones: the total just crossed a multiple of MILESTONE_EVERY.
      if (e.type === 'starbits' && e.data.delta > 0) {
        const before = e.data.total - e.data.delta;
        const crossed = Math.floor(e.data.total / MILESTONE_EVERY) * MILESTONE_EVERY;
        if (crossed > 0 && before < crossed) celebrate(ctx, crossed);
      }
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.dailyGift = () => { giveGift(ctx); return 'gift!'; };
      window.starby.milestone = (n = 100) => { celebrate(ctx, n); return n; };
    }
  },
};
