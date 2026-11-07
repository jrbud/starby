// Settings window. Moving the slider updates the pet live (main process broadcasts
// 'settings:changed'); the value is saved to settings.json and survives restarts.
import { flingTuning } from '../shared/flingTuning.js';

const api = window.sprite;
const slider = document.getElementById('fling-power');
const valueOut = document.getElementById('fling-power-value');
const detail = document.getElementById('fling-power-detail');

function describe(power) {
  const t = flingTuning(power);
  return `Throws ×${t.speedMul.toFixed(1)} · walls keep ${Math.round(t.bounce * 100)}% of the speed · `
    + 'hard wall hits freeze it for a moment.';
}

function show(settings) {
  slider.value = settings.flingPower;
  valueOut.textContent = settings.flingPower;
  detail.textContent = describe(settings.flingPower);
}

slider.addEventListener('input', () => {
  valueOut.textContent = slider.value;
  detail.textContent = describe(slider.value);
  api.setSettings({ flingPower: Number(slider.value) });
});

document.getElementById('reset').addEventListener('click', async () => show(await api.resetSettings()));

api.onSettingsChanged(show);
api.getSettings().then(show);
