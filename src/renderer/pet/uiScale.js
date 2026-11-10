// UI SIZES in the pet window: the Settings → UI sliders (settingsStore, 75–150 %) as factors
// (1 = 100 %, as designed):
//   menuScale()  the right-click / event menus' answer boxes (./dialogue/dialogue.js)
//   chatScale()  speech + thought bubbles (./bubble.js) and his line in the right-click menu
//   fontScale()  text size in the bubbles and menu boxes; the bubbles grow to fit
// (The shop/settings windows follow Menu size too, sized by the main process: main/windows/menuScale.js.)
// Starby and starbits have their own size settings and don't use these.
// It listens for the settings itself, so pet.js doesn't need to know about it.
const api = window.sprite;
const scales = { menuScale: 1, chatScale: 1, fontScale: 1 };

const factor = (v) => {
  const pct = Number(v);
  return Number.isFinite(pct) && pct > 0 ? Math.max(0.75, Math.min(1.5, pct / 100)) : 1;
};
const apply = (s) => {
  for (const key of Object.keys(scales)) scales[key] = factor(s && s[key]);
};

api?.getSettings?.().then(apply).catch(() => {});
api?.onSettingsChanged?.(apply);

export const menuScale = () => scales.menuScale;
export const chatScale = () => scales.chatScale;
export const fontScale = () => scales.fontScale;
