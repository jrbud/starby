// Click / drag / right-click on the pet. The pet can live anywhere on screen, so after a
// drag it stays where you let go (kept on screen) instead of falling back to the taskbar.
// A click without moving emits a 'pet:clicked' DOM event that other behaviors can react to.

const CLICK_SLOP = 4; // px of movement before a press counts as a drag
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let pressing = false;
let moved = false;
let start = { x: 0, y: 0 };
let grab = { x: 0, y: 0 };

export default {
  name: 'drag',

  init(ctx) {
    const { pet, petEl } = ctx;

    petEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      pressing = true;
      moved = false;
      start = { x: e.clientX, y: e.clientY };
      grab = { x: e.clientX - pet.x, y: e.clientY - pet.y };
      // Keep click-through off until mouseup even if the cursor leaves the sprite.
      ctx.setPinned(true);
    });

    window.addEventListener('mousemove', (e) => {
      if (!pressing) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) {
        moved = true;
        pet.mode = 'drag';
        petEl.classList.add('dragging');
      }
      if (moved) {
        pet.x = e.clientX - grab.x;
        pet.y = e.clientY - grab.y;
        pet.bob = 0;
        pet.squash = 1.08;
      }
    });

    window.addEventListener('mouseup', () => {
      if (!pressing) return;
      pressing = false;
      ctx.setPinned(false);
      petEl.classList.remove('dragging');
      if (moved) {
        // Keep it fully on screen, give a little landing squish, and carry on from here.
        pet.x = clamp(pet.x, 0, ctx.stageWidth() - pet.size);
        pet.y = clamp(pet.y, 0, ctx.groundY());
        pet.squash = 0.85;
        pet.mode = 'idle';
        ctx.log('drop', { x: Math.round(pet.x), y: Math.round(pet.y) });
      } else {
        ctx.log('click', {});
        petEl.dispatchEvent(new CustomEvent('pet:clicked'));
      }
    });

    petEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctx.api.showContextMenu();
    });
  },
};
