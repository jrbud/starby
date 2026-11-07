// CLICK-THROUGH (Windows): the pet window starts with setIgnoreMouseEvents(true, {forward:true}),
// so clicks go to whatever is underneath, but we still receive mousemove events.
// When the cursor is over any `.hit` element we turn click-through OFF so the sprite can be
// clicked/dragged, and turn it back ON when the cursor leaves.
//
// Gotcha: during a drag the cursor can outrun the sprite. If click-through flips back on
// mid-drag we lose the mouseup. Behaviors call setPinned(true) while dragging to prevent that.

let ignoring = true;
let pinned = false;

function setIgnore(ignore) {
  if (ignore === ignoring) return; // avoid spamming IPC on every mousemove
  ignoring = ignore;
  window.sprite.setIgnoreMouse(ignore);
}

export function setPinned(value) {
  pinned = value;
  if (pinned) setIgnore(false);
}

export function initClickThrough() {
  window.addEventListener('mousemove', (e) => {
    if (pinned) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setIgnore(!(el && el.closest('.hit')));
  });
}
