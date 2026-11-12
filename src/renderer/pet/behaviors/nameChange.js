// NAME CHANGE: when you give Starby your name (or change it) while he's running, he reacts:
// "nice to meet you, Sam!". Settings → Starby → "Your name", or the welcome window from the tray's
// "Info" (settingsStore.userName). At startup he just knows it (no reaction).
// Waits until you've stopped typing for SETTLE seconds, so a slowly typed name doesn't get a
// reaction per letter.
import { lineBag } from './chatter.js';

const SETTLE = 1.5; // seconds after the last change

const FIRST_NAME = lineBag([ // you didn't have a name before
  'nice to meet you, {name}!',
  '{name}! what a pretty name!',
  'hi {name}! i\'ll remember that forever',
  '{name}... {name}... got it! nice to meet you!',
  'ooh, {name}! that\'s a star-worthy name',
]);
const NEW_NAME = lineBag([ // you changed it
  'oh! {name} it is!',
  '{name}? ooh, i like it!',
  'got it! hi {name}!',
  'nice to meet you, {name}! ...again? hehe',
  'new name, same friend! hi {name}!',
  'okie dokie, {name}!',
]);
const NO_NAME = lineBag([ // you cleared it
  'no name? that\'s ok, i\'ll call you friend!',
  'mystery friend... ooh, spooky',
  'okay! just "friend" then :)',
]);

let known = null; // the name he last knew (null until settings first load)
let pending = null; // scheduler id of the reaction waiting for typing to settle

function react(ctx, name) {
  if (name === known) return;
  const was = known;
  known = name;
  const line = !name ? NO_NAME() : was ? NEW_NAME() : FIRST_NAME();
  ctx.say(line.replaceAll('{name}', name || 'friend'), 3500);
  ctx.log('name-change', { hadName: Boolean(was), hasName: Boolean(name) });
}

export default {
  name: 'name-change',

  init(ctx) {
    const current = (s) => (typeof s?.userName === 'string' ? s.userName.trim() : '');
    ctx.api.getSettings?.().then((s) => { if (known === null) known = current(s); }).catch(() => {});
    ctx.api.onSettingsChanged?.((s) => {
      if (known === null) return; // not loaded yet: nothing to compare with
      const name = current(s);
      if (pending !== null) ctx.cancel(pending);
      pending = null;
      if (name === known) return;
      pending = ctx.after(SETTLE, () => {
        pending = null;
        react(ctx, name);
      }, 'name-change: react');
    });
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.nameChange = (name = 'Sam') => { react(ctx, String(name)); return name; };
    }
  },
};
