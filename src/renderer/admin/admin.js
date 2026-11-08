// Admin Settings window: a slider for every starbits tuning knob. Moving a slider saves the
// value (main process → admin-settings.json) and the pet picks it up live via
// 'admin:changed'. Knobs, defaults and ranges come from ../shared/starbitsTuning.js.
import { STARBITS_TUNING, MIN_MAX_PAIRS, resolveTuning } from '../shared/starbitsTuning.js';

const api = window.sprite;
const container = document.getElementById('settings');
const rows = new Map(); // key -> { slider, output, defaultEl }

const fmt = (t, v) => {
  const decimals = String(t.step).includes('.') ? String(t.step).split('.')[1].length : 0;
  const n = Number(v).toFixed(decimals);
  return t.unit === '×' ? `×${n}` : t.unit ? `${n} ${t.unit}` : n;
};

// One collapsible section per `group`, in the order groups first appear in the list.
// Built on <details>/<summary>, so clicking the heading (or Enter/Space on it) toggles it.
// Open/closed is remembered per group in this window's localStorage (a per-viewer
// convenience only; if storage is unavailable, sections just start open).
const COLLAPSE_KEY = (name) => `admin-settings:collapsed:${name}`;
const readCollapsed = (name) => {
  try { return localStorage.getItem(COLLAPSE_KEY(name)) === '1'; } catch { return false; }
};
const writeCollapsed = (name, collapsed) => {
  try { localStorage.setItem(COLLAPSE_KEY(name), collapsed ? '1' : '0'); } catch { /* ignore */ }
};

const groups = new Map(); // group name -> element the rows go in
function groupBody(name) {
  if (!groups.has(name)) {
    const wrap = document.createElement('details');
    wrap.className = 'group';
    wrap.open = !readCollapsed(name);
    const heading = document.createElement('summary');
    const title = document.createElement('span');
    title.className = 'group-title';
    title.textContent = name;
    const count = document.createElement('span');
    count.className = 'group-count';
    heading.append(title, count);
    const body = document.createElement('div');
    body.className = 'group-body';
    wrap.append(heading, body);
    wrap.addEventListener('toggle', () => writeCollapsed(name, !wrap.open));
    container.append(wrap);
    groups.set(name, { body, count, rows: 0 });
  }
  const g = groups.get(name);
  g.rows += 1;
  g.count.textContent = `${g.rows} setting${g.rows === 1 ? '' : 's'}`;
  return g.body;
}

// Build the rows.
for (const t of STARBITS_TUNING) {
  const section = document.createElement('div');
  section.className = 'setting';

  const labelRow = document.createElement('div');
  labelRow.className = 'label-row';
  const label = document.createElement('label');
  label.htmlFor = `knob-${t.key}`;
  label.textContent = t.label;
  const output = document.createElement('output');
  output.htmlFor = `knob-${t.key}`;
  labelRow.append(label, output);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = `knob-${t.key}`;
  slider.min = t.min;
  slider.max = t.max;
  slider.step = t.step;

  const ends = document.createElement('div');
  ends.className = 'ends';
  const lo = document.createElement('span');
  lo.textContent = fmt(t, t.min);
  const defaultEl = document.createElement('span');
  defaultEl.className = 'default';
  defaultEl.textContent = `default ${fmt(t, t.default)}`;
  const hi = document.createElement('span');
  hi.textContent = fmt(t, t.max);
  ends.append(lo, defaultEl, hi);

  const help = document.createElement('p');
  help.className = 'detail';
  help.textContent = t.help;

  section.append(labelRow, slider, ends, help);
  groupBody(t.group || 'Other').append(section);
  rows.set(t.key, { t, slider, output, section });

  slider.addEventListener('input', () => {
    const patch = { [t.key]: Number(slider.value) };
    // Keep each min ≤ its max: dragging one past the other pushes the other along.
    for (const [loKey, hiKey] of MIN_MAX_PAIRS) {
      const loVal = Number(rows.get(loKey).slider.value);
      const hiVal = Number(rows.get(hiKey).slider.value);
      if (loVal > hiVal) {
        if (t.key === loKey) patch[hiKey] = loVal;
        else if (t.key === hiKey) patch[loKey] = hiVal;
      }
    }
    show(resolveTuning({ ...currentValues(), ...patch }));
    api.setAdminSettings(patch);
  });
}

function currentValues() {
  return Object.fromEntries([...rows].map(([k, r]) => [k, Number(r.slider.value)]));
}

function show(tuning) {
  for (const [key, r] of rows) {
    r.slider.value = tuning[key];
    r.output.textContent = fmt(r.t, tuning[key]);
    r.section.classList.toggle('changed', tuning[key] !== r.t.default);
  }
}

document.getElementById('reset').addEventListener('click', async () => {
  show(resolveTuning(await api.resetAdminSettings()));
});

api.onAdminSettingsChanged((overrides) => show(resolveTuning(overrides)));
api.getAdminSettings().then((overrides) => show(resolveTuning(overrides)));
