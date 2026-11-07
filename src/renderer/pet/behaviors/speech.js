// Idle commentary + something to say when clicked.
//   - Clicks answer instantly (plain ctx.say): the user asked for it.
//   - Idle chatter goes through chat() (./chatter.js): dropped if anything was said recently,
//     so it never talks over system reactions, flinches, milestones, etc.
// Lines come from shuffle bags, so the same line never shows twice in a row.
import { chat, lineBag } from './chatter.js';

const IDLE_LINES = [
  '*twinkle*',
  'la la la~',
  'nice desktop you got here',
  'i like it up here',
  '✦',
  'hmm hm hmm',
  'what are we doing today?',
  'just floating around',
  "don't mind me",
  'sparkle sparkle',
  'i counted all your icons. twice.',
  "you're doing great, btw",
  "i wonder what's past the taskbar",
  '*hums quietly*',
  'tiny star, big dreams',
  'is it snack time? i eat starlight',
  'still here!',
  'shiny day today',
  'beep boop. jk, i\'m a star',
  'stretch break? no? ok',
];

const CLICK_LINES = [
  'hehe',
  'boop!',
  'hi hi',
  'that tickles',
  'you found me!',
  'hey there!',
  '*sparkles at you*',
  'again! again!',
  'whee!',
  'yes? :)',
  'poke detected',
  'hi friend',
  'heehee, stop it',
  'did you need something?',
];

const CHAT_EVERY = [20, 40]; // seconds between idle-chatter attempts
const CHAT_GAP = 10; // idle chatter needs this many quiet seconds, or it's skipped

const nextIdle = lineBag(IDLE_LINES);
const nextClick = lineBag(CLICK_LINES);
const rand = (a, b) => a + Math.random() * (b - a);

function scheduleChat(ctx) {
  ctx.after(rand(...CHAT_EVERY), () => {
    // Only chat while relaxed (not while held, fleeing, etc.).
    if (ctx.pet.mode === 'idle' || ctx.pet.mode === 'walk') {
      chat(ctx, nextIdle(), 3000, { gap: CHAT_GAP });
    }
    scheduleChat(ctx);
  }, 'speech: idle chatter');
}

export default {
  name: 'speech',

  init(ctx) {
    ctx.petEl.addEventListener('pet:clicked', () => ctx.say(nextClick(), 2000));
    scheduleChat(ctx);
  },
};
