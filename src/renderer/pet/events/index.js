// EVENTS: scripted sequences that take over the star for a while, at high priority.
//
// Behaviors (../behaviors/) are always-on habits that each run every tick/frame. An event is
// different: it starts, takes control of the star (usually by setting its own pet.mode, so
// behaviors stand down — they only act on modes they know), plays out, then hands control back.
// Only one event runs at a time. pet.js runs the active event AFTER the behaviors every tick
// and frame, so the event gets the final say.
//
// An event module:
//
//   export default {
//     name: 'tag',
//     priority: 10,                      // a higher-priority event may interrupt a lower one
//     canStart(ctx, reason) {},          // optional: false = not now
//     auto: { every, chance, cooldown }, // optional: roll `chance` every `every` seconds, at most
//                                        //   once per `cooldown` seconds (canStart still applies)
//     init(ctx) {},                      // optional, once before the first tick (listeners, UI)
//     watch(ctx) {},                     // optional, every tick even when NOT running (e.g. to
//                                        //   notice things canStart needs)
//     watchFrame(ctx, dt) {},            // optional, every frame even when NOT running (e.g. to
//                                        //   keep a button next to the moving star)
//     start(ctx, end, reason) {},        // take over; call end(result) when finished. reason:
//                                        //   'menu' | 'random' | 'devtools' | whatever the caller passed
//     onTick(ctx, tick) {},              // 10x per second: decisions (on the session clock)
//     update(ctx, dt) {},                // every frame: smooth motion/visuals
//     stop(ctx, result) {},              // clean up and hand the star back (always called once)
//   };
//
// Start one from code with ctx.startEvent('tag'), from DevTools with starby.startEvent('tag'),
// or from the right-click menu (see src/main/ipc.js). Logged as 'event-start' / 'event-end'.
import intro from './intro.js';
import tag from './tag.js';
import pong from './pong.js';
import invite from './invite.js';
import starShower from './starShower.js';
import shootingStar from './shootingStar.js';
import hideSeek from './hideSeek.js';
import shop from './shop.js';
import dance from './dance.js';
import { gamesMenu } from './games.js';
import { happenings } from './happenings.js';

// invite = Starby asking you to play one of the games (picks from GAMES in games.js).
// star-shower, shooting-star = happenings, started by the happenings timer (happenings.js).
// hide-seek = a game (buttons) and a happening (he hides on his own); never in invites.
// shop = parks him in the shop window's display box while it's open (shop.js).
// intro = the launch animation (title slam, Starby flies in, greeting); starts itself at launch.
// dance = dances in bursts while a song plays in Spotify (dance.js); lowest priority.
export const EVENTS = [intro, tag, pong, invite, starShower, shootingStar, hideSeek, shop, dance];

// Helpers: not events (they never start or take over), but they get the same init / watch /
// watchFrame hooks. gamesMenu = the "Play a game?" buttons + the rest between games (games.js);
// happenings = the 20–50 minute timer that starts a random happening (happenings.js).
const HELPERS = [gamesMenu, happenings];
const WITH_HOOKS = [...EVENTS, ...HELPERS];

export function createEventRunner(ctx) {
  let active = null; // { event, startedAt }
  let initialized = false;
  const lastEnded = {}; // name → session seconds
  const nextRoll = {}; // name → session seconds of the next auto-start roll

  function finish(result) {
    if (!active) return;
    const { event, startedAt } = active;
    active = null;
    lastEnded[event.name] = ctx.clock.seconds;
    event.stop?.(ctx, result);
    ctx.log('event-end', { name: event.name, result, seconds: Math.round((ctx.clock.seconds - startedAt) * 10) / 10 });
  }

  function start(name, reason = 'manual') {
    const event = EVENTS.find((e) => e.name === name);
    if (!event) return false;
    if (active) {
      if ((active.event.priority || 0) >= (event.priority || 0)) return false;
      finish('interrupted');
    }
    if (event.canStart && !event.canStart(ctx, reason)) return false;
    active = { event, startedAt: ctx.clock.seconds };
    ctx.log('event-start', { name, reason });
    const mine = active;
    // `end` only works for this run, so a stale callback can't end a later event.
    event.start(ctx, (result) => { if (active === mine) finish(result); }, reason);
    return true;
  }

  function autoRoll() {
    const now = ctx.clock.seconds;
    for (const event of EVENTS) {
      const { auto } = event;
      if (!auto) continue;
      if (nextRoll[event.name] === undefined) nextRoll[event.name] = now + auto.every;
      if (now < nextRoll[event.name]) continue;
      nextRoll[event.name] = now + auto.every;
      const sinceLast = now - (lastEnded[event.name] ?? -Infinity);
      if (sinceLast >= auto.cooldown && Math.random() < auto.chance) start(event.name, 'random');
      if (active) return;
    }
  }

  // Events set up on the first tick, so pet.js doesn't need an extra init call.
  function initOnce() {
    if (initialized) return;
    initialized = true;
    for (const m of WITH_HOOKS) m.init?.(ctx);
  }

  return {
    start,
    stop: (result = 'stopped') => finish(result),
    active: () => (active ? active.event.name : null),
    onTick(tick) {
      initOnce();
      for (const m of WITH_HOOKS) m.watch?.(ctx);
      if (active) active.event.onTick?.(ctx, tick);
      else autoRoll();
    },
    update(dt) {
      if (!initialized) return;
      for (const m of WITH_HOOKS) m.watchFrame?.(ctx, dt);
      if (active) active.event.update?.(ctx, dt);
    },
  };
}
