// Settings window. Moving the slider updates the pet live (main process broadcasts
// 'settings:changed'); the value is saved to settings.json and survives restarts.
import { flingTuning } from '../shared/flingTuning.js';
import { STARBIT_COLORS, starbitImage, enabledColors, STARBIT_SIZE, clampStarbitSize } from '../shared/starbitArt.js';
import { sfx, SOUND_CATEGORIES } from '../shared/sfx.js';

// ---- Collapsible sections (<details>): every one starts COLLAPSED each time Settings opens
// (team decision; open/closed isn't remembered). Click a heading to open it.
for (const section of document.querySelectorAll('details.group')) section.open = false;

// ---- Sections switched OFF by the box in their header (Sounds, Starbits, Games): their body is
// hidden (settings.css, .section-off), but nothing in it is changed, so switching the section back
// on brings every setting back as it was. Switching one on also opens it, so you see what's back.
function syncSectionsOff() {
  for (const section of document.querySelectorAll('details.group')) {
    const box = section.querySelector(':scope > summary .header-toggle');
    if (box) section.classList.toggle('section-off', !box.checked);
  }
}
document.addEventListener('change', (e) => {
  if (!e.target.matches?.('.header-toggle')) return;
  syncSectionsOff();
  if (e.target.checked) e.target.closest('details').open = true;
});
// An off section's heading doesn't open/close it (there's nothing to show); its box still works.
for (const summary of document.querySelectorAll('details.group > summary')) {
  summary.addEventListener('click', (e) => {
    if (summary.parentElement.classList.contains('section-off') && !e.target.matches('.header-toggle')) e.preventDefault();
  });
}

const api = window.sprite;

// Frameless window: our own close button (team art, see ../shared/menuFrame.css).
document.getElementById('close').addEventListener('click', () => window.close());

const slider = document.getElementById('fling-power');
const valueOut = document.getElementById('fling-power-value');

// ---- Starbits → Color: one checkbox per color (saved as the list of colors turned OFF) ----
const colorGrid = document.getElementById('starbit-colors');
const colorCount = document.getElementById('starbit-colors-count');
const colorBoxes = new Map(); // color -> checkbox
// Color saves still in flight. While any are, 'settings:changed' broadcasts from earlier
// clicks would re-check boxes you just changed (quick clicking), so the color part of
// show() waits, and the last save's reply sets the final state.
let pendingColorSaves = 0;
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);

// The order the color tiles show in (Settings only; starbitArt.js's list order is untouched).
// Any color not listed here (a new one added to starbitArt.js) goes at the end.
const COLOR_ORDER = ['yellow', 'green', 'teal', 'blue', 'pink', 'red', 'white'];
const tileColors = [
  ...COLOR_ORDER.filter((c) => STARBIT_COLORS.includes(c)),
  ...STARBIT_COLORS.filter((c) => !COLOR_ORDER.includes(c)),
];

for (const color of tileColors) {
  const label = document.createElement('label');
  label.className = 'color-option';
  // The checkbox stays (keyboard, screen readers, the change handler below) but is hidden: the
  // tile itself shows on/off with the team's square art (settings.css, .color-option).
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = color;
  box.className = 'sr-only';
  box.setAttribute('aria-label', titleCase(color));
  label.title = titleCase(color);
  const preview = document.createElement('img');
  preview.src = starbitImage(color, 1); // the team's art for this color
  preview.alt = '';
  preview.draggable = false;
  // No visible name (the tile's title / the checkbox's aria-label carry it). Don't add an empty
  // element here: the tile is a centering grid, and a 2nd item pushes the starbit off-center.
  label.append(box, preview);
  colorGrid.append(label);
  colorBoxes.set(color, box);
  box.addEventListener('change', () => {
    const on = [...colorBoxes].filter(([, b]) => b.checked).map(([c]) => c);
    showColors(on);
    pendingColorSaves += 1;
    api.setSettings({ starbitColors: on }).then((saved) => {
      pendingColorSaves -= 1;
      if (pendingColorSaves === 0) showColors(saved.starbitColors);
    });
  });
}

// Check the boxes for the colors that are on (falls back to the default, yellow, if none).
function showColors(colorsOn) {
  const on = new Set(enabledColors(colorsOn));
  for (const [color, box] of colorBoxes) box.checked = on.has(color);
  const checked = [...colorBoxes.values()].filter((b) => b.checked);
  // Keep at least one color: the last checked box can't be unchecked.
  for (const box of colorBoxes.values()) {
    box.disabled = checked.length === 1 && box.checked;
    box.title = box.disabled ? 'At least one color stays on' : '';
  }
}

// ---- Starbits → Size: slider + live preview ----
const sizeSlider = document.getElementById('starbit-size');
const sizeOut = document.getElementById('starbit-size-value');
const sizePreview = document.getElementById('starbit-size-preview');
sizeSlider.min = STARBIT_SIZE.min;
sizeSlider.max = STARBIT_SIZE.max;
sizeSlider.step = STARBIT_SIZE.step;
sizePreview.src = starbitImage('yellow', 1);
// The preview shows the first enabled color in the tiles' order (COLOR_ORDER above), so it
// matches what Starby throws and the first checked tile.
const previewColor = (colorsOn) => {
  const on = enabledColors(colorsOn);
  return tileColors.find((c) => on.includes(c)) || on[0];
};

function showSize(px) {
  const v = clampStarbitSize(px);
  sizeSlider.value = v;
  sizeOut.textContent = `${v} px`;
  sizePreview.style.width = `${v}px`;
  sizePreview.style.height = `${v}px`;
}

sizeSlider.addEventListener('input', () => {
  showSize(sizeSlider.value);
  api.setSettings({ starbitSize: Number(sizeSlider.value) });
});

// ---- Starbits → on/off switches (saved as 1/0) ----
const SWITCHES = [
  ['starbit-spawning', 'starbitSpawning'],
  ['starbit-visible', 'starbitVisible'],
  ['starbit-shoot', 'starbitShootAnimation'],
  ['starbit-show-count', 'starbitShowCount'],
  ['show-welcome', 'showWelcome'], // App → the welcome window at launch
  ['game-invites', 'gameInvites'], // Games → Starby asks you to play
  ['starby-game-invites', 'gameInvites'], // ...the same switch again, in the Starby section (linked)
  ['idle-chats', 'idleChats'], // Starby → random lines while he hangs around
  ['games-on', 'gamesEnabled'], // Games → the section's own box (all games on/off)
].map(([id, key]) => ({ box: document.getElementById(id), key }));

// Several boxes can share one setting (gameInvites is in Starby AND Games): ticking one ticks the
// others right away (the saved value comes back through show() as well).
for (const { box, key } of SWITCHES) {
  box.addEventListener('change', () => {
    for (const other of SWITCHES) if (other.key === key && other.box !== box) other.box.checked = box.checked;
    api.setSettings({ [key]: box.checked ? 1 : 0 });
  });
}

function showSwitches(settings) {
  // Missing = on (older settings files).
  for (const { box, key } of SWITCHES) box.checked = settings[key] === undefined || Number(settings[key]) !== 0;
}

// ---- Starby size (px; pet.js resizes him live) ----
const starbySlider = document.getElementById('starby-size');
const starbyOut = document.getElementById('starby-size-value');

function showStarbySize(px) {
  const v = Number(px) || 100;
  starbySlider.value = v;
  starbyOut.textContent = `${v} px`;
}

starbySlider.addEventListener('input', () => {
  showStarbySize(starbySlider.value);
  api.setSettings({ starbySize: Number(starbySlider.value) });
});

// ---- UI section: Menu size, Chat size, Font size (%). Saved when you LET GO, not while dragging:
// Menu size resizes this very window, and resizing under the cursor mid-drag makes the slider jump.
const UI_SLIDERS = [
  ['menu-scale', 'menuScale'],
  ['chat-scale', 'chatScale'],
  ['font-scale', 'fontScale'],
].map(([id, key]) => ({ slider: document.getElementById(id), out: document.getElementById(`${id}-value`), key }));

for (const { slider: s, out, key } of UI_SLIDERS) {
  s.addEventListener('input', () => { out.textContent = `${s.value}%`; });
  s.addEventListener('change', () => api.setSettings({ [key]: Number(s.value) }));
}

function showUiScales(settings) {
  for (const { slider: s, out, key } of UI_SLIDERS) {
    const v = Number(settings[key]) || 100;
    s.value = v;
    out.textContent = `${v}%`;
  }
}

// ---- Sounds: on/off box in the "Sounds" header (all sounds), "All sounds" master volume, then one
// slider + on/off box per category. (shared/sfx.js plays every sound at master × category;
// categories: SOUND_CATEGORIES there.) The header box is the reverse of the saved sfxMuted:
// checked = sounds on = sfxMuted 0.
const sfxSlider = document.getElementById('sfx-volume');
const sfxOut = document.getElementById('sfx-volume-value');
const sfxOn = document.getElementById('sfx-on');
sfx.preload(SOUND_CATEGORIES.map((c) => c.sample));
const pct = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// Change settings: apply to this window's player right away (so the sample uses it), then save.
function saveSound(patch) {
  sfx.applyNow(patch);
  return api.setSettings(patch);
}

function showSfx(settings) {
  const v = pct(settings.sfxVolume, 70);
  const muted = Number(settings.sfxMuted) === 1;
  sfxSlider.value = v;
  sfxOut.textContent = muted ? 'off' : `${v}%`;
  sfxOn.checked = !muted;
  sfxSlider.classList.toggle('is-muted', muted);
  for (const row of categoryRows) row.show(settings);
}

sfxSlider.addEventListener('input', () => {
  // Moving the slider while sounds are off turns them back on (you clearly want sound).
  const v = Number(sfxSlider.value);
  sfxOn.checked = true;
  sfxOut.textContent = `${v}%`;
  sfxSlider.classList.remove('is-muted');
  saveSound({ sfxVolume: v, sfxMuted: 0 });
});
// Letting go: play a sample so you hear the new volume.
sfxSlider.addEventListener('change', () => sfx.play('collect-starbit'));
sfxOn.addEventListener('change', () => {
  const on = sfxOn.checked;
  sfxOut.textContent = on ? `${sfxSlider.value}%` : 'off';
  sfxSlider.classList.toggle('is-muted', !on);
  saveSound({ sfxMuted: on ? 0 : 1 });
  if (on) sfx.play('collect-starbit');
});

// One row per category: "Voice  80%", the slider, and an on/off box.
const categoryList = document.getElementById('sound-categories');
const categoryRows = SOUND_CATEGORIES.map((cat) => {
  const id = `sfx-cat-${cat.id.toLowerCase()}`;
  const section = document.createElement('section');
  section.className = 'setting sound-category';
  section.innerHTML = `
    <div class="label-row">
      <label for="${id}">${cat.label}</label>
      <output for="${id}"></output>
    </div>
    <div class="sound-row">
      <input id="${id}" type="range" min="0" max="200" step="1" value="100" />
      <label class="switch-row sound-toggle" title="${cat.label} sounds on/off">
        <input type="checkbox" class="art-check" aria-label="${cat.label} sounds on" />
      </label>
    </div>`;
  categoryList.append(section);
  const slider = section.querySelector('input[type="range"]');
  const out = section.querySelector('output');
  const box = section.querySelector('input[type="checkbox"]');

  const showState = (v, on) => {
    slider.value = v;
    out.textContent = on ? `${v}%` : 'off';
    box.checked = on;
    slider.classList.toggle('is-muted', !on);
  };
  slider.addEventListener('input', () => {
    // Moving a category's slider switches that category back on.
    const v = Number(slider.value);
    showState(v, true);
    saveSound({ [cat.volumeKey]: v, [cat.onKey]: 1 });
  });
  slider.addEventListener('change', () => sfx.play(cat.sample)); // hear the new level
  box.addEventListener('change', () => {
    showState(Number(slider.value), box.checked);
    saveSound({ [cat.onKey]: box.checked ? 1 : 0 });
    if (box.checked) sfx.play(cat.sample);
  });

  return {
    show(settings) {
      const on = settings[cat.onKey] === undefined || Number(settings[cat.onKey]) !== 0;
      showState(pct(settings[cat.volumeKey], 100), on);
    },
  };
});

// ---- Slider art: wrap every slider so its hand-drawn line can be mirrored (settings.css,
// .art-slider). Each one gets the next way of flipping, so neighbors never look the same.
// (After the sound category rows above are built, so their sliders are included.)
const FLIPS = ['', 'flip-h', 'flip-v', 'flip-hv'];
document.querySelectorAll('input[type="range"]').forEach((input, i) => {
  const wrap = document.createElement('span');
  wrap.className = `art-slider ${FLIPS[i % FLIPS.length]}`.trim();
  input.replaceWith(wrap);
  wrap.append(input);
});

// The colored fill left of the starbit (settings.css, .art-slider::after) needs to know where the
// slider is: --p = 0 at the left end … 1 at the right. Updated while dragging and whenever saved
// settings are shown (setting .value from code doesn't fire 'input').
function syncFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const p = max > min ? (Number(input.value) - min) / (max - min) : 0;
  input.parentElement?.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
}
const syncAllFills = () => document.querySelectorAll('.art-slider > input[type="range"]').forEach(syncFill);
document.addEventListener('input', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'range') syncFill(e.target);
});
syncAllFills();

// ---- Starby → "Your name" (settingsStore.userName; what he calls you, renderer/pet/userName.js).
// Saved shortly after you stop typing; not overwritten while you're typing in it.
const nameBox = document.getElementById('user-name');
let nameTimer = null;
nameBox.addEventListener('input', () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => api.setSettings({ userName: nameBox.value }), 400);
});
nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameBox.blur(); });
function showUserName(settings) {
  if (document.activeElement !== nameBox) nameBox.value = typeof settings.userName === 'string' ? settings.userName : '';
}

function show(settings) {
  showUserName(settings);
  showSfx(settings);
  showSwitches(settings);
  showStarbySize(settings.starbySize);
  showUiScales(settings);
  showGameToggles(settings);
  slider.value = settings.flingPower;
  valueOut.textContent = settings.flingPower;
  if (pendingColorSaves === 0) showColors(settings.starbitColors);
  showSize(settings.starbitSize);
  sizePreview.src = starbitImage(previewColor(settings.starbitColors), 1);
  syncAllFills();
  syncSectionsOff(); // after the header boxes above are set
}

slider.addEventListener('input', () => {
  valueOut.textContent = slider.value;
  api.setSettings({ flingPower: Number(slider.value) });
});

document.getElementById('reset').addEventListener('click', async () => show(await api.resetSettings()));

// ---- Reset progress: starbits + shop purchases ----
// Each click moves to the next label; clicking "For real?" does the reset (main process:
// starbits 0, only Sunny + no accessory; Starby then says something sad). If you stop clicking
// partway, it backs out to "Reset progress" after CONFIRM_TIMEOUT_MS, so a stray click can't
// leave it one click away from wiping everything.
const resetProgressBtn = document.getElementById('reset-progress');
const RESET_STEPS = ['Reset progress', 'Are you sure?', "You'll lose your starbits!", 'And your accessories!', 'Are you really sure?', 'For real?'];
const CONFIRM_TIMEOUT_MS = 5000;
let resetStep = 0;
let resetTimer = null;

function setResetStep(step) {
  resetStep = step;
  resetProgressBtn.textContent = RESET_STEPS[step];
  clearTimeout(resetTimer);
  if (step > 0) resetTimer = setTimeout(() => setResetStep(0), CONFIRM_TIMEOUT_MS);
}

resetProgressBtn.addEventListener('click', async () => {
  if (resetStep < RESET_STEPS.length - 1) {
    setResetStep(resetStep + 1);
    return;
  }
  setResetStep(0);
  await api.resetProgress();
});

// ---- App → Start Starby when Windows starts (src/main/startup.js). Not a saved setting: it's
// Windows' own startup list, so it's read from there. Disabled where it can't work (development).
const runAtStartupBox = document.getElementById('run-at-startup');
const runAtStartupRow = document.getElementById('run-at-startup-row');
function showRunAtStartup(s) {
  runAtStartupBox.checked = Boolean(s?.enabled);
  runAtStartupBox.disabled = !s?.available;
  runAtStartupRow.classList.toggle('disabled', !s?.available);
  runAtStartupRow.title = s?.available ? '' : 'Only in the downloaded app (not while developing)';
}
api.getRunAtStartup?.().then(showRunAtStartup).catch(() => showRunAtStartup(null));
runAtStartupBox.addEventListener('change', async () => {
  showRunAtStartup(await api.setRunAtStartup(runAtStartupBox.checked));
});

// ---- Stats (lifetime, read-only; src/main/statsStore.js). Live: they tick up while open. ----
const num = (v) => (Number(v) || 0).toLocaleString();
function duration(seconds) {
  const m = Math.floor((Number(seconds) || 0) / 60);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
const date = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};
// [title, rows: [label, key, format]]
const STAT_GROUPS = [
  ['Starbits', [
    ['Collected', 'starbitsCollected', num],
    ['Spent', 'starbitsSpent', num],
    ['Items bought', 'itemsBought', num],
  ]],
  ['Games', [
    ['Played', 'gamesPlayed', num],
    ['Won', 'gamesWon', num],
    ['Best win streak', 'bestWinStreak', num],
  ]],
  ['Playing with Starby', [
    ['Throws', 'throws', num],
    ['Slingshots', 'slingshots', num],
    ['Wall hits', 'wallHits', num],
    ['Pokes', 'pokes', num],
    ['Times dizzy', 'timesDizzy', num],
    ['Times mad', 'timesMad', num],
    ['Naps', 'naps', num],
    ['Dances', 'dances', num],
  ]],
  ['Together', [
    ['Friends since', 'firstMet', date],
    ['Days visited', 'daysVisited', num],
    ['Time together', 'secondsTogether', duration],
  ]],
];
// Game names as players know them (events/games.js labels; that file isn't loaded in this window).
const GAME_LABELS = {
  tag: 'Tag', pong: 'Pong', 'hide-seek': 'Hide & Seek', catch: 'Catch', 'starby-says': 'Starby Says',
  'hoop-shot': 'Hoop Shot', maze: 'Maze', shuffle: 'Asteroid Shuffle', memory: 'Memory', constellation: 'Star Quiz',
};
const gameLabel = (name) => GAME_LABELS[name] || name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---- Games → one on/off box per game (checked = on). Saved as the list switched OFF
// (settingsStore.gamesOff), so a game added later starts out on. The pet hides an off game from
// his menu, his invites and the tray (pet/events/games.js, main/tray.js).
// A new game needs adding to GAME_LABELS above to get a box here.
const gameToggleBoxes = new Map(); // name → checkbox
const gameTogglesEl = document.getElementById('game-toggles');
for (const name of Object.keys(GAME_LABELS)) {
  const label = document.createElement('label');
  label.className = 'switch-row';
  const span = document.createElement('span');
  span.className = 'switch-name';
  span.textContent = GAME_LABELS[name];
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'art-check';
  box.checked = true;
  label.append(span, box);
  gameTogglesEl.append(label);
  gameToggleBoxes.set(name, box);
  box.addEventListener('change', () => {
    const off = [...gameToggleBoxes].filter(([, b]) => !b.checked).map(([n]) => n);
    api.setSettings({ gamesOff: off });
  });
}
function showGameToggles(settings) {
  const off = new Set(Array.isArray(settings?.gamesOff) ? settings.gamesOff : []);
  for (const [name, box] of gameToggleBoxes) box.checked = !off.has(name);
}

const statsGroupsEl = document.getElementById('stats-groups');
const statOutputs = new Map(); // key → [output, format]

function statsGroup(title) {
  const section = document.createElement('section');
  section.className = 'setting stats-list';
  const h = document.createElement('h3');
  h.className = 'stats-subtitle';
  h.textContent = title;
  section.append(h);
  statsGroupsEl.append(section);
  return section;
}
function statRow(parent, label, value = '0') {
  const row = document.createElement('div');
  row.className = 'label-row';
  const name = document.createElement('span');
  name.className = 'label';
  name.textContent = label;
  const out = document.createElement('output');
  out.textContent = value;
  row.append(name, out);
  parent.append(row);
  return out;
}

for (const [title, rows] of STAT_GROUPS) {
  const section = statsGroup(title);
  for (const [label, key, format] of rows) statOutputs.set(key, [statRow(section, label), format]);
}
const perGameEl = statsGroup('Per game'); // rows filled in by showStats (only games you've played)

function showStats(stats) {
  if (!stats) return;
  for (const [key, [out, format]] of statOutputs) out.textContent = format(stats[key]);
  // Per game: "3 won / 7 played", most played first.
  perGameEl.querySelectorAll('.label-row, .stats-empty').forEach((el) => el.remove());
  const games = Object.entries(stats.games || {}).filter(([, g]) => g.played > 0)
    .sort((a, b) => b[1].played - a[1].played);
  if (!games.length) {
    const p = document.createElement('p');
    p.className = 'stats-empty';
    p.textContent = 'no games yet!';
    perGameEl.append(p);
  }
  for (const [name, g] of games) statRow(perGameEl, gameLabel(name), `${num(g.won)} won / ${num(g.played)} played`);
}
api.getStats?.().then(showStats);
api.onStatsChanged?.(showStats);

api.onSettingsChanged(show);
api.getSettings().then(show);
