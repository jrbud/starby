// THE DIALOGUE TREE: what Starby says when you right-click him, and the answers you can pick.
// Edit freely: this file is just data. ./dialogue.js shows it and runs the actions.
//
// A node:
//   nodeId: {
//     line: 'what he says',            // or an array: one picked at random each time
//                                      // or a function (ctx) => string, for lines that depend on state
//     options: [ ...answers ],         // shown as buttons, top to bottom
//   }
//
// An answer (option):
//   { label: 'what you say',
//     next: 'nodeId',                  // go to another node (his reply), and/or...
//     action: 'shop',                  // ...do something, then close (see ACTIONS in ./dialogue.js):
//                                      //   'close'  'shop'  'settings'  'admin'  'quit'  'devtools'
//                                      //   'focus'  'unfocus'  'stop-event'
//                                      //   'game:<name>'     ask him to play that game (events/games.js)
//                                      //   'starby:<fn>'     call a DevTools helper, window.starby.<fn>()
//     say: 'okay!',                    // optional: a line he says (speech bubble) after the box closes
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

export const TREE = {
  start: {
    line: (ctx) => {
      const { mood } = ctx.pet;
      if (focusing(ctx)) return pick(['oh! hi! need something?', 'hm? what is it?']);
      if (mood === 'mad') return pick(['...what.', 'hmph. what do you want?']);
      if (mood === 'sleepy') return pick(['*yawn* huh? what\'s up?', 'mmh... hi...']);
      if (mood === 'sad') return pick(['oh... hey.', 'hi...']);
      return pick(['hey, what\'s up?', 'hi hi! what\'s up?', 'ooh, hi! what\'s going on?']);
    },
    options: [
      { label: "Let's chat!", next: 'chat' },
      { label: 'Wanna shop?', action: 'shop', say: 'ooh, shopping!' },
      { label: 'Do you want to play a game?', next: 'games' },
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
    line: (ctx) => {
      const rest = restLeft(ctx);
      if (rest > 0) return `i'm still a little tired... (${mmss(rest)})`;
      return pick(['yes!! which one?', 'ooh, a game! pick one!']);
    },
    options: [
      ...GAMES.map((g) => ({ label: g.label, action: `game:${g.name}` })),
      { label: 'Back', next: 'start' },
    ],
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

  dev: {
    line: ['beep boop. developer mode!'],
    options: [
      { label: 'Open pet DevTools', action: 'devtools' },
      { label: 'Start star shower now', action: 'starby:happening:star-shower' },
      { label: 'Start shooting star now', action: 'starby:happening:shooting-star' },
      { label: 'Invite me to a game', action: 'starby:invite' },
      { label: 'Skip game rest', action: 'starby:skipRest', say: 'all rested!' },
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
    line: ["we're in the middle of something!", 'hey! we\'re busy!'],
    options: [
      { label: 'Keep going', action: 'close' },
      { label: "Let's stop", action: 'stop-event' },
    ],
  },
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
