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
//   { type: 'active-window', app, category, key }   category: 'browser' | 'editor' | 'game' | 'music'
//                                              | 'chat' | 'reading' | 'writing' | 'other'
//                                              (the window title stays in the main process)
//                                              key: a specific app / site ('notepad', 'acrobat', 'youtube'...)
//   { type: 'music', playing }                 handled by ../events/dance.js
//   { type: 'theme', dark } | { type: 'display', count, change } | { type: 'cpu', busy }   (desktop.js)
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

// A specific app or site (activeWindow.js `key`) beats the category line, and comes back sooner.
const APP_SPECIFIC = lineBags({
  notepad: ['notepad? old school. i respect it', 'ooh, quick notes?', "writing a secret? i won't look"],
  notepadpp: ['notepad plus plus! fancy', 'ooh, the plus plus kind', 'editing something nerdy?'],
  acrobat: ['ooh, a pdf! reading something important?', 'adobe! very official', "what're we reading?"],
  pdf: ['ooh, a pdf!', "reading time? i'll be quiet", "what're we reading?"],
  word: ['word time! writing an essay?', 'ooh, a document. very professional'],
  excel: ['spreadsheets! so many little boxes', 'excel? i can count stars, does that help?'],
  powerpoint: ['making slides? add a star, trust me', 'ooh, a presentation!'],
  onenote: ['taking notes? write one about me'],
  outlook: ['emails... good luck in there', 'inbox zero? i believe in you'],
  taskmanager: ['task manager? is everything okay in there?', "checking on your computer? i'm doing great, thanks"],
  calculator: ['doing math? i can count to infinity. twice.', 'calculator! what are we figuring out?'],
  paint: ['ooh, art time! draw me?', 'paint! make it sparkly'],
  photoshop: ['photoshop! make me look extra shiny', 'ooh, editing pics?'],
  blender: ['blender! are we making 3d stars?'],
  figma: ['figma! designing something cool?'],
  obs: ['are we streaming?! hi chat!', 'ooh, recording? let me find my good side'],
  zoom: ["zoom! i'll be on my best behavior"],
  settings: ["changing settings? don't change me!", 'ooh, tweaking things'],
  steam: ['steam! what are we playing?', 'game shopping? get the space ones'],
  discord: ['discord! say hi to everyone for me!', 'tell your friends a star says hi'],
  vscode: ['vs code! you got this, coder', 'ooh, coding? go go go!'],
  spotify: ['ooh, what are we listening to?', "play something! i'll dance"],
  minecraft: ['minecraft! build me a star', "don't let the creepers get you!"],
  roblox: ['roblox! what are we playing?'],
  whatsapp: ['say hi from me!'],
  terminal: ['ooh, a terminal. very hacker', 'typing commands? beep boop... i mean, twinkle'],
  files: ['looking for something?', 'file adventure!'],
  youtube: ['ooh, what are we watching?', 'youtube! anything with space in it?'],
  netflix: ['netflix! is it a space movie?', "movie time? i'll grab the starbits"],
  twitch: ['twitch! who are we watching?'],
  github: ['github! very official coder stuff'],
  gmail: ['checking emails? good luck in there'],
  reddit: ['reddit! rabbit hole time?'],
  wikipedia: ['wikipedia! looking up space facts? i know a few'],
  amazon: ['shopping? i have a shop too, you know'],
  nasa: ["nasa!! that's my neighborhood!", 'say hi to the astronauts for me!'],
});
const KEY_COOLDOWN = 2 * 60; // seconds before the same app/site line again

// Been in one kind of app for a long time (once per stretch).
const LONG_SESSION = 60 * 60; // seconds
const LONG_LINES = lineBags({
  editor: ["you've been coding for an hour! stretch break?", 'one hour of code! drink some water, ok?'],
  game: ["an hour of gaming! you're on a roll", 'still playing? one more round, right?'],
  reading: ["you've been reading for ages! what a bookworm"],
  writing: ["an hour of writing! that's a lot of words"],
  browser: ['an hour of browsing... how many tabs now?'],
});

// Switching apps a lot in a short time.
const MULTITASK_SWITCHES = 6; // app changes...
const MULTITASK_WINDOW = 30; // ...within this many seconds
const MULTITASK_COOLDOWN = 10 * 60;
const MULTITASK = lineBag(['so much multitasking!', 'whoa, tab tab tab tab', 'busy busy! i can barely keep up']);

// Desktop (desktop.js).
const THEME = lineBags({
  dark: ['ooh, dark mode! very spacey', 'dark mode! now i really shine'],
  light: ['light mode! my eyes!', 'whoa, so bright in here'],
});
const DISPLAY = lineBags({
  added: ['a new screen?! more room for me!', 'ooh, another monitor! can i have it?'],
  removed: ["where'd the other screen go?", 'aww, one screen less'],
});
const CPU_BUSY = lineBag(['whoa, your computer is working hard!', "your pc is huffing and puffing... want me to blow on it?", 'something is keeping your computer really busy']);
const CPU_COOLDOWN = 15 * 60;

// The day of the week, once when he starts up.
const WEEKDAY = {
  1: lineBag(['ugh, mondays... i got you', 'monday! fresh start ✦']),
  5: lineBag(["it's friday!!", 'friday! almost weekend!']),
  6: lineBag(['saturday! do we even have to work today?', 'weekend vibes ✦']),
  0: lineBag(['sunday! cozy day?', 'lazy sunday, my favorite']),
};

let lastCategory = null;
const lastAppLineAt = {}; // category → session seconds

// Comment when the user moves to a different *kind* of app (Chrome → Firefox is not news),
// at most once per APP_COOLDOWN per kind, so alt-tabbing all day doesn't get chatty.
const lastKeyLineAt = {}; // app/site key → session seconds
let categorySince = 0; // when the current kind of app started
let longSaid = false; // said the long-session line for this stretch
const switchTimes = [];
let multitaskAt = -Infinity;

function appChanged(ctx, category, key) {
  const now = ctx.clock.seconds;
  // Multitasking: lots of app changes in a short time.
  switchTimes.push(now);
  while (switchTimes.length && now - switchTimes[0] > MULTITASK_WINDOW) switchTimes.shift();
  if (switchTimes.length >= MULTITASK_SWITCHES && now - multitaskAt >= MULTITASK_COOLDOWN) {
    multitaskAt = now;
    chat(ctx, MULTITASK(), 2500, { wait: 4 });
    return;
  }
  const prev = lastCategory;
  lastCategory = category;
  if (category !== prev) { categorySince = now; longSaid = false; }
  // A specific app / site first (its own, shorter cooldown).
  if (key && APP_SPECIFIC[key] && now - (lastKeyLineAt[key] ?? -Infinity) >= KEY_COOLDOWN) {
    if (chat(ctx, APP_SPECIFIC[key](), 2500, { wait: 6 }) !== 'dropped') {
      lastKeyLineAt[key] = now;
      lastAppLineAt[category] = now;
    }
    return;
  }
  if (!APP_LINES[category] || category === prev) return;
  if (now - (lastAppLineAt[category] ?? -Infinity) < APP_COOLDOWN) return;
  if (chat(ctx, APP_LINES[category](), 2500, { wait: 6 }) !== 'dropped') lastAppLineAt[category] = now;
}

// An hour in the same kind of app: one gentle line (checked every minute).
function checkLongSession(ctx) {
  if (longSaid || !LONG_LINES[lastCategory]) return;
  if (ctx.clock.seconds - categorySince < LONG_SESSION) return;
  if (chat(ctx, LONG_LINES[lastCategory](), 3000, { wait: 30 }) !== 'dropped') longSaid = true;
}

let cpuAt = -Infinity;
let weekdaySaid = false;

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
    ctx.every(60, () => checkLongSession(ctx), 'system: long app sessions');
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
          if (!weekdaySaid) { // and the day of the week, once at startup
            weekdaySaid = true;
            const day = WEEKDAY[new Date().getDay()];
            if (day) chat(ctx, day(), 3000, { wait: 25 });
          }
          break;
        case 'active-window':
          appChanged(ctx, evt.category, evt.key);
          break;
        case 'theme':
          chat(ctx, (evt.dark ? THEME.dark : THEME.light)(), 2500, { wait: 6 });
          break;
        case 'display':
          if (DISPLAY[evt.change]) chat(ctx, DISPLAY[evt.change](), 2800, { wait: 8 });
          break;
        case 'cpu':
          if (evt.busy && ctx.clock.seconds - cpuAt >= CPU_COOLDOWN) {
            cpuAt = ctx.clock.seconds;
            chat(ctx, CPU_BUSY(), 3000, { wait: 15 });
          }
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
