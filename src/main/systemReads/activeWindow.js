// Active/focused window (read-only). Emits
//   emit('active-window', { app, category })   category: 'browser' | 'editor' | 'game' | 'music'
//                                              | 'chat' | 'reading' | 'writing' | 'other'
// when the user settles on a different app (or a browser tab switches kind, e.g. to a PDF).
//
// Uses the `get-windows` npm package. On Windows it's a prebuilt Node-API addon, so it loads in
// Electron without a rebuild. It only *reads* the foreground window and the name/path of the
// process that owns it; it never interacts with or modifies the other app. The first call takes
// ~1s (loading the addon); after that each poll is ~1ms, so polling doesn't stall the main process.
// `get-windows` is ESM-only, hence the dynamic import() from this CommonJS file.
//
// PRIVACY: the window title never leaves this file (titles hold email subjects, file names,
// chat names...). It's only used locally for a few hints below (Minecraft, a PDF or a Google
// Doc open in a browser). We send the app's display name and a coarse category, nothing else.

const POLL_MS = 2000;
const STABLE_POLLS = 2; // an app must stay focused this many polls in a row before we report it,
// so alt-tabbing past windows doesn't fire a reaction for each one

// Matched against the lower-cased exe name without ".exe".
const CATEGORIES = {
  browser: [
    'chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'vivaldi', 'arc', 'zen',
    'librewolf', 'waterfox', 'iexplore',
  ],
  editor: [
    'code', 'code - insiders', 'cursor', 'windsurf', 'zed', 'devenv', 'sublime_text', 'notepad++',
    'idea64', 'pycharm64', 'webstorm64', 'rider64', 'clion64', 'goland64', 'phpstorm64', 'studio64',
    'nvim-qt', 'neovide',
  ],
  music: [
    'spotify', 'applemusic', 'itunes', 'musicbee', 'foobar2000', 'winamp', 'tidal', 'deezer',
    'amazon music', 'aimp',
  ],
  game: [
    // launchers count too: "game time?" fits
    'steam', 'steamwebhelper', 'epicgameslauncher', 'battle.net', 'riotclientservices', 'leagueclient',
    'league of legends', 'valorant', 'robloxplayerbeta', 'minecraft', 'minecraftlauncher', 'cs2', 'csgo',
    'gta5', 'eldenring', 'overwatch', 'fortniteclient-win64-shipping', 'osu!', 'rocketleague', 'dota2',
    'r5apex', 'genshinimpact',
  ],
  chat: [
    'discord', 'discordptb', 'discordcanary', 'slack', 'teams', 'ms-teams', 'msteams', 'whatsapp',
    'telegram', 'signal', 'messenger', 'element', 'zulip',
  ],
  reading: [ // PDF readers (a PDF open in a browser is caught by the title, below)
    'acrord32', 'acrobat', 'sumatrapdf', 'foxitpdfreader', 'foxitreader', 'foxitphantompdf',
    'pdfxedit', 'pdfxcview', 'nitropdf', 'okular', 'drawboardpdf',
  ],
  writing: [ // documents: writing, notes, spreadsheets, slides
    'winword', 'wordpad', 'notepad', 'onenote', 'notion', 'obsidian', 'excel', 'powerpnt',
    'soffice', 'soffice.bin', 'scrivener', 'typora', 'joplin', 'evernote',
  ],
};

// In a browser, the tab says more than the app: a PDF is reading, a Google Doc is writing.
// (Checked on the title locally; the title still never leaves this file.)
const BROWSER_HINTS = [
  { category: 'reading', test: /\.pdf\b/i },
  { category: 'writing', test: /google (docs|sheets|slides)|microsoft word|word online|- word$|notion\b/i },
];

// Games get installed all over the place; these folders are a strong hint.
const GAME_FOLDERS = [
  '\\steamapps\\common\\', '\\epic games\\', '\\riot games\\', '\\xboxgames\\', '\\gog galaxy\\games\\',
  '\\ea games\\', '\\ubisoft game launcher\\games\\',
];

function categorize(exe, exePath, title) {
  for (const [category, names] of Object.entries(CATEGORIES)) {
    if (!names.includes(exe)) continue;
    if (category === 'browser') {
      const hint = BROWSER_HINTS.find((h) => h.test.test(title));
      if (hint) return hint.category;
    }
    return category;
  }
  const p = exePath.toLowerCase();
  if (GAME_FOLDERS.some((folder) => p.includes(folder))) return 'game';
  if (exe === 'javaw' && /minecraft/i.test(title)) return 'game'; // Minecraft Java runs as javaw.exe
  return 'other';
}

// Our own shop window can take focus (the pet window can't: it's focusable:false).
// Windows are owned by the main Electron process, i.e. this one.
function isOwnProcess(owner) {
  return owner.processId === process.pid
    || (owner.path && owner.path.toLowerCase() === process.execPath.toLowerCase());
}

// WINDOWS QUIRK: get-windows reports physical pixels on Windows; Electron's displays are in DIPs
// (they differ with display scaling above 100%), so convert before comparing. Others match.
function toDip(b) {
  if (!b || !Number.isFinite(b.x)) return null;
  const rect = { x: b.x, y: b.y, width: b.width, height: b.height };
  if (process.platform !== 'win32') return rect;
  try {
    return require('electron').screen.screenToDipRect(null, rect);
  } catch {
    return rect;
  }
}

// FULLSCREEN: the focused window covers its whole display (a fullscreen game or video; a
// maximized window doesn't count, the taskbar is still showing). Not the desktop itself.
// Emitted as 'fullscreen' { active } whenever it changes (renderer/pet/events/hush.js).
function isFullscreen(exe, b) {
  if (!b || exe === 'explorer') return false;
  let d;
  try {
    d = require('electron').screen.getDisplayMatching(b).bounds;
  } catch {
    return false;
  }
  return b.x <= d.x + 2 && b.y <= d.y + 2 && b.width >= d.width - 4 && b.height >= d.height - 4;
}

function start(emit) {
  let activeWindow = null;
  let candidate = null; // app seen on the last poll(s)
  let seen = 0; // how many polls in a row
  let reported = null; // last app we emitted
  let sentFullscreen = null; // last fullscreen state we emitted

  const poll = async () => {
    let win;
    try {
      win = await activeWindow();
    } catch {
      return; // e.g. a window closed mid-read; try again next poll
    }
    const owner = win && win.owner;
    if (!owner || isOwnProcess(owner)) return;

    const exePath = owner.path || '';
    const exe = (exePath.split('\\').pop() || owner.name || '').replace(/\.exe$/i, '').toLowerCase();
    const category = categorize(exe, exePath, win.title || '');
    // App + category, so switching browser tabs to a PDF / Google Doc counts as a change too.
    const key = (exePath.toLowerCase() || exe) && `${exePath.toLowerCase() || exe}|${category}`;
    if (!key) return;

    seen = key === candidate ? seen + 1 : 1;
    candidate = key;
    const fullscreen = isFullscreen(exe, toDip(win.bounds));
    if (fullscreen !== sentFullscreen) {
      sentFullscreen = fullscreen;
      emit('fullscreen', { active: fullscreen });
    }
    if (seen < STABLE_POLLS || key === reported) return;

    reported = key;
    emit('active-window', { app: owner.name || exe, category });
  };

  import('get-windows')
    .then((mod) => {
      activeWindow = mod.activeWindow;
      poll();
      setInterval(poll, POLL_MS);
    })
    .catch((err) => {
      // Don't take the app down over a nice-to-have: the pet just won't react to app switches.
      console.warn('[activeWindow] could not load get-windows; active-window reactions are off:', err.message);
    });
}

module.exports = { start, categorize, isFullscreen };
