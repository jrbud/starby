// Shop items. Purely cosmetic: no item changes behavior (drop rate, speed, etc.).
//
// slot:  which part of the sprite it changes ('color' | 'accessory')
// value: what the renderer uses (a hex color, or an accessory id)
//
// The star has ONE shape. There is no shape slot. Don't add shape items.
//
// ART RULE (claude.md): colors are just a fill value, so new colors can be added here freely.
// New accessories need hand-drawn PNG art from the team. Don't add a draw function in
// renderer/shared/sprite.js as a stand-in. The accessories below are the original
// skeleton ones; new ones wait for art.
//
// BALANCE: starbits.js drops one every 8–15s (~11.5s average), so a player who collects most
// drops earns ~5 per minute. Cheapest items cost 25 (~5 min of play, the first purchase).
// Rough tiers: colors 25–60, accessories 50–100.
// Buying everything costs 515 (~1.7 hours). For demos use the shop's demo shortcut (P4-3).

const SHOP_ITEMS = [
  // Colors
  { id: 'color-sunny', slot: 'color', name: 'Sunny', price: 0, value: '#ffd84a' },
  { id: 'color-pink', slot: 'color', name: 'Bubblegum', price: 25, value: '#ff8fc7' },
  { id: 'color-mint', slot: 'color', name: 'Mint', price: 25, value: '#7be0b5' },
  { id: 'color-peach', slot: 'color', name: 'Peach', price: 30, value: '#ffb48a' },
  { id: 'color-sky', slot: 'color', name: 'Sky', price: 35, value: '#7fbfff' },
  { id: 'color-aqua', slot: 'color', name: 'Aqua', price: 35, value: '#5fd8e0' },
  { id: 'color-coral', slot: 'color', name: 'Coral', price: 40, value: '#ff7f7a' },
  { id: 'color-lilac', slot: 'color', name: 'Lilac', price: 45, value: '#c6a2ff' },
  { id: 'color-moonbeam', slot: 'color', name: 'Moonbeam', price: 60, value: '#f4f1de' },

  // Accessories
  { id: 'accessory-none', slot: 'accessory', name: 'None', price: 0, value: 'none' },
  { id: 'accessory-bow', slot: 'accessory', name: 'Bow', price: 50, value: 'bow' },
  { id: 'accessory-tophat', slot: 'accessory', name: 'Top hat', price: 70, value: 'tophat' },
  { id: 'accessory-halo', slot: 'accessory', name: 'Halo', price: 100, value: 'halo' },
];

function getItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

module.exports = { SHOP_ITEMS, getItem };
