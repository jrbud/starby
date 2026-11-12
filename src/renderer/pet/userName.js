// What Starby calls you: settingsStore.userName (asked in the welcome window, changeable in
// Settings → Starby). Any line he says can contain {name}; ctx.say (pet.js) swaps it for your name,
// or "friend" if you didn't give one. So lines must read fine with either:
//   "hi {name}!"  →  "hi sam!" / "hi friend!"
// The name is used as typed (capitals kept: it's your name).
const FALLBACK = 'friend';
let name = '';

const api = window.sprite;
const apply = (s) => {
  if (s && typeof s.userName === 'string') name = s.userName.trim();
};
api?.getSettings?.().then(apply).catch(() => {});
api?.onSettingsChanged?.(apply);

/** The user's name, or '' if they didn't give one. */
export const userName = () => name;

/** Fill {name} in a line. */
export const fillName = (text) => (typeof text === 'string' && text.includes('{name}') ? text.replaceAll('{name}', name || FALLBACK) : text);
