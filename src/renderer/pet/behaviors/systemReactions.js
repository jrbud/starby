// Reacts to READ-ONLY system events sent from src/main/systemReads/.
// Event shapes: { type: 'clipboard', length, preview } | { type: 'idle', seconds }
//   | { type: 'idle-return' } | { type: 'power', onBattery }
//   | { type: 'time-of-day', hour, part } | { type: 'active-window', title, app } (TODO)
// TODO(system-reads owner): battery % via navigator.getBattery(), more varied reactions.

const GREETINGS = {
  morning: 'good morning!',
  afternoon: 'good afternoon~',
  evening: 'evening already?',
  night: "it's late... sleepy?",
};

export default {
  name: 'system-reactions',

  init(ctx) {
    ctx.api.onSystemEvent((evt) => {
      switch (evt.type) {
        case 'clipboard':
          ctx.say(evt.length > 200 ? 'ooh, that’s a lot of words' : 'copied something!', 2000);
          break;
        case 'idle':
          ctx.say('...zzz', 4000);
          break;
        case 'idle-return':
          ctx.say('welcome back!', 2500);
          break;
        case 'power':
          ctx.say(evt.onBattery ? 'running on battery!' : 'plugged in, yay', 2500);
          break;
        case 'time-of-day':
          ctx.say(GREETINGS[evt.part] || 'hi!', 3000);
          break;
        default:
          break;
      }
    });
  },
};
