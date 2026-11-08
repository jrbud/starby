// SKY EVENTS — the sky-event category: things that fall out of the sky now and then (star shower,
// shooting star). Not games, not dancing, not something you ask for. High priority (14).
//
// One shared timer on the session clock: the next sky event is due a random GAP (10–15 minutes)
// after the last one started. When it's due, one is picked at random from HAPPENINGS (by weight)
// and started with ctx.startEvent(name, 'happening').
//   A dance running? The sky event interrupts it. A game, an invite, the shop, hush or the intro
//   running, or you away from the mouse for USER_AWAY seconds? It waits RETRY seconds and tries
//   again, rather than skipping.
//
// The other categories have their own timers: games → ./games.js, dance → ./dance.js (music).
//
// TO ADD A SKY EVENT: write its event (see ./starShower.js; category: 'sky', priority: 14),
// register it in ./index.js, and add it to HAPPENINGS below with a weight (higher = more often).
//
// Not an event itself: ./index.js runs it as a helper (init / watch hooks).
// DevTools: starby.happening() (random one now), starby.happening('star-shower'),
//           starby.nextHappening() → seconds until the next one.

export const HAPPENINGS = [
  { name: 'star-shower', weight: 1 },
  { name: 'shooting-star', weight: 1 }, // a clump of starbits shoots across the screen
];
// Running events a due sky event may interrupt (lower-priority categories).
const INTERRUPTS = ['dance'];

const GAP = [10 * 60, 15 * 60]; // seconds between sky events (10–15 minutes)
const RETRY = 60; // seconds to wait when it's not a good moment
const USER_AWAY = 120; // seconds without cursor movement = nobody's watching, so wait

const rand = (a, b) => a + Math.random() * (b - a);

let timer = null;
let dueAt = null; // session seconds
let lastCursor = { x: -9999, y: -9999 };
let cursorMovedAt = -Infinity;

function pick() {
  const total = HAPPENINGS.reduce((sum, h) => sum + (h.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const h of HAPPENINGS) {
    r -= h.weight ?? 1;
    if (r <= 0) return h;
  }
  return HAPPENINGS[HAPPENINGS.length - 1];
}

function scheduleIn(ctx, seconds) {
  ctx.cancel(timer);
  dueAt = ctx.clock.seconds + seconds;
  timer = ctx.after(seconds, () => fire(ctx), 'happenings: next');
}

function fire(ctx) {
  timer = null;
  if (!HAPPENINGS.length) return;
  const away = ctx.clock.seconds - cursorMovedAt > USER_AWAY;
  const active = ctx.activeEvent();
  if (away || (active && !INTERRUPTS.includes(active))) {
    scheduleIn(ctx, RETRY);
    return;
  }
  const h = pick();
  if (ctx.startEvent(h.name, 'happening')) {
    ctx.log('happening', { name: h.name });
    scheduleIn(ctx, rand(...GAP)); // next one, counted from this one's start
  } else {
    scheduleIn(ctx, RETRY);
  }
}

export const happenings = {
  name: 'happenings',

  init(ctx) {
    scheduleIn(ctx, rand(...GAP));
    if (typeof window !== 'undefined' && window.starby) {
      window.starby.happening = (name) => {
        const h = name ? HAPPENINGS.find((x) => x.name === name) : pick();
        if (!h) return `unknown happening; try: ${HAPPENINGS.map((x) => x.name).join(', ')}`;
        if (ctx.activeEvent()) ctx.stopEvent('dev'); // a dev trigger always works: end whatever's running
        return ctx.startEvent(h.name, 'devtools');
      };
      window.starby.nextHappening = () => (dueAt === null ? null : Math.max(0, Math.round(dueAt - ctx.clock.seconds)));
    }
  },

  // Every tick: notice whether you're around.
  watch(ctx) {
    const { cursor } = ctx;
    if (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y) {
      lastCursor = { x: cursor.x, y: cursor.y };
      cursorMovedAt = ctx.clock.seconds;
    }
  },
};
