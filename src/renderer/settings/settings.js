// Settings window. Moving the slider updates the pet live (main process broadcasts
// 'settings:changed'); the value is saved to settings.json and survives restarts.
import { flingTuning } from '../shared/flingTuning.js';
import { STARBIT_COLORS, starbitImage, enabledColors, STARBIT_SIZE, clampStarbitSize } from '../shared/starbitArt.js';
import { sfx } from '../shared/sfx.js';

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
  const v = Number(px) || 96;
  starbySlider.value = v;
  starbyOut.textContent = `${v} px`;
}

starbySlider.addEventListener('input', () => {
  showStarbySize(starbySlider.value);
  api.setSettings({ starbySize: Number(starbySlider.value) });
});

// ---- Sound effects: volume slider + mute (shared/sfx.js plays at this volume everywhere) ----
const sfxSlider = document.getElementById('sfx-volume');
const sfxOut = document.getElementById('sfx-volume-value');
const sfxMute = document.getElementById('sfx-muted');
sfx.preload(['collect-starbit']);

function showSfx(settings) {
  const v = Number.isFinite(Number(settings.sfxVolume)) ? Number(settings.sfxVolume) : 70;
  const muted = Number(settings.sfxMuted) === 1;
  sfxSlider.value = v;
  sfxOut.textContent = muted ? 'muted' : `${v}%`;
  sfxMute.checked = muted;
  sfxSlider.classList.toggle('is-muted', muted);
}

sfxSlider.addEventListener('input', () => {
  // Moving the slider while muted unmutes (you clearly want sound).
  const v = Number(sfxSlider.value);
  sfxMute.checked = false;
  sfxOut.textContent = `${v}%`;
  sfxSlider.classList.remove('is-muted');
  api.setSettings({ sfxVolume: v, sfxMuted: 0 });
});
// Letting go: play a sample so you hear the new volume.
sfxSlider.addEventListener('change', () => {
  sfx.setVolume(Number(sfxSlider.value), false);
  sfx.play('collect-starbit');
});
sfxMute.addEventListener('change', () => {
  const muted = sfxMute.checked;
  sfxOut.textContent = muted ? 'muted' : `${sfxSlider.value}%`;
  sfxSlider.classList.toggle('is-muted', muted);
  api.setSettings({ sfxMuted: muted ? 1 : 0 });
  if (!muted) {
    sfx.setVolume(Number(sfxSlider.value), false);
    sfx.play('collect-starbit');
  }
});

function show(settings) {
  showSfx(settings);
  showSwitches(settings);
  showStarbySize(settings.starbySize);
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
