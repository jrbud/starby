// THE DIALOGUE TREE: what Starby says when you right-click him, and the answers you can pick.
// Edit freely: this file is just data. ./dialogue.js shows it and runs the actions.
//
// RULE: at most 6 answers per node (MAX_OPTIONS in ./dialogue.js): they sit in a horseshoe around
// him, 3 on each side. With an odd count, the last answer sits centered under him. Split bigger
// lists into sub-nodes (see the games: Action / Chill).
//
// A node:
//   nodeId: {
//     line: 'what he says',            // shown in the box above his head
//                                      // or an array: one picked at random each time
//                                      // or a function (ctx) => string, for lines that depend on state
//     options: [ ...answers ],         // the boxes around him: left, right, left, right, ...
//     pose: 'wink',                    // optional: a face he makes while saying it ('wink',
//                                      // 'glistening', 'playful', 'spittle', 'sad'...), or
//                                      // { face, for: seconds }
//   }
//
// An answer (option):
//   { label: 'what you say',
//     next: 'nodeId',                  // go to another node (his reply; the new boxes burst out of
//                                      // the box you picked), and/or...
//     action: 'shop',                  // ...do something, then close (see runAction in ./dialogue.js):
//                                      //   'close'  'shop'  'settings'  'admin'  'quit'  'devtools'
//                                      //   'focus'  'unfocus'  'stop-event'
//                                      //   'game:<name>'          ask him to play that game (events/games.js)
//                                      //   'starby:<fn>[:<arg>]'  call a DevTools helper, window.starby.<fn>(arg)
//     say: 'okay!',                    // optional: a line he says (speech bubble) after the boxes close
//     show: (ctx) => true,             // optional: only show this answer when it returns true
//   }
//
// 'start' is the node right-clicking opens. 'busy' opens instead while a game / sky event is on.
// To write the chat: fill in the 'chat' node and add your own nodes, linking them with `next`.
import { GAMES, restLeft } from '../events/games.js';

const focusing = (ctx) => ctx.activeEvent() === 'focus';

const mmss = (s) => {
  const whole = Math.ceil(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// Games, split in two so no menu has more than 6 answers (each list + Back ≤ 6).
// A game added to GAMES (events/games.js) also needs adding to one of these lists.
const ACTION_GAMES = ['tag', 'pong', 'catch', 'hoop-shot', 'maze'];
const CHILL_GAMES = ['hide-seek', 'starby-says', 'constellation', 'memory', 'shuffle'];
const gameOptions = (names) => names
  .map((name) => GAMES.find((g) => g.name === name))
  .filter(Boolean)
  .map((g) => ({ label: g.label, action: `game:${g.name}` }));

// "i'm still tired (0:42)" while he needs a rest after a game, else `fresh`.
const restOr = (fresh) => (ctx) => {
  const rest = restLeft(ctx);
  return rest > 0 ? `i'm still a little tired... (${mmss(rest)})` : pick(fresh);
};

// The end of a chat branch: answers that close the chat (no Back). `goodbye` (optional) = a line he
// says as the boxes go back in, on the second answer ("Talk to you later!" -> "byeee!").
function end(first, second = 'Talk to you later!', goodbye = null) {
  return [
    { label: first, action: 'close' },
    { label: second, action: 'close', say: goodbye || pick(['byeee!', 'talk soon!', 'see ya! *twinkle*']) },
  ];
}

export const TREE = {
  start: {
    line: (ctx) => {
      const { mood } = ctx.pet;
      if (focusing(ctx)) return pick(['oh! hi! need something?', 'hm? what is it?']);
      if (mood === 'mad') return pick(['...what.', 'hmph. what do you want?']);
      if (mood === 'sleepy') return pick(["*yawn* huh? what's up?", 'mmh... hi...']);
      if (mood === 'sad') return pick(['oh... hey.', 'hi...']);
      return pick(["hey, what's up?", "hi hi! what's up?", "ooh, hi! what's going on?"]);
    },
    options: [
      { label: "Let's chat!", next: 'chat' },
      { label: 'Wanna shop?', action: 'shop', say: 'ooh, shopping!' },
      { label: 'Wanna play a game?', next: 'games' },
      { label: 'Sorry, I gotta focus', action: 'focus', show: (ctx) => !focusing(ctx) },
      { label: "Okay, I'm done focusing!", action: 'unfocus', show: focusing },
      { label: 'Never mind', action: 'close' },
      { label: 'Settings', next: 'settings' },
    ],
  },

  // ---- Chat ----
  // Starby is fun, outgoing and excited, but he's seen basically everything (he's made of
  // starlight), so your questions are a little bit silly to him.
  // Middle nodes have a Back; the LAST reply of a branch ends the chat instead (end(): "Haha,
  // okay!", "Talk to you later!", ...), sometimes with a goodbye line from him as the boxes go back.
  // `pose` = a face he makes while saying the line (frames.js faces: wink, glistening, playful,
  // spittle, sad, up, ...).
  chat: {
    line: ['ooh, chat time! ask me anything!', "ask away! i've seen it all, probably.", 'yay, questions! go go go!'],
    options: [
      { label: 'Do you miss your star friends?', next: 'chatFriends' },
      { label: "What's your favorite moon?", next: 'chatMoon' },
      { label: 'How long have you been a star?', next: 'chatAge' },
      { label: 'Is there alien life out there?', next: 'chatAliens' },
      { label: "How's my desktop?", next: 'chatDesktop' },
      { label: 'Back', next: 'start' },
    ],
  },

  chatFriends: {
    line: "sometimes! but i'm made of light, so i can visit them whenever i want. zoom!",
    options: [
      { label: 'What are their names?', next: 'chatFriendNames' },
      { label: "Wait, you're light speed?", next: 'chatLightSpeed' },
      { label: 'Can I meet them?', next: 'chatFriendsMeet' },
      { label: 'Back', next: 'chat' },
    ],
  },
  chatFriendNames: {
    line: 'gavin, jeremy, ian and legrand! total legends, all four of them.',
    pose: 'glistening',
    options: end('They sound awesome!', 'Talk to you later!'),
  },
  chatFriendsMeet: {
    line: "they're kinda far... like, REALLY far. but i'll tell them you said hi!",
    options: end('Aww, thanks!', 'Tell them hi!', 'will do! *twinkle*'),
  },
  chatLightSpeed: {
    line: 'yep! wanna see me go to the moon and back? ...done. wanna see it again?',
    pose: 'playful',
    options: [
      { label: 'Do it again!', next: 'chatLightSpeedAgain' },
      { label: "I didn't see anything...", next: 'chatLightSpeedBlink' },
      { label: 'Back', next: 'chatFriends' },
    ],
  },
  chatLightSpeedAgain: {
    line: '...and back! that was the fastest one yet. you blinked, huh?',
    pose: 'wink',
    options: end('Wow, okay!', 'Talk to you later!'),
  },
  chatLightSpeedBlink: {
    line: "exactly! that's how fast i am. hehe.",
    pose: 'playful',
    options: end('Haha, okay!', 'Talk to you later!'),
  },

  chatMoon: {
    line: "mmm... io! it's fun to say. io. io... io!",
    pose: 'playful',
    options: [
      { label: "That's Jupiter's moon, right?", next: 'chatMoonJupiter' },
      { label: 'Say it again!', next: 'chatMoonAgain' },
      { label: 'What about our moon?', next: 'chatMoonOurs' },
      { label: 'Was our moon landing faked?', next: 'chatMoonLanding' },
      { label: 'Back', next: 'chat' },
    ],
  },
  chatMoonLanding: {
    line: 'nah, that was real. wrong moon tho',
    pose: 'wink',
    options: [
      // He clams up and the dialogue closes.
      { label: 'What?', action: 'close', say: "i've said too much" },
      { label: 'Which one is made of cheese?', next: 'chatMoonCheese' },
    ],
  },
  chatMoonCheese: {
    line: 'idk, ask wallace and gromit',
    pose: 'playful',
    options: end('Haha, okay!', 'Talk to you later!'),
  },
  chatMoonJupiter: {
    line: 'look at you! the volcano one. very spicy. 10/10 moon.',
    pose: 'glistening',
    options: end('Spicy moon. Got it.', 'Talk to you later!'),
  },
  chatMoonAgain: {
    line: 'io! ...okay, that one was just for you.',
    pose: 'wink',
    options: end('Haha, thanks!', 'Talk to you later!', 'io! io! byeee!'),
  },
  chatMoonOurs: {
    line: "the moon? classic. a little dusty, but i'd never say that to its face.",
    options: end('Haha, okay!', 'Talk to you later!'),
  },

  chatAge: {
    line: "rude! you can't just ask a star that!",
    pose: { face: 'sad', for: 1.2 }, // (the grumpy frames)
    options: [
      { label: 'Hey! I was just wondering!', next: 'chatAgeWondering' },
      { label: "Oh, my bad, I'm sorry!", next: 'chatAgeSorry' },
      { label: 'Back', next: 'chat' },
    ],
  },
  chatAgeWondering: {
    line: 'okay, okay... about one zabillion years. give or take a weekend.',
    options: end('Wow, okay!', 'Talk to you later!'),
  },
  chatAgeSorry: {
    line: "it's okay! you're still my friend :)",
    pose: 'glistening',
    options: end('Yay!', 'Talk to you later!', 'bye, friend!'),
  },

  chatAliens: {
    line: "bruh. you're looking at one.",
    options: [
      { label: 'No, like ALIEN aliens', next: 'chatAliensReal' },
      { label: 'Space must be scary alone', next: 'chatAliensAlone' },
      { label: 'Back', next: 'chat' },
    ],
  },
  chatAliensReal: {
    line: 'yes, duh! have you never seen e.t.?',
    options: [
      { label: 'Wait, that was real?!', next: 'chatAliensDocumentary' },
      { label: 'Back', next: 'chatAliens' },
    ],
  },
  chatAliensDocumentary: {
    line: 'of course! it was a documentary.',
    pose: 'wink',
    options: end('Huh. Okay!', 'Talk to you later!'),
  },
  chatAliensAlone: {
    line: 'nah, space is cozy! and aliens are sooo chill.',
    options: [
      { label: 'How chill?', next: 'chatAliensChill' },
      { label: 'Back', next: 'chatAliens' },
    ],
  },
  chatAliensChill: {
    line: "let's just say... martians know how to party.",
    pose: { face: 'spittle', for: 1.92 }, // the spit-laugh
    options: end('Haha, okay!', 'Talk to you later!', 'party on!'),
  },

  chatDesktop: {
    line: 'pretty neat! honestly one of my favorites.',
    options: [
      { label: 'Aww, thanks!', next: 'chatDesktopThanks' },
      { label: "You've seen others?", next: 'chatDesktopOthers' },
      { label: 'Favorite thing on here?', next: 'chatDesktopFavorite' },
      { label: 'Back', next: 'chat' },
    ],
  },
  chatDesktopThanks: {
    line: 'of course! *wink*',
    pose: { face: 'wink', for: 1.2 },
    options: end('Hehe, okay!', 'Talk to you later!'),
  },
  chatDesktopOthers: {
    line: 'oh, tons. speed of light and all. yours is top ten though!',
    options: end('Only top ten?!', 'Talk to you later!', "top ten! that's a lot of desktops!"),
  },
  chatDesktopFavorite: {
    line: "the cursor! it's always running around. we're basically best friends.",
    pose: 'glistening',
    options: end('Aww!', 'Talk to you later!'),
  },

  games: {
    line: restOr(['yes!! what kind?', 'ooh, a game! what kind?']),
    options: [
      { label: 'Action games', next: 'gamesAction' },
      { label: 'Chill games', next: 'gamesChill' },
      { label: 'Back', next: 'start' },
    ],
  },

  gamesAction: {
    line: restOr(["let's go! pick one!", 'ooh, which one?']),
    options: [...gameOptions(ACTION_GAMES), { label: 'Back', next: 'games' }],
  },

  gamesChill: {
    line: restOr(['something cozy? pick one!', 'ooh, which one?']),
    options: [...gameOptions(CHILL_GAMES), { label: 'Back', next: 'games' }],
  },

  settings: {
    line: ['settings stuff? sure!', 'what do you want to change?'],
    options: [
      { label: 'Feeling sleepy?', action: 'starby:getSleepy' }, // "yeah... *yawn*" → sleepy walk to the taskbar
      { label: 'Open settings', action: 'settings' },
      { label: 'bye starby!', next: 'quit' },
      { label: 'Back', next: 'start' },
    ],
  },

  // HIDDEN: only opens with 3 Shift+right-clicks on him in a row (dialogue.js), not from Settings.
  // (Also in the tray menu's Developer submenu, with a couple more, e.g. "invite you to a game".)
  dev: {
    line: ['beep boop. developer mode!', 'psst... secret menu!'],
    options: [
      { label: 'Admin settings', action: 'admin' },
      { label: 'Star shower now', action: 'starby:happening:star-shower' },
      { label: 'Shooting star now', action: 'starby:happening:shooting-star' },
      { label: 'No game rest (5 min)', action: 'starby:noRest:5', say: 'no breaks for 5 minutes!' },
      { label: 'Stop current event', action: 'stop-event' },
      { label: 'Close', action: 'close' },
    ],
  },

  quit: {
    line: ["you're leaving?", 'aww, bye already?'],
    options: [
      { label: 'Yes, quit', action: 'quit' },
      { label: 'No, stay!', next: 'start' },
    ],
  },

  // Right-clicked during a game or a sky event.
  busy: {
    line: ["we're in the middle of something!", "hey! we're busy!"],
    options: [
      { label: 'Keep going', action: 'close' },
      { label: "Let's stop", action: 'stop-event' },
    ],
  },
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
