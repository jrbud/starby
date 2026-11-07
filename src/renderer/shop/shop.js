// Shop UI: buy and equip cosmetic items with stardust.
// Equipping goes through the main process, which persists it and broadcasts 'state:changed',
// so the on-screen sprite updates immediately.
import { drawSprite } from '../shared/sprite.js';

const api = window.sprite;
const SLOT_TITLES = { color: 'Colors', shape: 'Shapes', accessory: 'Accessories' };

let catalog = [];
let state = null;

const $ = (id) => document.getElementById(id);

function equippedLook(overrides = {}) {
  const value = (slot) => catalog.find((i) => i.id === state.equipped[slot])?.value;
  return { color: value('color'), shape: value('shape'), accessory: value('accessory'), ...overrides };
}

function itemCard(item) {
  const owned = state.owned.includes(item.id);
  const equipped = state.equipped[item.slot] === item.id;

  const card = document.createElement('div');
  card.className = `item${equipped ? ' equipped' : ''}`;

  // Preview: the current sprite with just this item swapped in.
  const thumb = document.createElement('canvas');
  thumb.width = 48;
  thumb.height = 48;
  drawSprite(thumb, equippedLook({ [item.slot]: item.value }));

  const name = document.createElement('div');
  name.textContent = item.name;

  const btn = document.createElement('button');
  if (equipped) {
    btn.textContent = 'Equipped';
    btn.disabled = true;
  } else if (owned) {
    btn.textContent = 'Equip';
    btn.onclick = () => act(api.equip(item.id));
  } else {
    btn.textContent = `Buy · ${item.price}`;
    btn.disabled = state.stardust < item.price;
    btn.onclick = () => act(api.buy(item.id), `Bought ${item.name}!`);
  }

  card.append(thumb, name, btn);
  return card;
}

async function act(promise, successMsg = '') {
  const res = await promise;
  $('message').textContent = res.ok ? successMsg : `Can't do that: ${res.reason}`;
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
