// Launcher for `npm start`. Starts Electron with ELECTRON_RUN_AS_NODE removed from its
// environment.
//
// Why: if ELECTRON_RUN_AS_NODE=1 is set (VS Code sets it for its own processes, and terminals
// or tools started from inside VS Code can inherit it), Electron runs as plain Node.js:
// require('electron') returns no API, `app` is undefined, and main.js crashes with
// "Cannot read properties of undefined (reading 'requestSingleInstanceLock')".
// Doing this in a script (not `env -u` in package.json) works the same on Windows and macOS.
const { spawn } = require('child_process');
const path = require('path');

// Required from plain Node, the electron package exports the path to the Electron binary.
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, '..'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

// Pass Ctrl+C / termination on to Electron, and exit with Electron's exit code.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (err) => {
  console.error('Failed to start Electron:', err.message);
  process.exit(1);
});
