// Shop UI: buy and equip cosmetic items with stardust.
// Equipping goes through the main process, which persists it and broadcasts 'state:changed',
// so the on-screen sprite updates immediately.
import { drawSprite } from '../shared/sprite.js';

const api = window.sprite;
const SLOT_TITLES = { color: 'Colors', accessory: 'Accessories' };

const TOAST_MS = 2200;
const JUST_BOUGHT_MS = 1200;

let catalog = [];
let state = null;
let justBoughtId = null; // card to flash after a purchase (render() rebuilds the DOM)
let toastTimer = null;

const $ = (id) => document.getElementById(id);

// Each card is in exactly one state. Plain-text labels only (no icons, per the art rule).
//   equipped: owned and worn right now
//   owned:    bought, not worn → "Equip"
//   buyable:  not owned, enough stardust → "Buy · N"
//   locked:   not owned, not enough → dimmed, "Need N more"
function cardState(item) {
  if (state.equipped[item.slot] === item.id) return 'equipped';
  if (state.owned.includes(item.id)) return 'owned';
  return state.stardust >= item.price ? 'buyable' : 'locked';
}

const TAG_TEXT = { equipped: 'Wearing', owned: 'Owned', buyable: '', locked: 'Locked' };

function equippedLook(overrides = {}) {
  const value = (slot) => catalog.find((i) => i.id === state.equipped[slot])?.value;
  return { color: value('color'), accessory: value('accessory'), ...overrides };
}

function itemCard(item) {
  const status = cardState(item);

  const card = document.createElement('div');
  card.className = `item ${status}${item.id === justBoughtId ? ' just-bought' : ''}`;

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = TAG_TEXT[status];
  if (!tag.textContent) tag.hidden = true;

  // Preview: the current sprite with just this item swapped in.
  const thumb = document.createElement('canvas');
  thumb.width = 48;
  thumb.height = 48;
  drawSprite(thumb, equippedLook({ [item.slot]: item.value }));

  const name = document.createElement('div');
  name.textContent = item.name;

  const btn = document.createElement('button');
  if (status === 'equipped') {
    btn.textContent = 'Equipped';
    btn.disabled = true;
  } else if (status === 'owned') {
    btn.textContent = 'Equip';
    btn.className = 'secondary';
    btn.onclick = () => equip(item);
  } else if (status === 'buyable') {
    btn.textContent = `Buy · ${item.price}`;
    btn.onclick = () => buy(item);
  } else {
    btn.textContent = `Need ${item.price - state.stardust} more`;
    btn.title = `Costs ${item.price} stardust`;
    btn.disabled = true;
  }

  card.append(tag, thumb, name, btn);
  return card;
}

function toast(text, kind = 'ok') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), TOAST_MS);
}

async function buy(item) {
  // Set before the call: the main process broadcasts 'state:changed' (→ render) before
  // the invoke resolves, so the flash class has to be ready by then.
  justBoughtId = item.id;
  const res = await api.buy(item.id);
  if (!res.ok) {
    justBoughtId = null;
    toast(`Can't buy that: ${res.reason}`, 'error');
    return;
  }
  toast(`Bought ${item.name}! Hit Equip to wear it.`);
  setTimeout(() => {
    if (justBoughtId !== item.id) return;
    justBoughtId = null;
    document.querySelector('.item.just-bought')?.classList.remove('just-bought');
  }, JUST_BOUGHT_MS);
}

async function equip(item) {
  const res = await api.equip(item.id);
  if (!res.ok) toast(`Can't equip that: ${res.reason}`, 'error');
  // UI refresh happens via onStateChanged.
}

function render() {
  $('balance').textContent = state.stardust;
  drawSprite($('preview'), equippedLook());

  const sections = $('sections');
  sections.replaceChildren();
  for (const slot of Object.keys(SLOT_TITLES)) {
    const h = document.createElement('h2');
    h.textContent = SLOT_TITLES[slot];
    const grid = document.createElement('div');
    grid.className = 'grid';
    catalog.filter((i) => i.slot === slot).forEach((item) => grid.appendChild(itemCard(item)));
    sections.append(h, grid);
  }
}

async function boot() {
  catalog = await api.getCatalog();
  state = await api.getState();
  api.onStateChanged((s) => { state = s; render(); });
  render();
}

boot();
