// The Developer window (src/main/windows/devToolsWindow.js). Each button sends one or more commands
// through window.sprite.devCommand(cmd):
//   { type: 'starby', fn, args }   → window.starby[fn](...args) in the pet window
//   { type: 'start-event', name }  → start that event (as if picked from his menu)
//   { type: 'pet-devtools' }  → open the pet window's DevTools
// TO ADD A BUTTON: add it to SECTIONS below. A new window.starby helper works with no other changes.
// The Admin Settings tab is adminPanel.js.
const api = window.sprite;
const statusEl = document.getElementById('status');

// ---- Tabs: Actions / Admin Settings. Starts on ?tab=... (devToolsWindow.js opens the Admin tab for
// "Admin Settings" in Starby's hidden menu), else the last one used (this window's localStorage). ----
const TAB_KEY = 'devtools:tab';
function showTab(name) {
  if (!document.getElementById(`tab-${name}`)) name = 'actions';
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  statusEl.hidden = name !== 'actions';
  try { localStorage.setItem(TAB_KEY, name); } catch { /* ignore */ }
}
window.showTab = showTab; // devToolsWindow.js switches tabs on an already-open window
for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
{
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* ignore */ }
  showTab(new URLSearchParams(location.search).get('tab') || saved || 'actions');
}

const starby = (fn, ...args) => ({ type: 'starby', fn, args });
const stop = starby('stopEvent');
const event = (name) => ({ type: 'start-event', name });

const GAMES = [
  ['tag', 'Tag'], ['pong', 'Pong'], ['hide-seek', 'Hide & seek'], ['catch', 'Catch'],
  ['constellation', 'Star quiz'], ['starby-says', 'Starby says'], ['hoop-shot', 'Hoop shot'],
  ['memory', 'Memory'], ['shuffle', 'Asteroid shuffle'], ['maze', 'Maze'],
];
const MOODS = ['happy', 'playful', 'mad', 'sad', 'dizzy', 'yawning', 'sleepy'];

// [legend, buttons, note?]. A button: [label, command or [commands...]].
const SECTIONS = [
  ['Tools', [
    ['Open pet DevTools', { type: 'pet-devtools' }],
    ['Find Starby', starby('find')],
    ['Stop current event', stop],
  ]],
  ['Sky events', [
    ['Star shower', starby('happening', 'star-shower')],
    ['Shooting star', starby('happening', 'shooting-star')],
    ['Black hole', starby('happening', 'black-hole')],
    ['Random one', starby('happening')],
  ]],
  ['Other events', [
    ['Friend visits', starby('friendVisit')],
    ['Secret (asks first)', starby('secret')],
    ['Secret: tell one', starby('secret', 'tell')],
    ['Secret: spit-laugh', starby('secret', 'spit')],
    ['Copycat', [stop, event('copycat')]],
    ['Dance', [stop, event('dance')]],
    ['Open dialogue box', starby('dialogue')],
  ]],
  ['Start a game', GAMES.map(([name, label]) => [label, [stop, event(name)]])],
  ['Game invites', [
    ['Invite (random game)', starby('invite')],
    ...GAMES.filter(([name]) => name !== 'hide-seek').map(([name, label]) => [`Invite: ${label}`, starby('invite', name)]),
  ], 'Hide & seek has no invite: it starts as a surprise.'],
  ['Game rest', [
    ['Skip game rest', starby('skipRest')],
    ['No rest for 5 min', starby('noRest', 5)],
    ['No rest for 30 min', starby('noRest', 30)],
  ]],
  ['Mood', [
    ...MOODS.map((m) => [m, starby('setMood', m)]),
    ['Get sleepy (walk to nap)', starby('getSleepy')],
    ['Show mood label', starby('showMood', true)],
    ['Hide mood label', starby('showMood', false)],
  ]],
  ['Faces & moves', [
    ['Wink', starby('flourish', 'wink')],
    ['Glisten', starby('flourish', 'glistening')],
    ['Spin', starby('fidget', 'spin')],
    ['Bop', starby('fidget', 'bop')],
    ['Look around', starby('fidget', 'look')],
    ['Stretch', starby('fidget', 'stretch')],
  ], 'Fidgets only play while he\'s idle.'],
  ['Effects', [
    ['Star burst', starby('fx', 'burst')],
    ['Wake burst', starby('fx', 'wake')],
    ['Swat', starby('fx', 'swat')],
    ['Wall hit: left', starby('impactFx', 'left')],
    ['Wall hit: right', starby('impactFx', 'right')],
    ['Wall hit: top', starby('impactFx', 'top')],
    ['Wall hit: bottom', starby('impactFx', 'bottom')],
  ]],
  ['Sleep', [
    ['Dream', starby('dream')],
    ['Sleep talk', starby('sleepTalk')],
  ], 'Set the mood to sleepy first.'],
  ['Gifts', [
    ['Daily gift', starby('dailyGift')],
    ['Milestone (100)', starby('milestone', 100)],
    ['Milestone (1000)', starby('milestone', 1000)],
  ]],
  ['Name', [
    ['Name change reaction (Sam)', starby('nameChange', 'Sam')],
  ], 'Only his reaction: your saved name doesn\'t change.'],
  ['Goodbye', [
    ['Play goodbye (doesn\'t quit)', starby('goodbye')],
  ]],
];

function send(label, cmds) {
  for (const c of Array.isArray(cmds) ? cmds : [cmds]) api.devCommand?.(c);
  statusEl.textContent = `Sent: ${label}`;
}

function fieldset(legend, note) {
  const fs = document.createElement('fieldset');
  fs.innerHTML = `<legend></legend><div class="row"></div>`;
  fs.querySelector('legend').textContent = legend;
  if (note) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = note;
    fs.append(p);
  }
  document.getElementById('sections').append(fs);
  return fs.querySelector('.row');
}

function button(row, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  row.append(b);
}

for (const [legend, buttons, note] of SECTIONS) {
  const row = fieldset(legend, note);
  for (const [label, cmds] of buttons) button(row, label, () => send(label, cmds));
}

// Time of day: try the moment for a given hour right now (systemReactions.js timeMoment).
{
  const row = fieldset('Time of day', 'Plays his time-of-day reaction for that hour (0–23), if there is one.');
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '23';
  input.value = String(new Date().getHours());
  row.append('Hour ', input);
  button(row, 'Try it', () => {
    const h = Math.max(0, Math.min(23, Math.round(Number(input.value) || 0)));
    send(`time of day ${h}:00`, starby('timeMoment', h));
  });
}
