// Double-click the star to open the shop (P4-4). The right-click menu also has "Open shop".
//
// dblclick only fires when both clicks land without a drag in between (drag.js turns a press
// into a drag once the cursor moves past its click slop), so throws don't open the shop.
// The single clicks still reach drag.js / speech.js as usual.
//
// NOTE: behaviors/index.js imports this file's default export. If you disable this behavior,
// remove it from index.js too; commenting out the export breaks the whole pet renderer.

export default {
  name: 'shopOpener',

  init(ctx) {
    ctx.petEl.addEventListener('dblclick', () => {
      if (ctx.pet.mode === 'drag' || ctx.pet.mode === 'toss') return;
      ctx.log('shop-open', { via: 'dblclick' });
      ctx.api.openShop();
    });
  },
};
