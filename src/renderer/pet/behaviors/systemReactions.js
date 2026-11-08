// Reacts to READ-ONLY system events sent from src/main/systemReads/.
// Event shapes:
//   { type: 'clipboard', length, kind }        kind: 'url' | 'email' | 'color' | 'number' | 'path'
//                                              | 'emoji' | 'code' | 'long' | 'text' | 'image' | 'files'
//                                              | 'screenshot' (he winks: "say cheese!")
//                                              (worked out in the main process; what you copied
//                                              never reaches the renderer)
//   { type: 'idle', seconds } | { type: 'idle-return' }
//   { type: 'power', onBattery, initial? }     initial: true for the state at startup
//   { type: 'lock' } | { type: 'unlock', lockedFor }   the PC was locked / unlocked (seconds)
//   { type: 'sleep' } | { type: 'wake', sleptFor }      the PC went to sleep / woke up
//   { type: 'call', active } | { type: 'fullscreen', active }   handled by ../events/hush.js
//   { type: 'time-of-day', hour, part }
//   { type: 'active-window', app, category }   category: 'browser' | 'editor' | 'game' | 'music'
//                                              | 'chat' | 'reading' | 'writing' | 'other'
//                                              (the window title stays in the main process)
//   { type: 'music', playing }                 handled by ../events/dance.js
//
// Read here in the renderer (not available in the main process):
//   battery level  navigator.getBattery() (read-only Battery Status API). Desktops without a
//                  battery report "charging, 100%" forever, so they simply never trigger.
//   internet       the window's 'online' / 'offline' events (Chromium's network status).
//
// All of these are unprompted, so they go through chat() (./chatter.js): they wait their turn
// or get dropped instead of stacking up. `wait` = how long a line stays worth saying.
import { chat, lineBag, lineBags } from './chatter.js';
import { startJump, isJumping } from './motion.js';
import { strikePose } from './mood.js';

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
  email: ['writing to someone?', 'an email address! say hi from me', "ooh, who's that?"],
  color: ['pretty color!', 'ooh, is that a color code?', 'i wonder what color that is ✦'],
  number: ['numbers! doing math?', 'ooh, digits', 'i can count to... a lot'],
  path: ['finding your files?', 'ooh, a file path', 'so organized!'],
  emoji: ['emoji! ✦', 'ooh, cute emoji', ':D'],
  code: ["ooh, code! nerd~", "copying code? i won't tell", 'beep boop, code detected'],
  image: ['ooh, a picture!', 'copied a pic? lemme see~', 'nice image ✦'],
  files: ['moving files around?', 'ooh, file shuffle', 'copy-paste files, very organized'],
  long: ["that's a lot of words", 'whoa, a whole essay', 'big copy energy'],
  text: ['copied something!', 'copy that ✦', 'ctrl+c, nice'],
});

// Locking the PC: nobody sees him then, so no line on lock; he greets you on unlock instead.
const UNLOCK = lineBags({
  quick: ['oh, that was quick!', 'back already?', 'hi again!'],
  away: ["you're back! i guarded the desktop ✦", 'welcome back!! i missed you', 'yay, you\'re back!'],
  long: ['finally! i thought you forgot about me', "you were gone ages! i counted all the pixels", 'welcome back, stranger ✦'],
});
const UNLOCK_AWAY = 60; // seconds locked to count as "away"...
const UNLOCK_LONG = 30 * 60; // ...and as "gone ages"

// Internet: only react if it stays down a few seconds (Wi-Fi blips are normal).
const NET = lineBags({
  offline: ['uh oh, the internet left :(', 'wifi went bye-bye...', 'no internet? more time for me!'],
  online: ["internet's back!", 'wifi returned ✦', 'reconnected! phew'],
});
const OFFLINE_AFTER = 3; // seconds offline before he says anything

// The PC woke up from sleep.
const WAKE = lineBag(['whoa, did we nap? good morning!', 'mm... are we awake now?', 'that was a good nap!']);

// Screenshot (Print Screen / Win+Shift+S): he strikes a pose (a wink) and says cheese.
const SCREENSHOT = lineBag(['say cheese!', 'did you get my good side?', 'ooh, a screenshot! *poses*']);
const POSE_FOR = 1.8; // seconds of wink

// Copying a lot in a row.
const CHAMPION = lineBag(["you're a copy-paste machine!", 'copy, paste, copy, paste...', 'ctrl+c champion right here']);
const CHAMPION_COPIES = 5; // copies...
const CHAMPION_WINDOW = 60; // ...within this many seconds
const CHAMPION_COOLDOWN = 10 * 60; // seconds before he says it again

// Time-of-day moments, read from the system clock: each at most once per hour.
// {t} = the time, like "2am". hours = local clock hours it applies to.
const MOMENTS = [
  { hours: [0, 1, 2, 3, 4], lines: lineBag(["it's {t}... go to sleep!", "{t}?! bedtime, please", "it's so late... i'm sleepy for you"]) },
  { hours: [12, 13], lines: lineBag(['lunch time?', "it's {t}, did you eat?", 'snack break? just saying']) },
  { hours: [18, 19], lines: lineBag(['dinner time?', "it's {t}... what's for dinner?", 'is it food o clock?']) },
];
const MOMENT_CHECK_EVERY = 60; // seconds
const clockLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

const IDLE = lineBag(['...zzz', '*yawn*', "guess i'll nap too"]);
const IDLE_RETURN = lineBag(['welcome back!', "oh, you're back!", 'missed you~']);
const POWER = lineBags({
  battery: ['running on battery!', 'unplugged! adventure time'],
  plugged: ['plugged in, yay', 'mmm, power'],
  relief: ['phew, thank you!', "ahh, that's better", 'charging up ✦'], // plugged in after a low warning
});

// 'other' apps get no line.
const APP_LINES = lineBags({
  browser: ['browsing time!', 'ooh, what are we looking up?', "don't open too many tabs~"],
  editor: ['ooh, code! you got this', 'coding time? go go go!', "i'll be quiet while you work... mostly"],
  game: ['game time!! good luck', 'ooh, are we gaming?', "i'll cheer from up here ✦"],
  music: ['ooh, music!', 'what are we listening to?', '*bops along*'],
  chat: ['say hi to everyone for me!', 'tell your friends i said hi ✦', 'ooh, who are we talking to?'],
  reading: ['ooh, reading something?', "what're we reading?", "i'll read over your shoulder~"],
  writing: ['ooh, typing something?', 'writing something important?', "i won't peek... much"],
});
const APP_COOLDOWN = 5 * 60; // seconds before commenting on the same kind of app again

let lastCategory = null;
const lastAppLineAt = {}; // category → session seconds

// Comment when the user moves to a different *kind* of app (Chrome → Firefox is not news),
// at most once per APP_COOLDOWN per kind, so alt-tabbing all day doesn't get chatty.
function appChanged(ctx, category) {
  const prev = lastCategory;
  lastCategory = category;
  if (!APP_LINES[category] || category === prev) return;
  const now = ctx.clock.seconds;
  if (now - (lastAppLineAt[category] ?? -Infinity) < APP_COOLDOWN) return;
  if (chat(ctx, APP_LINES[category](), 2500, { wait: 6 }) !== 'dropped') lastAppLineAt[category] = now;
}

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
      // Important enough to say even while he's asleep (other system reactions are dropped then).
      chat(ctx, LOW_LINES().replace('{pct}', pct), 4000, { wait: 30, ignoreQuiet: true });
      ctx.log('battery-low', { percent: pct });
    }
  };
  battery.addEventListener('levelchange', check);
  battery.addEventListener('chargingchange', check);
  check(); // already low at launch → warn once (queued behind the startup greeting)
}

// Unlocked the PC: a greeting that depends on how long you were away, and a happy hop.
function unlocked(ctx, lockedFor) {
  const { pet } = ctx;
  const kind = lockedFor >= UNLOCK_LONG ? 'long' : lockedFor >= UNLOCK_AWAY ? 'away' : 'quick';
  chat(ctx, UNLOCK[kind](), 2800, { wait: 8 });
  if ((pet.mode === 'idle' || pet.mode === 'walk') && !isJumping()) startJump({ height: 0.25 * pet.size, air: 0.4 });
}

// The PC woke up from sleep: a sleepy greeting and a hop.
function wokeUp(ctx) {
  const { pet } = ctx;
  chat(ctx, WAKE(), 2800, { wait: 8 });
  if ((pet.mode === 'idle' || pet.mode === 'walk') && !isJumping()) startJump({ height: 0.2 * pet.size, air: 0.4 });
}

// Clipboard: a screenshot gets a wink and "say cheese!"; lots of copies in a row get the
// champion line; anything else gets the line for its kind.
const copyTimes = [];
let championAt = -Infinity;
function copied(ctx, kind) {
  const now = ctx.clock.seconds;
  if (kind === 'screenshot') {
    strikePose(ctx, 'wink', POSE_FOR);
    ctx.say(SCREENSHOT(), 2200); // answers what you just did, so instant
    return;
  }
  copyTimes.push(now);
  while (copyTimes.length && now - copyTimes[0] > CHAMPION_WINDOW) copyTimes.shift();
  if (copyTimes.length >= CHAMPION_COPIES && now - championAt >= CHAMPION_COOLDOWN) {
    championAt = now;
    chat(ctx, CHAMPION(), 2500, { wait: 6 });
    return;
  }
  chat(ctx, (CLIPBOARD[kind] || CLIPBOARD.text)(), 2500, { wait: 4 });
}

// Time-of-day moments: checked every minute; each moment speaks at most once per clock hour.
let momentSaidFor = null; // "YYYY-M-D H" of the last moment line
function checkMoment(ctx, date = new Date()) {
  const h = date.getHours();
  const moment = MOMENTS.find((m) => m.hours.includes(h));
  const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${h}`;
  if (!moment || momentSaidFor === hourKey) return null;
  const said = chat(ctx, moment.lines().replace('{t}', clockLabel(h)), 3000, { wait: 30 });
  if (said !== 'dropped') momentSaidFor = hourKey;
  return said;
}

// Internet down for OFFLINE_AFTER seconds → one line; back up after that → one line.
function watchNetwork(ctx) {
  let offlineTimer = null;
  let saidOffline = false;
  window.addEventListener('offline', () => {
    ctx.log('network', { online: false });
    ctx.cancel(offlineTimer);
    offlineTimer = ctx.after(OFFLINE_AFTER, () => {
      offlineTimer = null;
      saidOffline = true;
      chat(ctx, NET.offline(), 2800, { wait: 10 });
    }, 'network: still offline?');
  });
  window.addEventListener('online', () => {
    ctx.log('network', { online: true });
    ctx.cancel(offlineTimer); // just a blip: say nothing
    offlineTimer = null;
    if (saidOffline) chat(ctx, NET.online(), 2500, { wait: 10 });
    saidOffline = false;
  });
}

export default {
  name: 'system-reactions',

  init(ctx) {
    watchBattery(ctx);
    watchNetwork(ctx);
    ctx.every(MOMENT_CHECK_EVERY, () => checkMoment(ctx), 'system: time-of-day moments');
    // DevTools: starby.timeMoment(13) tries the moment for 1pm right now.
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.timeMoment = (hour) => {
        const d = new Date();
        d.setHours(hour, 0, 0, 0);
        return checkMoment(ctx, d);
      };
    }
    ctx.api.onSystemEvent((evt) => {
      switch (evt.type) {
        case 'clipboard':
          copied(ctx, evt.kind);
          break;
        case 'wake':
          wokeUp(ctx);
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
        case 'active-window':
          appChanged(ctx, evt.category);
          break;
        case 'unlock':
          unlocked(ctx, evt.lockedFor ?? 0);
          break;
        default:
          break;
      }
    });
  },
};
