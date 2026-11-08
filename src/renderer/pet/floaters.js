// Floating accessories: they follow Starby instead of being stuck to him.
//   balloon    floats a little above him on a string tied to HIS right hand (screen left),
//              drifting behind whichever way he moves, bobbing, string goes taut/slack
//   ufo        flies lazy loops near him (above/beside), always BEHIND him, never over his face
//   startail   the sparkle trail streams out behind whichever way he's moving (kept pointing the
//              way he last moved when he stops)
//
// Each one is its own little canvas in the stage, inserted BEFORE #pet so it's always drawn
// behind him, and not a `.hit` element (pointer-events: none), so it never blocks clicks.
// They don't spin/squash with him (that's what worn accessories do); they lag behind with a
// spring, which is what makes them feel like they're floating.
//
// THE STRING: a thin line in Starby's outline brown, drawn by code. That's an explicit team
// decision (supplementary lines are OK; character/accessory art is still hand-drawn only).
import { ACCESSORIES } from './accessories.js';

const ART = 2048;
const STRING_COLOR = '#3a2219'; // matches the dark brown outline in the art
const SVG_NS = 'http://www.w3.org/2000/svg';

// Tuning (sizes are in units of Starby's size, so they scale with him)
const BALLOON = { up: 0.72, out: 0.18, drift: 0.75, string: 0.95, k: 12, c: 4.5 };
// lead/maxLead: it aims a little behind the way he's going (0.15s of his motion, at most 0.8 sizes).
// leash: on a fast throw it can't fall more than this far behind; it's towed along instead.
const UFO = { radius: 1.0, height: 0.85, wobble: 0.12, speed: 0.6, k: 8, c: 5, tilt: 14, lead: 0.15, maxLead: 0.8, leash: 2.5 };
const TRAIL = { back: 0.26, down: 0, minSpeed: 50, turn: 8, idleAlpha: 0.9 };
const SNAP = 5; // if HE moves this many star-sizes in a single frame (moved in one jump: a reset,
// a game starting), floaters snap to him instead of flying across the screen. Judged by his own
// jump, not by how far behind a floater is: a fast throw leaves the UFO far behind without any
// jump, and snapping then made it teleport.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} o
 * @param {HTMLElement} o.stage   where to put the elements (inserted before o.petEl)
 * @param {HTMLElement} o.petEl
 * @param {object} o.art          createAccessoryArt(...) instance
 * @param {() => number} o.size   Starby's size in css px
 * @param {(name: string) => ({x:number,y:number}|null)} o.anchor  a body point on screen (e.g. 'lhand')
 * @param {() => ({x:number,y:number})} o.center  his middle on screen
 */
export function createFloaters({ stage, petEl, art, size, anchor, center }) {
  const active = new Map(); // value → state
  const motion = { last: null, vx: 0, vy: 0 }; // his smoothed velocity (px/s)
  let jumped = false; // he moved SNAP+ star-sizes this frame (teleported)

  function makeCanvas(def) {
    const s = size() / ART * def.scale; // css px per art px
    const [, , cw, ch] = def.crop;
    const el = document.createElement('canvas');
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    el.width = Math.ceil(cw * s * dpr);
    el.height = Math.ceil(ch * s * dpr);
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', width: `${cw * s}px`, height: `${ch * s}px`,
      pointerEvents: 'none', willChange: 'transform, opacity',
    });
    el.className = 'floater';
    stage.insertBefore(el, petEl); // behind him
    return { el, s, drawn: false };
  }

  // Draw the cropped art once it's loaded (retried every frame until then).
  function paint(state, def) {
    if (state.c.drawn) return;
    const img = art.get(def.file);
    if (!img) return;
    const k = img.width / ART;
    const [x, y, w, h] = def.crop;
    const g = state.c.el.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, x * k, y * k, w * k, h * k, 0, 0, state.c.el.width, state.c.el.height);
    state.c.drawn = true;
  }

  function add(value) {
    const def = ACCESSORIES[value];
    if (!def || !['float', 'companion', 'trail'].includes(def.kind)) return;
    const state = { def, c: makeCanvas(def), p: null, v: { x: 0, y: 0 }, theta: Math.random() * 6, rot: 0, alpha: 1 };
    if (def.kind === 'float') {
      const svg = document.createElementNS(SVG_NS, 'svg');
      Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' });
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', STRING_COLOR);
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-linecap', 'round');
      svg.append(path);
      stage.insertBefore(svg, state.c.el); // string behind the balloon (and behind him)
      state.svg = svg;
      state.path = path;
    }
    if (def.kind === 'trail') state.dir = { x: 1, y: 0 }; // trail starts out to his left
    active.set(value, state);
  }

  function remove(value) {
    const st = active.get(value);
    if (!st) return;
    st.c.el.remove();
    st.svg?.remove();
    active.delete(value);
  }

  // Spring toward a target: a = k·(target − p) − c·v
  // leash (px, optional): never more than this far from the target; towed along at that distance.
  function spring(st, tx, ty, k, c, dt, leash = Infinity) {
    if (!st.p || jumped) {
      st.p = { x: tx, y: ty };
      st.v = { x: 0, y: 0 };
    }
    st.v.x += (k * (tx - st.p.x) - c * st.v.x) * dt;
    st.v.y += (k * (ty - st.p.y) - c * st.v.y) * dt;
    st.p.x += st.v.x * dt;
    st.p.y += st.v.y * dt;
    const dx = st.p.x - tx;
    const dy = st.p.y - ty;
    const d = Math.hypot(dx, dy);
    if (d > leash) {
      st.p.x = tx + (dx / d) * leash;
      st.p.y = ty + (dy / d) * leash;
      // Drop the speed that points away from the target, so it doesn't fight the leash.
      const away = (st.v.x * dx + st.v.y * dy) / d;
      if (away > 0) { st.v.x -= (away * dx) / d; st.v.y -= (away * dy) / d; }
    }
  }

  function updateBalloon(st, dt, t, S, mid) {
    const { def } = st;
    const hand = anchor(def.hand) || anchor(def.fallbackHand) || mid;
    const drift = -clamp(motion.vx / 250, -1, 1); // drifts behind the way he's moving
    const tx = hand.x + (-BALLOON.out + drift * BALLOON.drift) * S;
    const ty = hand.y - BALLOON.up * S + Math.sin(t * 1.4) * 0.05 * S;
    spring(st, tx, ty, BALLOON.k, BALLOON.c, dt);
    // The string can't stretch: past its length, pull the balloon back and drop outward speed.
    const L = BALLOON.string * S;
    let dx = st.p.x - hand.x;
    let dy = st.p.y - hand.y;
    let d = Math.hypot(dx, dy) || 1;
    if (d > L) {
      st.p.x = hand.x + (dx / d) * L;
      st.p.y = hand.y + (dy / d) * L;
      const out = (st.v.x * dx + st.v.y * dy) / d;
      if (out > 0) { st.v.x -= (out * dx) / d; st.v.y -= (out * dy) / d; }
      dx = st.p.x - hand.x; dy = st.p.y - hand.y; d = L;
    }
    // Lean along the string; knot (bottom of the balloon) sits on the string's end.
    const lean = Math.atan2(dx, -dy) * 0.6;
    const [cx, cy] = def.crop;
    const kx = (def.knot[0] - cx) * st.c.s;
    const ky = (def.knot[1] - cy) * st.c.s;
    st.c.el.style.transformOrigin = `${kx}px ${ky}px`;
    st.c.el.style.transform = `translate(${st.p.x - kx}px, ${st.p.y - ky}px) rotate(${lean}rad)`;
    // String: hand → knot, sagging when slack.
    const slack = Math.max(0, L - d);
    const mx = (hand.x + st.p.x) / 2;
    const my = (hand.y + st.p.y) / 2 + slack * 0.6;
    st.path.setAttribute('d', `M ${hand.x.toFixed(1)} ${hand.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${st.p.x.toFixed(1)} ${st.p.y.toFixed(1)}`);
  }

  function updateUfo(st, dt, t, S, mid) {
    st.theta += dt * UFO.speed;
    const lead = clamp(motion.vx * UFO.lead, -UFO.maxLead * S, UFO.maxLead * S);
    const tx = mid.x + Math.sin(st.theta) * UFO.radius * S - lead;
    const ty = mid.y - UFO.height * S + Math.sin(st.theta * 2.1) * UFO.wobble * S;
    spring(st, tx, ty, UFO.k, UFO.c, dt, UFO.leash * S);
    const w = st.c.el.offsetWidth || 1;
    const h = st.c.el.offsetHeight || 1;
    const tilt = clamp(st.v.x / 400, -1, 1) * UFO.tilt;
    st.c.el.style.transformOrigin = '50% 50%';
    st.c.el.style.transform = `translate(${st.p.x - w / 2}px, ${st.p.y - h / 2 + Math.sin(t * 2.3) * 2}px) rotate(${tilt}deg)`;
  }

  function updateTrail(st, dt, t, S, mid) {
    const { def } = st;
    const speed = Math.hypot(motion.vx, motion.vy);
    if (speed > TRAIL.minSpeed) {
      // Ease toward the way he's moving.
      const a = Math.min(1, dt * TRAIL.turn);
      const nx = st.dir.x + (motion.vx / speed - st.dir.x) * a;
      const ny = st.dir.y + (motion.vy / speed - st.dir.y) * a;
      const n = Math.hypot(nx, ny) || 1;
      st.dir = { x: nx / n, y: ny / n };
    }
    st.alpha += ((speed > TRAIL.minSpeed ? 1 : TRAIL.idleAlpha) - st.alpha) * Math.min(1, dt * 4);
    // The art streams out to the LEFT of its front end. Moving left → mirror it to stream right.
    const mirrored = st.dir.x < 0;
    const back = Math.atan2(-st.dir.y, -st.dir.x); // direction the trail should point
    let rot = mirrored ? back : back - Math.PI;
    rot = Math.atan2(Math.sin(rot), Math.cos(rot)); // keep it in -π..π
    const [cx, cy] = def.crop;
    const ax = (def.attach[0] - cx) * st.c.s;
    const ay = (def.attach[1] - cy) * st.c.s;
    const px = mid.x - st.dir.x * TRAIL.back * S;
    const py = mid.y - st.dir.y * TRAIL.back * S + TRAIL.down * S;
    st.c.el.style.transformOrigin = `${ax}px ${ay}px`;
    st.c.el.style.transform = `translate(${px - ax}px, ${py - ay}px) rotate(${rot}rad) scaleX(${mirrored ? -1 : 1})`;
    st.c.el.style.opacity = st.alpha.toFixed(2);
  }

  return {
    /** Which accessory values are worn right now (e.g. ['balloon']); others are removed. */
    setActive(values) {
      const want = new Set(values.filter((v) => ['float', 'companion', 'trail'].includes(ACCESSORIES[v]?.kind)));
      for (const v of [...active.keys()]) if (!want.has(v)) remove(v);
      for (const v of want) if (!active.has(v)) add(v);
    },
    /** Every frame, after he has moved. `t` = seconds. */
    update(dt, t) {
      const mid = center();
      const S = size();
      jumped = !!motion.last && Math.hypot(mid.x - motion.last.x, mid.y - motion.last.y) > SNAP * S;
      if (jumped) {
        motion.vx = 0; // a teleport isn't speed (it would fling the trail / balloon drift)
        motion.vy = 0;
      } else if (motion.last && dt > 0) {
        const a = Math.min(1, dt * 6);
        motion.vx += ((mid.x - motion.last.x) / dt - motion.vx) * a;
        motion.vy += ((mid.y - motion.last.y) / dt - motion.vy) * a;
      }
      motion.last = mid;
      for (const st of active.values()) {
        paint(st, st.def);
        if (st.def.kind === 'float') updateBalloon(st, dt, t, S, mid);
        else if (st.def.kind === 'companion') updateUfo(st, dt, t, S, mid);
        else updateTrail(st, dt, t, S, mid);
      }
    },
  };
}
