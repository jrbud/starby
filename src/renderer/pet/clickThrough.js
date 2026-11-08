// CLICK-THROUGH (Windows): the pet window starts with setIgnoreMouseEvents(true, {forward:true}),
// so clicks go to whatever is underneath, but we still receive mousemove events.
// When the cursor is over any `.hit` element we turn click-through OFF so the sprite can be
// clicked/dragged, and turn it back ON when the cursor leaves.
//
// Gotcha: during a drag the cursor can outrun the sprite. If click-through flips back on
// mid-drag we lose the mouseup. Behaviors call setPinned(true) while dragging to prevent that.
//
// PINS HAVE OWNERS (fixed by Person 3): 'press' (the default: a drag / slingshot / hoop-shot pull,
// only valid while a mouse button is held) and 'menu' (the dialogue's click-away catcher). Each
// setPinned(false) only drops its own owner, so one feature can't unpin (or leave pinned) another.
// SELF-HEAL: a 'press' pin is dropped the moment the mouse moves with NO button held. Before, if an
// event interrupted a drag (a song, a call, the shop...) the unpin could be skipped and the whole
// screen stayed un-clickable (window X buttons dead) until the app quit.

let ignoring = true;
let pinned = false;
const owners = new Set(); // who has click-through pinned off: 'press' | 'menu'
let lastPos = null; // last cursor position (to re-check click-through right after an unpin)
// NEVER TURN CLICK-THROUGH BACK ON MID-PRESS (Windows): while a mouse button is held over this
// window, Windows routes the whole press to it. Making the window click-through in the middle of
// that press could leave the mouse stuck on this (invisible, full-screen) window: other apps'
// buttons stop working. So while a button is held we wait, and re-check on the release.
let held = 0; // mouse buttons held (from this window's own mouse events)
let recheckOnRelease = false;

function setIgnore(ignore) {
  if (ignore && held) { recheckOnRelease = true; return; } // not mid-press (see above)
  if (ignore === ignoring) return; // avoid spamming IPC on every mousemove
  ignoring = ignore;
  window.sprite.setIgnoreMouse(ignore);
}

const overHit = (x, y) => {
  const el = document.elementFromPoint(x, y);
  return Boolean(el && el.closest('.hit'));
};

export function setPinned(value, owner = 'press') {
  if (value) owners.add(owner);
  else owners.delete(owner);
  pinned = owners.size > 0;
  if (pinned) setIgnore(false);
  else if (lastPos) setIgnore(!overHit(lastPos.x, lastPos.y)); // back to normal right away
}

// STILL-CURSOR RECHECK: the hover check above only runs on mousemove. But HE moves too: drop him
// and let go, then he hops/walks off (or flies away after a throw) while your mouse sits still,
// and the window stayed solid over empty pixels, eating your scroll wheel and clicks on the page
// underneath until you nudged the mouse. So re-check where the cursor already is a few times a
// second (and on any wheel that lands here), in both directions.
const RECHECK_MS = 100;

function recheck() {
  if (pinned || held || !lastPos) return;
  setIgnore(!overHit(lastPos.x, lastPos.y));
}

export function initClickThrough() {
  setInterval(recheck, RECHECK_MS);
  // A wheel that reached this window over nothing of his: pass the next ones through.
  window.addEventListener('wheel', (e) => { lastPos = { x: e.clientX, y: e.clientY }; recheck(); }, { passive: true });
  window.addEventListener('mousedown', (e) => { held = e.buttons || 1; }, true);
  window.addEventListener('mouseup', (e) => {
    held = e.buttons || 0;
    if (!held && recheckOnRelease) {
      recheckOnRelease = false;
      if (!pinned && lastPos) setIgnore(!overHit(lastPos.x, lastPos.y));
    }
  }, true);
  window.addEventListener('mousemove', (e) => {
    held = e.buttons || 0;
    lastPos = { x: e.clientX, y: e.clientY };
    // A 'press' pin with no button held is stale (its mouseup got lost): drop it.
    if (owners.has('press') && e.buttons === 0) {
      owners.delete('press');
      pinned = owners.size > 0;
    }
    if (pinned) return;
    setIgnore(!overHit(e.clientX, e.clientY));
  });
}
