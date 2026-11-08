// Show a window and really bring it in front of whatever app you're using.
//
// WINDOWS QUIRK (foreground lock): Windows only lets an app take the foreground if it got the
// user's last input. Our clicks go to the pet window, which is focusable:false (so it never
// steals focus, see petWindow.js), so when the star's double-click or right-click menu opens
// the shop/settings, Windows refuses to bring the new window forward: it opens BEHIND the app
// you were using, and you only see it after clicking its taskbar button.
//
// Workaround: briefly make the window always-on-top (always allowed, and it jumps above
// everything), focus it, then drop always-on-top again. Dropping it puts the window at the top
// of the normal windows, so it stays in front without being stuck on top. The pet window stays
// above it, since the pet is always-on-top for good.
function bringToFront(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.setAlwaysOnTop(true);
  win.moveTop();
  win.focus();
  // A short delay so Windows has processed the z-order change before we undo it.
  setTimeout(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 150);
}

module.exports = { bringToFront };
