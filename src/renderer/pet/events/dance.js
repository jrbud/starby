// DANCE — Starby dances while a song is playing in Spotify.
//
// src/main/systemReads/music.js sends { type: 'music', playing } (true/false only, never the
// song). While music plays and he's happy or playful, he dances in bursts: DANCE_FOR seconds of
// dancing, then a DANCE_COOLDOWN (1 minute) of hanging out normally while the song keeps going,
// then again, so it never gets repetitive. The cooldown counts from the end of every dance (done,
// song over, interrupted...), so there's always at least a minute between dances.
//
// The moves are all MOTION on his existing frames (bounce, sway, side steps, hops, a spin) on a
// steady beat. We can't hear the music, so the beat is a fixed pop tempo (BEAT). His face is the
// 'dancing' face (frames.js: the excited happy-1/2 frames, swapping on the beat).
//
// Its own category ('dance'): its own trigger (music) and cooldown, separate from the sky events
// (./happenings.js) and the games (./games.js). It's a background thing, not all he does: lowest
// priority of all events (2), so a sky event interrupts it and an invite, a game or the shop window
// always wins. And YOU snap him out of it: clicking him (talking to him), grabbing or throwing him,
// a swat or a flinch ends the dance. It also ends when the song stops or his mood changes (mad,
// dizzy, sleepy...). He only dances again once DANCE_COOLDOWN (1 minute) has passed since the last
// dance AND things have been quiet for QUIET_FOR seconds: no interaction and no other event.
// Owns the star via pet.mode = 'dance' (behaviors stand down for modes they don't know).
// RANDOM DANCE (very rare): with no music at all, the event runner rolls RANDOM_DANCE.chance every
// RANDOM_DANCE.every seconds (at most once per RANDOM_DANCE.cooldown, and only when nothing else
// is going on); he hums a little tune and does a short RANDOM_DANCE_FOR burst. Same snap-outs.
// In DevTools: starby.startEvent('dance') dances one burst even without music.
import { rand, approach, clampToScreen, startJump, updateJump, cancelJump } from '../behaviors/motion.js';
import { chat, lineBag } from '../behaviors/chatter.js';

// ---- Tuning ----
const BEAT = 0.5; // seconds per beat (~120 bpm)
const BEATS_PER_MOVE = 8; // each move lasts two bars
const DANCE_FOR = [14, 24]; // seconds per dance burst...
const DANCE_COOLDOWN = 60; // seconds between dances (after any dance ends, however it ended)
const MOODS_THAT_DANCE = ['happy', 'playful'];
const MOVES = ['bounce', 'sway', 'step', 'hop', 'spin'];
const STEP = 0.22; // side-step distance, in star-sizes
const MID_LINE_CHANCE = 0.25; // per move change
// Very rare dance with no music: ~2% a minute → about once an hour, never twice within 20 min.
const RANDOM_DANCE = { every: 60, chance: 0.02, cooldown: 1200 };
const RANDOM_DANCE_FOR = [6, 10]; // seconds: a short little bop
const QUIET_FOR = 25; // seconds with no interaction / other event before he dances (again)
// Things you do to him that snap him out of a dance (event log types).
const SNAP_OUT = ['click', 'grab', 'toss', 'swat', 'flinch'];

const LINES = {
  start: lineBag(['ooh, i love this song!', '*dance time*', "this one's a bop!", '*starts bopping*', 'music!!']),
  mid: lineBag(['la la la!', 'woo!', 'look at my moves!', '*shimmy*', 'ba-dum tss']),
  stop: lineBag(['aww, the song stopped', 'that was fun!', 'encore?']),
  random: lineBag(['*hums a little tune*', 'i feel like dancing!', '*bops to a song only i can hear*', 'dance break!']),
};

let musicPlaying = false;
let restUntil = 0; // session seconds: no new dance before this (DANCE_COOLDOWN after the last)
let busyAt = -Infinity; // session seconds of the last interaction or other event
let endDance = null;
let t = 0; // seconds into this burst
let danceFor = 0;
let move = 'bounce';
let moveIndex = -1;
let lastBeat = -1;
let homeX = 0; // where he dances (side steps go either side of this)
let noMusicRun = false; // started from DevTools or at random: dance one burst even with no music

const relaxed = (pet) => pet.mode === 'idle' || pet.mode === 'walk';

function finish(result) {
  const end = endDance;
  endDance = null;
  end?.(result);
}

function nextMove() {
  const options = MOVES.filter((m) => m !== move);
  move = options[Math.floor(Math.random() * options.length)];
}

export default {
  name: 'dance',
  category: 'dance',
  priority: 2, // below everything: invites 5, games 10, sky events 14, hush 15, focus 16, shop 20
  auto: RANDOM_DANCE, // the rare no-music dance (events/index.js rolls it; canStart reason 'random')

  init(ctx) {
    ctx.events.onEntry((e) => {
      if (e.type === 'system' && e.data.type === 'music') {
        musicPlaying = Boolean(e.data.playing);
        return;
      }
      // You interacted with him, or something else happened: snap out of it, and wait for quiet.
      const otherEvent = (e.type === 'event-start' || e.type === 'event-end') && e.data.name !== 'dance';
      if (SNAP_OUT.includes(e.type) || otherEvent) {
        busyAt = ctx.clock.seconds;
        if (endDance && SNAP_OUT.includes(e.type)) finish(`snapped out: ${e.type}`);
      }
    });
  },

  canStart(ctx, reason) {
    const { pet } = ctx;
    if (!MOODS_THAT_DANCE.includes(pet.mood) || !relaxed(pet)) return false;
    return musicPlaying || reason === 'devtools' || reason === 'random';
  },

  // Every tick, even when not dancing: start a burst when the song is on, he's free, and it's
  // been quiet for a while.
  watch(ctx) {
    const now = ctx.clock.seconds;
    if (!musicPlaying || ctx.activeEvent() || now < restUntil || now - busyAt < QUIET_FOR) return;
    ctx.startEvent('dance', 'music');
  },

  start(ctx, end, reason) {
    const { pet } = ctx;
    endDance = end;
    noMusicRun = reason === 'devtools' || reason === 'random';
    t = 0;
    danceFor = reason === 'random' ? rand(...RANDOM_DANCE_FOR) : rand(...DANCE_FOR);
    moveIndex = -1;
    lastBeat = -1;
    homeX = pet.x;
    pet.mode = 'dance';
    nextMove();
    chat(ctx, reason === 'random' ? LINES.random() : LINES.start(), 2200, { wait: 3 });
  },

  onTick(ctx) {
    const { pet } = ctx;
    if (pet.mode !== 'dance') return finish('interrupted'); // grabbed, thrown, etc.
    if (!MOODS_THAT_DANCE.includes(pet.mood)) return finish('mood');
    if (!musicPlaying && t > 1 && !noMusicRun) { // (devtools / random dances run without music)
      chat(ctx, LINES.stop(), 2200, { wait: 3 });
      return finish('song over');
    }
    if (t >= danceFor) {
      return finish('rest');
    }
  },

  update(ctx, dt) {
    const { pet } = ctx;
    if (pet.mode !== 'dance') return;
    const S = pet.size;
    t += dt;
    const beat = t / BEAT;
    const whole = Math.floor(beat);
    const newBeat = whole !== lastBeat;
    lastBeat = whole;

    // A new move every BEATS_PER_MOVE beats.
    const index = Math.floor(beat / BEATS_PER_MOVE);
    if (index !== moveIndex) {
      if (moveIndex >= 0) {
        nextMove();
        if (Math.random() < MID_LINE_CHANCE) chat(ctx, LINES.mid(), 1600, { gap: 8 });
      }
      moveIndex = index;
      ctx.log('dance', { move }); // mood.js counts dancing as being busy (no yawning mid-song)
    }

    const jumping = updateJump(pet, dt); // a hop in progress owns bob/squash
    let targetX = homeX;
    let rotation = 0;
    let bob = 0;
    let squash = 1 + 0.06 * Math.cos(2 * Math.PI * beat); // stretch up, squash down, on the beat
    const bounce = Math.abs(Math.sin(Math.PI * beat)); // 0 on the beat, 1 between beats

    if (move === 'bounce') {
      bob = -bounce * 0.12 * S;
    } else if (move === 'sway') {
      rotation = Math.sin(Math.PI * beat) * 0.25; // lean left, lean right
      bob = -bounce * 0.05 * S;
    } else if (move === 'step') {
      const side = whole % 2 ? 1 : -1;
      targetX = homeX + side * STEP * S;
      rotation = side * 0.1; // lean into the step
      bob = -bounce * 0.06 * S;
    } else if (move === 'hop') {
      if (newBeat && !jumping) startJump({ height: 0.16 * S, air: BEAT * 0.6 });
    } else if (move === 'spin') {
      const local = beat % 4; // spin for 2 beats, then 2 beats of bouncing
      if (local < 2) {
        const p = local / 2;
        rotation = (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) * Math.PI * 2; // ease in-out
      }
      bob = -bounce * 0.08 * S;
    }

    pet.x = approach(pet.x, clampToScreen(ctx, targetX, pet.y).x, dt, 12);
    pet.rotation = rotation; // set after drag.js (events update after behaviors)
    if (!jumping) {
      pet.bob = bob;
      pet.squash = approach(pet.squash, squash, dt, 18);
    }
  },

  stop(ctx) {
    const { pet } = ctx;
    endDance = null;
    restUntil = ctx.clock.seconds + DANCE_COOLDOWN; // 1 minute before the next dance
    cancelJump();
    pet.rotation = 0;
    pet.bob = 0;
    pet.squash = 1;
    if (pet.mode === 'dance') pet.mode = 'idle';
  },
};
