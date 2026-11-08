// Is a song playing in Spotify? (read-only) Emits
//   emit('music', { playing })   when that changes (and once at startup)
//
// HOW: the Spotify desktop app's window title is the song while one plays ("Artist - Song"),
// and just the app's own name ("Spotify" / "Spotify Premium" / "Spotify Free" / "Spotifast")
// when paused or stopped. So ANY other title means music is playing. Every POLL_MS we read the
// titles of that app's windows (get-windows, read-only: nothing is focused, moved or changed)
// and work out playing / not playing HERE.
//
// PRIVACY: the title (song and artist) never leaves this file. Only true/false is sent.
//
// Matches any program whose exe name contains "spotif" (Spotify, and similar players like
// Spotifast). LIMITS: if Spotify is closed to the tray (no window at all), it can't be seen;
// the Spotify web player in a browser isn't detected.
const path = require('path');

const POLL_MS = 2000;
const PLAYER = /spotif/i; // exe name
// Titles that mean "open but not playing": the app's own name (with or without its plan),
// ads, an empty title, and Windows' invisible helper windows some apps own.
const NOT_PLAYING = [
  /^$/,
  /^spoti(fy|fast)(\s+(premium|free|music))?$/i,
  /^(spotify\s*[-–]\s*)?advertisement$/i,
  /^(gdi\+ window|default ime|msctfime ui|chrome legacy window)\b/i,
];

/** True if a player window title means a song is playing: anything but an idle title. */
function isPlayingTitle(title) {
  const t = String(title || '').trim();
  return !NOT_PLAYING.some((re) => re.test(t));
}

const exeOf = (owner) => path.win32.basename((owner && (owner.path || owner.name)) || '').toLowerCase();

function start(emit) {
  let playing = null;
  import('get-windows')
    .then(({ openWindows }) => {
      const poll = async () => {
        let wins;
        try {
          wins = await openWindows();
        } catch {
          return; // a window vanished mid-read; try again next poll
        }
        const now = wins.some((w) => PLAYER.test(exeOf(w.owner)) && isPlayingTitle(w.title));
        if (now !== playing) {
          playing = now;
          emit('music', { playing: now });
        }
      };
      poll();
      setInterval(poll, POLL_MS);
    })
    .catch((err) => {
      console.warn('[music] could not load get-windows; dancing to music is off:', err.message);
    });
}

module.exports = { start, isPlayingTitle };
