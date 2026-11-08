// A small popup next to the star with buttons, for events: the Yes / No game invite and the
// "Play a game?" buttons that appear when you click him.
//
// Plain HTML box + buttons: UI chrome, not character art. It has the `hit` class, so
// click-through switches off while the cursor is over it (see ../clickThrough.js) and the
// buttons can be clicked; everywhere else stays click-through.
//
//   const prompt = createPrompt(ctx.stage);
//   prompt.show({ text: 'Play tag?', yes: 'Yes!', no: 'No', onYes, onNo });
//   prompt.show({ text: '', yes: 'Play tag?', no: null, onYes });   // one button, no text line
//   prompt.show({ text: 'Play a game?', buttons: [{ label: 'Tag', onClick }, ...] });   // any number
//   prompt.setText('resting… 0:42');   // update the text line in place (empty = hide it)
//   prompt.place(pet, ctx.area());   // every frame: keep it next to the star, off the taskbar
//   prompt.hide();

const GAP = 30; // px below the star (leaves room for the debug mood label)
const SIDE_GAP = 14; // px beside the star, when there's no room below
const EDGE = 8; // px kept clear of the screen edges

// WINDOWS QUIRK: the pet window covers the whole display, taskbar included, so the popup must
// be kept inside the usable area (ctx.area() from pet.js, passed to place()), wherever the
// taskbar is, or its buttons can end up under the taskbar where they can't be clicked.
const fullWindow = () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });

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
  let buttonsEl = null;
  let extraBtns = []; // buttons made for show({ buttons }) beyond yes/no
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
    buttonsEl = buttons;
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
    show({ text = '', yes = 'Yes', no = 'No', onYes, onNo, buttons }) {
      if (!el) build();
      textEl.textContent = text;
      textEl.style.display = text ? '' : 'none';
      for (const b of extraBtns) b.remove();
      extraBtns = [];
      if (buttons && buttons.length) {
        // Any number of buttons: the first reuses the "yes" style (filled), the rest the outlined one.
        const [first, ...rest] = buttons;
        yesBtn.textContent = first.label;
        noBtn.style.display = 'none';
        handlers = { onYes: first.onClick };
        for (const b of rest) {
          const btn = document.createElement('button');
          btn.className = 'no';
          btn.textContent = b.label;
          btn.addEventListener('mousedown', (e) => { e.stopPropagation(); b.onClick?.(); });
          buttonsEl.appendChild(btn);
          extraBtns.push(btn);
        }
      } else {
        yesBtn.textContent = yes;
        noBtn.textContent = no || '';
        noBtn.style.display = no ? '' : 'none'; // no = null → a single button
        handlers = { onYes, onNo };
      }
      el.style.display = 'block';
      size = { w: el.offsetWidth, h: el.offsetHeight };
    },
    setText(text = '') {
      if (!el || textEl.textContent === text) return;
      textEl.textContent = text;
      textEl.style.display = text ? '' : 'none';
      size = { w: el.offsetWidth, h: el.offsetHeight };
    },
    /**
     * Keep it next to the star and fully inside the usable screen (above the taskbar):
     * centered under him, or beside him (right, else left) when there's no room below, e.g.
     * when he's standing on the taskbar line. Never above him: that's where his speech bubble is.
     */
    place(pet, area = fullWindow()) {
      if (!el || el.style.display === 'none') return;
      const left = area.left + EDGE;
      const top = area.top + EDGE;
      const bottom = area.bottom - EDGE;
      const right = area.right - EDGE;
      let x = pet.x + pet.size / 2 - size.w / 2;
      let y = pet.y + pet.size + GAP;
      if (y + size.h > bottom) {
        y = pet.y + pet.size / 2 - size.h / 2; // level with him
        x = pet.x + pet.size + SIDE_GAP; // right side...
        if (x + size.w > right) x = pet.x - size.w - SIDE_GAP; // ...or left if he's near the right edge
      }
      x = Math.max(left, Math.min(right - size.w, x));
      y = Math.max(top, Math.min(bottom - size.h, y));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    },
    hide() {
      handlers = {};
      if (el) el.style.display = 'none';
    },
    isShowing: () => !!el && el.style.display !== 'none',
  };
}
