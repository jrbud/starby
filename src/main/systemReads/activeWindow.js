// Active/focused window (read-only). Emits
//   emit('active-window', { app, category, key })   category: 'browser' | 'editor' | 'game' | 'music'
//                                              | 'chat' | 'reading' | 'writing' | 'other'
//                                              key: a specific app or site ('notepad', 'acrobat',
//                                              'taskmanager', 'youtube'...; see appKey) or null
// when the user settles on a different app (or a browser tab switches kind / site).
//
// Uses the `get-windows` npm package. On Windows it's a prebuilt Node-API addon, so it loads in
// Electron without a rebuild. It only *reads* the foreground window and the name/path of the
// process that owns it; it never interacts with or modifies the other app. The first call takes
// ~1s (loading the addon); after that each poll is ~1ms, so polling doesn't stall the main process.
// `get-windows` is ESM-only, hence the dynamic import() from this CommonJS file.
//
// PRIVACY: the window title never leaves this file (titles hold email subjects, file names,
// chat names...). It's only used locally for a few hints below (Minecraft, a PDF or a Google
// Doc open in a browser, which site a tab is on). We send the app's display name, a coarse category
// and a short app/site key ('youtube'), nothing else.

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
    'spotify', 'spotifast', 'applemusic', 'itunes', 'musicbee', 'foobar2000', 'winamp', 'tidal', 'deezer',
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
    'acrord32', 'acrobat', 'acrocef', 'acrobat_sl', 'sumatrapdf', 'foxitpdfreader', 'foxitreader', 'foxitphantompdf',
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
  if (/\.pdf\b/i.test(title) && !CATEGORIES.editor.includes(exe)) return 'reading'; // a PDF in ANY app (Adobe...)
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

// A specific app (by exe) or site (a browser tab's title), for app-specific lines in
// renderer/pet/behaviors/systemReactions.js. Only this short key is sent, never the title.
const APP_KEYS = {
  notepad: 'notepad', 'notepad++': 'notepadpp', acrobat: 'acrobat', acrord32: 'acrobat', acrocef: 'acrobat',
  winword: 'word', excel: 'excel', powerpnt: 'powerpoint', onenote: 'onenote', outlook: 'outlook', olk: 'outlook',
  taskmgr: 'taskmanager', calculatorapp: 'calculator', calc: 'calculator', mspaint: 'paint', paint: 'paint',
  photoshop: 'photoshop', blender: 'blender', figma: 'figma', obs64: 'obs', obs32: 'obs', zoom: 'zoom',
  systemsettings: 'settings', steam: 'steam', steamwebhelper: 'steam', discord: 'discord', code: 'vscode',
  spotify: 'spotify', spotifast: 'spotify', minecraft: 'minecraft', minecraftlauncher: 'minecraft',
  robloxplayerbeta: 'roblox', whatsapp: 'whatsapp', windowsterminal: 'terminal', wt: 'terminal', cmd: 'terminal',
  powershell: 'terminal', pwsh: 'terminal',
};
// Sites, from a browser tab's title (checked here; the title never leaves this file).
const SITE_KEYS = [
  { key: 'youtube', test: /youtube/i }, { key: 'netflix', test: /netflix/i }, { key: 'twitch', test: /twitch/i },
  { key: 'github', test: /github/i }, { key: 'gmail', test: /gmail|inbox \(\d+\)/i }, { key: 'reddit', test: /reddit/i },
  { key: 'wikipedia', test: /wikipedia/i }, { key: 'amazon', test: /amazon/i }, { key: 'nasa', test: /\bnasa\b/i },
  { key: 'pdf', test: /\.pdf\b/i },
];

function appKey(exe, title, category) {
  if (exe === 'javaw' && /minecraft/i.test(title)) return 'minecraft';
  if (exe === 'explorer') return title && title !== 'Program Manager' ? 'files' : null; // File Explorer, not the desktop
  if (CATEGORIES.browser.includes(exe)) {
    const site = SITE_KEYS.find((k) => k.test.test(title));
    return site ? site.key : null;
  }
  if (category === 'reading' && !(exe in APP_KEYS)) return 'pdf';
  return APP_KEYS[exe] ?? null;
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
// Windows' own full-screen overlays aren't "a fullscreen app": the snipping overlay (Win+Shift+S),
// Start / search, the lock screen, the touch keyboard... (explorer = the desktop, task view).
const NOT_FULLSCREEN_APPS = [
  'explorer', 'shellexperiencehost', 'startmenuexperiencehost', 'searchhost', 'searchapp', 'searchui',
  'lockapp', 'screenclippinghost', 'snippingtool', 'screensketch', 'textinputhost', 'shellhost',
];
const FULLSCREEN_POLLS = 2; // must stay fullscreen this many polls in a row (leaving counts at once)

function isFullscreen(exe, b) {
  if (!b || NOT_FULLSCREEN_APPS.includes(exe)) return false;
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
  let fullscreenPolls = 0; // polls in a row the focused window has been fullscreen

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
    const specific = appKey(exe, win.title || '', category);
    // App + category + site, so switching browser tabs to a PDF / YouTube counts as a change too.
    const key = (exePath.toLowerCase() || exe) && `${exePath.toLowerCase() || exe}|${category}|${specific}`;
    if (!key) return;

    seen = key === candidate ? seen + 1 : 1;
    candidate = key;
    // Fullscreen only counts once it's held for FULLSCREEN_POLLS polls; leaving counts at once.
    fullscreenPolls = isFullscreen(exe, toDip(win.bounds)) ? fullscreenPolls + 1 : 0;
    const fullscreen = fullscreenPolls >= FULLSCREEN_POLLS;
    if (fullscreen !== sentFullscreen) {
      sentFullscreen = fullscreen;
      emit('fullscreen', { active: fullscreen });
    }
    if (seen < STABLE_POLLS || key === reported) return;

    reported = key;
    emit('active-window', { app: owner.name || exe, category, key: specific });
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

module.exports = { start, categorize, isFullscreen, appKey };
