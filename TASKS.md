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
- [x] **P1-6 (Nice) Tag event.** First *event* (`src/renderer/pet/events/`, see below). Starts from an invite
  (P1-9), the game buttons (P1-7), the menu ("Play tag") or `starby.startEvent('tag')`. He counts down in his
  bubble ("3...", "2...", "1...", "GO!", one per second, standing still) so you can get ready. Then real tag on a **15s clock** (top-right box, shows who's it): Starby starts as it and
  chases the cursor (800–1040px/s, pounces at 1550px/s within 160px; uses his left/right walk art while running sideways); touching you = you're it, and he runs
  (450–780px/s, jukes at 1150px/s within 120px). Touch him = he's it again: he stands still 1s, then chases. No
  tag-backs for 1.2s after he tags you. **Whoever is it when time runs out loses.** You win → he shoots out 7
  starbits in a ring (`burstStarbits` in `starbits.js`); you lose → no reward, and he pulls back any starbits on
  screen (`reclaimStarbits`). Touches are spotted every
  frame (fast moves can pass between ticks) and acted on at the tick. Grabbing him mid-game = foul, game over.
  Mood flips playful ↔ happy every 1.5–3s (via `requestMood` in `mood.js`), and he
  stays playful afterwards. Tuning at the top of `events/tag.js`.
- [x] **P1-7 (Nice) Ask Starby to play.** Clicking him also pops up "Play a game? [Tag] [Pong]" next to him for
  4s (`events/games.js`, shared by all games). Pressing one starts that game right away (no question back).
  After ANY game he needs a 60s rest (`GAME_REST`): asking via the buttons or the menu gets "give me a little,
  i'm tired", then "still tired... give me Ns", then "i'm tired! ask me in a bit"; the buttons show "resting…
  0:42". Mad / dizzy: he refuses. Asleep: no buttons. Sad: the click cheers him up, so he says yes.
  `games.js` also has `createReady()` (the 3-2-1-GO countdown) used by tag and pong.
- [x] **P1-8 (Nice) Pong event.** `events/pong.js`: Starby is the ball. He glides to the middle; a paddle
  appears on each side (the team's `menuIcons/line.png` stroke in the app's yellow with a dark purple outline; only yours is labelled "YOU", yellow Sour Gummy on `menuIcons/button-hover.png`, fading out 1.5s after "GO!"; every paddle hit plays the wall-hit effect via `behaviors/fx.js`): left = yours, follows the mouse up and down; right =
  the AI. "3... 2... 1... GO!", served toward you; bounces off the top/bottom of the usable area and off the
  paddles (hit position sets the angle, max 55°; +9% speed per hit, max 1500px/s), spinning. The AI predicts
  where he'll arrive but misjudges more as he speeds up (and tops out at 520px/s; tuned harder: aim error 28px + 0.07/px·s, was 430px/s / 40px / 0.09), so a casual player wins about
  a third of the time (a sharp one still wins most, with rallies about twice as long). **One point wins:** past the AI → you win, 7 starbits burst out; past you → you lose, he takes
  back the starbits on screen. Grabbing him = foul. Starts from an invite (P1-9), the game buttons, the menu
  ("Play pong") or `starby.startEvent('pong')`. Tuning at the top of `events/pong.js`.
- [x] **P1-9 (Nice) Starby invites you to play (any game).** `events/invite.js`: every 30s, 30% chance (2-min
  cooldown) he picks a game at random from `GAMES` in `events/games.js` (not the same one twice in a row),
  stops and asks ("wanna play pong? i can be the ball!") with a "Play Pong with Starby? [Yes] [No]" popup
  (`events/prompt.js`). **Yes** → that game starts. **No** → `sad` mood (`moods.js` / `mood.js`: half walk speed,
  no hops, looks away, no "oh! hi"; 30s, or a click cheers him up) and no invites for 10 min. No answer in 12s →
  "maybe later", not sad. Only when he's relaxed, happy/playful, rested after the last game, and the cursor
  moved in the last 10s. **New games join automatically:** add them to `GAMES` with their ask lines.
  DevTools: `starby.invite()` / `starby.invite('pong')`. The menu items start games directly (no invite).
- [x] **P1-10 (Nice) Happenings timer + Star Shower.** `events/happenings.js`: one shared timer on the session
  clock; every 10–15 min (random gap; was 20–50) it starts a random *happening* from `HAPPENINGS` (weighted). Not a good
  moment (a game/invite running, or the cursor hasn't moved for 2 min)? It retries every 60s instead of
  skipping. **Add a happening:** write its event, register it in `events/index.js`, add it to `HAPPENINGS`.
  First one, `events/starShower.js`: he shouts "THE SKY IS FALLING!" and hops; for 12s, 30 starbits fall from
  the top of the usable area (`rainStarbit` in `starbits.js`: sway + spin, no magnet, slightly bigger catch
  zone). Catch them with the cursor or they fade at the bottom; then he says how many you caught. He isn't
  taken over (keeps wandering, extra hops). Low priority: never interrupts a game. DevTools:
  `starby.happening('star-shower')`, `starby.nextHappening()` (seconds until the next).
- [x] **P1-11 (Nice) Hide and seek.** `events/hideSeek.js`: he runs off and hides without a word (no speech,
  no countdown, no starbit drops, debug mood label hidden; `pet.hiding` tells `starbits.js` / `moodLabel.js`).
  He only hides just past an **edge of the usable screen** (behind the taskbar, or past the left / right / top
  edge); no windows. "Behind the edge" is a CSS clip on the pet element, so a peek shows only the part sticking
  out. Every 4–9s he peeks out ~30px for 1.5s, and **each peek comes from a new random edge spot** (he moves
  there while fully hidden), so he isn't where you saw him hide. Touch him (or grab him) while he peeks → found:
  "you found me!" + 10 starbits. Not found in 150s → he comes out and wins. On the game buttons, the games timer
  (he hides on his own, P1-15) and the menu ("Play hide & seek"); never in invites (`invite: false`).
- [x] **P1-14 (Nice) Catch.** `events/catchGame.js`, a game (buttons, invites, menu "Play catch"): "i'm gonna
  throw myself! catch me in the box!" A catch box (5 × 5 Starbys, the team's tan box art `assets/events/tan-translucent-box.png`, with 3 strike X's on top: `assets/menuIcons/x-idle.png`, each strike swaps the next to `x-hover.png`; "Catch Here!" inside at the top in Sour Gummy, blue, at the box's opacity) appears on the right; he goes to the far
  left, stretches out, says "get ready to catch me!", counts down "3... 2... 1... GO!" (before every throw) and flings himself at the box (950px/s, ~0.35s inside it). Click/grab him
  **inside the box** → "NICE!" + 10 starbits. Missed → "STRIKE n!", he bonks the edge, flies back, tries again;
  3 strikes → out. He walks back to the left facing left (the 'left' art, via `pet.faceOverride`, which
  `mood.js` honours) on one straight path. Clicking him before or after the box (or while winding up / flying back) → "CHEATER!", game
  over. During the game the box is a `.hit` element, so a click with a still cursor still reaches us (the pet
  window is otherwise click-through until the cursor moves over him). Clicks are judged at the next tick.
- [x] **P1-13 (Nice) Shooting Star + slower random tosses.** `events/shootingStar.js`: a sky event (shares the
  10–15 min timer with Star Shower, P1-15): he yells "WATCH OUT! STARS INCOMING!", then 1.5s later
  10–16 starbits shoot across the screen from the left or right as one tight clump with trails (`shootStarbit` in
  `starbits.js`; all launched within 0.2s, ±25px of one height, 910–970px/s, shared slant: ~180×50px mid-flight). Catch them as they fly past; uncaught ones fade at the far side.
  Rain and shooting stars share one "flying starbit" path in `starbits.js`. Developer menu: "Start shooting star
  now". Separately, Starby's own random tosses now default to every **30–60s** (`dropEveryMin/Max` in
  `shared/starbitsTuning.js`, was 8–15s; Admin Settings overrides still win).
- [x] **P1-12 (Nice) Developer menu.** Right-click → *Play hide & seek*, and a *Developer* submenu (`ipc.js`):
  Open pet DevTools, Start star shower now, Start shooting star now, Starby invites you to a game, Skip game rest (`starby.skipRest()`), Stop
  current event. Menu items send `{ type: 'starby', fn, args }` and `pet.js` calls `window.starby[fn](...args)`,
  so any new debug helper can be added to the menu without touching `pet.js`.
- [x] **P1-15 (Nice) Event categories: sky, games, dance.** Each event has a `category`, and each category
  starts its own way (table in `events/index.js`):
  - **Sky events** (`category: 'sky'`, priority 14; hush is 15): Star Shower, Shooting Star. Only these are on the 10–15 min
    timer in `events/happenings.js`. A due sky event **interrupts a dance**; if a game, invite, the shop or the
    intro is running, it waits and retries every 60s.
  - **Games** (`category: 'games'`, priority 10; invite 5): Tag, Pong, Hide & Seek, Catch. They start from the
    buttons, the menu, or the **games timer** in `events/games.js` (every 30s, 30%, 2-min cooldown, only when
    nothing else is running and you're around). The timer picks a random game: announced games go through an
    invite (`events/invite.js` no longer has its own `auto` roll); Hide & Seek starts silently
    (`canStart(ctx, 'random')`).
    **No matter what:** if 4 minutes pass without any game or invite starting, he asks you to play anyway
    (always an invite, reason `'due'`), skipping the chance roll, mood, you-being-around, rest and the
    10-min-after-"no" checks; it only waits while another event is running or you're holding him.
  - **Dance** (`category: 'dance'`, priority 2): music-triggered (P3-8), with a **1-minute cooldown** between
    dances (counted from the end of every dance).
  - Intro and shop are `category: 'system'`. The runner still supports `auto`, but nothing uses it now.
- [x] **P1-16 (Nice) Constellation quiz.** `events/constellation.js`, a game (invite "wanna do a star quiz?",
  game buttons as "Star Quiz", games timer, menu "Play constellation quiz"): he throws one starbit per star to
  its spot beside him, then the constellation's lines draw in one by one (the team's `menuIcons/line.png` stroke, star to star, in the
  app's yellow with a dark purple outline, via CSS masks; the stars are the starbit PNGs). "Which constellation
  is this?" + 4 answer buttons (the right one + 3 random others), 20s to answer. **Right** → the starbits are
  released and float like normal drops for you to collect. **Wrong / no answer** → he takes them all back (they
  fly into him; nothing is taken from your count). Grabbed mid-quiz → he takes them back. Shapes live in
  `events/constellations.js`: Big Dipper, Little Dipper, Orion, Cassiopeia, Cygnus, Lyra, Southern Cross, and
  all 12 zodiac constellations (Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpius, Sagittarius,
  Capricornus, Aquarius, Pisces); add one there and it's automatically a question and a wrong answer for the others.
  Needs **held starbits** in `behaviors/starbits.js` (P2's file): `placeStarbit(ctx, x, y)` (fly to a spot and
  stay: no drift/magnet/pickup/fade, not counted in the on-screen cap), `releaseStarbits(ctx, list)`, and
  `reclaimStarbits(ctx, list)` (optional list; no list = all, as before). No random drops while `pet.mode === 'quiz'`.
- [x] **P1-17 (Nice) Copycat.** `events/copycat.js`, **its own category** (`'copycat'`, priority 3), like dance: not
  a game (not on the game buttons or in the games timer, no shared rest). **Its own timer: every 3 minutes** (from
  the end of the last one, or launch) he tries to start one, silently; only when nothing else is running, he's
  relaxed and happy/playful, and you're moving the mouse (moved in the last 3s); otherwise he retries every 15s.
  "hehe, i'm copying you!" and then every move your cursor makes, he makes too (same distance and direction, from
  where he is: he mirrors you, doesn't follow you). Max 1400px/s; cursor jumps over 250px in one frame are ignored.
  Ends after **30s** ("ok i'm bored now"), or as soon as a copied move would push him **into the edge** of the
  usable screen ("hey! i'm not walking into a wall!"). Grabbed → ends. Sky events, invites and games take over.
  No reward. Tray menu → Developer → "Start copycat now".
- [x] **P1-18 (Nice) Starby Says.** `events/starbySays.js`, a game (invite "wanna play starby says?", game
  buttons, menu "Play starby says"), like Simon says. After a short intro the clock runs **15s** (countdown top
  right). He gives commands one after another, in his bubble, 60% of them starting with
  "Starby says": tap me (`click`), pick me up (`grab`), throw me (`toss`), throw me into the wall (`impact`), spin me
  (`spin`), tap me N times (`click` ×N, N = 2–5; progress like "(2/4)" in his bubble;
  without "Starby says" even one tap counts as doing it). **With "Starby says"**: do it within 4s or you lose ("too
  slow!"). **Without**: doing it loses ("i didn't say starby says!"); leaving it alone is safe. Only the current
  command's action counts. After a done command he waits until he's landed (+0.6s) before the next. Last the 15s →
  win, 8 starbits; lose → nothing taken. (There's no "open the shop" command: the shop takes him over and would
  end the game.) He isn't taken over (no `pet.mode`), so grabbing and
  throwing work as usual.
- [x] **P1-19 (Nice) Hoop Shot.** `events/hoopShot.js`, a game (invite "wanna play hoop shot?", game buttons,
  menu "Play hoop shot"). He flies to a launch spot on his side; a hoop appears on the far side (random height).
  **Right- or left-click and drag** him back like a slingshot, with the same look as the normal slingshot
  (`behaviors/slingshot.js`): feet pinned, head held by the cursor, body stretched like a rubber band, trembling near
  full pull (max 170px). Let go: he flies the other way in an **arc** (gravity 1500px/s², this game only) with the
  rubber-band wobble, **spinning** 7–14 rad/s (harder pull = faster), bouncing off the screen edges, and tips back
  upright after landing. (Hoop shot keeps its own angle because drag.js straightens him every frame otherwise.)
  While pulling, 6 small starbit PNGs show only the **first 0.4s** of the arc. Passing down through the hoop's
  opening → "SWISH!" + 10 starbits. A miss bounces on the floor and he flies back to try again. **15s** on the clock
  (countdown top right); a shot in the air at 0 still counts. Just a click (either button) → he stays put: "right
  click or left click and drag me!". During the game, presses on him and the right-click menu are caught by window
  capture listeners, so a left press never grabs him or ends the game (drag.js untouched). **Hoop art: `assets/events/hoop.png`** (the team's rim + net;
  sized and scored by the pink rim, `HOOP_ART_BOX`, with the net hanging below).

- [x] **P1-20 (Nice) Moon timer.** The game timer (`events/countdown.js`; tag, Starby Says, hoop shot) is a "moon"
  that **wanes like the real moon**, ticking once a second: full → gibbous (3/4) → half → crescent (1/4) → gone at 0
  (the dark side creeps in from the right); it pulses for the last 5s. No numbers or text: just the moon (110px) on
  the team's purple button art (`menuIcons/button-hover.png`, border-image) as a 150px card in the top-left corner.
  **The moon is the team's `assets/events/moon.png`** (`MOON_ART`). The phases are a CSS mask over the PNG (lit left half ± a terminator ellipse, mask-composite add /
  subtract): code only hides parts of team art; nothing is drawn.
- [x] **P1-21 (Nice) "How To Care for Your New Starby" popup.** `src/renderer/pet/howTo.js` (a helper in
  `events/index.js`): after the launch intro, a popup centered on screen with the basics (left click + drag to carry
  him, let go to throw, right click to talk, play games to keep him happy, watch out for limited events, collect
  starbits for the shop). **"Got it!"** closes it (it shows again next launch); **"Don't show again"** closes it for
  good (saved in the pet page's localStorage, `starby.howTo.hidden`; no saved-state schema change). Team frame art
  (`button-hover.png` panel, `button-idle.png` buttons), Sour Gummy, shop yellow; `.hit` so it's clickable.
  DevTools: `starby.howTo()`, `starby.howToReset()`.

- [x] **P1-22 (Nice) Memory (a chill game).** `events/memory.js`: invite "wanna play a memory game?", the dialogue's
  **Chill** games (`dialogue/tree.js` CHILL_GAMES), tray "Play memory". He glides to the middle and one starbit of
  every colour (team PNGs) pops out in a ring around him. He lights some up in order (each grows, glows and shakes),
  then you click them in the same order (6s per click). **3 sets, harder each time:** 3 / 5 / 7 starbits, shown
  faster each set. All 3 → 12 starbits; a wrong click or too slow → the right one lights up, "oops!", and 4 starbits
  per set cleared. Starbits are `.hit` during the game; glow / grow / shake are CSS on the PNGs.

- [x] **P1-23 (Nice) Asteroid Shuffle (a chill game).** `events/shuffle.js`: a shell game. Invite "wanna play asteroid
  shuffle?", the dialogue's **Chill** games, tray "Play asteroid shuffle". He glides to the middle; 3 asteroids hover
  above 3 spots and drop, the middle one covering him. 8 swaps along little arcs (one over, one under; 0.55s each,
  a touch quicker each time, ~0.36s by the last), and he moves with his asteroid. A popup above the asteroids (chat theme, not a line from him) says "Which
  asteroid is Starby hiding behind? Click one!"; click one (12s); it lifts. **While hidden he's hushed** (no speech
  over his asteroid) and the right-click dialogue is off (`pet.hiding`, also for hide and seek). Right → "you found me!" + 8 starbits; wrong / too slow → his asteroid lifts too. **Asteroids are a
  PLACEHOLDER: the moon PNG** (`assets/events/moon.png`) until asteroid art exists; swap `ASTEROID_ART`.

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
    - **star tail:** streams behind whichever way he moves.
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
- [x] **P3-8 Dancing to music.**
  - **`src/main/systemReads/music.js` (new):**
    - reads the window titles of any program whose name contains "spotif" (Spotify, Spotifast) every
      2s and emits `{ type: 'music', playing }`;
    - "Artist - Song" in the title means a song is playing; "Spotify" / "Spotify Premium" means paused;
    - the title never leaves the main process, only true/false;
    - limits: it can't see Spotify closed to the tray, or the web player.
  - **`events/dance.js` (new):**
    - its own category (`'dance'`, P1-15) and the lowest-priority event (2): a sky event interrupts it,
      and invites, games and the shop always win;
    - while a song plays and he's happy or playful, he dances in bursts (14–24s on, then a 1-minute cooldown
      between dances);
    - moves, on a steady ~120 bpm beat: bounce, sway, side steps, hops, a spin;
    - he uses the new `dancing` face (`happy-1/2` swapping on the beat);
    - it ends when the song stops, when he's grabbed, or when his mood changes (mad, dizzy, sleepy...);
    - dancing counts as busy in `mood.js`, so no yawning mid-playlist;
    - DevTools: `starby.startEvent('dance')` dances one burst without music.
  - **Update:** any Spotify/Spotifast title other than its idle name ("Spotify", "Spotify Premium",
    "Spotifast", ads) now counts as playing. Clicking, grabbing, throwing, a swat or a flinch snaps him
    out of the dance, and he only dances again after 25s with no interaction and no other event.
- [x] **P3-9 More system reactions.**
  - **Lock/unlock** (`power.js`, Electron `powerMonitor`): on unlock he says a line that depends on how
    long you were away (quick / a minute or more / 30 min or more) and does a happy hop. Unlocking also
    wakes a yawning star (`mood.js`).
  - **New app kinds** (`activeWindow.js`), still worked out from the program name only:
    - `chat` (Discord, Slack, Teams, WhatsApp...): "say hi to everyone for me!";
    - `reading` (PDF readers, or a `.pdf` open in a browser);
    - `writing` (Word, Notepad, OneNote, Notion, Excel, Google Docs in a browser).

    A browser tab's title is only checked locally. Switching browser tabs to a PDF or a Doc counts as
    a change.
  - **Smarter clipboard** (`clipboard.js`), sending only the kind: url, email, color code, number,
    file path, emoji, code, long text, text, **image**, **files** copied in Explorer.
  - **Wi-Fi** (`systemReactions.js`, the browser's `online`/`offline` events): one line if the
    internet stays down for 3s or more (blips are ignored), and one line when it's back.
- [x] **P3-10 Considerate + fun reactions.** No emoji in any line (music notes removed too).
  - **Quiet during video calls** (`systemReads/calls.js`, new):
    - finds a meeting window by program + title, checked in the main process only: Zoom meeting,
      Teams meeting/call, a Google Meet tab, Webex, Slack huddle;
    - sends only `{ type: 'call', active }`.
  - **Fullscreen** (`activeWindow.js`): the focused window covers the whole display →
    `{ type: 'fullscreen', active }`. Maximized windows and the desktop don't count.
  - **`events/hush.js` (new), priority 15** (above games, below the shop):
    - during a call he stops and sits still; with a fullscreen app he tiptoes to the nearest bottom corner;
    - `pet.hushed` makes `ctx.say` in `pet.js` show nothing, and hides a bubble already showing, so
      he's completely silent, including when clicked;
    - games and dancing can't start; you can still move him.
  - **PC sleep/wake** (`power.js`): a wake-up greeting and a hop; waking also wakes a yawning star.
  - **Screenshot** (`clipboard.js` → kind `screenshot`): a picture that's exactly a display's size
    (Print Screen), or copied while or just after a snipping tool window was open (Win+Shift+S). He
    winks (`strikePose` in `mood.js`) and says "say cheese!".
  - **Time-of-day moments** (`systemReactions.js`): late night (12am–4am, "it's 2am... go to sleep!"),
    lunch (12–1pm), dinner (6–7pm), each at most once per hour. DevTools: `starby.timeMoment(2)`.
  - **Copy-paste champion:** 5 copies within 60s → "you're a copy-paste machine!" (10 min cooldown),
    said instead of the normal copy line.
- [x] **P3-11 Effects: wall impacts.**
  - **Art:** `assets/effects/` holds hand-drawn frame pairs: `impact1/2`, `dust1/2`, `starcloud1/2`,
    `wind1/2` (wind isn't used yet).
  - **`src/renderer/pet/effects.js` (new):** a reusable player. It swaps frames 1 and 2 quickly, fades in
    and out, can rotate, mirror, drift and grow, and removes itself when done. Every effect is
    click-through.
  - **`behaviors/wallImpact.js` (new):** on drag.js's `impact` (hard hits only) it plays:
    - the crash lines at the wall, in front of him (drawn for a right wall: mirrored or rotated for the
      others, and nudged to his feet on the floor);
    - a dust puff off the wall, behind him;
    - two small twinkling star clouds drifting away.

    Harder hits get bigger, longer effects. DevTools: `starby.impactFx('left', 2000)`.
  - **Update:** `wallImpact.js` became `behaviors/fx.js`. It also plays small crash lines on a swat, a
    star-cloud burst when he's shaken or thrown awake, and a bigger burst on a shop buy/equip. Wind
    effects were tried and removed. A throw of 300px/s or more wakes a sleeping Starby (`mood.js`).
- [x] **P3-12 Right-click dialogue + focus mode + tray menu.**
  - **Burst layout (replaces the single box):**
    - Right-click → if he's too close to an edge, he slides away from it first.
    - Then up to 6 answer boxes burst out of him with a snappy overshoot into a horseshoe, 3 down each
      side. An odd last answer sits centered under him.
    - His line is in a box above his head.
    - Picking an answer: the others snap back into him and the picked one pops. A submenu's boxes burst
      out from the picked box into a fresh horseshoe.
    - Max 6 answers per node (`MAX_OPTIONS`). Games are split into Action / Chill; Developer is trimmed to 6
      ("Invite me to a game" is still in the tray menu).
    - Developer: "No game rest (5 min)" → `starby.noRest(5)` in `games.js`.
  - **Chat tree** (`tree.js`, `chat*` nodes): star friends (names, light speed, meeting them), favorite moon
    (io!, our moon), age (rude!), aliens (e.t., martian parties), your desktop (favorite thing: the cursor).
    It's built from the team's draft.
    - Middle nodes have Back. Final replies end the chat with closing answers instead ("Haha, okay!" /
      "Talk to you later!" + a goodbye line), via `end()`.
    - A node can `pose` while he says it (`strikePose`): a real wink on "*wink*", sparkly eyes, the spit-laugh
      for "martians know how to party", and a grumpy face on "rude!".
  - **Dreams** (`behaviors/dream.js`):
    - While asleep, every 10-18s (first one 5-10s after he falls asleep) he dreams for 4.5s, shown in his
      speech bubble.
    - What he dreams: an accessory (wiggling and shaking) or a row of 3 random starbits (bouncing). The art's
      empty canvas is trimmed at load.
    - It goes through `bubble.js showContent` (`talkbox.setContent`), so it follows the one-bubble rule.
    - **Thought cloud:** dreams use the team's think bubble (`assets/talkbox/think-bubble-frame-1/2.png`, the
      `think` style in `talkbox.js`, measured from the art). The cloud floats up-left with its dots trailing
      to his head, and boils frame 1 ↔ 2.
    - **Sleep-talk:** about a third of turns, he murmurs a themed line in his speech bubble instead of
      dreaming ("mmm... starbits...", "zzz... io... io...", "no... those are MY starbits..."). Half of those
      are about what he just dreamed ("mmm... top hat..."). It's the only speech allowed while asleep
      (`bubble.say(..., { force: true })`).
    - **Naps on the taskbar:** yawning now walks him down onto the taskbar under where he is (`napSpot` in
      `mood.js`), not to a top corner. He's kept 140px from the left edge and 100px from the right, so the
      cloud and bubbles never get pushed by an edge.
    - **Asleep = silent:**
      - `mood.js` sets `talkbox.setSpeechGate` while sleepy, so no `ctx.say` line shows (chatter, clicks,
        system comments). Only dreams show.
      - Right-click does nothing while he's asleep.
      - Wake-up lines still show, because the mood changes first.
  - **Click the starbits counter → shop** (`starbits.js`, P2's file):
    - The top-right counter card is now a `.hit` button that opens the shop.
    - Hovering keeps it from sliding away and grows it a little.
    - It's parked off-screen when hidden, so it only catches clicks while it's showing.
  - **"feeling sleepy?"** (right-click dialogue → Settings → `starby:getSleepy`, in `mood.js`): "yeah...
    *yawn*", then he goes straight into the sleepy walk to his nap spot on the taskbar and falls asleep.
    It isn't on the settings page.
  - **Hardening:**
    - `sandbox: true` set explicitly on all four windows (Electron's default, now written down).
    - Dependencies pinned to the tested versions (electron 45.2.3, get-windows 10.0.0) in package.json and
      the lock file's root entry.
    - Tested in the real app: every window's preload bridge, saves, system reads.
  - **Charm** (`mood.js` petting, `behaviors/charm.js`, `behaviors/fidget.js`):
    - Petting: a slow back-and-forth rub over him → sparkly eyes, a hop, "hehe, that's nice". It calms a
      mad star. 20s cooldown.
    - Daily gift: the first launch each day, after the intro → "you came back! here's a gift" + 5 starbits
      (localStorage `starby.lastGiftDay`; the save file isn't touched).
    - Nice catch: a grab while he's flying fast (drag.js logs `grab` `midAir`) → "nice catch!!", 30% chance
      of a starbit.
    - Fidgets: alone, idle and happy for 20s+ → rarely a spin, bop, look around or stretch (`pet.mode
      'fidget'`).
    - Starbit milestones: every 100 in the total → a star-cloud burst (`fx.js celebrateBurst`) + "100
      starbits!! we're rich!".
  - **Intro crash fixed** (`intro.js`, P1's): with a save but no "last seen" record, the welcome-back
    lookup threw and froze his update loop. It now falls back to the last greeting bucket.
  - **Mouse stuck after picking a menu answer:**
    - Dialogue / event-menu answers and click-away now act on the RELEASE, not the press.
    - `clickThrough.js` never turns click-through back on while a button is held; it re-checks on release.
    - Why: making the window click-through mid-press can leave Windows routing the mouse to our invisible
      full-screen window.
  - **Un-clickable screen fixed** (`clickThrough.js`, `drag.js`, `slingshot.js`, `hoopShot.js`):
    - Pins are named ('press' for drags/pulls, 'menu' for the dialogue catcher), so one can't clear another.
    - A mousemove with no button held drops a stale 'press' pin and replays the lost mouseup (drag /
      slingshot / hoop pull end normally).
    - Before: an event interrupting a press could leave the whole screen catching clicks (window X buttons
      dead) or Starby glued to the cursor.
  - **Calls + fullscreen → focus mode** (`focus.js`; `hush.js` no longer auto-starts):
    - Call: "i'll be quiet for now!", then the slingshot to the corner.
    - Fullscreen: an instant, silent flip into focus.
    - Either ending: out of focus at once, and he walks back to where he was ("call over? hi again!").
    - Clicking him out during a call doesn't restart focus until the call ends.
  - **Fullscreen detection fixed** (`activeWindow.js`):
    - Windows overlays (snipping Win+Shift+S, Start/search, lock screen...) no longer count as fullscreen.
      They used to send him to the bottom-left corner, where he'd stay.
    - It must hold for 2 polls; leaving counts at once.
  - **No squeezed bubbles:** the focus corner is 90px in from the edge. Copycat's wall smack recoils him
    ~1.3 sizes off the wall before he speaks.
  - **App/site-specific lines:** `activeWindow.js` sends a `key` (notepad, notepadpp, acrobat, pdf,
    word/excel/powerpoint, taskmanager, calculator, paint, obs, steam, discord, vscode, terminal, files,
    youtube, netflix, twitch, github, gmail, reddit, wikipedia, amazon, nasa...). Each has its own lines in
    `systemReactions.js`, with a 2-min cooldown per key.
    - A ".pdf" title in ANY app counts as reading (fixes Adobe).
  - **New system triggers** (`systemReads/desktop.js` + `systemReactions.js`): dark/light mode, a monitor
    plugged in/out, the CPU working hard (85%+ for 15s), an hour in one kind of app, 6 app switches in 30s,
    and a day-of-week line at startup.
  - **Song start = dance, always (demo):**
    - `music.js` also reports `newSong` when the playing title changes. The title still never leaves the
      main process.
    - `dance.js` `songStartNow`: a song starting or changing makes him dance at once. No quiet wait, no
      cooldown, any mood (music wakes / cheers him).
    - Invite and copycat step aside for it. It waits for games, focus, hush, the shop, sky events, the
      intro, or being held.
    - Already dancing → a fresh burst. Tested in the real app: asleep, mad, new song, mid-invite.
    - `spotifast` was added to the music app category.
  - **Fixes:**
    - Exit: he vanishes in place inside the burst (quick fade). Before, a CSS `scale` on #pet also scaled
      his position, so he zoomed off toward the top-left.
    - Launch: empty bubbles no longer flicker in the bottom-left. The boil swapped frames with
      `visibility: visible`, which overrode the intro's hidden parent, so it now uses opacity.
    - Dream cloud: its dots now come from his upper-left (`THINK_TIP` in `bubble.js`), so the cloud sits
      lower and further left.
    - Dialogue line: it sits right on his head now. Rows of boxes at that height move out sideways to
      clear it, instead of the line floating above the boxes.
  - **More space talk** (`speech.js`): ~20 space jokes in his idle chatter ("the martians are throwing
    another party tonight. i'm not invited. again."), plus space click replies ("greetings, earthling!") and
    playful/mad lines.
  - **Bigger dialogue (+33%):** his dialogue line and the answer boxes (font, padding, button borders, gaps).
    `fitCenter` still keeps everything 10px inside the screen: he slides away from an edge, as before.
  - **Never uppercase:** `text-transform: lowercase` on every talkbox text and dialogue line, and the plain
    fallback bubble lowercases too, so whatever he says shows in lowercase.
  - **Copycat smacks into the wall** (`copycat.js`, P1's file):
    - A copied move into an edge makes him actually hit it: a `slam` (fx.js wall-hit effects, no starbit
      drop), a squish, a bounce back, and a dazed face.
    - Then "oof! you tricked me!" and the game ends 'wall'.
  - **Shop names** (`shopCatalog.js`, P4's file): Propeller hat → Toy hat, Basketball shoes → Shoes, UFO
    buddy → UFO. Sleep-talk uses these shop names too.
  - **Only sleeps on the taskbar:** asleep anywhere else (dropped, thrown, put to sleep up high), he drifts
    down to his nap spot at 150px/s (`sinkToNapSpot` in `mood.js`).
  - **Goodbye on quit** (`src/main/goodbye.js` + `behaviors/goodbye.js`):
    - Every quit (tray, dialogue, Windows) goes through app.quit(). `before-quit` holds the quit once and runs
      `starby.goodbye()` in the pet window.
    - The goodbye: he stops everything and says an excited line ("see you next time!", "byeee! come back
      soon!"). Then a star-cloud explosion plays on top of him (`fx.js goodbyeBurst`) while he pops and shrinks
      away, and his floaters fade.
    - The pet then sends `app:goodbye-done` and the app quits (~2.2s). The main process quits after 3.5s no
      matter what.
    - Nothing can talk over the goodbye line (speech gate, `pet.goodbyeSaid`).
    - Shared files: `main.js` (1 line) and `preload.js` (`goodbyeDone`).
  - **More Starby Says / dancing:**
    - `GAMES` entries can have a `weight` (games.js). Starby Says has weight 3, so the games timer picks it
      ~27% of the time vs ~12% for each other game.
    - Random no-music dance is now 12%/min after a 5 min rest (was 2%/min after 20 min): roughly every
      10-15 min.
  - **Choices are lowercase:** `text-transform: lowercase` on every answer box (tree, invites, quiz).
  - **Harder to scare** (`cursorReact.js`, P1's file):
    - Flinching needs a really fast lunge right at him: 2600px/s (was 1300), path within 130px (was 180),
      missing by at most 50px (was 70).
    - The "calm cursor" for greeting/following keeps its old 650px/s.
  - **No dialogue mid-slingshot:** after "Sorry, I gotta focus", right-click does nothing until he's landed
    (`pet.noDialogue`), so the boxes don't open and then get scrambled by the jump.
  - **Right-click while focusing:** the dialogue holds him (`pet.dialogueHold`) and flies him out of the corner
    so its boxes fit, like at any edge. He glides back to the corner when it closes, still focusing.
  - **Focus slingshot:** he says something nice, pulls back, arcs into the bottom-left corner spinning, and
    slams in. He logs `slam` for the left wall and floor, which `fx.js` plays as a wall hit. It isn't logged
    as `impact`, so starbits.js doesn't drop starbits. Then he's parked and quiet as before.
  - **All his speech = the team's talkbox art** (`assets/talkbox/`, small / medium / large × 2 frames).
    The shared module is `src/renderer/pet/talkbox.js`, used by `bubble.js` (every `ctx.say`) and the dialogue.
    - It picks the size that wastes least space and squishes it vertically (down to 55%, team-approved).
      Short lines get short, wide bubbles with a short tail.
    - Boil: the artist's frame 1 ↔ 2. Dark brown text.
    - `bubble.js` keeps the bubble on screen: it slides sideways near an edge, and flips below him (tail up)
      when there's no room above. pet.css's plain `.bubble` look is overridden only while a talkbox shows.
    - The art loads once (large first) a moment after launch. Until then the old plain bubble is used.
    - **Never two at once** (`takeSpeech` in `talkbox.js`):
      - Opening the dialogue or an event menu hides the speech bubble.
      - Lines said while it's open replace his line in it, and unprompted chatter waits.
      - A closing dialogue talkbox vanishes the moment a new speech bubble appears.
  - **Click away = cancel:**
    - A left or right click anywhere that isn't a box (his line's talkbox counts as "away") sends the boxes
      back into him.
    - How: while a menu is open, a transparent full-screen catcher sits behind Starby and the boxes, and
      click-through is pinned off. That one click only dismisses the menu, then clicks reach the desktop again.
    - Event menus opt in with `onCancel`: the invite treats it as "maybe later", the quiz as giving up.
  - **Event choices use the same menu:** `showMenu` / `setMenuLine` / `closeMenu` in `dialogue.js`.
    - The invite ("wanna play pong?" [Yes!] [No]) and the star quiz (4 answers, countdown in his bubble) use it.
    - `prompt.js` is now unused.
  - **Look (shop/settings style):**
    - The answers are `button-idle.png` (`button-hover.png` on hover).
      Both are used as CSS border-images, so the hand-drawn edge keeps its thickness at any size.
    - Text is Sour Gummy in the shop yellow `#ffe8a3`.
    - A slight "line boil": an SVG noise filter wobbles only the frame art at ~7 fps while anything's showing.
      It's code only, with no new assets.
  - **Right-click Starby:** a dialogue box opens beside him, on his right when he's on the left half of the
    screen and on his left otherwise. It shows his line and a list of answers.
    - The answers are: Let's chat! / Wanna shop? / Do you want to play a game? / Sorry, I gotta focus /
      Settings / Never mind.
    - Settings leads to Open settings / Admin settings / Developer stuff / Quit (asks to confirm).
  - **Files:** the tree is plain data in `src/renderer/pet/dialogue/tree.js` (edit this to write the chat).
    `dialogue/dialogue.js` shows the box and runs the actions.
  - **While the box is open:** he stands still. The box closes on an answer, on another right-click, when
    he's picked up, when an event takes over, or after 20s untouched.
  - **Right-click during an event:**
    - a game or sky event shows the "busy" node (Keep going / Let's stop);
    - a dance or invite is stopped first;
    - during the intro or the shop window, right-click does nothing.
  - **Left-click is only a poke now:** the "Play a game?" buttons were removed from `events/games.js`, which
    now exports `requestGame` for the dialogue.
  - **`events/focus.js` (new, priority 16):** he's happy and supportive, walks to the bottom-left corner
    (standing on the taskbar line) and goes fully quiet.
    - Once parked he's built not to distract: no movement at all, and the new `calm` face (`frames.js`:
      idle-1 only, arms down, no arm wave). Every 12-30s he winks or his eyes glisten.
    - He stays happy: `mood.js` skips the "user away" yawn during focus.
    - While focusing, nothing else happens: no speech, starbit drops, invites, sky events or dancing.
    - It ends when you click or grab him (he says hi, happy) or pick "Okay, I'm done focusing!".
  - **Tray icon (`src/main/tray.js`, new):** right-clicking it shows the old native menu. The icon uses the
    existing `assets/sprite/sunny/idle-1.png`, shrunk at runtime; the team should draw a dedicated tray icon.
  - **New IPC:** `app:quit`, `pet:devtools`. The old `pet:context-menu` channel is kept and now shows the
    tray menu.
  - **Shared / other people's files touched:**
    - `drag.js` (P1): right-click dispatches `pet:right-clicked`.
    - `games.js`: chip removed.
    - `starbits.js` (P2): no drops in `focus` mode.
    - `events/index.js`, `main.js`, `ipc.js`, `preload.js`.

---

## Person 4 — Shop & customization

**Owns:** `src/renderer/shop/*`, `src/shared/shopCatalog.js`, `src/renderer/shared/sprite.js`,
`src/shared/stateSchema.js` (only Person 4 edits the save format).

- [ ] **P4-1 (Must) Fill out and balance the catalog.** Add more colors and accessories in
  `shopCatalog.js` (the star has one shape, so no shape items); new accessories need a draw function in `sprite.js`. **Flat fills and simple
  primitives only — no gradients, glow, shading or images.** Price so the first purchase takes ~5 minutes
  of play (drops now default to every 30–60s, bursts of 1–4: see `shared/starbitsTuning.js`).
- [x] **P4-2 (Must) Shop polish.** Make owned / equipped / can't-afford states obvious at a glance
  (e.g. lock label, dimmed card, "need N more"). Show a short confirmation after buying.
- [ ] **P4-3 (Must) Demo shortcut.** A hidden key combo in the shop window (e.g. Ctrl+Shift+D) that adds
  50 starbits via `window.sprite.collectStarbits(50)`. Keep it simple and obvious in code so it can be
  removed later.
- [x] **P4-4 (Nice) Another way into the shop.** DROPPED (team decision): the shop opens only from the
  right-click menu, not by double-click. Original task: Double-click on the star → `window.sprite.openShop()`.
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
