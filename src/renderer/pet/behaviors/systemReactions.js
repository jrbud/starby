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
// Battery level isn't available in the main process, so it's read here with
// navigator.getBattery() (read-only Battery Status API, built into Chromium/Electron).
// Desktops without a battery report "charging, 100%" forever, so they simply never trigger.
//
// All of these are unprompted, so they go through chat() (./chatter.js): they wait their turn
// or get dropped instead of stacking up. `wait` = how long a line stays worth saying.
import { chat, lineBag, lineBags } from './chatter.js';

const LOW_BATTERY = 0.2; // warn once at or below this while on battery
const LOW_RESET = 0.25; // ...and only warn again after it has charged back above this
const POWER_DEDUPE = 5; // seconds: main's 'power' event and the battery API both report a plug-in
const LOW_LINES = lineBag([
  'only {pct}% battery left...',
  "battery's at {pct}%, i'm getting sleepy",
  '{pct}%! maybe find a charger?',
]);

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
  relief: ['phew, thank you!', "ahh, that's better", 'charging up ✦'], // plugged in after a low warning
});

// Set when we warn; cleared once the battery charges back above LOW_RESET, so a quick
// plug-in/unplug at 15% doesn't nag again, but the next real discharge does.
let warnedLow = false;
let lastPowerLine = { charging: null, at: -Infinity };

// Plug-in / unplug from either source → at most one line per change.
function powerChanged(ctx, charging) {
  const now = ctx.clock.seconds;
  if (lastPowerLine.charging === charging && now - lastPowerLine.at < POWER_DEDUPE) return;
  lastPowerLine = { charging, at: now };
  let line;
  if (charging) {
    line = warnedLow ? POWER.relief() : POWER.plugged();
  } else {
    line = POWER.battery();
  }
  chat(ctx, line, 2500, { wait: 8 });
}

async function watchBattery(ctx) {
  let battery;
  try {
    battery = await navigator.getBattery();
  } catch {
    return; // no Battery Status API: plug/unplug lines still come from main's 'power' event
  }
  let wasCharging = battery.charging;
  const check = () => {
    if (battery.charging !== wasCharging) {
      wasCharging = battery.charging;
      powerChanged(ctx, battery.charging);
    }
    if (warnedLow && battery.level > LOW_RESET) warnedLow = false;
    if (!battery.charging && battery.level <= LOW_BATTERY && !warnedLow) {
      warnedLow = true;
      const pct = Math.round(battery.level * 100);
      chat(ctx, LOW_LINES().replace('{pct}', pct), 4000, { wait: 30 });
      ctx.log('battery-low', { percent: pct });
    }
  };
  battery.addEventListener('levelchange', check);
  battery.addEventListener('chargingchange', check);
  check(); // already low at launch → warn once (queued behind the startup greeting)
}

export default {
  name: 'system-reactions',

  init(ctx) {
    watchBattery(ctx);
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
          if (!evt.initial) powerChanged(ctx, !evt.onBattery);
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
