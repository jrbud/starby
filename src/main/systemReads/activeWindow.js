// Active/focused window (read-only). Emits
//   emit('active-window', { app, category })   category: 'browser' | 'editor' | 'game' | 'music' | 'other'
// when the user settles on a different app.
//
// Uses the `get-windows` npm package. On Windows it's a prebuilt Node-API addon, so it loads in
// Electron without a rebuild. It only *reads* the foreground window and the name/path of the
// process that owns it; it never interacts with or modifies the other app. The first call takes
// ~1s (loading the addon); after that each poll is ~1ms, so polling doesn't stall the main process.
// `get-windows` is ESM-only, hence the dynamic import() from this CommonJS file.
//
// PRIVACY: the window title never leaves this file (titles hold email subjects, file names,
// chat names...). It's only used locally for one game hint below. We send the app's display
// name and a coarse category, nothing else.

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
};

// Games get installed all over the place; these folders are a strong hint.
const GAME_FOLDERS = [
  '\\steamapps\\common\\', '\\epic games\\', '\\riot games\\', '\\xboxgames\\', '\\gog galaxy\\games\\',
  '\\ea games\\', '\\ubisoft game launcher\\games\\',
];

function categorize(exe, exePath, title) {
  for (const [category, names] of Object.entries(CATEGORIES)) {
    if (names.includes(exe)) return category;
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

function start(emit) {
  let activeWindow = null;
  let candidate = null; // app seen on the last poll(s)
  let seen = 0; // how many polls in a row
  let reported = null; // last app we emitted

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
    const key = exePath.toLowerCase() || exe;
    if (!key) return;

    seen = key === candidate ? seen + 1 : 1;
    candidate = key;
    if (seen < STABLE_POLLS || key === reported) return;

    reported = key;
    emit('active-window', { app: owner.name || exe, category: categorize(exe, exePath, win.title || '') });
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

module.exports = { start, categorize };
