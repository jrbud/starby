// Shop UI (layout: the team's buy.png mockup). Buy and equip cosmetic items with starbits.
//
//   - Left: wallet (top-left), the display box Starby stands in, and one Buy / Equip button
//     that acts on the selected item.
//   - Right: "Colors" and "Accessories" dropdowns listing the items. Price (with the starbit
//     icon) only on items you don't own yet.
//   - Starby talks for the shop: picking an item you don't own, or pressing a grey Buy button
//     (not enough starbits), makes him say something (window.sprite.shopSay → pet window).
//
// Buying/equipping goes through the main process, which saves and broadcasts 'state:changed',
// so the on-screen star changes right away.
//
// The display box's position is sent to the main process (setShopDisplayRect) so Starby can
// run into it: see src/main/windows/shopWindow.js and src/renderer/pet/events/shop.js.

const api = window.sprite;

const ASSETS = '../../../assets'; // relative to src/renderer/shop/index.html
const SECTIONS = [
  { slot: 'color', title: 'Colors', open: true },
  { slot: 'accessory', title: 'Accessories', open: false },
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

// Row icon.
//   color:     a ★ text glyph in that color, as in the team's buy.png mockup (the team chose
//              this over waiting for per-color icon art).
//   accessory: team art at assets/shop/<id>/icon.png if it exists; missing → no icon
//              (we never draw a stand-in, see claude.md).
function itemIcon(item) {
  if (item.slot === 'color') {
    const star = document.createElement('span');
    star.className = 'item-icon color-star';
    star.textContent = '★';
    star.style.color = item.value;
    star.setAttribute('aria-hidden', 'true');
    return star;
  }
  const img = document.createElement('img');
  img.className = 'item-icon';
  img.alt = '';
  img.src = `${ASSETS}/shop/${item.value}/icon.png`;
  img.onerror = () => { img.style.visibility = 'hidden'; };
  return img;
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
  } else {
    btn.textContent = 'Buy';
    if (missing(item) > 0) btn.classList.add('grey'); // still clickable: Starby explains
  }
}

function render() {
  $('balance').textContent = state.starbits;
  renderLists();
  renderAction();
}

// ---- Actions ----
function select(item) {
  if (item.id === selectedId) return;
  selectedId = item.id;
  render();
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
    if (res.ok) say(LINES.equipped());
    return;
  }
  const need = missing(item);
  if (need > 0) {
    say(LINES.cantAfford(need));
    return;
  }
  const res = await api.buy(item.id);
  if (res.ok) say(LINES.bought(item));
  else say(LINES.cantAfford(missing(item)));
  // UI refresh happens via onStateChanged.
}

// Tell the main process where the display box is (in this page's CSS px), so Starby can run
// into it. The window is a fixed size, so this only changes if fonts/layout shift.
function reportDisplayBox() {
  const r = $('display').getBoundingClientRect();
  api.setShopDisplayRect?.({ x: r.left, y: r.top, width: r.width, height: r.height });
}

async function boot() {
  $('minimize').onclick = () => api.minimizeShop?.();
  $('close').onclick = () => api.closeShop?.();
  $('action').onclick = onAction;

  catalog = await api.getCatalog();
  state = await api.getState();
  // Start on what he's wearing.
  selectedId = state.equipped.color || catalog[0]?.id || null;
  api.onStateChanged((s) => { state = s; render(); });
  render();

  requestAnimationFrame(reportDisplayBox);
  document.fonts?.ready.then(reportDisplayBox);
  window.addEventListener('resize', reportDisplayBox);
}

boot();
