// Settings window. Moving the slider updates the pet live (main process broadcasts
// 'settings:changed'); the value is saved to settings.json and survives restarts.
import { flingTuning } from '../shared/flingTuning.js';
import { STARBIT_COLORS, starbitImage, enabledColors, STARBIT_SIZE, clampStarbitSize } from '../shared/starbitArt.js';

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
const detail = document.getElementById('fling-power-detail');

function describe(power) {
  const t = flingTuning(power);
  return `Throws ×${t.speedMul.toFixed(1)} · walls keep ${Math.round(t.bounce * 100)}% of the speed · `
    + 'hard wall hits freeze it for a moment.';
}

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
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = color;
  const preview = document.createElement('img');
  preview.src = starbitImage(color, 1); // the team's art for this color
  preview.alt = '';
  preview.draggable = false;
  const name = document.createElement('span');
  name.textContent = titleCase(color);
  label.append(box, preview, name);
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
  colorCount.textContent = checked.length === colorBoxes.size ? 'All colors' : `${checked.length} of ${colorBoxes.size}`;
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
  const v = Number(px) || 96;
  starbySlider.value = v;
  starbyOut.textContent = `${v} px`;
}

starbySlider.addEventListener('input', () => {
  showStarbySize(starbySlider.value);
  api.setSettings({ starbySize: Number(starbySlider.value) });
});

function show(settings) {
  showSwitches(settings);
  showStarbySize(settings.starbySize);
  slider.value = settings.flingPower;
  valueOut.textContent = settings.flingPower;
  detail.textContent = describe(settings.flingPower);
  if (pendingColorSaves === 0) showColors(settings.starbitColors);
  showSize(settings.starbitSize);
  sizePreview.src = starbitImage(previewColor(settings.starbitColors), 1);
}

slider.addEventListener('input', () => {
  valueOut.textContent = slider.value;
  detail.textContent = describe(slider.value);
  api.setSettings({ flingPower: Number(slider.value) });
});

document.getElementById('reset').addEventListener('click', async () => show(await api.resetSettings()));

api.onSettingsChanged(show);
api.getSettings().then(show);
