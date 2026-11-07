// Turns the "Fling power" slider (0–100) into throw/bounce physics numbers.
// Shared by the pet (behaviors/drag.js) and the settings window (to describe the slider).
//
// 50 = default: lively throws that usually reach a wall and bounce back.
// Lower = gentle throws that die quickly against walls.
// Higher = faster throws, slipperier glide and bouncier walls; at 100 a good throw
// ricochets side to side across the whole screen many times.

const lerp = (a, b, t) => a + (b - a) * t;

export const DEFAULT_FLING_POWER = 50;

export function flingTuning(power = DEFAULT_FLING_POWER) {
  const p = Math.max(0, Math.min(100, Number(power) || 0)) / 100;
  // Piecewise: 0 → low, 0.5 → mid (default), 1 → high.
  const seg = (low, mid, high) => (p < 0.5 ? lerp(low, mid, p / 0.5) : lerp(mid, high, (p - 0.5) / 0.5));
  return {
    speedMul: seg(0.6, 1.4, 3.5), // multiplies the speed you throw it at
    maxSpeed: seg(1800, 3800, 10000), // px/s cap on a throw
    bounce: seg(0.3, 0.75, 0.97), // fraction of speed kept when hitting a wall
    friction: seg(3.0, 1.6, 0.35), // per second; lower = glides further
  };
}
