// Shop UI (layout: the team's buy.png mockup). Buy and equip cosmetic items with starbits.
//
//   - Left: wallet (top-left), the display box Starby stands in, and one Buy / Equip button
//     that acts on the selected item.
//   - Right: "Colors" and "Accessories" dropdowns (both open when the shop opens) listing the
//     items. Price (with the starbit icon) only on items you don't own yet.
//   - Starby talks for the shop: picking an item you don't own, or pressing a grey Buy button
//     (not enough starbits), makes him say something (window.sprite.shopSay → pet window).
//
// Buying/equipping goes through the main process, which saves and broadcasts 'state:changed',
// so the on-screen star changes right away.
//
// The display box's position is sent to the main process (setShopDisplayRect) so Starby can
// run into it: see src/main/windows/shopWindow.js and src/renderer/pet/events/shop.js.
import { accessoryDef } from '../pet/accessories.js';

const api = window.sprite;

const ASSETS = '../../../assets'; // relative to src/renderer/shop/index.html
const SECTIONS = [
  { slot: 'color', title: 'Colors', open: true },
  { slot: 'accessory', title: 'Accessories', open: true },
];

let catalog = [];
let state = null;
let selectedId = null;
const openSlots = new Set(SECTIONS.filter((s) => s.open).map((s) => s.slot));

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---- What Starby says ----
const LINES = {
  browse: (item) => pick([
    `ooh, ${item.name}! that's ${item.price} starbits`,
    `${item.name}? i'd look so cute in that!`,
    `${item.name}... ${item.price} starbits. pretty please?`,
  ]),
  browseShort: (item, need) => pick([
    `${item.name}! we need ${need} more starbits for that`,
    `ooh, ${item.name}... ${need} more starbits to go!`,
  ]),
  cantAfford: (need) => pick([
    `we need ${need} more starbits!`,
    `not enough starbits... ${need} more!`,
    `hmm, ${need} starbits short. go catch some!`,
  ]),
  bought: (item) => pick([`yay! ${item.name} is ours!`, `thank you!! i love ${item.name}!`]),
  equipped: () => pick(['how do i look?', 'ta-da!', 'so fancy!']),
};

const say = (text) => api.shopSay?.(text);

// ---- Item state ----
const isOwned = (item) => state.owned.includes(item.id);
const isEquipped = (item) => state.equipped[item.slot] === item.id;
const missing = (item) => Math.max(0, item.price - state.starbits);
const selectedItem = () => catalog.find((i) => i.id === selectedId) || null;

function starbitIcon() {
  const img = document.createElement('img');
  img.className = 'starbit-icon';
  img.src = `${ASSETS}/starbits/cluster.png`;
  img.alt = '';
  return img;
}

// ---- Accessory icons ----
// Each accessory PNG (assets/accessories/, hand-drawn by the team) is a full 2048×2048 canvas
// with the item somewhere on it, so for a row icon we find the drawn part once (its
// non-transparent bounds, measured on a 256px copy) and draw just that, fitted into the icon.
// The art itself is never changed.
const ICON_CSS = 22;
const MEASURE = 256;
const accessoryCrops = new Map(); // file → Promise<{ img, sx, sy, sw, sh } | null>

function loadAccessoryCrop(file) {
  if (!accessoryCrops.has(file)) {
    accessoryCrops.set(file, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = MEASURE;
        c.height = MEASURE;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, MEASURE, MEASURE);
        const { data } = g.getImageData(0, 0, MEASURE, MEASURE);
        let minX = MEASURE, minY = MEASURE, maxX = -1, maxY = -1;
        for (let y = 0; y < MEASURE; y++) {
          for (let x = 0; x < MEASURE; x++) {
            if (data[(y * MEASURE + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) { resolve(null); return; }
        const k = img.naturalWidth / MEASURE;
        resolve({ img, sx: minX * k, sy: minY * k, sw: (maxX - minX + 1) * k, sh: (maxY - minY + 1) * k });
      };
      img.onerror = () => resolve(null);
      img.src = `${ASSETS}/accessories/${file}.png`;
    }));
  }
  return accessoryCrops.get(file);
}

function accessoryIcon(item) {
  const c = document.createElement('canvas');
  c.className = 'item-icon';
  c.width = ICON_CSS * 2; // 2x for sharpness
  c.height = ICON_CSS * 2;
  const def = accessoryDef(item.value);
  if (!def) {
    c.style.visibility = 'hidden'; // "None", or no art yet: no icon (never a stand-in)
    return c;
  }
  loadAccessoryCrop(def.file).then((crop) => {
    if (!crop) { c.style.visibility = 'hidden'; return; }
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const fit = Math.min(c.width / crop.sw, c.height / crop.sh);
    const w = crop.sw * fit;
    const h = crop.sh * fit;
    g.drawImage(crop.img, crop.sx, crop.sy, crop.sw, crop.sh, (c.width - w) / 2, (c.height - h) / 2, w, h);
  });
  return c;
}

// Row icon.
//   color:     a ★ text glyph in that color, as in the team's buy.png mockup (the team chose
//              this over waiting for per-color icon art).
//   accessory: its hand-drawn PNG, cropped to the drawn part (see above).
function itemIcon(item) {
  if (item.slot === 'color') {
    const star = document.createElement('span');
    star.className = 'item-icon color-star';
    star.textContent = '★';
    star.style.color = item.value;
    star.setAttribute('aria-hidden', 'true');
    return star;
  }
  return accessoryIcon(item);
}

function itemRow(item) {
  const row = document.createElement('button');
  row.className = `item${item.id === selectedId ? ' selected' : ''}`;
  row.title = isEquipped(item) ? 'Wearing' : isOwned(item) ? 'Owned' : `${item.price} starbits`;

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;
  row.append(itemIcon(item), name);

  if (!isOwned(item)) {
    const price = document.createElement('span');
    price.className = 'price';
    price.append(starbitIcon(), document.createTextNode(String(item.price)));
    row.append(price);
  }

  row.onclick = () => select(item);
  return row;
}

function sectionEl({ slot, title }) {
  const open = openSlots.has(slot);
  const section = document.createElement('div');
  section.className = `section${open ? '' : ' closed'}`;

  const toggle = document.createElement('button');
  toggle.className = 'section-toggle';
  toggle.setAttribute('aria-expanded', String(open));
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = title;
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = open ? '▲' : '▼';
  toggle.append(label, arrow);
  toggle.onclick = () => {
    if (openSlots.has(slot)) openSlots.delete(slot);
    else openSlots.add(slot);
    renderLists();
  };

  const items = document.createElement('div');
  items.className = 'items';
  catalog.filter((i) => i.slot === slot).forEach((item) => items.appendChild(itemRow(item)));

  section.append(toggle, items);
  return section;
}

// ---- Rendering ----
function renderLists() {
  const lists = $('lists');
  const scroll = lists.scrollTop; // keep the scroll position across re-renders
  lists.replaceChildren(...SECTIONS.map(sectionEl));
  lists.scrollTop = scroll;
}

function renderAction() {
  const btn = $('action');
  const item = selectedItem();
  btn.className = 'action-button';
  btn.disabled = false;
  if (!item) {
    btn.textContent = 'Buy';
    btn.classList.add('done');
    btn.disabled = true;
  } else if (isEquipped(item)) {
    btn.textContent = 'Equipped';
    btn.classList.add('done');
    btn.disabled = true;
  } else if (isOwned(item)) {
    btn.textContent = 'Equip';
    btn.classList.add('equip'); // white button art
  } else {
    btn.textContent = 'Buy';
    // Enough starbits: green button art. Not enough: white art, still clickable (Starby explains).
    btn.classList.add(missing(item) > 0 ? 'grey' : 'buy');
  }
}

function render() {
  $('balance').textContent = state.starbits;
  renderLists();
  renderAction();
}

// ---- Try-on ----
// Selecting an accessory or a color (colorway/skin) shows it on Starby right away (not saved).
// Selecting anything else, or what he already has on, shows what he really has on. Closing or
// minimizing the shop takes a try-on off again (main process → events/shop.js); only
// Buy/Equip keep it.
function updateTryOn() {
  const item = selectedItem();
  const trying = item && !isEquipped(item);
  api.previewAccessory?.(trying && item.slot === 'accessory' ? item.value : null);
  api.previewColor?.(trying && item.slot === 'color' ? item.id : null);
}

// ---- Actions ----
function select(item) {
  if (item.id === selectedId) return;
  selectedId = item.id;
  render();
  updateTryOn();
  // Clicking through new items you don't own: Starby comments.
  if (!isOwned(item)) {
    const need = missing(item);
    say(need > 0 ? LINES.browseShort(item, need) : LINES.browse(item));
  }
}

async function onAction() {
  const item = selectedItem();
  if (!item || isEquipped(item)) return;
  if (isOwned(item)) {
    const res = await api.equip(item.id);
    if (res.ok) {
      updateTryOn(); // now really worn: drop the try-on
      say(LINES.equipped());
    }
    return;
  }
  const need = missing(item);
  if (need > 0) {
    say(LINES.cantAfford(need));
    return;
  }
  const res = await api.buy(item.id);
  if (!res.ok) {
    say(LINES.cantAfford(missing(item)));
    return;
  }
  // Whatever you just bought (color or accessory, while trying it on) stays on: equip it too.
  await api.equip(item.id);
  updateTryOn(); // now really worn: drop the try-on
  say(LINES.bought(item));
  // UI refresh happens via onStateChanged.
}

// Tell the main process where the display box is (in this page's CSS px), so Starby can run
// into it. The window is a fixed size, so this only changes if fonts/layout shift.
function reportDisplayBox() {
  const r = $('display').getBoundingClientRect();
  api.setShopDisplayRect?.({ x: r.left, y: r.top, width: r.width, height: r.height });
}

async function boot() {
  $('close').onclick = () => api.closeShop?.();
  $('action').onclick = onAction;

  catalog = await api.getCatalog();
  state = await api.getState();
  // Start on what he's wearing.
  selectedId = state.equipped.color || catalog[0]?.id || null;
  api.previewAccessory?.(null); // fresh shop: no try-on left over
  api.previewColor?.(null);
  api.onStateChanged((s) => { state = s; render(); });
  render();

  requestAnimationFrame(reportDisplayBox);
  document.fonts?.ready.then(reportDisplayBox);
  window.addEventListener('resize', reportDisplayBox);
}

boot();
