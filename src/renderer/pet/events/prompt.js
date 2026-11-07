// A small yes/no popup next to the star, for events that ask before they start (tag uses it).
//
// Plain HTML box + buttons: UI chrome, not character art. It has the `hit` class, so
// click-through switches off while the cursor is over it (see ../clickThrough.js) and the
// buttons can be clicked; everywhere else stays click-through.
//
//   const prompt = createPrompt(ctx.stage);
//   prompt.show({ text: 'Play tag?', yes: 'Yes!', no: 'No', onYes, onNo });
//   prompt.place(pet);   // every frame: keep it next to the star
//   prompt.hide();

const GAP = 30; // px below the star (leaves room for the debug mood label)
const SIDE_GAP = 14; // px beside the star, when there's no room below
const EDGE = 8; // px kept clear of the screen edges

// Bottom of the usable screen, in window coordinates.
// WINDOWS QUIRK: the pet window covers the whole display, taskbar included, so innerHeight
// reaches into the taskbar. screen.availHeight stops above it (same as groundY in pet.js),
// which keeps the buttons where they can actually be clicked.
const usableBottom = () => (window.screen && window.screen.availHeight) || window.innerHeight;

function injectStyles() {
  if (document.getElementById('event-prompt-styles')) return;
  const style = document.createElement('style');
  style.id = 'event-prompt-styles';
  style.textContent = `
    .event-prompt {
      position: absolute; left: 0; top: 0; display: none;
      background: #ffffff; color: #2b2b3a; border: 2px solid #2b2b3a; border-radius: 10px;
      padding: 8px 10px; font: 13px "Segoe UI", system-ui, sans-serif; text-align: center;
      white-space: nowrap; will-change: transform;
    }
    .event-prompt .text { font-weight: 600; margin-bottom: 6px; }
    .event-prompt .buttons { display: flex; gap: 6px; justify-content: center; }
    .event-prompt button {
      font: inherit; border-radius: 6px; padding: 3px 14px; cursor: pointer;
      border: 1.5px solid #6c5ce7; background: #ffffff; color: #6c5ce7;
    }
    .event-prompt button.yes { background: #6c5ce7; color: #ffffff; }
    .event-prompt button:hover { filter: brightness(0.92); }
  `;
  document.head.appendChild(style);
}

export function createPrompt(stage) {
  let el = null;
  let textEl = null;
  let yesBtn = null;
  let noBtn = null;
  let handlers = {};
  let size = { w: 0, h: 0 };

  function build() {
    injectStyles();
    el = document.createElement('div');
    el.className = 'event-prompt hit';
    textEl = document.createElement('div');
    textEl.className = 'text';
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    yesBtn = document.createElement('button');
    yesBtn.className = 'yes';
    noBtn = document.createElement('button');
    noBtn.className = 'no';
    buttons.append(yesBtn, noBtn);
    el.append(textEl, buttons);
    // mousedown so it answers on the first press even though the pet window isn't focusable.
    yesBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); handlers.onYes?.(); });
    noBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); handlers.onNo?.(); });
    stage.appendChild(el);
  }

  return {
    show({ text, yes = 'Yes', no = 'No', onYes, onNo }) {
      if (!el) build();
      textEl.textContent = text;
      yesBtn.textContent = yes;
      noBtn.textContent = no;
      handlers = { onYes, onNo };
      el.style.display = 'block';
      size = { w: el.offsetWidth, h: el.offsetHeight };
    },
    /**
     * Keep it next to the star and fully inside the usable screen (above the taskbar):
     * centered under him, or beside him (right, else left) when there's no room below, e.g.
     * when he's standing on the taskbar line. Never above him: that's where his speech bubble is.
     */
    place(pet) {
      if (!el || el.style.display === 'none') return;
      const bottom = usableBottom() - EDGE;
      const right = window.innerWidth - EDGE;
      let x = pet.x + pet.size / 2 - size.w / 2;
      let y = pet.y + pet.size + GAP;
      if (y + size.h > bottom) {
        y = pet.y + pet.size / 2 - size.h / 2; // level with him
        x = pet.x + pet.size + SIDE_GAP; // right side...
        if (x + size.w > right) x = pet.x - size.w - SIDE_GAP; // ...or left if he's near the right edge
      }
      x = Math.max(EDGE, Math.min(right - size.w, x));
      y = Math.max(EDGE, Math.min(bottom - size.h, y));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    },
    hide() {
      handlers = {};
      if (el) el.style.display = 'none';
    },
    isShowing: () => !!el && el.style.display !== 'none',
  };
}
