// Draws the sprite with plain canvas primitives. Used by the pet window and shop previews.
//
// PLACEHOLDER-ASSET RULE: flat fills only. No gradients, shading, glow, textures or
// image files. A flat shape + two dot eyes is the whole character. Keep it that way.

const EYE_COLOR = '#2b2b3a';

function starPath(c, cx, cy, points, outer, inner) {
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

// Shape ids must match `value` of shape items in src/shared/shopCatalog.js.
const SHAPES = {
  star4: (c, cx, cy, r) => starPath(c, cx, cy, 4, r, r * 0.38),
  star5: (c, cx, cy, r) => starPath(c, cx, cy, 5, r, r * 0.45),
  diamond: (c, cx, cy, r) => {
    c.moveTo(cx, cy - r);
    c.lineTo(cx + r * 0.7, cy);
    c.lineTo(cx, cy + r);
    c.lineTo(cx - r * 0.7, cy);
    c.closePath();
  },
  plus: (c, cx, cy, r) => {
    const t = r * 0.4; // half arm thickness
    const pts = [
      [-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t],
      [t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t],
    ];
    pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(cx + x, cy + y) : c.lineTo(cx + x, cy + y)));
    c.closePath();
  },
};

// Accessory ids must match `value` of accessory items in src/shared/shopCatalog.js.
const ACCESSORIES = {
  none: () => {},
  tophat: (c, cx, cy, r) => {
    c.fillStyle = EYE_COLOR;
    c.fillRect(cx - r * 0.45, cy - r - 2, r * 0.9, r * 0.12); // brim
    c.fillRect(cx - r * 0.28, cy - r - 2 - r * 0.5, r * 0.56, r * 0.5); // crown
  },
  bow: (c, cx, cy, r) => {
    const bx = cx + r * 0.4;
    const by = cy - r * 0.55;
    const s = r * 0.25;
    c.fillStyle = '#e0457b';
    c.beginPath();
    c.moveTo(bx, by); c.lineTo(bx - s, by - s * 0.7); c.lineTo(bx - s, by + s * 0.7); c.closePath();
    c.moveTo(bx, by); c.lineTo(bx + s, by - s * 0.7); c.lineTo(bx + s, by + s * 0.7); c.closePath();
    c.fill();
  },
  halo: (c, cx, cy, r) => {
    c.strokeStyle = '#d9c25a';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(cx, cy - r - 4, r * 0.45, r * 0.13, 0, 0, Math.PI * 2);
    c.stroke();
  },
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ color: string, shape: string, accessory: string, lookX?: number, blink?: boolean }} look
 *   lookX: -1..1, shifts the eyes left/right (cursor awareness). blink: draw closed eyes.
 */
export function drawSprite(canvas, { color, shape, accessory, lookX = 0, blink = false }) {
  const c = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  c.clearRect(0, 0, w, h);

  // Body sits a bit low so accessories have room above it.
  const cx = w / 2;
  const cy = h * 0.58;
  const r = w * 0.34;

  c.fillStyle = color;
  c.beginPath();
  (SHAPES[shape] || SHAPES.star4)(c, cx, cy, r);
  c.fill();

  // Eyes: two dots (or two short lines when blinking).
  c.fillStyle = EYE_COLOR;
  const ex = r * 0.28;
  const ey = cy - r * 0.05;
  const er = Math.max(1.5, r * 0.09);
  for (const side of [-1, 1]) {
    const x = cx + side * ex + lookX * r * 0.1;
    if (blink) {
      c.fillRect(x - er, ey - 0.75, er * 2, 1.5);
    } else {
      c.beginPath();
      c.arc(x, ey, er, 0, Math.PI * 2);
      c.fill();
    }
  }

  (ACCESSORIES[accessory] || ACCESSORIES.none)(c, cx, cy, r);
}
