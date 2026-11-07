// Click / drag / right-click on the pet. After a drag the pet falls back to the ground.
// A click without moving emits a 'pet:clicked' DOM event that other behaviors can react to.

const CLICK_SLOP = 4; // px of movement before a press counts as a drag
const GRAVITY = 2200; // px/s^2

let pressing = false;
let moved = false;
let start = { x: 0, y: 0 };
let grab = { x: 0, y: 0 };
let vy = 0;

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
        vy = 0;
        pet.mode = 'fall';
      } else {
        petEl.dispatchEvent(new CustomEvent('pet:clicked'));
      }
    });

    petEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctx.api.showContextMenu();
    });
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'fall') return;
    vy += GRAVITY * dt;
    pet.y += vy * dt;
    pet.squash = 1.1;
    if (pet.y >= ctx.groundY()) {
      pet.y = ctx.groundY();
      pet.squash = 0.8; // landing squish; idle eases it back
      pet.mode = 'idle';
    }
  },
};
