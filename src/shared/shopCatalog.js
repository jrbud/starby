// Shop items. Purely cosmetic: no item changes behavior (drop rate, speed, etc.).
//
// slot:  which part of the sprite it changes ('color' | 'accessory')
// value: what the renderer uses (a hex color, or an accessory id from
//        src/renderer/pet/accessories.js, which knows the art file and where it goes)
// set:   (colors, optional) the skin folder in assets/sprite/<set>/ with this color's hand-drawn
//        frames. Defaults to the id minus "color-" (color-sunny → sunny). A color with no folder
//        yet shows the sunny art; frames missing from a set come from sunny (see frames.js).
//
// The star has ONE shape. There is no shape slot. Don't add shape items.
//
// ART RULE (claude.md): colors are just a fill value, so new colors can be added here freely.
// Accessories are hand-drawn PNGs in assets/accessories/; a new one needs its art plus an
// entry in accessories.js (anchor/position), never a code-drawn stand-in.
//
// WEARING SEVERAL: he wears at most ONE accessory per `category` (one head item, one hand item,
// ...), saved as state.equipped.accessories = { head: id, hand: id, ... } (stateSchema.js).
// Equipping replaces what's worn in that category; the shop's "Take off" empties it.
// accessoriesConflict() below is that rule. `place` is only where on him it's drawn.
//
// BALANCE: starbits.js drops one every 8–15s (~11.5s average), so a player who collects most
// drops earns ~5 per minute. Cheapest items cost 25 (~5 min of play, the first purchase).
// Accessories are bought with starbits like colors (only "None" is free):
//   40–50   small things: lollipop, bow, tie                       (~8–10 min of play)
//   60–70   hats and shoes: propeller hat, sneakers, boots, top hat (~12–14 min)
//   80–90   floating extras: balloon, star tail, neon trail, motion blur (~16–18 min)
//   100–120 the showpieces: halo, UFO, rainbow trail, the flag ribbons (~20–24 min)
// Everything (colors 60 + accessories 1600) costs 1660 starbits, about 5.5 hours of play.
// For demos use the shop's demo shortcut (P4-3).

const SHOP_ITEMS = [
  // Colors
  { id: 'color-sunny', slot: 'color', name: 'Sunny', price: 0, value: '#ffd84a' },
  // set: hand-drawn skin in assets/sprite/bubblegum/ (the id stays color-pink so saves that
  // already own it keep it).
  { id: 'color-pink', slot: 'color', name: 'Bubblegum', price: 25, value: '#ff8fc7', set: 'bubblegum' },
  { id: 'color-sky', slot: 'color', name: 'Sky', price: 35, value: '#7fbfff' }, // assets/sprite/sky/
  // Only colors with a hand-drawn skin are sold. (Mint, Peach, Aqua, Coral, Lilac and Moonbeam
  // were removed; stateSchema.js migrate() drops them from old saves and puts anyone wearing
  // one back in Sunny.)

  // Accessories (place: head | feet | neck | leftHand | rightHand | companion | trail;
  // left/right = HIS left/right: he faces you, so his left hand is on the screen's right)
  // category: which shop dropdown lists it (head | hand | shoes | buddies | trails; the list and
  // its order live in src/renderer/shop/shop.js). Only for the shop's grouping: `place` is where
  // he actually wears it.
  // "None" has no category, so the shop doesn't list it (each item has "Take off" instead). It
  // stays because old saves own it; equipping it takes every accessory off.
  { id: 'accessory-none', slot: 'accessory', name: 'None', price: 0, value: 'none' },
  { id: 'accessory-tophat', slot: 'accessory', name: 'Top Hat', price: 70, value: 'tophat', place: 'head', category: 'head' },
  { id: 'accessory-propeller', slot: 'accessory', name: 'Toy Hat', price: 60, value: 'propeller', place: 'head', category: 'head' },
  { id: 'accessory-bow', slot: 'accessory', name: 'Bow', price: 50, value: 'bow', place: 'head', category: 'head' },
  { id: 'accessory-halo', slot: 'accessory', name: 'Halo', price: 100, value: 'halo', place: 'head', category: 'head' },
  { id: 'accessory-tie', slot: 'accessory', name: 'Tie', price: 50, value: 'tie', place: 'neck', category: 'hand' },
  { id: 'accessory-lollipop', slot: 'accessory', name: 'Lollipop', price: 40, value: 'lollipop', place: 'leftHand', category: 'hand' },
  { id: 'accessory-balloon', slot: 'accessory', name: 'Balloon', price: 80, value: 'balloon', place: 'rightHand', category: 'hand' },
  { id: 'accessory-startail', slot: 'accessory', name: 'Star Tail', price: 90, value: 'startail', place: 'trail', category: 'hand' },
  { id: 'accessory-sneakers', slot: 'accessory', name: 'Shoes', price: 60, value: 'sneakers', place: 'feet', category: 'shoes' },
  { id: 'accessory-boots', slot: 'accessory', name: 'Boots', price: 60, value: 'boots', place: 'feet', category: 'shoes' },
  { id: 'accessory-ufo', slot: 'accessory', name: 'UFO', price: 120, value: 'ufo', place: 'companion', category: 'buddies' },
  // Trails: no art files. They're copies of Starby's own frames, tinted by code (renderer/pet/
  // behaviors/trail.js), so no entry in accessories.js and no row icon in the shop (no stand-in drawn).
  { id: 'accessory-rainbowtrail', slot: 'accessory', name: 'Rainbow Blur', price: 100, value: 'rainbowtrail', place: 'trail', category: 'trails' },
  { id: 'accessory-neontrail', slot: 'accessory', name: 'Sandevistan', price: 90, value: 'neontrail', place: 'trail', category: 'trails' },
  { id: 'accessory-blurtrail', slot: 'accessory', name: 'Motion Blur', price: 80, value: 'blurtrail', place: 'trail', category: 'trails' },
  // The ribbon is drawn by code (renderer/pet/behaviors/ribbon.js; a team-approved exception to
  // the art rule), not copies of Starby.
  { id: 'accessory-ribbontrail', slot: 'accessory', name: 'Rainbow Ribbon', price: 110, value: 'ribbontrail', place: 'trail', category: 'trails' },
  // Pride flag ribbons: same ribbon, each flag's stripes (RIBBONS in ribbon.js).
  { id: 'accessory-lesbianribbon', slot: 'accessory', name: 'Lesbian Ribbon', price: 110, value: 'lesbianribbon', place: 'trail', category: 'trails' },
  { id: 'accessory-mlmribbon', slot: 'accessory', name: 'MLM Ribbon', price: 110, value: 'mlmribbon', place: 'trail', category: 'trails' },
  { id: 'accessory-biribbon', slot: 'accessory', name: 'Bi Ribbon', price: 110, value: 'biribbon', place: 'trail', category: 'trails' },
  { id: 'accessory-transribbon', slot: 'accessory', name: 'Trans Ribbon', price: 110, value: 'transribbon', place: 'trail', category: 'trails' },
];

function getItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

/** Two accessories can't be worn together if they're in the same shop category. */
function accessoriesConflict(idA, idB) {
  const a = getItem(idA);
  const b = getItem(idB);
  return Boolean(a && b && a.category && a.category === b.category && a.id !== b.id);
}

module.exports = { SHOP_ITEMS, getItem, accessoriesConflict };
