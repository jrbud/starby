// FOCUS: "Sorry, I gotta focus" in the right-click dialogue (../dialogue/tree.js).
// Starby is sad but understanding: he says so, walks to the bottom-left corner of the usable
// screen (standing on the taskbar), and stays there, quiet, until you come back to him.
//
//   while focusing   pet.hushed = true (after his "okay..." line), so he says nothing at all:
//                    no idle chatter, no system-read comments. Starbit drops, game invites, sky
//                    events and dancing are all paused: this event outranks them (priority 16),
//                    and starbits.js skips drops in 'focus' mode.
//   ends when        you click him or pick him up (he cheers up and says hi), or you pick
//                    "Okay, I'm done focusing!" in the dialogue. The shop window (priority 20)
//                    also ends it.
// You can still right-click him while he focuses: the dialogue opens and he stays parked.
// Above hush (15): if a call starts while focusing he's already quiet and parked.
// Owns the star via pet.mode = 'focus'. DevTools: starby.startEvent('focus').
import { approach, petBounds } from '../behaviors/motion.js';
import { requestMood } from '../behaviors/mood.js';
import { lineBag } from '../behaviors/chatter.js';

const WALK_SPEED = 120; // px/s to the corner
const EDGE = 8; // px in from the left edge
const QUIET_AFTER = 2.6; // seconds: let his "okay..." line finish before he goes silent
// Things you do to him that end focus (event log types).
const WAKE_ON = ['click', 'grab'];

const LINES = {
  okay: lineBag(["oh... okay. i'll be right here!", "aw, okay. you got this!", "okay... i'll be quiet. good luck!"]),
  back: lineBag(['yay, you\'re back!', 'all done? hi hi!', 'break time? yay!']),
};

let endFocus = null;
let t = 0;

function finish(result) {
  const end = endFocus;
  endFocus = null;
  end?.(result);
}

const corner = (ctx) => {
  const b = petBounds(ctx);
  return { x: b.minX + EDGE, y: b.maxY }; // bottom-left, standing on the taskbar line
};

export default {
  name: 'focus',
  category: 'system',
  priority: 16, // above hush 15, games 10, sky 14, dance 2; below the shop window 20

  init(ctx) {
    ctx.events.onEntry((e) => {
      if (endFocus && WAKE_ON.includes(e.type)) finish('woken');
    });
  },

  start(ctx, end) {
    const { pet } = ctx;
    endFocus = end;
    t = 0;
    requestMood(ctx, 'sad', 'you need to focus'); // a little sad (mood.js: lasts a few seconds)
    ctx.say(LINES.okay(), QUIET_AFTER * 1000);
    if (pet.mode !== 'drag' && pet.mode !== 'toss') pet.mode = 'focus';
  },

  update(ctx, dt) {
    const { pet } = ctx;
    t += dt;
    if (t >= QUIET_AFTER) pet.hushed = true;
    if (pet.mode === 'drag' || pet.mode === 'toss') return; // (grabbing ends focus anyway)
    if (pet.mode !== 'focus') pet.mode = 'focus';
    pet.rotation = 0;

    const c = corner(ctx);
    const dx = c.x - pet.x;
    const dy = c.y - pet.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      // Walk over, a bit droopy (mood.js shows the walking-left frames from his movement).
      const step = Math.min(d, WALK_SPEED * dt);
      pet.x += (dx / d) * step;
      pet.y += (dy / d) * step;
      pet.facing = dx < 0 ? -1 : 1;
      pet.bob = -Math.abs(Math.sin(t * 9)) * 3;
      pet.squash = approach(pet.squash, 1, dt, 10);
      return;
    }
    // Parked: a slow, quiet breath.
    pet.bob = Math.sin(t * 1.5) * 1.5;
    pet.squash = approach(pet.squash, 1 + Math.sin(t * 1.5) * 0.015, dt, 6);
  },

  stop(ctx, result) {
    const { pet } = ctx;
    endFocus = null;
    pet.hushed = false;
    pet.bob = 0;
    if (pet.mode === 'focus') pet.mode = 'idle';
    // Came back to him: a happy hello. (A beat later, so speech.js's click answer doesn't cover it.)
    if (result === 'woken' || result === 'done') {
      requestMood(ctx, 'happy', 'done focusing');
      ctx.after(0.15, () => ctx.say(LINES.back(), 2200), 'focus hello');
    }
  },
};
