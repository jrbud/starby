// Speech helpers for unprompted lines (Person 3). Not a behavior itself, so it is NOT
// registered in behaviors/index.js.
//
//   chat(ctx, text, ms, opts)  — say something *only when it's quiet*: waits in a short queue
//                                or gets dropped instead of talking over another line.
//   lineBag(lines)             — returns next() that cycles lines in random order and never
//                                repeats the same line twice in a row.
//
// Rule of thumb:
//   - Lines that answer the user (click, flinch, drag) → plain ctx.say(), so they're instant.
//   - Lines that come out of nowhere (idle chatter, system reactions) → chat(), so they can't
//     stack up or talk over each other.
//
// A dropped line never reaches ctx.say, so it never shows up in the event log either.
// Queue state lives in this module, so every caller shares one global rate limit.

const DEFAULT_GAP = 5; // seconds since the last line started before we talk again
const MAX_QUEUE = 2; // queued lines beyond this push the oldest one out
const PUMP_EVERY = 0.5; // seconds between "is it quiet yet?" checks while lines are waiting

const queue = []; // { text, ms, gap, expiresAt }
let pumpId = null;

function isQuiet(ctx, gap) {
  if (ctx.isSpeaking() || ctx.pet.mode === 'drag') return false;
  const last = ctx.events.last('say');
  return !last || ctx.clock.seconds - last.t >= gap;
}

function pump(ctx) {
  pumpId = null;
  const now = ctx.clock.seconds;
  while (queue.length && queue[0].expiresAt < now) queue.shift(); // too stale to say now
  if (queue.length && isQuiet(ctx, queue[0].gap)) {
    const { text, ms } = queue.shift();
    ctx.say(text, ms);
  }
  if (queue.length) pumpId = ctx.after(PUMP_EVERY, () => pump(ctx), 'chatter: queued lines');
}

/**
 * Say `text` if nothing was said in the last `gap` seconds; otherwise queue it for up to
 * `wait` seconds (0 = drop right away). Returns 'said' | 'queued' | 'dropped'.
 */
export function chat(ctx, text, ms = 3000, { gap = DEFAULT_GAP, wait = 0 } = {}) {
  if (!queue.length && isQuiet(ctx, gap)) {
    ctx.say(text, ms);
    return 'said';
  }
  if (wait <= 0 || queue.some((q) => q.text === text)) return 'dropped';
  queue.push({ text, ms, gap, expiresAt: ctx.clock.seconds + wait });
  if (queue.length > MAX_QUEUE) queue.shift();
  if (pumpId === null) pumpId = ctx.after(PUMP_EVERY, () => pump(ctx), 'chatter: queued lines');
  return 'queued';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffle-bag picker: goes through every line before reusing one, never the same twice in a row. */
export function lineBag(lines) {
  let bag = [];
  let last = null;
  return () => {
    if (lines.length < 2) return lines[0];
    if (!bag.length) {
      bag = shuffle([...lines]);
      // Lines are popped from the end; don't start the new round with the line we just said.
      if (bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop();
    return last;
  };
}

/** lineBag for each key of an object of line arrays, e.g. { morning: [...], night: [...] }. */
export function lineBags(pools) {
  return Object.fromEntries(Object.entries(pools).map(([k, lines]) => [k, lineBag(lines)]));
}
