// Study timer (focus menu → "Start a timer"). Art: assets/menuIcons/clock/ + assets/events/moon.png.
//
// STATES (body[data-state], timer.css shows/hides things per state):
//   set       pick a time: up/down arrows change one digit each (wrapping 9 → 0 and 0 → 9; the
//             tens of seconds wrap at 5, since 59 is the most seconds). 00:00 is allowed while
//             picking, but Start does nothing until there's at least 00:01. Up to 99:59.
//   running   counting down.
//               analog  the digits, updated every second. Pause → paused.
//               phases  the moon wanes from its right edge (like moon phases) as time runs out.
//               pie     the moon empties clockwise from 12 o'clock, like a pie chart.
//             Clicking the moon pauses (moon modes have no Pause text).
//   paused    analog: "Resume". Moon: a sideways triangle on the moon; click to carry on.
//   done      time's up: dark face, the ears ring, "Stop" (analog shows 00 : 00, the moon modes
//             "Time's up!"). Stop → back to picking.
// Rewind (top left) cancels a timer and goes back to picking (does nothing while picking).
// Minimize / close are the window's own buttons (closing throws the timer away; it reopens at 00:00).
//
// The mode comes from Settings → UI → Study Timer (settingsStore.studyTimer) and switches live.
// Time is kept as an END TIME, not by counting ticks, so it stays right even if the window is
// minimized or the computer is busy.

import { sfx } from '../shared/sfx.js';

const api = window.sprite || {};
const DESIGN_WIDTH = 308; // keep in sync with timer.css and src/main/windows/timerWindow.js
const MAX_SECONDS = 99 * 60 + 59;

const body = document.body;
const root = document.documentElement;
const $ = (id) => document.getElementById(id);

// ---- Fit the page to the window (Menu size) and the text to Font size ----
function fitZoom() {
  const z = window.innerWidth / DESIGN_WIDTH;
  root.style.zoom = String(Math.abs(z - 1) < 0.01 ? 1 : z);
  drawMoon(); // the canvas is sharpened for the zoom
}
window.addEventListener('resize', fitZoom);

let mode = 'analog';
function applySettings(s) {
  const pct = Number(s?.fontScale);
  const f = Number.isFinite(pct) && pct > 0 ? Math.max(0.75, Math.min(1.5, pct / 100)) : 1;
  root.style.setProperty('--font-scale', String(f));
  mode = ['analog', 'phases', 'pie'].includes(s?.studyTimer) ? s.studyTimer : 'analog';
  body.dataset.mode = mode;
  // Switched mode mid-countdown: start/stop the moon's smooth redraw to match.
  if (state === 'running') {
    cancelAnimationFrame(frame);
    if (mode !== 'analog') frame = requestAnimationFrame(animate);
  }
  render();
}

// ---- State ----
let state = 'set';
let digits = [0, 0, 0, 0]; // m m : s s while picking
let picked = 0; // seconds picked when Start was pressed (rewind / Stop go back to this)
let endAt = 0; // ms timestamp when the running timer hits 0
let leftMs = 0; // ms left (kept while paused)
let totalMs = 0;
let ticker = null;
let frame = null;

const pickedSeconds = () => (digits[0] * 10 + digits[1]) * 60 + digits[2] * 10 + digits[3];

function setDigitsFrom(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  digits = [Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10];
}

// ALARM: assets/sounds/alarm.mp3, on repeat from the moment time's up until the timer leaves that
// state (Stop or rewind → back to picking). Closing the window ends the page, which stops it too.
// Volume: Settings → Sounds → "Timer" (× "All sounds"), live while it rings (sfx.loop).
let alarm = null;

function setState(next) {
  if (next === 'done' && !alarm) alarm = sfx.loop('alarm');
  if (next !== 'done' && alarm) { alarm.stop(); alarm = null; }
  state = next;
  body.dataset.state = next;
  clearInterval(ticker);
  cancelAnimationFrame(frame);
  ticker = null;
  if (next === 'running') {
    ticker = setInterval(tick, 200);
    if (mode !== 'analog') frame = requestAnimationFrame(animate);
  }
  render();
}

function remainingMs() {
  if (state === 'running') return Math.max(0, endAt - Date.now());
  if (state === 'paused') return leftMs;
  return 0;
}

function tick() {
  if (state !== 'running') return;
  if (Date.now() >= endAt) {
    leftMs = 0;
    setState('done');
    api.timerEnded?.(); // Starby says something (src/renderer/pet/events/focus.js, LINES.timerEnded)
    return;
  }
  render();
}

// Moon modes: redraw smoothly while running.
function animate() {
  if (state !== 'running') return;
  drawMoon();
  frame = requestAnimationFrame(animate);
}

// ---- Actions ----
function start() {
  const secs = pickedSeconds();
  if (secs < 1) return; // 00:00 can't start
  picked = Math.min(MAX_SECONDS, secs);
  totalMs = picked * 1000;
  endAt = Date.now() + totalMs;
  setState('running');
}

function pause() {
  if (state !== 'running') return;
  leftMs = Math.max(0, endAt - Date.now());
  setState('paused');
}

function resume() {
  if (state !== 'paused') return;
  endAt = Date.now() + leftMs;
  setState('running');
}

// Rewind / Stop: back to picking, with the time that was picked before Start.
function backToSet() {
  if (state === 'set') return;
  setDigitsFrom(picked);
  setState('set');
}

function onAction() {
  if (state === 'set') start();
  else if (state === 'running') pause();
  else if (state === 'paused') resume();
  else if (state === 'done') backToSet();
}

// Up/down on one digit. Each digit wraps on its own (tens of seconds: 0–5).
function nudge(i, delta) {
  if (state !== 'set') return;
  const max = i === 2 ? 5 : 9;
  digits[i] = (digits[i] + delta + max + 1) % (max + 1);
  render();
}

// ---- Rendering ----
const cols = [];
function buildDigits() {
  const box = $('digits');
  const make = (key) => {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.i = key;
    box.appendChild(col);
    return col;
  };
  for (const key of ['0', '1', 'c', '2', '3']) {
    const col = make(key);
    if (key === 'c') {
      const colon = document.createElement('span');
      colon.className = 'colon';
      colon.textContent = ':';
      col.appendChild(colon);
      continue;
    }
    const i = Number(key);
    const up = document.createElement('button');
    up.className = 'arrow up';
    up.type = 'button';
    up.setAttribute('aria-label', 'Up');
    up.onclick = () => nudge(i, 1);
    const down = document.createElement('button');
    down.className = 'arrow down';
    down.type = 'button';
    down.setAttribute('aria-label', 'Down');
    down.onclick = () => nudge(i, -1);
    const digit = document.createElement('span');
    digit.className = 'digit';
    col.append(up, digit, down);
    cols[i] = digit;
  }
}

function render() {
  // Digits: what you're picking, or the time left (rounded up, so it shows 00:01 until it's 0).
  let shown = digits;
  if (state !== 'set') {
    const secs = Math.ceil(remainingMs() / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    shown = [Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10];
  }
  shown.forEach((d, i) => { if (cols[i]) cols[i].textContent = String(d); });

  const action = $('action');
  action.textContent = { set: 'Start', running: 'Pause', paused: 'Resume', done: 'Stop' }[state];
  const cantStart = state === 'set' && pickedSeconds() < 1;
  action.classList.toggle('disabled', cantStart);
  action.setAttribute('aria-disabled', String(cantStart));
  drawMoon();
}

// ---- The moon (team art, clipped to the time left) ----
const moonImg = new Image();
moonImg.onload = () => drawMoon();
moonImg.src = '../../../assets/events/moon.png';
// The moon disk inside moon.png (500 × 500): drawn from (3, 3) to (494, 491).
const DISK = { cx: (3 + 494) / 2 / 500, cy: (3 + 491) / 2 / 500, r: 492 / 2 / 500 };
const EXPIRED_ALPHA = 0.18; // the faint moon for time that's gone (same as the loading moon's DIM)

function drawMoon() {
  const canvas = $('moon');
  if (!canvas || mode === 'analog' || !(state === 'running' || state === 'paused')) return;
  const zoom = Number(root.style.zoom) || 1;
  const px = Math.round(190 * zoom * (window.devicePixelRatio || 1));
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, px, px);
  if (!moonImg.complete || !moonImg.naturalWidth) return;
  const f = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs() / totalMs)) : 0; // share left
  g.imageSmoothingQuality = 'high';
  // The time that's gone shows as a faint moon (like the loading moon: the same art at low
  // opacity underneath), and the time left as the full-strength moon on top.
  g.globalAlpha = EXPIRED_ALPHA;
  g.drawImage(moonImg, 0, 0, px, px);
  g.globalAlpha = 1;
  if (f <= 0) return;
  const cx = DISK.cx * px;
  const cy = DISK.cy * px;
  const r = DISK.r * px;
  g.save();
  g.beginPath();
  if (mode === 'pie') {
    // What's gone grows clockwise from 12 o'clock; what's left is the rest of the pie.
    const top = -Math.PI / 2;
    const R = r * 1.04; // a little past the edge, so the outline isn't cut
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, top + 2 * Math.PI * (1 - f), top + 2 * Math.PI, false);
    g.closePath();
  } else {
    // Moon phases, waning from the right: the left edge stays; the shadow line is half an ellipse
    // that sweeps from the right edge (all lit) through the middle (half) to the left (gone).
    const k = 2 * f - 1; // 1 = full, 0 = half, -1 = gone
    const R = r * 1.04;
    g.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true); // left half, top → bottom
    g.ellipse(cx, cy, Math.max(0.001, Math.abs(k) * R), R, 0, Math.PI / 2, -Math.PI / 2, k > 0);
    g.closePath();
  }
  g.clip();
  g.drawImage(moonImg, 0, 0, px, px);
  g.restore();
}

// ---- Wiring ----
buildDigits();
$('action').addEventListener('click', onAction);
$('rewind').addEventListener('click', backToSet);
$('minimize').addEventListener('click', () => api.minimizeTimer?.());
$('close').addEventListener('click', () => api.closeTimer?.());
const moonToggle = () => { if (state === 'running') pause(); else if (state === 'paused') resume(); };
$('moon').addEventListener('click', moonToggle);
document.querySelector('.resume-mark').addEventListener('click', moonToggle);
$('moon').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); moonToggle(); }
});

fitZoom();
setState('set');
applySettings({});
api.getSettings?.().then(applySettings).catch(() => {});
api.onSettingsChanged?.(applySettings);
