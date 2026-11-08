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
//     category: 'games',                 // which category it belongs to (see CATEGORIES below)
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
// from the right-click dialogue (../dialogue/), or the tray icon's menu (src/main/tray.js). Logged as 'event-start' / 'event-end'.
//
// CATEGORIES — each has its own way of starting, so they don't share a timer:
//   category  events                              starts from                         priority
//   sky       star-shower, shooting-star          sky timer, 10–15 min (happenings.js)  14
//   games     tag, pong, hide-seek, catch,        dialogue / tray menu / games timer   10 (invite 5)
//             constellation, starby-says, hoop-shot, invite
//             (games.js: every 30s, 30%, 2 min cooldown; hide-seek starts silently;
//             4 min with no game → he asks no matter what)
//   copycat   copycat                             its own timer, every 3 min (copycat.js)    3
//   dance     dance                               music playing, 1 min cooldown (dance.js)  2
//   system    intro (100), shop (20), focus (16), launch / the shop window / the dialogue's
//             hush (15)                           "I gotta focus" / a call or fullscreen app
// A sky event interrupts a dance; the sky timer waits for games, invites, the shop, hush and the intro.
import intro from './intro.js';
import tag from './tag.js';
import pong from './pong.js';
import invite from './invite.js';
import starShower from './starShower.js';
import shootingStar from './shootingStar.js';
import hideSeek from './hideSeek.js';
import catchGame from './catchGame.js';
import shop from './shop.js';
import dance from './dance.js';
import hush from './hush.js';
import constellation from './constellation.js';
import copycat from './copycat.js';
import starbySays from './starbySays.js';
import hoopShot from './hoopShot.js';
import focus from './focus.js';
import { gamesMenu } from './games.js';
import { happenings } from './happenings.js';
import { dialogue } from '../dialogue/dialogue.js';
import { howTo } from '../howTo.js';

// invite = Starby asking you to play one of the games (the games timer in games.js starts it).
// star-shower, shooting-star = sky events, started by the sky timer (happenings.js).
// hide-seek = a game; the games timer starts it silently (he hides on his own); never in invites.
// shop = parks him in the shop window's display box while it's open (shop.js).
// intro = the launch animation (title slam, Starby flies in, greeting); starts itself at launch.
// catch = a game: he throws himself across the screen, catch him in the box (catchGame.js).
// dance = its own category: dances while a song plays in Spotify, 1 min apart (dance.js).
// hush = quiet and still during video calls / fullscreen apps (hush.js); above the games.
// constellation = a game: he draws a constellation out of starbits, you guess it (constellation.js).
// copycat = its own category: every 3 min he copies your cursor's movement for 30s (copycat.js).
// starby-says = a game: do what he says only if he says "starby says" first, 15s (starbySays.js).
// hoop-shot = a game: right-drag slingshot him into a hoop, with gravity, 15s (hoopShot.js).
// focus = "Sorry, I gotta focus": parked bottom-left, silent, until you click/grab him (focus.js).
export const EVENTS = [intro, tag, pong, invite, starShower, shootingStar, hideSeek, catchGame, shop, dance, hush, constellation, copycat, starbySays, hoopShot, focus];

// Helpers: not events (they never start or take over), but they get the same init / watch /
// watchFrame hooks. gamesMenu = the rest between games, requestGame and the games timer (games.js);
// dialogue = the right-click dialogue box (../dialogue/dialogue.js); happenings = the 10–15 minute sky timer that starts a sky event (happenings.js).
// howTo = the "How To Care for Your New Starby" popup after the launch intro (../howTo.js).
const HELPERS = [gamesMenu, happenings, dialogue, howTo];
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
