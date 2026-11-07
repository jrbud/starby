// Behavior registry. Each behavior is a small module:
//
//   export default {
//     name: 'my-behavior',
//     init(ctx) {},          // once at startup: add listeners, timers
//     update(ctx, dt) {},    // every frame; dt in seconds
//   };
//
// `ctx` is defined in ../pet.js: { api, pet, petEl, stage, cursor, catalog,
//   groundY(), stageWidth(), say(text, ms), isSpeaking(), setPinned(bool) }.
// Behaviors coordinate through `ctx.pet.mode` ('idle' | 'walk' | 'drag').
// Only change the mode for states you own, and respect 'drag' (the user is holding the pet).
//
// Order matters a little: later behaviors run after earlier ones each frame.
import idle from './idle.js';
import walk from './walk.js';
import drag from './drag.js';
import cursorReact from './cursorReact.js';
import speech from './speech.js';
import stardust from './stardust.js';
import systemReactions from './systemReactions.js';

export const BEHAVIORS = [idle, walk, drag, cursorReact, speech, stardust, systemReactions];
