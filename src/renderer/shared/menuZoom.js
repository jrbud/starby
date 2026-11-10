// Fits a hand-drawn menu page (shop, settings) to the Settings → UI sliders:
//
//   Menu size  The pages are designed 584 CSS px wide (main/windows/menuSize.js DESIGN_WIDTH). The main
//              process resizes the window (main/windows/menuScale.js); this zooms the whole page by the
//              same amount, so everything inside grows or shrinks together.
//   Font size  sets --font-scale on <html> (1 = 100 %). The pages' CSS multiplies their font sizes by
//              it (calc(20px * var(--font-scale, 1))), and fires a 'fontscale' event on window so
//              JS that measures text (the shop's name fitting) can redo it.
//
// A classic (non-module) script in <head>, so it runs before the page's own scripts and its
// 'resize' listener goes first (the shop re-measures its display box on resize, after the zoom).
(function () {
  var DESIGN_WIDTH = 584; // keep in sync with menuSize.js
  var root = document.documentElement;

  function fit() {
    var z = window.innerWidth / DESIGN_WIDTH;
    if (Math.abs(z - 1) < 0.01) z = 1; // 100 %: the window rounds to whole px; don't blur the page for that
    root.style.zoom = String(z);
  }
  fit();
  window.addEventListener('resize', fit);

  var current = null;
  function applyFont(settings) {
    var pct = Number(settings && settings.fontScale);
    var f = Number.isFinite(pct) && pct > 0 ? Math.max(0.75, Math.min(1.5, pct / 100)) : 1;
    if (f === current) return;
    current = f;
    root.style.setProperty('--font-scale', String(f));
    window.dispatchEvent(new Event('fontscale'));
  }
  var api = window.sprite;
  if (api && api.getSettings) api.getSettings().then(applyFont).catch(function () {});
  if (api && api.onSettingsChanged) api.onSettingsChanged(applyFont);
})();
