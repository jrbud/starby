// Welcome window page (src/main/windows/welcomeWindow.js).
//   "Start Starby when Windows starts"  applied right away (src/main/startup.js); greyed out where it
//                                       isn't available (development: `npm start`)
//   "Don't show this again"             settingsStore.showWelcome = 0 (Settings → App turns it back on)
//   "Let's go!"                         starts Starby, and this window closes
const api = window.sprite || {};

// ---- Starby at the top: the team's sprite frames (happy-1 ↔ happy-2, like his idle boil), and a
// wink while you hover "let's go!". PNG frames swapped in code (no GIFs), nothing drawn.
const SPRITE = '../../../assets/sprite/sunny';
const HAPPY = [`${SPRITE}/happy-1.png`, `${SPRITE}/happy-2.png`];
const WINK = `${SPRITE}/wink.png`;
const FRAME_MS = 450;
const starby = document.getElementById('starby');
for (const src of [...HAPPY, WINK]) new Image().src = src; // preload: no flicker on the first swap
let frame = 0;
let winking = false;
setInterval(() => {
  if (winking) return;
  frame = (frame + 1) % HAPPY.length;
  starby.src = HAPPY[frame];
}, FRAME_MS);
starby.onerror = () => { starby.style.visibility = 'hidden'; }; // missing art: leave the spot empty

// ---- Start when Windows starts ----
const startupBox = document.getElementById('startup');
const startupRow = document.getElementById('startup-row');
const startupHint = document.getElementById('startup-hint');

function showStartup(s) {
  const available = Boolean(s?.available);
  startupBox.checked = Boolean(s?.enabled);
  startupBox.disabled = !available;
  startupRow.classList.toggle('disabled', !available);
  startupHint.hidden = available;
}
Promise.resolve(api.getRunAtStartup?.()).then(showStartup).catch(() => showStartup(null));
startupBox.addEventListener('change', async () => {
  try { showStartup(await api.setRunAtStartup(startupBox.checked)); } catch { showStartup(null); }
});

// ---- Don't show this again ----
const hideBox = document.getElementById('hide');
Promise.resolve(api.getSettings?.()).then((s) => { hideBox.checked = Number(s?.showWelcome) === 0; }).catch(() => {});
hideBox.addEventListener('change', () => {
  api.setSettings?.({ showWelcome: hideBox.checked ? 0 : 1 })?.catch?.(() => {});
});

// ---- Let's go! ----
const go = document.getElementById('go');
go.addEventListener('mouseenter', () => { winking = true; starby.src = WINK; });
go.addEventListener('mouseleave', () => { winking = false; starby.src = HAPPY[frame]; });
go.addEventListener('click', () => {
  go.disabled = true;
  api.welcomeDone?.();
});
go.focus();
