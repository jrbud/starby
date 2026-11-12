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
import slingshot from './slingshot.js'; // hold right-click on him, pull, let go
import cursorReact from './cursorReact.js';
import mood from './mood.js';
import moodLabel from './moodLabel.js'; // DEBUG label under the star; remove before the demo
import speech from './speech.js';
import starbits from './starbits.js';
import systemReactions from './systemReactions.js';
import sessionEvents from './sessionEvents.js';
import dream from './dream.js'; // dreams while asleep: accessories / starbits wiggling in his bubble
import charm from './charm.js'; // daily gift, "nice catch!", starbit milestones
import fidget from './fidget.js'; // little bored fidgets (spin, bop, look around, stretch)
import goodbye from './goodbye.js'; // quitting: a goodbye line, a star burst, he shrinks away
import fx from './fx.js'; // hand-drawn effects: wall hits, swats, star bursts
import find from './find.js'; // tray → "Find Starby": he pops into the middle of the screen
import nameChange from './nameChange.js'; // "nice to meet you, Sam!" when you change your name
import trail from './trail.js'; // shop → Trails (Rainbow Blur / Sandevistan / Motion Blur): tinted copies of him behind him
import ribbon from './ribbon.js'; // shop → Trails → "Rainbow Ribbon": a rainbow ribbon along his path
import stats from './stats.js'; // lifetime stats: counts throws, slingshots, games (Settings → Stats)
import cheerleader from './cheerleader.js'; // a long stretch in a work app → he cheers you on

export const BEHAVIORS = [idle, walk, drag, slingshot, cursorReact, mood, moodLabel, speech, starbits, systemReactions, sessionEvents, dream, charm, fidget, goodbye, fx, find, cheerleader, nameChange, trail, ribbon, stats];
