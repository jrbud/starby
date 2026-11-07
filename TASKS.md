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
- All rules in `claude.md` still apply: placeholder shapes only, read-only system access, Windows target,
  and never commit — the human commits.
- Behavior contract (see `src/renderer/pet/behaviors/index.js`): `init(ctx)` once, `update(ctx, dt)` every
  frame. `ctx` = `{ api, pet, petEl, stage, cursor, catalog, groundY(), stageWidth(), say(text, ms),
  isSpeaking(), setPinned(bool) }`.

---

## Person 1 — Movement & cursor

**Owns:** `src/renderer/pet/behaviors/idle.js`, `walk.js`, `drag.js`, `cursorReact.js`.
Also owns the list of `pet.mode` values: currently `'idle' | 'walk' | 'drag' | 'fall'`.

- [ ] **P1-1 (Must) Climb screen edges.** Add a `'climb'` mode. When a walk ends at the left or right
  edge (`x <= 0` or `x >= stageWidth() - size`), sometimes climb up that edge to a random height, pause,
  then climb or drop back down (`'fall'` already exists in `drag.js`). Rotate the canvas 90° while
  climbing via `pet` state that `pet.js` renders — if `pet.js` needs a new field (e.g. `pet.rotation`),
  flag it: `pet.js` is shared.
  *Done when:* the star reaches both side edges and climbs them without getting stuck.
- [ ] **P1-2 (Must) Livelier wandering.** In `walk.js`/`idle.js`: random short pauses mid-walk, sometimes
  turn around before reaching the target, vary speed slightly and walk distance (short shuffles vs. long
  walks).
- [ ] **P1-3 (Must) Flinch.** In `cursorReact.js`: track cursor speed from `ctx.cursor` between frames.
  If the cursor moves fast toward the star and gets within ~60px, do a quick hop away from it
  (bob + squash, nudge `x` away) and say something short with `ctx.say`. Cooldown so it doesn't loop.
- [ ] **P1-4 (Nice) Follow briefly.** After noticing the cursor, walk a few steps toward it, then lose
  interest and go back to idle.
- [ ] **P1-5 (Nice) Toss + keep on screen.** In `drag.js`: record velocity during drag, keep horizontal
  velocity on release while falling, bounce/clamp at screen edges so the star can't be dragged or thrown
  off screen.

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
- [ ] **P2-4 (Nice) Drop animation.** Spawn at the star's center and fall/bounce to the ground with a CSS
  transition or per-frame update before it becomes collectable.
- [ ] **P2-5 (Nice) Multiple monitors.** Decide: primary-only (current) or support others. Document the
  decision in a comment in `petWindow.js`. If supporting, flag it — it changes the window design.

---

## Person 3 — Speech & system reads

**Owns:** `src/renderer/pet/behaviors/speech.js`, `src/renderer/pet/bubble.js`,
`src/renderer/pet/behaviors/systemReactions.js`, `src/main/systemReads/*`.

- [ ] **P3-1 (Must) Active window.** Implement `src/main/systemReads/activeWindow.js`: poll the focused
  window every ~2s and `emit('active-window', { title, app })` when it changes. Easiest route: the
  `get-windows` npm package (read-only). **Adding a package changes `package.json` — flag it to the team.**
  Then in `systemReactions.js`, react to a few app types (browser, code editor, game, music) with
  matching lines. Never interact with or modify the other app.
- [ ] **P3-2 (Must) More to say, less spam.** In `speech.js`: bigger line pools (idle, click), never the
  same line twice in a row. Add a global rate limit (e.g. in `bubble.js` or a small helper) so system
  reactions + idle chatter can't stack up — drop or queue a line if one was shown in the last few seconds.
- [ ] **P3-3 (Must) Battery level.** In `systemReactions.js`, use `navigator.getBattery()` (renderer-side)
  to react once when battery drops below ~20% while on battery, and again when charging starts.
- [ ] **P3-4 (Nice) Smarter clipboard reactions.** Use the `preview` from the `'clipboard'` event to tell
  apart a URL, a number, and long text, each with its own lines. Never log or store clipboard content.
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
