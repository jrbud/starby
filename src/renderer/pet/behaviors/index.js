// Behavior registry. Each behavior is a small module:
//
//   export default {
//     name: 'my-behavior',
//     init(ctx) {},          // once at startup: add listeners, timers, scheduled events
//     onTick(ctx, tick) {},  // optional, 10x per second: decisions ("start walking", "jump now")
//     update(ctx, dt) {},    // optional, every frame: smooth motion/visuals; dt in seconds
//   };
//
// Use onTick for decisions and random rolls, update for anything that moves on screen.
//
// `ctx` is defined in ../pet.js:
//   { api, pet, petEl, stage, cursor, catalog, groundY(), stageWidth(),
//     say(text, ms), isSpeaking(), setPinned(bool),
//     clock,                         // clock.tick, clock.seconds since app opened
//     after(sec, fn, label), every(sec, fn, label), cancel(id),   // timed events
//     log(type, data), events }      // session event log (see ../core/eventLog.js)
// Behaviors coordinate through `ctx.pet.mode` ('idle' | 'walk' | 'follow' | 'flee' | 'drag' | 'toss').
// Only change the mode for states you own, and respect 'drag' (the user is holding the pet).
//
// Order matters a little: within a tick and within a frame, behaviors run in this order.
import idle from './idle.js';
import walk from './walk.js';
import drag from './drag.js';
import cursorReact from './cursorReact.js';
import speech from './speech.js';
import starbits from './starbits.js';
import systemReactions from './systemReactions.js';
import sessionEvents from './sessionEvents.js';
import shopOpener from './shopOpener.js';

export const BEHAVIORS = [idle, walk, drag, cursorReact, speech, starbits, systemReactions, sessionEvents, shopOpener];
