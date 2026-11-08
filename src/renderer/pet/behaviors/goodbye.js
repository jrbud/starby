// GOODBYE (Person 3): when sprite.exe quits, Starby says goodbye before the window closes.
// src/main/goodbye.js holds the quit and calls window.starby.goodbye() here; when we're done we
// tell it (api.goodbyeDone) and the app quits. (If this ever hangs, the main process quits anyway
// after a few seconds.)
//
//   1. anything he's doing stops (event, dialogue); he's awake and un-hushed for it
//   2. an excited goodbye line in his speech bubble (SAY_FOR)
//   3. the bubble goes, and he BURSTS: a star-cloud explosion on top of him (fx.js goodbyeBurst:
//      the team's starcloud1/2 frames swapping) and he just disappears in it, right where he is
//      (a quick fade, VANISH_MS); his floating accessories (balloon, ufo, trail) vanish with him.
//      (Not a CSS scale on #pet: that also scales his on-screen position, so he'd zoom off toward
//      the top-left corner instead of staying put.)
//   4. done → the app quits
// Owns the star via pet.mode = 'goodbye' (behaviors stand down); he doesn't move. DevTools: starby.goodbye() (this
// WILL quit the app).
import { goodbyeBurst } from './fx.js';
import { requestMood } from './mood.js';
import { closeDialogue } from '../dialogue/dialogue.js';
import { speechBubble } from '../bubble.js';
import { sfx } from '../../shared/sfx.js';

// ---- Tuning ----
const SAY_FOR = 1.4; // seconds of his goodbye line before the burst
const VANISH_MS = 90; // he blinks out inside the burst
const AFTER_MS = 650; // let the star clouds fly a moment before the window closes

const LINES = [
  'see you next time!',
  'byeee! come back soon!',
  "bye bye! i'll miss you!",
  'until next time! *twinkle*',
  'see ya, space cadet!',
  'off to the stars! bye!',
];

let leaving = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function sayGoodbye(ctx) {
  const { pet } = ctx;
  // 1. Drop everything.
  closeDialogue(ctx);
  if (ctx.activeEvent()) ctx.stopEvent('goodbye');
  pet.mode = 'goodbye';
  pet.hushed = false; // (a call / fullscreen app: he still gets to say bye)
  pet.noDialogue = true;
  pet.faceOverride = null;
  pet.rotation = 0;
  if (pet.mood !== 'happy' && pet.mood !== 'playful') requestMood(ctx, 'happy', 'saying goodbye'); // awake + talking
  ctx.log('goodbye', {});
  // exit.mp3. Exclusive: nothing else plays over it (not even the chat blip of his bye line).
  sfx.play('exit', { exclusive: true });

  // 2. The line.
  ctx.say(LINES[Math.floor(Math.random() * LINES.length)], SAY_FOR * 1000 + 600);
  pet.goodbyeSaid = true; // from now on nothing else gets to talk over it (mood.js speech gate)
  await wait(SAY_FOR * 1000);

  // 3. Burst + shrink.
  speechBubble()?.hide();
  goodbyeBurst(ctx);
  // He just disappears inside the burst (and his floating accessories with him).
  for (const el of [ctx.petEl, ...ctx.stage.querySelectorAll(':scope > .floater, :scope > svg')]) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: VANISH_MS, fill: 'forwards' });
  }
  await wait(VANISH_MS + AFTER_MS);

  // 4. Done: the main process quits the app.
  ctx.api.goodbyeDone?.();
}

export default {
  name: 'goodbye',

  init(ctx) {
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.goodbye = () => {
        if (leaving) return 'already leaving';
        leaving = true;
        sayGoodbye(ctx);
        return 'bye!';
      };
    }
  },

  // Hold still while leaving (events / behaviors mustn't take him back mid-goodbye).
  update(ctx) {
    if (leaving && ctx.pet.mode !== 'goodbye' && ctx.pet.mode !== 'drag') ctx.pet.mode = 'goodbye';
  },
};
