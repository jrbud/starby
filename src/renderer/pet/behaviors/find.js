// FIND STARBY (tray → "Find Starby"): he pops into the middle of the screen with a star burst and
// says hi, so you can spot him (e.g. he was tucked in a corner or next to the taskbar).
// The tray sends { type: 'starby', fn: 'find' } (src/main/tray.js → pet.js onPetCommand).
// During an event (a game, the shop...) or while you're holding him, he stays put and just waves:
// the event owns his position.
// DevTools: starby.find().
import { cancelJump } from './motion.js';

const LINES = ['here i am!', 'you rang?', 'peekaboo!', 'right here!'];
const FREE_MODES = ['idle', 'walk', 'follow', 'flee', 'fidget', 'toss'];

function find(ctx) {
  const { pet } = ctx;
  if (!ctx.activeEvent() && FREE_MODES.includes(pet.mode)) {
    const a = ctx.area();
    cancelJump();
    pet.x = (a.left + a.right) / 2 - pet.size / 2;
    pet.y = (a.top + a.bottom) / 2 - pet.size / 2;
    pet.rotation = 0;
    pet.bob = 0;
    pet.squash = 1;
    pet.warp = null;
    pet.mode = 'idle';
  }
  window.starby?.fx?.('burst');
  ctx.say(LINES[Math.floor(Math.random() * LINES.length)], 2500);
  ctx.log('found', {});
  return 'found';
}

export default {
  name: 'find',

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) window.starby.find = () => find(ctx);
  },
};
