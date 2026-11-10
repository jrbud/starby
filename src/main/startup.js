// RUN WHEN WINDOWS STARTS: an opt-in (welcome window + Settings → App), OFF unless the user turns it on.
//
// SCOPE NOTE (team-approved): this is the one thing Starby writes outside its own folder. Electron's
// setLoginItemSettings adds/removes a value in the CURRENT USER's startup list
// (HKCU\Software\Microsoft\Windows\CurrentVersion\Run). Per-user only: no admin rights, no other
// users, nothing else in the registry. Turning it off removes the value again.
//
// WINDOWS QUIRK (portable .exe): the portable build unpacks itself to a temp folder on every launch
// and runs from THERE (process.execPath). The startup entry must point at the .exe the user actually
// has, which electron-builder's portable wrapper passes in PORTABLE_EXECUTABLE_FILE. (If they move
// that .exe later, the entry points at the old spot and Windows just skips it; turning it off and on
// again fixes it.)
// In development (`npm start`) process.execPath is electron.exe itself, which would start a blank
// Electron, so it's unavailable there: available: false, and the checkboxes are disabled.
const { app } = require('electron');

const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const available = () => app.isPackaged;

/** { available, enabled } */
function get() {
  if (!available()) return { available: false, enabled: false };
  try {
    return { available: true, enabled: Boolean(app.getLoginItemSettings({ path: exePath() }).openAtLogin) };
  } catch {
    return { available: true, enabled: false };
  }
}

/** Turn it on/off (no-op where unavailable). Returns the new { available, enabled }. */
function set(on) {
  if (!available()) return get();
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(on), path: exePath() });
  } catch (err) {
    console.warn('[startup] could not change run-at-startup:', err.message);
  }
  return get();
}

module.exports = { get, set };
