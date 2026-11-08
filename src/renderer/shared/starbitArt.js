// Starbit art: the team-drawn PNGs in assets/starbits/, named <color><n>.png (e.g. pink3.png).
// Shared by the pet (behaviors/starbits.js picks a random image from the enabled colors) and
// the Settings window (one "Color" checkbox per color, with a preview).
//
// The page can't list a folder, so the colors are listed here: to add a color, drop its PNGs
// in assets/starbits/ and add it to STARBIT_COLORS; it gets a Settings checkbox automatically
// (unchecked unless it's in DEFAULT_STARBIT_COLORS). To add a 5th design per color, bump
// STARBIT_VARIANTS_PER_COLOR.

// Relative to an HTML page two folders under src/renderer/ (pet/, settings/ both are).
export const STARBIT_ART_DIR = '../../../assets/starbits/';
export const STARBIT_COLORS = ['blue', 'green', 'pink', 'red', 'teal', 'white', 'yellow'];
export const STARBIT_VARIANTS_PER_COLOR = 4;
// Colors switched on by default (and after "Reset to default"). Must match starbitColors in
// src/main/settingsStore.js.
export const DEFAULT_STARBIT_COLORS = ['yellow'];

export const starbitImage = (color, n) => `${STARBIT_ART_DIR}${color}${n}.png`;

// On-screen size (px), set in Settings → Starbits → Size. The default must match
// starbitSize in src/main/settingsStore.js.
export const STARBIT_SIZE = { min: 10, max: 48, step: 1, default: 20 };
export const clampStarbitSize = (v) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.round(Math.max(STARBIT_SIZE.min, Math.min(STARBIT_SIZE.max, n)))
    : STARBIT_SIZE.default;
};

// Every image for the given colors (all colors if none given).
export function starbitImages(colors = STARBIT_COLORS) {
  return colors.flatMap((color) =>
    Array.from({ length: STARBIT_VARIANTS_PER_COLOR }, (_, i) => starbitImage(color, i + 1)),
  );
}

// Settings store the colors that are switched ON (settings.starbitColors).
// Returns the known colors that are on, in list order; never empty (falls back to the
// defaults if nothing valid is on, e.g. before settings load).
export function enabledColors(colorsOn = DEFAULT_STARBIT_COLORS) {
  const on = new Set(Array.isArray(colorsOn) ? colorsOn : []);
  const known = STARBIT_COLORS.filter((c) => on.has(c));
  return known.length ? known : STARBIT_COLORS.filter((c) => DEFAULT_STARBIT_COLORS.includes(c));
}
