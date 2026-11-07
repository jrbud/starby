// Idle commentary + something to say when clicked.
// TODO(speech owner): more lines, personality, avoid repeats.

const IDLE_LINES = ['*twinkle*', 'la la la', 'nice desktop you got here', 'i like it up here', '✦'];
const CLICK_LINES = ['hehe', 'boop!', 'hi hi', "that tickles", 'you found me!'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

let nextChatIn = rand(20, 40);

export default {
  name: 'speech',

  init(ctx) {
    ctx.petEl.addEventListener('pet:clicked', () => ctx.say(pick(CLICK_LINES), 2000));
  },

  update(ctx, dt) {
    nextChatIn -= dt;
    if (nextChatIn <= 0) {
      nextChatIn = rand(20, 40);
      if (!ctx.isSpeaking() && ctx.pet.mode !== 'drag') ctx.say(pick(IDLE_LINES));
    }
  },
};
