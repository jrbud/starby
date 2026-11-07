// Idle commentary + something to say when clicked, in the voice of the current mood
// (pet.mood, set by mood.js).
//   - Clicks answer instantly (plain ctx.say): the user asked for it.
//   - Idle chatter goes through chat() (./chatter.js): dropped if anything was said recently,
//     so it never talks over system reactions, flinches, milestones, etc.
// Lines come from shuffle bags, so the same line never shows twice in a row.
// Moods without their own pool use the happy lines.
import { chat, lineBag, lineBags } from './chatter.js';

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

// Per-mood pools. The 4th quick poke turns him mad *before* this click is answered (mood.js
// sees the click in the event log first), so that click already gets a mad line.
const CLICK_BY_MOOD = lineBags({
  happy: CLICK_LINES,
  mad: ['hey! stop that!', 'hmph!', 'quit poking me!', 'grrr', "i'm not talking to you", '>:('],
  playful: ['again! again!', 'hehe, catch me!', 'wheee, more!', 'tag, you\'re it!', ':P'],
  dizzy: ['@_@', 'not now... still spinning', 'whoa, two of you?', 'ugh... wobbly'],
  yawning: ['*yawn* hm?', "i'm awake, i'm awake", 'sleepy...'],
  sad: ['...', 'oh. hi.', '*sniff*'], // (a click cheers him up first, so these rarely show)
  // Clicks don't wake him (only picking him up and shaking does), so hint at that.
  sleepy: ['zzz...', '*snore*', 'mmm... five more minutes...', 'zzz... (he needs a good shake)'],
});

const IDLE_BY_MOOD = lineBags({
  happy: IDLE_LINES,
  mad: ['hmph.', "i'm still mad, you know", '*grumbles*', 'no stardust for pokers'],
  playful: ['throw me again!', 'that was fun!', 'hehe', 'wheee~ (remembering)', 'bet you can\'t throw me farther'],
  dizzy: ['the room is spinning...', '@_@', 'which way is up?'],
  yawning: ['*yaaawn*', 'so sleepy...', 'nap time soon...'],
  sad: ['*sigh*', 'i just wanted to play...', '...', 'oh well.', '*kicks a pixel*'],
  sleepy: ['zzz...', '*snore*', 'zzz... mm... stardust...', '*mumbles in sleep*'],
});

const CHAT_EVERY = [20, 40]; // seconds between idle-chatter attempts
const CHAT_GAP = 10; // idle chatter needs this many quiet seconds, or it's skipped

const rand = (a, b) => a + Math.random() * (b - a);
const forMood = (bags, pet) => (bags[pet.mood] || bags.happy)();

function scheduleChat(ctx) {
  ctx.after(rand(...CHAT_EVERY), () => {
    // Only chat while relaxed (not while held, fleeing, etc.).
    if (ctx.pet.mode === 'idle' || ctx.pet.mode === 'walk') {
      // ignoreQuiet: these pools already fit the mood (asleep → "zzz"), so they're allowed while asleep.
      chat(ctx, forMood(IDLE_BY_MOOD, ctx.pet), 3000, { gap: CHAT_GAP, ignoreQuiet: true });
    }
    scheduleChat(ctx);
  }, 'speech: idle chatter');
}

export default {
  name: 'speech',

  init(ctx) {
    ctx.petEl.addEventListener('pet:clicked', () => ctx.say(forMood(CLICK_BY_MOOD, ctx.pet), 2000));
    scheduleChat(ctx);
  },
};
