// Settings window. Moving the slider updates the pet live (main process broadcasts
// 'settings:changed'); the value is saved to settings.json and survives restarts.
import { flingTuning } from '../shared/flingTuning.js';
import { STARBIT_COLORS, starbitImage, enabledColors, STARBIT_SIZE, clampStarbitSize } from '../shared/starbitArt.js';
import { sfx, SOUND_CATEGORIES } from '../shared/sfx.js';

// ---- Collapsible sections (<details>): remember open/closed per section in this window's
// localStorage (a per-viewer convenience; if storage is unavailable they just start open).
for (const section of document.querySelectorAll('details.group[data-key]')) {
  const key = `settings:collapsed:${section.dataset.key}`;
  try { if (localStorage.getItem(key) === '1') section.open = false; } catch { /* ignore */ }
  section.addEventListener('toggle', () => {
    try { localStorage.setItem(key, section.open ? '0' : '1'); } catch { /* ignore */ }
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

for (const color of STARBIT_COLORS) {
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
// The preview shows the first enabled color, so it matches what Starby throws.
const previewColor = (colorsOn) => enabledColors(colorsOn)[0];

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
].map(([id, key]) => ({ box: document.getElementById(id), key }));

for (const { box, key } of SWITCHES) {
  box.addEventListener('change', () => api.setSettings({ [key]: box.checked ? 1 : 0 }));
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

// One row per category: "Voice  80%" (+ a hint of what's in it), the slider, and an on/off box.
const categoryList = document.getElementById('sound-categories');
const categoryRows = SOUND_CATEGORIES.map((cat) => {
  const id = `sfx-cat-${cat.id.toLowerCase()}`;
  const section = document.createElement('section');
  section.className = 'setting sound-category';
  section.innerHTML = `
    <div class="label-row">
      <label for="${id}">${cat.label} <span class="sound-hint">${cat.hint}</span></label>
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

function show(settings) {
  showSfx(settings);
  showSwitches(settings);
  showStarbySize(settings.starbySize);
  showUiScales(settings);
  slider.value = settings.flingPower;
  valueOut.textContent = settings.flingPower;
  if (pendingColorSaves === 0) showColors(settings.starbitColors);
  showSize(settings.starbitSize);
  sizePreview.src = starbitImage(previewColor(settings.starbitColors), 1);
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

api.onSettingsChanged(show);
api.getSettings().then(show);
