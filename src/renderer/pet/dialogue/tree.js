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
const ACTION_GAMES = ['tag', 'pong', 'catch', 'hoop-shot'];
const CHILL_GAMES = ['hide-seek', 'starby-says', 'constellation'];
const gameOptions = (names) => names
  .map((name) => GAMES.find((g) => g.name === name))
  .filter(Boolean)
  .map((g) => ({ label: g.label, action: `game:${g.name}` }));

// "i'm still tired (0:42)" while he needs a rest after a game, else `fresh`.
const restOr = (fresh) => (ctx) => {
  const rest = restLeft(ctx);
  return rest > 0 ? `i'm still a little tired... (${mmss(rest)})` : pick(fresh);
};

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
      { label: 'Settings', next: 'settings' },
      { label: 'Never mind', action: 'close' },
    ],
  },

  // Placeholder until the real chat tree is written.
  chat: {
    line: ['ooh, i love chatting! (the chat is still being written)'],
    options: [
      { label: 'Okay!', action: 'close' },
      { label: 'Back', next: 'start' },
    ],
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
      { label: 'Open settings', action: 'settings' },
      { label: 'Admin settings', action: 'admin' },
      { label: 'Developer stuff', next: 'dev' },
      { label: 'Quit sprite.exe', next: 'quit' },
      { label: 'Back', next: 'start' },
    ],
  },

  // (Also in the tray menu's Developer submenu, with a couple more, e.g. "invite you to a game".)
  dev: {
    line: ['beep boop. developer mode!'],
    options: [
      { label: 'Open pet DevTools', action: 'devtools' },
      { label: 'Star shower now', action: 'starby:happening:star-shower' },
      { label: 'Shooting star now', action: 'starby:happening:shooting-star' },
      { label: 'No game rest (5 min)', action: 'starby:noRest:5', say: 'no breaks for 5 minutes!' },
      { label: 'Stop current event', action: 'stop-event' },
      { label: 'Back', next: 'settings' },
    ],
  },

  quit: {
    line: ["you're leaving? :(", 'aww, bye already?'],
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
