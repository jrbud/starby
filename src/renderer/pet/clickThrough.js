// CLICK-THROUGH (Windows): the pet window starts with setIgnoreMouseEvents(true, {forward:true}),
// so clicks go to whatever is underneath. When the cursor is over any `.hit` element we turn
// click-through OFF so the sprite can be clicked/dragged, and turn it back ON when it leaves.
//
// WINDOWS QUIRK: `forward: true` is supposed to keep delivering mousemove events while
// click-through is on, but on Windows forwarding silently dies after the sprite is dragged
// once. The renderer then goes blind to the cursor and click-through gets stuck in whatever
// state it was in (either the star can't be clicked, or nothing behind the window can).
// Fix: don't rely on forwarding. The main process polls the cursor position
// (see petWindow.js, `pet:cursor`) and we:
//   1. hit-test against that position ourselves, and
//   2. re-dispatch it as a synthetic `mousemove` on `window`, so every behavior that listens
//      for mousemove (pet.js cursor tracking, stardust, cursorReact, drag) keeps working
//      without having to know about this workaround.
// When real mousemoves do arrive they're handled the same way; duplicates are harmless.
//
// Gotcha: during a drag the cursor can outrun the sprite. If click-through flips back on
// mid-drag we lose the mouseup. Behaviors call setPinned(true) while dragging to prevent that.

let ignoring = true;
let pinned = false;
const cursor = { x: -9999, y: -9999 };

function setIgnore(ignore) {
  if (ignore === ignoring) return; // avoid spamming IPC
  ignoring = ignore;
  console.log('[CT-DEBUG] setIgnore', ignore, 'at', cursor.x, cursor.y); // TEMP debug
  window.sprite.setIgnoreMouse(ignore);
}

function updateHit() {
  if (pinned) return;
  const el = document.elementFromPoint(cursor.x, cursor.y);
  setIgnore(!(el && el.closest('.hit')));
}

export function setPinned(value) {
  pinned = value;
  if (pinned) setIgnore(false);
  else updateHit(); // re-check right away on release instead of waiting for the next move
}

export function initClickThrough() {
  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    updateHit();
  });

  // Polled cursor from the main process (window-relative CSS px).
  // TEMP debug: real vs polled moves, clicks, and where the pet is.
  let polled = 0;
  let real = 0;
  window.addEventListener('mousemove', (e) => { if (e.isTrusted) real++; });
  window.addEventListener('mousedown', (e) => console.log('[CT-DEBUG] mousedown', e.clientX, e.clientY, 'target', e.target.id || e.target.className));
  setInterval(() => {
    const r = document.getElementById('pet').getBoundingClientRect();
    const el = document.elementFromPoint(cursor.x, cursor.y);
    console.log('[CT-DEBUG] polled', polled, 'real', real, 'cursor', cursor.x, cursor.y, 'pet', Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), 'under', el && (el.id || el.tagName), 'ignoring', ignoring, 'pinned', pinned, 'dpr', window.devicePixelRatio, 'inner', window.innerWidth, window.innerHeight, 'vis', document.visibilityState);
    polled = 0; real = 0;
  }, 1000);

  window.sprite.onCursor(({ x, y }) => {
    polled++; // TEMP debug
    if (x === cursor.x && y === cursor.y) return; // a real mousemove already covered it
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  });

  // The star moves on its own, so it can walk under (or away from) a cursor that's
  // standing still. Re-check every frame; elementFromPoint is cheap.
  const loop = () => {
    updateHit();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
