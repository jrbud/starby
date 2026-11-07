// Shop items. Purely cosmetic: no item changes behavior (drop rate, speed, etc.).
// PLACEHOLDER ASSETS ONLY: every item is a flat color or a primitive shape id that
// renderer/shared/sprite.js knows how to draw. No art files.
//
// slot:  which part of the sprite it changes ('color' | 'shape' | 'accessory')
// value: what the renderer uses (a hex color, or a shape/accessory id)

const SHOP_ITEMS = [
  // Colors
  { id: 'color-sunny', slot: 'color', name: 'Sunny', price: 0, value: '#ffd84a' },
  { id: 'color-pink', slot: 'color', name: 'Bubblegum', price: 5, value: '#ff8fc7' },
  { id: 'color-mint', slot: 'color', name: 'Mint', price: 5, value: '#7be0b5' },
  { id: 'color-sky', slot: 'color', name: 'Sky', price: 8, value: '#7fbfff' },
  { id: 'color-lilac', slot: 'color', name: 'Lilac', price: 10, value: '#c6a2ff' },

  // Shapes
  { id: 'shape-star4', slot: 'shape', name: 'Twinkle', price: 0, value: 'star4' },
  { id: 'shape-star5', slot: 'shape', name: 'Star', price: 10, value: 'star5' },
  { id: 'shape-diamond', slot: 'shape', name: 'Diamond', price: 12, value: 'diamond' },
  { id: 'shape-plus', slot: 'shape', name: 'Plus', price: 12, value: 'plus' },

  // Accessories
  { id: 'accessory-none', slot: 'accessory', name: 'None', price: 0, value: 'none' },
  { id: 'accessory-tophat', slot: 'accessory', name: 'Top hat', price: 15, value: 'tophat' },
  { id: 'accessory-bow', slot: 'accessory', name: 'Bow', price: 15, value: 'bow' },
  { id: 'accessory-halo', slot: 'accessory', name: 'Halo', price: 20, value: 'halo' },
];

function getItem(id) {
  return SHOP_ITEMS.find((item) => item.id === id) || null;
}

module.exports = { SHOP_ITEMS, getItem };
