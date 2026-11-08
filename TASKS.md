# sprite.exe — Task assignments

Each teammate is **Person 1–4**. Tell Claude Code who you are ("I'm person 2") or point at a task
("do P3-1") and it will work from your section below.

## How Claude Code should use this file

- When someone says "I'm person N" / "user N" / "track N", work **only** on that person's tasks, in order:
  all **Must** tasks first, then **Nice**. Skip tasks marked `[x]`.
- Stay inside that person's **Owns** files. If a task needs a change to another person's file or a
  shared file (see "Shared files" at the bottom), **stop and flag it** instead of editing it.
- Before starting, read the files listed for the task. After finishing, mark the task `[x]` here
  (that's the only edit to this file allowed outside your section).
- All rules in `claude.md` still apply: Claude never creates or edits art assets, read-only system
  access, Windows target, and never commit — the human commits.
- Behavior contract (see `src/renderer/pet/behaviors/index.js`): `init(ctx)` once, optional
  `onTick(ctx, tick)` 10x/second for decisions and random rolls, optional `update(ctx, dt)` every frame
  for motion/visuals. `ctx` = `{ api, pet, petEl, stage, cursor, catalog, groundY(), stageWidth(),
  say(text, ms), isSpeaking(), setPinned(bool), clock, after(sec, fn, label), every(sec, fn, label),
  cancel(id), log(type, data), events }`.
- Timed events: use `ctx.after` / `ctx.every` (session clock), not `setTimeout`/`setInterval`.
  Log anything notable with `ctx.log(type, data)`; read history with `ctx.events` (see
  `src/renderer/pet/core/eventLog.js`).

---

## Person 1 — Movement & cursor

**Owns:** `src/renderer/pet/behaviors/idle.js`, `walk.js`, `drag.js`, `cursorReact.js`.
Also owns the list of `pet.mode` values: currently `'idle' | 'walk' | 'follow' | 'flee' | 'drag' | 'toss' | 'tag'`.

- [x] **P1-1 (Must) Roam anywhere on screen.** The star walks to targets anywhere on the screen (not just
  edges or the taskbar), mostly short wanders nearby with occasional long trips. Kept between a top margin
  (room for the speech bubble) and the top of the taskbar. After a drag it stays where it's dropped.
- [x] **P1-2 (Must) Livelier wandering.** Three kinds of walk (shuffle / wander / long trip) with their own
  distances and speeds, easing in and out. Mid-walk pauses to look around, sometimes turning back partway,
  random hops (crouch → arc → landing squish) while walking and idle, short/medium/long rests, looking
  around and double blinks while idle. Shared helpers (jumps, clamping) live in `behaviors/motion.js`.
- [x] **P1-3 (Must) Flinch & run.** `cursorReact.js` checks the path the cursor took since the last tick.
  If that path comes within 180px of the star, was heading at it at ≥1300px/s (a quick flick, not a normal
  move) and was aimed within 70px of its center, the star does a startle hop, says something, and switches
  to a new `'flee'` mode (run by `walk.js`: fast, no pauses/turn-backs) away from the cursor's path
  (sideways on a dead-on hit), angling off if cornered. Cursor jumps (>8000px/s) are ignored.
  2.5s cooldown. After 3 flinches in 30s it gives up for 20s (checked via the event log) so it can still
  be caught. "oh! hi" now only fires for calm approaches.
- [x] **P1-4 (Nice) Follow briefly.** When `cursorReact.js` notices a calm cursor, 60% of the time it
  switches to a new `'follow'` mode: walks slowly (55–80px/s) toward the cursor, re-aimed every tick,
  stopping ~70px short. Ends when it gets there, after 1.8–3.5s (a `ctx.after` timer; sometimes says
  "...nevermind"), or if the cursor gets 450px+ away. 20s cooldown. A flick still makes it flinch mid-follow.
  `walk.js` runs the movement (no random pauses/hops). `idle.js` now cancels its pending walk timer when it
  leaves idle, so a stale timer can't start a walk right after a follow/grab/flinch ends.
- [x] **P1-5 (Nice) Swing, spin & toss.** In `drag.js`: while held, the star hangs from the cursor at the
  point you grabbed (pendulum with light gravity), so it swings until that point sits under the cursor;
  jerks and fast swipes spin it. On release (`'toss'` mode) it keeps its speed and spin, glides, bounces
  off screen edges and wobbles back upright. "wheee!" on fast spins, dizzy wobble after 3+ turns.
  `pet.rotation` is rendered by `pet.js` (canvas only, so the speech bubble stays upright).
- [x] **P1-6 (Nice) Tag event.** First *event* (`src/renderer/pet/events/`, see below). He first **asks**: stops,
  says "wanna play tag?" and shows a Yes / No popup next to him (`events/prompt.js`, a clickable `.hit` box).
  **No** → new `sad` mood (`moods.js` / `mood.js`: half walk speed, no hops, looks away, no "oh! hi"; 30s, or a
  click cheers him up) and he won't ask on his own again for 10 min. No answer in 12s → "maybe later", not sad.
  **Yes** → he counts down in his bubble ("3...", "2...", "1...", "GO!", one per second, standing still) so
  you can get ready. Then real tag on a **15s clock** (top-right box, shows who's it): Starby starts as it and
  chases the cursor (700–900px/s, pounces at 1350px/s within 160px); touching you = you're it, and he runs
  (450–780px/s, jukes at 1150px/s within 120px). Touch him = he's it again: he stands still 1s, then chases. No
  tag-backs for 1.2s after he tags you. **Whoever is it when time runs out loses.** You win → he shoots out 7
  starbits in a ring (`burstStarbits` in `starbits.js`); you lose → no reward, and he pulls back any starbits on
  screen (`reclaimStarbits`). Touches are spotted every
  frame (fast moves can pass between ticks) and acted on at the tick. Grabbing him mid-game = foul, game over.
  Mood flips playful ↔ happy every 1.5–3s (via `requestMood` in `mood.js`), and he
  stays playful afterwards. Asks from the right-click menu ("Play tag") or randomly; `starby.startEvent('tag')`
  skips the question. Random: every 60s, 20% chance, 4-min cooldown, only when happy/playful, relaxed and the
  cursor moved in the last 10s. Tuning at the top of `events/tag.js`.
- [x] **P1-7 (Nice) Ask Starby to play.** Clicking him also pops up "Play a game? [Tag] [Pong]" next to him for
  4s (`events/games.js`, shared by all games). Pressing one starts that game right away (no question back).
  After ANY game he needs a 60s rest (`GAME_REST`): asking via the buttons or the menu gets "give me a little,
  i'm tired", then "still tired... give me Ns", then "i'm tired! ask me in a bit"; the buttons show "resting…
  0:42". Mad / dizzy: he refuses. Asleep: no buttons. Sad: the click cheers him up, so he says yes.
  `games.js` also has `createReady()` (the 3-2-1-GO countdown) used by tag and pong.
- [x] **P1-8 (Nice) Pong event.** `events/pong.js`: Starby is the ball. He glides to the middle; a paddle
  appears on each side (plain CSS bars labelled YOU / AI): left = yours, follows the mouse up and down; right =
  the AI. "3... 2... 1... GO!", served toward you; bounces off the top/bottom of the usable area and off the
  paddles (hit position sets the angle, max 55°; +9% speed per hit, max 1500px/s), spinning. The AI predicts
  where he'll arrive but misjudges more as he speeds up (and tops out at 430px/s), so a decent player wins about
  half the time. **One point wins:** past the AI → you win, 7 starbits burst out; past you → you lose, he takes
  back the starbits on screen. Grabbing him = foul. Starts from the game buttons, the menu ("Play pong") or
  `starby.startEvent('pong')`; never asks first. Tuning at the top of `events/pong.js`.

> **Events vs. behaviors.** Behaviors (`behaviors/`) are always-on habits. Events (`events/`) are scripted
> sequences that take over the star at high priority, usually by setting their own `pet.mode` (behaviors
> stand down for modes they don't know), then hand it back. One at a time; pet.js runs the active event
> after the behaviors. Add one in `events/index.js`; the module contract is documented there.

---

## Person 2 — Starbits & Windows testing

**Owns:** `src/renderer/pet/behaviors/starbits.js`, `src/renderer/pet/pet.css`.
Windows fixes only in: `src/main/windows/petWindow.js`, `src/renderer/pet/clickThrough.js` (tell the team
before changing these — they're core).

- [ ] **P2-1 (Must, do first) Windows test.** Run `npm install && npm start` on Windows and check:
  1. Clicks pass through everywhere except on the star (and work on the star: click, drag, right-click).
  2. The star stays visible above the taskbar (`setAlwaysOnTop(true, 'screen-saver')`).
  3. He never walks, lands or gets thrown under the taskbar, wherever it is: drag the taskbar to the top,
     left and right and check (`ctx.area()` in `pet.js` = the usable area; `starby.area()` in DevTools).
  4. Works at 125% and 150% display scaling.
  Fix what's broken (comment any Windows quirk you find), or report it to the team.
- [ ] **P2-2 (Must) Show the count.** On pickup, spawn a small "+1" text element that floats up and fades
  (CSS transition, plain text). Also show the total: e.g. a small plain-text badge near the star while the
  cursor is over it. Get the total from `ctx.api.getState()` / `ctx.api.onStateChanged`.
  Badge/float text must not have class `hit` (keep them click-through).
- [x] **P2-3 (Must) Old starbits fade.** Each drop gets a spawn time; after ~60s fade it out and remove it
  from `drops`.
- [ ] **P2-4 (Nice) Drop animation.** Spawn at the star's center and fall/bounce to its feet with a CSS
  transition or per-frame update before it becomes collectable.
- [ ] **P2-5 (Nice) Multiple monitors.** Decide: primary-only (current) or support others. Document the
  decision in a comment in `petWindow.js`. If supporting, flag it — it changes the window design.

---

## Person 3 — Speech & system reads

**Owns:** `src/renderer/pet/behaviors/speech.js`, `src/renderer/pet/bubble.js`,
`src/renderer/pet/behaviors/systemReactions.js`, `src/renderer/pet/behaviors/chatter.js`,
`src/renderer/pet/behaviors/mood.js`, `src/renderer/pet/behaviors/moods.js`, `src/main/systemReads/*`.
Also owns `pet.mood`, `pet.face` and `pet.goal` (proposed; see P3-6, agree with the team).

> **Speech convention (for everyone):** lines that answer the user (click, flinch, drag) use plain
> `ctx.say()` so they show instantly. Lines that come out of nowhere (idle chatter, system reactions,
> timed events) use `chat(ctx, text, ms, { gap, wait })` from `behaviors/chatter.js`, which only speaks
> when nothing was said in the last `gap` seconds (default 5) and otherwise queues the line for up to
> `wait` seconds or drops it. Dropped lines never reach `ctx.say`, so they aren't in the event log.
> `lineBag(lines)` in the same file picks lines without repeating one twice in a row.
> `sessionEvents.js` milestones still use `ctx.say` directly; switching them to `chat()` is a two-line
> change (not done, since that file isn't Person 3's).

- [x] **P3-1 (Must) Active window.** Done. `src/main/systemReads/activeWindow.js` polls every 2s with the
  `get-windows` package (**new dependency in `package.json`, announce before pushing**) and emits
  `{ app, category }` (`'browser' | 'editor' | 'game' | 'music' | 'other'`) once an app has stayed focused
  for 2 polls, so alt-tabbing past windows doesn't trigger anything. The window title never leaves the
  main process. Categories come from the exe name, plus game install folders (e.g. `steamapps\common`).
  Our own shop window is ignored. Checked on Windows: the prebuilt Node-API addon loads in Electron 45
  without a rebuild, and each poll takes about 1ms after the first. If it ever fails to load, the reader
  logs a warning and turns itself off instead of crashing. `systemReactions.js` comments when you
  switch to a different *kind* of app, at most once per kind every 5 minutes.
- [x] **P3-2 (Must) More to say, less spam.** Done: `speech.js` has bigger line pools (20 idle, 14 click)
  drawn from shuffle bags (never the same line twice in a row). Idle chatter runs on `ctx.after`
  and is skipped unless it's been quiet for 10s. The global rate limit is `chat()` in `behaviors/chatter.js`
  (see the speech convention above), not in `bubble.js`, so clicks and flinches stay instant.
  System reads now start 2s after the pet page loads (`systemReads/index.js`), because events sent before
  `pet.js` finishes its async boot were being dropped. `power` sends `initial: true` for the startup state,
  and the star only comments on changes, so startup is one greeting instead of several lines at once.
- [x] **P3-3 (Must) Battery level.** Done in `systemReactions.js` with `navigator.getBattery()`: warns
  once at ≤20% while on battery (logged as `battery-low`), and only warns again after charging back above
  25%, so a quick plug/unplug doesn't nag. Plugging in after a warning gets a relieved line instead of the
  usual one. Main's `'power'` event and the battery API both report plug-ins, so they share one handler
  that says at most one line per change. Desktops without a battery never trigger it.
- [x] **P3-4 (Nice) Smarter clipboard reactions.** Done, a little differently than planned: the
  `'clipboard'` event no longer has a `preview`. `systemReads/clipboard.js` classifies the text in the main
  process and sends only `{ length, kind }`, with `kind` one of `'url' | 'number' | 'long' | 'text'`, so the
  copied text never reaches the renderer, the event log or DevTools. `systemReactions.js` has lines per kind.
- [ ] **P3-5 (Nice) Sleepy at night.** Folded into P3-6: no new `'sleep'` mode needed. He yawns after
  1 minute alone at night (2 minutes by day) and sleeps once he reaches a top corner.
- [ ] **P3-6 (Must) Emotions.** Moods are a separate layer from `pet.mode`: **mode** = what the body is
  doing (Person 1), **mood** = how he feels (`pet.mood`: happy, mad, playful, dizzy, yawning, sleepy),
  **face** = which frames to show (`pet.face`: the mood, plus `dragged` while held and `talking` while happy
  and speaking). Behaviors never check mood names: they read one rule from `rulesFor(ctx.pet)` in
  `behaviors/moods.js` (`starbits`, `wander`, `follow`, `flee`, `hop`, `grabbable`, `quiet`, `bobSpeed`).
  Every mood change is logged as `mood`. In DevTools: `starby.setMood('sleepy')`, `starby.mood()`.
  - [x] **Phase 1 (Person 3): state machine + speech.** `mood.js` handles:
    - **mad:** 4 clicks in 8s; 20s after the last poke he's happy again.
    - **playful:** thrown at ≥500px/s; lasts 15s, and each throw or edge hit restarts it.
    - **dizzy:** spun 3+ turns (`drag.js` logs `dizzy`), 3 throws within 20s, or the cursor circling him
      3 times within 6s; lasts 5s.
    - **yawning:** 2 minutes without interaction (1 at night) or the system `idle` event; sets `pet.goal`
      to the nearest top corner.
    - **sleepy:** reached that corner. **Only picking him up and shaking him wakes him**; clicks, the
      cursor and throws don't, and he dangles asleep if held without shaking.
    - **speech:** `speech.js` has click and idle lines for each mood. `chat()` drops unprompted lines while
      he's asleep (the `quiet` rule), except low battery.
    - Two lines added to the shared `behaviors/index.js` to register `mood.js`.
  - [x] **Phase 2: hook behaviors up to the rules.** Done by Person 3 in Persons 1 and 2's files, with
    them informed. Each file's header has a "MOODS" note listing exactly what was added.
    - [x] **`idle.js`:**
      - no walks or looking around when `!wander` (dizzy, asleep);
      - when `wander === 'corner'`, the next walk goes to `pet.goal` at a slow plod with short rests;
      - breathing speed from `bobSpeed`, and no hops when `!hop`;
      - eyes stay shut while asleep (`eyesShut`, using the existing blink drawing).
    - [x] **`walk.js`:**
      - getting dizzy mid-walk stops him on the spot;
      - starting to yawn mid-walk sends him to the corner right away;
      - corner walks never turn back, and there are no random hops when `!hop`.
    - [x] **`motion.js`:** `CORNER_WALK_SPEED` and a `hasGoalToReach()` helper.
    - [x] **`cursorReact.js`:**
      - no "oh! hi" and no following when `!follow`, and a follow in progress ends if the mood changes;
      - no flinching when `!flee`;
      - eyes look away from the cursor while mad (`lookAway`).
    - [x] **`drag.js` (done by Person 3, with Person 1 informed):** edge hits are logged as `impact`
      `{ side, speed }`, and `mood.js` listens for them. **Swat:** when `!grabbable` (mad), pressing and
      dragging him cancels the grab. He recoils about 200px away from the cursor with a little spin, using
      the normal throw physics, glares back and says something like "hands off!". It's logged as `swat`,
      and `mood.js` counts it as another poke. A plain click on a mad star is still a poke. The real
      cursor is never moved: that would be a system write, out of scope.
    - [x] **`starbits.js`:**
      - the drop timer runs at the `starbits` rate: playful drops about twice as fast (50 vs 25 in a
        5-minute test), and rate 0 drops nothing;
      - a mad star says "no starbits for you!" once per mad spell (`refuses`);
      - hard wall hits (`impact` ≥900px/s) drop 1–3 starbits just off the wall, with a 2s cooldown, and
        nothing while mad or asleep. **Person 4: please check these numbers against shop prices.**
    - **New rules in `moods.js`:** `refuses`, `lookAway`, `eyesShut`. The table now builds every mood from
      shared defaults, so each mood only lists what differs from happy.
  - [x] **Phase 3: the hand-drawn PNGs are now Starby** (done by Person 3).
    - **Art:** 22 PNGs in `assets/sprite/sunny/`. The mapping (which file shows when, and how fast pairs
      alternate) is in `assets/README.md` and `src/renderer/pet/frames.js`.
    - **`frames.js` (new):** loads each 2048px frame once and shrinks it to the on-screen size.
      - It lines every frame up on the same feet spot, measured from the art: `left`, `right` and
        `dizzy` get small shifts, and the rest already matched.
      - His feet sit on the bottom edge, so squash pivots from his feet and he stands on the taskbar.
      - Color sets are folders next to `sunny/`, and missing files fall back to sunny.
    - **`pet.js` (shared):**
      - draws `pet.face`'s frame instead of the code-drawn star, on a higher-resolution canvas for
        sharp scaling;
      - stops mirroring (the art faces the viewer; walking uses `left`/`right`);
      - waits for the standing frames before he first appears;
      - falls back to the old drawn star only if the art can't load.
    - **`mood.js` (new faces):** `left`/`right` while walking, `up`/`down` when the cursor is right above
      or below him, `up` when an event sets `pet.lookUp` (for a star shower), `playful` during tag, and
      random `glistening`/`wink` moments every 15–35s. Try them with `starby.flourish('wink')`.
    - **Unchanged:** every effect (swing, spin, squash/stretch, impact freeze, hops, dizzy wobble) is the
      same CSS transform on the canvas, so it works on the PNGs as before. Tested in the real app.
    - **No longer visible:** eyes following the cursor, and mad's eyes looking away (the eyes are painted
      on now).
    - **Still to do:** other color sets need their PNG folders. (Accessories and shop previews are done
      in P3-7.)
- [x] **P3-7 Accessories (hand-drawn PNGs).** Done by Person 3; it touches Person 4's shop files (flag to Person 4).
  - **Art:** 11 accessories in `assets/accessories/`, on the same 2048 canvas as Starby. The placement
    table is in `assets/README.md`.
  - **`src/renderer/pet/accessories.js` (new):**
    - body points per frame (head, both hands, chest, both feet), measured from the art, so accessories
      follow his pose (leaning, slumped, raised arms, dizzy sway);
    - each accessory's placement (anchor, pivot, offset, scale);
    - loading, and drawing worn ones into his canvas, so they spin, squash and swing with him;
    - still previews for the shop.
  - **Worn:** top hat, propeller hat, bow, halo (bobs slightly), tie, sneakers, boots (one shoe per
    foot), lollipop (in HIS left hand; passes to the other hand while yawning). None cover his face.
  - **`src/renderer/pet/floaters.js` (new), floating ones, always behind him:**
    - **balloon:** floats just above him on a string tied to his right hand, drifting behind his
      movement. The string is a code-drawn line (team-approved exception, noted in `claude.md`).
    - **UFO:** loops near him.
    - **star trail:** streams behind whichever way he moves.
  - **`pet.js`:** the canvas now has room around his box for things that stick out (only the box is
    clickable), and draws worn accessories after his frame. `anchorOnScreen()` maps a body point through
    his spin and squash, so the string stays tied to his hand.
  - **Shop (Person 4's files):**
    - `shopCatalog.js` lists the 11 accessories, each with a `place`;
    - `stateSchema.js` unlocks every accessory from the start, for now (`UNLOCKED_FOR_NOW`);
    - `shop.js` previews draw the PNG Starby wearing the item, and color cards get a small swatch.
  - **One accessory at a time for now.** The renderer already takes a list (`pet.look.accessories`), and
    `accessoriesConflict()` in the catalog implements the rule for wearing several later: one per `place`,
    so boots and sneakers (both `feet`) can't be worn together.
  - **Also in this change:**
    - sad after saying no to a game lasts 5s;
    - he yawns after 1 minute and walks to the corner about twice as fast (`CORNER_WALK_SPEED` in
      `motion.js`);
    - a happy star turns playful when the cursor rests on him for 0.8s;
    - wall bounces during a throw give him some spin (`drag.js`, `BOUNCE_SPIN_*`).

---

## Person 4 — Shop & customization

**Owns:** `src/renderer/shop/*`, `src/shared/shopCatalog.js`, `src/renderer/shared/sprite.js`,
`src/shared/stateSchema.js` (only Person 4 edits the save format).

- [ ] **P4-1 (Must) Fill out and balance the catalog.** Add more colors and accessories in
  `shopCatalog.js` (the star has one shape, so no shape items); new accessories need a draw function in `sprite.js`. **Flat fills and simple
  primitives only — no gradients, glow, shading or images.** Price so the first purchase takes ~5 minutes
  of play (drops are every 8–15s in `starbits.js`, so roughly 25 starbits).
- [x] **P4-2 (Must) Shop polish.** Make owned / equipped / can't-afford states obvious at a glance
  (e.g. lock label, dimmed card, "need N more"). Show a short confirmation after buying.
- [ ] **P4-3 (Must) Demo shortcut.** A hidden key combo in the shop window (e.g. Ctrl+Shift+D) that adds
  50 starbits via `window.sprite.collectStarbits(50)`. Keep it simple and obvious in code so it can be
  removed later.
- [ ] **P4-4 (Nice) Another way into the shop.** Double-click on the star → `window.sprite.openShop()`.
  The listener lives in the pet renderer — put it in a new behavior file (e.g. `behaviors/shopOpener.js`)
  and add one line to `behaviors/index.js`.
- [ ] **P4-5 (Nice) Reset save.** A "Reset progress" button in the shop with an in-page confirm step.
  Needs a new IPC channel (`state:reset`) in `ipc.js` + `preload.js` that writes defaults via
  `store.update` — add-only change to shared files, tell the team.

---

## Shared files (flag before editing)

| File | Rule |
|---|---|
| `src/preload/preload.js`, `src/main/ipc.js` | Add new channels freely. Never rename or remove existing ones. |
| `src/renderer/pet/behaviors/index.js` | One line per new behavior. Trivial conflicts. |
| `src/renderer/pet/pet.js` | Shared render loop/`ctx`. Ask before changing. |
| `src/renderer/pet/core/*` | Session clock, scheduler, event log. Shared; ask before changing. |
| `src/renderer/pet/events/index.js` | Event runner + registry. Adding an event = one line; ask before changing the runner. |
| `pet.mode` values | Person 1 owns. Ask before adding a mode. |
| `src/shared/stateSchema.js` | Person 4 only. |
| `src/main/main.js`, `src/main/windows/petWindow.js` | Core. Person 2 for Windows fixes; tell the team. |
| `package.json` | Announce any new package before pushing. |

## Timeline

- **Hour 0–1:** everyone runs the app; Person 2 does P2-1; start on your Musts.
- **Middle:** Musts, then Nice. Pull and run the app together every few hours.
- **End − 4h:** no new features, bug fixes only.
- **End − 2h:** cut anything half-working.
- **End − 1h:** dry-run the demo on Windows using the demo shortcut and reset button.
