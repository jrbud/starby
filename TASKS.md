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
Also owns the list of `pet.mode` values: currently `'idle' | 'walk' | 'follow' | 'flee' | 'drag' | 'toss'`.

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

---

## Person 2 — Stardust & Windows testing

**Owns:** `src/renderer/pet/behaviors/stardust.js`, `src/renderer/pet/pet.css`.
Windows fixes only in: `src/main/windows/petWindow.js`, `src/renderer/pet/clickThrough.js` (tell the team
before changing these — they're core).

- [ ] **P2-1 (Must, do first) Windows test.** Run `npm install && npm start` on Windows and check:
  1. Clicks pass through everywhere except on the star (and work on the star: click, drag, right-click).
  2. The star stays visible above the taskbar (`setAlwaysOnTop(true, 'screen-saver')`).
  3. The "ground" sits right on top of the taskbar (`groundY()` uses `screen.availHeight`).
  4. Works at 125% and 150% display scaling.
  Fix what's broken (comment any Windows quirk you find), or report it to the team.
- [ ] **P2-2 (Must) Show the count.** On pickup, spawn a small "+1" text element that floats up and fades
  (CSS transition, plain text). Also show the total: e.g. a small plain-text badge near the star while the
  cursor is over it. Get the total from `ctx.api.getState()` / `ctx.api.onStateChanged`.
  Badge/float text must not have class `hit` (keep them click-through).
- [ ] **P2-3 (Must) Old stardust fades.** Each drop gets a spawn time; after ~60s fade it out and remove it
  from `drops`.
- [ ] **P2-4 (Nice) Drop animation.** Spawn at the star's center and fall/bounce to its feet with a CSS
  transition or per-frame update before it becomes collectable.
- [ ] **P2-5 (Nice) Multiple monitors.** Decide: primary-only (current) or support others. Document the
  decision in a comment in `petWindow.js`. If supporting, flag it — it changes the window design.

---

## Person 3 — Speech & system reads

**Owns:** `src/renderer/pet/behaviors/speech.js`, `src/renderer/pet/bubble.js`,
`src/renderer/pet/behaviors/systemReactions.js`, `src/renderer/pet/behaviors/chatter.js`,
`src/main/systemReads/*`.

> **Speech convention (for everyone):** lines that answer the user (click, flinch, drag) use plain
> `ctx.say()` so they show instantly. Lines that come out of nowhere (idle chatter, system reactions,
> timed events) use `chat(ctx, text, ms, { gap, wait })` from `behaviors/chatter.js`, which only speaks
> when nothing was said in the last `gap` seconds (default 5) and otherwise queues the line for up to
> `wait` seconds or drops it. Dropped lines never reach `ctx.say`, so they aren't in the event log.
> `lineBag(lines)` in the same file picks lines without repeating one twice in a row.
> `sessionEvents.js` milestones still use `ctx.say` directly; switching them to `chat()` is a two-line
> change (not done, since that file isn't Person 3's).

- [ ] **P3-1 (Must) Active window.** Implement `src/main/systemReads/activeWindow.js`: poll the focused
  window every ~2s and `emit('active-window', { app, category })` when it changes, with `category` one of
  `'browser' | 'editor' | 'game' | 'music' | 'other'`, worked out in the main process. **Don't send the
  window title:** titles often contain email subjects and file names, and every system event ends up in
  the session event log. Easiest route: the `get-windows` npm package (read-only). It is ESM-only
  (load it with `await import('get-windows')` from our CommonJS main process), needs Node ≥ 22, and may need
  a rebuild for Electron, so test it on Windows early. Fallback: a read-only PowerShell call.
  **Adding a package changes `package.json` — flag it to the team.** Ignore our own process (the shop
  window can take focus). Then in `systemReactions.js`, react to each category with matching lines via
  `chat()`. Never interact with or modify the other app.
- [x] **P3-2 (Must) More to say, less spam.** Done: `speech.js` has bigger line pools (20 idle, 14 click)
  drawn from shuffle bags (never the same line twice in a row). Idle chatter runs on `ctx.after`
  and is skipped unless it's been quiet for 10s. The global rate limit is `chat()` in `behaviors/chatter.js`
  (see the speech convention above), not in `bubble.js`, so clicks and flinches stay instant.
  System reads now start 2s after the pet page loads (`systemReads/index.js`), because events sent before
  `pet.js` finishes its async boot were being dropped. `power` sends `initial: true` for the startup state,
  and the star only comments on changes, so startup is one greeting instead of several lines at once.
- [ ] **P3-3 (Must) Battery level.** In `systemReactions.js`, use `navigator.getBattery()` (renderer-side)
  to react once when battery drops below ~20% while on battery, and again when charging starts.
- [x] **P3-4 (Nice) Smarter clipboard reactions.** Done, a little differently than planned: the
  `'clipboard'` event no longer has a `preview`. `systemReads/clipboard.js` classifies the text in the main
  process and sends only `{ length, kind }`, with `kind` one of `'url' | 'number' | 'long' | 'text'`, so the
  copied text never reaches the renderer, the event log or DevTools. `systemReactions.js` has lines per kind.
- [ ] **P3-5 (Nice) Sleepy at night.** Late `time-of-day` or long `'idle'` puts the star to sleep (closed
  eyes, slow bob, "zzz"). Needs a new `'sleep'` mode — **agree with Person 1 first.**

---

## Person 4 — Shop & customization

**Owns:** `src/renderer/shop/*`, `src/shared/shopCatalog.js`, `src/renderer/shared/sprite.js`,
`src/shared/stateSchema.js` (only Person 4 edits the save format).

- [ ] **P4-1 (Must) Fill out and balance the catalog.** Add more colors and accessories in
  `shopCatalog.js`; new shapes/accessories need a draw function in `sprite.js`. **Flat fills and simple
  primitives only — no gradients, glow, shading or images.** Price so the first purchase takes ~5 minutes
  of play (drops are every 8–15s in `stardust.js`, so roughly 25 stardust).
- [ ] **P4-2 (Must) Shop polish.** Make owned / equipped / can't-afford states obvious at a glance
  (e.g. lock label, dimmed card, "need N more"). Show a short confirmation after buying.
- [ ] **P4-3 (Must) Demo shortcut.** A hidden key combo in the shop window (e.g. Ctrl+Shift+D) that adds
  50 stardust via `window.sprite.collectStardust(50)`. Keep it simple and obvious in code so it can be
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
