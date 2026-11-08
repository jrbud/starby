// Shop UI: buy and equip cosmetic items with starbits.
// Equipping goes through the main process, which persists it and broadcasts 'state:changed',
// so the on-screen sprite updates immediately.
// Previews draw the real hand-drawn Starby PNG wearing the item (same placement code as the
// pet window: ../pet/accessories.js), not the old code-drawn star.
import { createFrames } from '../pet/frames.js';
import { createAccessoryArt, drawPreview } from '../pet/accessories.js';

const api = window.sprite;
const PREVIEW_RES = 256; // art is shrunk to this per 2048 once, then previews draw from it
const frames = createFrames(PREVIEW_RES);
const accessoryArt = createAccessoryArt(PREVIEW_RES);
const colorSetOf = (colorId) => (colorId || 'color-sunny').replace(/^color-/, '');
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
//   buyable:  not owned, enough starbits → "Buy · N"
//   locked:   not owned, not enough → dimmed, "Need N more"
function cardState(item) {
  if (state.equipped[item.slot] === item.id) return 'equipped';
  if (state.owned.includes(item.id)) return 'owned';
  return state.starbits >= item.price ? 'buyable' : 'locked';
}

const TAG_TEXT = { equipped: 'Wearing', owned: 'Owned', buyable: '', locked: 'Locked' };

// What to preview: the equipped look, with `item` (if given) swapped in.
function previewLook(item = null) {
  const accessory = catalog.find((i) => i.id === state.equipped.accessory)?.value || 'none';
  return {
    colorSet: colorSetOf(item?.slot === 'color' ? item.id : state.equipped.color),
    accessory: item?.slot === 'accessory' ? item.value : accessory,
  };
}

// A canvas drawn at 2x for sharpness, shown at `css` px.
function previewCanvas(css) {
  const c = document.createElement('canvas');
  c.width = css * 2;
  c.height = css * 2;
  c.style.width = `${css}px`;
  c.style.height = `${css}px`;
  return c;
}

function itemCard(item) {
  const status = cardState(item);

  const card = document.createElement('div');
  card.className = `item ${status}${item.id === justBoughtId ? ' just-bought' : ''}`;

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = TAG_TEXT[status];
  if (!tag.textContent) tag.hidden = true;

  // Preview: the current Starby with just this item swapped in.
  const thumb = previewCanvas(56);
  drawPreview(thumb, frames, accessoryArt, previewLook(item));

  const name = document.createElement('div');
  name.textContent = item.name;
  // Colors: until each color has its own PNG set, every preview shows the sunny art, so add a
  // small flat swatch of the color (plain UI, like the starbits icon) to tell them apart.
  if (item.slot === 'color') {
    const swatch = document.createElement('span');
    Object.assign(swatch.style, {
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', marginRight: '5px',
      verticalAlign: 'middle', background: item.value, border: '1px solid rgba(0,0,0,0.25)',
    });
    name.prepend(swatch);
  }

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
    btn.textContent = `Need ${item.price - state.starbits} more`;
    btn.title = `Costs ${item.price} starbits`;
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
  $('balance').textContent = state.starbits;
  const header = $('preview');
  if (header.width !== 192) { header.width = 192; header.height = 192; header.style.width = '96px'; header.style.height = '96px'; }
  drawPreview(header, frames, accessoryArt, previewLook());

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
  // The art loads in the background; redraw the previews once it's here.
  await frames.loadEssentials(colorSetOf(state.equipped.color));
  await frames.loadEssentials('sunny');
  render();
  await accessoryArt.loadAll();
  render();
}

boot();
