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
// Behaviors coordinate through `ctx.pet.mode` ('idle' | 'walk' | 'follow' | 'flee' | 'drag' | 'toss' | 'tag').
// 'tag' (and any other mode a behavior doesn't know) belongs to a scripted event (../events/): stand down.
// Only change the mode for states you own, and respect 'drag' (the user is holding the pet).
// Emotions live in `ctx.pet.mood` (mood.js); read their rules with rulesFor() from ./moods.js.
//
// Order matters a little: within a tick and within a frame, behaviors run in this order.
import idle from './idle.js';
import walk from './walk.js';
import drag from './drag.js';
import cursorReact from './cursorReact.js';
import mood from './mood.js';
import moodLabel from './moodLabel.js'; // DEBUG label under the star; remove before the demo
import speech from './speech.js';
import starbits from './starbits.js';
import systemReactions from './systemReactions.js';
import sessionEvents from './sessionEvents.js';
// (No double-click → shop: the shop opens only from the right-click menu, src/main/ipc.js.)
import wallImpact from './wallImpact.js'; // crash lines + dust + star clouds when he hits a wall

export const BEHAVIORS = [idle, walk, drag, cursorReact, mood, moodLabel, speech, starbits, systemReactions, sessionEvents, wallImpact];
