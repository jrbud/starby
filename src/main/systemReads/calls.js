// Is a video call / meeting going on? (read-only) Emits
//   emit('call', { active })   when that changes (and once at startup)
// so Starby can go quiet and sit still (renderer/pet/events/hush.js).
//
// HOW: every POLL_MS we read the open windows (get-windows, read-only: nothing is focused,
// moved or changed) and look for a meeting window by program name + window title, HERE:
//   Zoom        a "Zoom Meeting" / "Zoom Webinar" window
//   Teams       a window titled "...Meeting..." or "...Call..." (the meeting/call window)
//   Google Meet a browser window whose current tab is Meet ("Meet - abc-defg-hij")
//   Webex       its meeting window
//   Slack       a huddle window
// PRIVACY: titles never leave this file. Only true/false is sent.
// LIMITS: a Meet call in a background browser tab can't be seen (only the current tab's title
// is visible); Discord voice channels have no tell-tale window.
const path = require('path');

const POLL_MS = 3000;
const exeOf = (owner) => path.win32.basename((owner && (owner.path || owner.name)) || '').toLowerCase().replace(/\.exe$/, '');
const BROWSERS = ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'vivaldi', 'arc', 'zen'];

// [exe test, title test]
const MEETING_WINDOWS = [
  [(e) => e === 'zoom', (t) => /zoom (meeting|webinar)/i.test(t)],
  [(e) => e === 'teams' || e === 'ms-teams' || e === 'msteams', (t) => /\b(meeting|call)\b/i.test(t) && !/^calendar\b/i.test(t)],
  [(e) => BROWSERS.includes(e), (t) => /^meet\s*[-–]|google meet|meet\.google\.com/i.test(t)],
  [(e) => e === 'webex' || e === 'webexmta' || e === 'ciscocollabhost', (t) => /meeting|webex/i.test(t)],
  [(e) => e === 'slack', (t) => /huddle/i.test(t)],
];

/** True if this window (exe name without .exe, title) is a meeting/call window. */
function isMeetingWindow(exe, title) {
  const t = String(title || '');
  return MEETING_WINDOWS.some(([exeTest, titleTest]) => exeTest(exe) && titleTest(t));
}

function start(emit) {
  let active = null;
  import('get-windows')
    .then(({ openWindows }) => {
      const poll = async () => {
        let wins;
        try {
          wins = await openWindows();
        } catch {
          return; // a window vanished mid-read; try again next poll
        }
        const now = wins.some((w) => isMeetingWindow(exeOf(w.owner), w.title));
        if (now !== active) {
          active = now;
          emit('call', { active: now });
        }
      };
      poll();
      setInterval(poll, POLL_MS);
    })
    .catch((err) => console.warn('[calls] could not load get-windows; quiet-during-calls is off:', err.message));
}

module.exports = { start, isMeetingWindow };
