// Reacts to READ-ONLY system events sent from src/main/systemReads/.
// Event shapes:
//   { type: 'clipboard', length, kind }        kind: 'url' | 'number' | 'long' | 'text'
//                                              (worked out in the main process; the clipboard
//                                              text itself never reaches the renderer)
//   { type: 'idle', seconds } | { type: 'idle-return' }
//   { type: 'power', onBattery, initial? }     initial: true for the state at startup
//   { type: 'time-of-day', hour, part }
//   { type: 'active-window', app, category }   TODO (P3-1)
//
// All of these are unprompted, so they go through chat() (./chatter.js): they wait their turn
// or get dropped instead of stacking up. `wait` = how long a line stays worth saying.
// TODO(P3-3): battery % via navigator.getBattery().
import { chat, lineBag, lineBags } from './chatter.js';

const GREETINGS = lineBags({
  morning: ['good morning!', 'morning! ✦', 'rise and shine~'],
  afternoon: ['good afternoon~', 'afternoon already!', 'hope lunch was good'],
  evening: ['evening already?', 'good evening ✦', 'the sky must be pretty right now'],
  night: ["it's late... sleepy?", 'night owl, huh?', "it's my time to shine ✦"],
});

const CLIPBOARD = lineBags({
  url: ['ooh, a link!', 'going somewhere?', 'saving that link for later?'],
  number: ['numbers! doing math?', 'ooh, digits', 'i can count to... a lot'],
  long: ["that's a lot of words", 'whoa, a whole essay', 'big copy energy'],
  text: ['copied something!', 'copy that ✦', 'ctrl+c, nice'],
});

const IDLE = lineBag(['...zzz', '*yawn*', "guess i'll nap too"]);
const IDLE_RETURN = lineBag(['welcome back!', "oh, you're back!", 'missed you~']);
const POWER = lineBags({
  battery: ['running on battery!', 'unplugged! adventure time'],
  plugged: ['plugged in, yay', 'mmm, power'],
});

export default {
  name: 'system-reactions',

  init(ctx) {
    ctx.api.onSystemEvent((evt) => {
      switch (evt.type) {
        case 'clipboard':
          chat(ctx, (CLIPBOARD[evt.kind] || CLIPBOARD.text)(), 2500, { wait: 4 });
          break;
        case 'idle':
          chat(ctx, IDLE(), 4000, { wait: 10 });
          break;
        case 'idle-return':
          chat(ctx, IDLE_RETURN(), 2500, { wait: 6 });
          break;
        case 'power':
          // The state at startup isn't news; only react when it actually changes.
          if (!evt.initial) chat(ctx, (evt.onBattery ? POWER.battery : POWER.plugged)(), 2500, { wait: 8 });
          break;
        case 'time-of-day':
          if (GREETINGS[evt.part]) chat(ctx, GREETINGS[evt.part](), 3000, { wait: 15 });
          break;
        default:
          break;
      }
    });
  },
};
