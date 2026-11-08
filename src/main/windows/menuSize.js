// Size of the hand-drawn menu windows (shop, settings). Both share the background art's aspect
// ratio (assets/backgrounds/*.png, 2324×2596).
//
// The pages are laid out for a 584×652 window (DESIGN_*). To make the windows smaller or bigger,
// change MENU_SCALE only: the window shrinks and the page is zoomed by the same factor
// (webPreferences.zoomFactor), so everything inside scales together and the layout stays the same.
//
// NOTE: with a zoom, page coordinates (CSS px) × MENU_SCALE = window coordinates (DIPs). The
// shop's display-box position is converted that way in shopWindow.js.
const MENU_SCALE = 0.8;
const DESIGN_WIDTH = 584;
const DESIGN_HEIGHT = 652;

module.exports = {
  MENU_SCALE,
  MENU_WIDTH: Math.round(DESIGN_WIDTH * MENU_SCALE),
  MENU_HEIGHT: Math.round(DESIGN_HEIGHT * MENU_SCALE),
};
