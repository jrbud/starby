// The starbits tuning knobs: one list of every adjustable value with its default, range and
// label. Shared by the pet (behaviors/starbits.js uses the values) and the Admin Settings
// window (builds a slider per entry from this list).
//
// To change a DEFAULT, edit `default` here. To add a new knob: add an entry here, then read
// it in starbits.js as `tuning.<key>`; the Admin Settings window picks it up automatically.
// `group` is the section heading it appears under in Admin Settings (in list order).
//
// Admin Settings only saves values someone changed (admin-settings.json in the app's data
// folder); anything not saved uses the default below. "Reset to defaults" clears them all.

export const STARBITS_TUNING = [
  {
    group: 'Starbits', key: 'dropEveryMin', label: 'Drop every (min)', unit: 's', min: 1, max: 120, step: 1, default: 8,
    help: 'Shortest wait between drops. Moods scale this (playful = twice as often, mad/asleep = none).',
  },
  {
    group: 'Starbits', key: 'dropEveryMax', label: 'Drop every (max)', unit: 's', min: 1, max: 120, step: 1, default: 15,
    help: 'Longest wait between drops. Each wait is random between min and max.',
  },
  {
    group: 'Starbits', key: 'burstMin', label: 'Burst size (min)', unit: '', min: 1, max: 10, step: 1, default: 1,
    help: 'Fewest starbits thrown per drop.',
  },
  {
    group: 'Starbits', key: 'burstMax', label: 'Burst size (max)', unit: '', min: 1, max: 10, step: 1, default: 4,
    help: 'Most starbits thrown per drop (still limited by "Max on screen").',
  },
  {
    group: 'Starbits', key: 'maxOnScreen', label: 'Max on screen', unit: '', min: 1, max: 50, step: 1, default: 8,
    help: 'Most starbits floating at once; no new drops until some are collected or fade. '
      + 'Tag win rewards can go over this.',
  },
  {
    group: 'Starbits', key: 'value', label: 'Starbit value', unit: '', min: 1, max: 100, step: 1, default: 1,
    help: 'How much the counter goes up for each starbit collected.',
  },
  {
    group: 'Starbits', key: 'lifetime', label: 'Lifetime', unit: 's', min: 5, max: 600, step: 5, default: 60,
    help: 'Seconds before an uncollected starbit fades away.',
  },
  {
    group: 'Starbits', key: 'magnetStrength', label: 'Magnet strength', unit: '×', min: 0, max: 5, step: 0.1, default: 1,
    help: 'How hard the cursor pulls starbits in. 0 = off (touch to collect).',
  },
  {
    group: 'Starbits', key: 'magnetRadius', label: 'Magnet reach', unit: 'px', min: 0, max: 400, step: 10, default: 90,
    help: 'How close the cursor has to get before starbits drift toward it.',
  },
];

// Pairs where the first must not exceed the second.
export const MIN_MAX_PAIRS = [
  ['dropEveryMin', 'dropEveryMax'],
  ['burstMin', 'burstMax'],
];

export const DEFAULT_TUNING = Object.fromEntries(STARBITS_TUNING.map((t) => [t.key, t.default]));

// Saved overrides → a complete, safe tuning object: unknown keys dropped, every value a
// number inside its range, and min ≤ max for each pair.
export function resolveTuning(overrides = {}) {
  const out = {};
  for (const t of STARBITS_TUNING) {
    const v = Number(overrides?.[t.key]);
    out[t.key] = Number.isFinite(v) ? Math.max(t.min, Math.min(t.max, v)) : t.default;
  }
  for (const [lo, hi] of MIN_MAX_PAIRS) {
    if (out[lo] > out[hi]) out[hi] = out[lo];
  }
  return out;
}
