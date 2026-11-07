// Active/focused window title (read-only). NOT IMPLEMENTED YET.
//
// Electron has no built-in API for other apps' windows. Options:
//   - the `get-windows` npm package (native module, read-only; check it builds on Windows)
//   - a small read-only PowerShell call (slower; spawns a process every poll)
// Whichever you choose: read only. Emit something like
//   emit('active-window', { title, app })
// when the focused window changes.

function start(_emit) {
  // TODO(system-reads owner): implement.
}

module.exports = { start };
