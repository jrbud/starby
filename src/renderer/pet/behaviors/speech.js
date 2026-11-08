// Idle commentary + something to say when clicked, in the voice of the current mood
// (pet.mood, set by mood.js).
//   - Clicks answer instantly (plain ctx.say): the user asked for it.
//   - Idle chatter goes through chat() (./chatter.js): dropped if anything was said recently,
//     so it never talks over system reactions, flinches, milestones, etc.
// Lines come from shuffle bags, so the same line never shows twice in a row.
// Moods without their own pool use the happy lines.
import { chat, lineBag, lineBags } from './chatter.js';
import { POKES_TO_MAD, POKE_WINDOW, strikePose } from './mood.js';

const IDLE_LINES = [
  '*twinkle*',
  'la la la~',
  'nice desktop you got here',
  'i like it up here',
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
  ':3',
  // Space stuff: he's made of starlight and has seen it all, so he's got stories (and opinions).
  "the martians are throwing another party tonight. i'm not invited. again.",
  "fun fact: the sun is my cousin. we don't really talk.",
  "saturn won't stop bragging about its rings",
  'i raced a comet once. i let it win.',
  'pluto is still a planet in my heart',
  'the milky way tastes nothing like milk. trust me.',
  'black holes are just space vacuums. very rude ones.',
  'the moon still owes me five starbits',
  'jupiter? two stars. way too windy.',
  'venus smells like rotten eggs. skip it.',
  "mars is red because it's embarrassed. long story.",
  'astronauts wave at me sometimes. i wave back.',
  'the big dipper is just a really big spoon',
  'a meteor told me a joke once. it was a little rocky.',
  'the aliens say hi. the nice ones, anyway.',
  "i've seen a supernova. 10/10, very sparkly",
  'orion keeps losing his belt',
  'comets are just space snowballs with main character energy',
  'space is so quiet... perfect for naps',
  "if you hear a tiny 'zoom', that was me. light speed.",
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
  'hi friend',
  'heehee, stop it',
  'did you need something?',
  'greetings, earthling!',
  'beam me up! ...wait, i live here',
  'one small boop for you...',
  'this is ground control... i mean, hi!',
];

// Poke warnings: quick pokes in a row (happy/playful) get escalating warnings, so you can tell
// you're making him mad before you do (people didn't notice before). Tier by how close the
// count is to POKES_TO_MAD (mood.js); the last tier also flashes his grumpy face.
const POKE_WARNINGS = [
  lineBag(['hehe, that tickles!', 'boop?', 'hey! hi!', 'hm? yes?']),
  lineBag(['okay okay, i see you!', "that's a lot of poking...", 'hey... easy there', 'poke... poke... hmm']),
  lineBag(["one more poke and i'm gonna be mad!", 'seriously, stop poking me!', "i'm warning you... >:/", 'last warning!!']),
];

function clickLine(ctx) {
  const { pet } = ctx;
  if (pet.mood === 'happy' || pet.mood === 'playful') {
    const pokes = ctx.events.count('click', POKE_WINDOW); // includes this click
    if (pokes >= 2 && pokes < POKES_TO_MAD) {
      const tier = Math.min(POKE_WARNINGS.length - 1, Math.floor(((pokes - 2) * POKE_WARNINGS.length) / Math.max(1, POKES_TO_MAD - 2)));
      if (pokes === POKES_TO_MAD - 1) strikePose(ctx, 'sad', 1.2); // grumpy look: next poke = mad
      return POKE_WARNINGS[tier]();
    }
  }
  return forMood(CLICK_BY_MOOD, pet);
}

// Per-mood pools. The 5th quick poke (POKES_TO_MAD) turns him mad *before* this click is answered (mood.js
// sees the click in the event log first), so that click already gets a mad line.
const CLICK_BY_MOOD = lineBags({
  happy: CLICK_LINES,
  mad: ['hey! stop that!', 'hmph!', 'quit poking me!', 'grrr', "i'm not talking to you", '>:(', "i've met friendlier black holes"],
  playful: ['again! again!', 'hehe, catch me!', 'wheee, more!', 'tag, you\'re it!', ':P', 'launch me into orbit!', 'wheee, zero gravity!'],
  dizzy: ['@_@', 'not now... still spinning', 'whoa, two of you?', 'ugh... wobbly'],
  yawning: ['*yawn* hm?', "i'm awake, i'm awake", 'sleepy...'],
  sad: ['...', 'oh. hi.', '*sniff*'], // (a click cheers him up first, so these rarely show)
  // Clicks don't wake him (only picking him up and shaking does), so hint at that.
  sleepy: ['zzz...', '*snore*', 'mmm... five more minutes...', 'zzz... (he needs a good shake)'],
});

const IDLE_BY_MOOD = lineBags({
  happy: IDLE_LINES,
  mad: ['hmph.', "i'm still mad, you know", '*grumbles*', 'no starbits for pokers', "i'm going back to space. ...in five minutes."],
  playful: ['throw me again!', 'that was fun!', 'hehe', 'wheee~ (remembering)', 'bet you can\'t throw me farther', 'i almost reached the moon that time!'],
  dizzy: ['the room is spinning...', '@_@', 'which way is up?'],
  yawning: ['*yaaawn*', 'so sleepy...', 'nap time soon...'],
  sad: ['*sigh*', 'i just wanted to play...', '...', 'oh well.'],
  sleepy: ['zzz...', '*snore*', 'zzz... mm... starbits...', '*mumbles*'],
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
    ctx.petEl.addEventListener('pet:clicked', () => ctx.say(clickLine(ctx), 2000));
    scheduleChat(ctx);
  },
};
