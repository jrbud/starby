# sprite.exe

A tiny star that lives on your (Windows) desktop. Hackathon build, so see `claude.md` for scope and rules
(placeholder assets only, read-only system access).

## Run

```
npm install
npm start
```

Right-click the star → **Open shop** / **Settings…** / **Quit**. Settings has the *Fling power* slider
(how hard throws fly and how bouncy the screen edges are).

> `npm start` runs `scripts/start.js`, which launches Electron with `ELECTRON_RUN_AS_NODE` removed.
> VS Code (and terminals/tools started from it) can set that variable, which makes Electron run as
> plain Node and crash with "Cannot read properties of undefined (reading 'requestSingleInstanceLock')".
> If you run `electron .` directly instead of `npm start`, unset it first.

## Layout

```
src/
  main/                     Electron main process (Node)
    main.js                 entry: wires everything together            [CORE: flag before editing]
    store.js                persisted state → %APPDATA%/sprite-exe/state.json
    settingsStore.js        user settings (sliders) → settings.json, separate from the state schema
    ipc.js                  all ipcMain handlers (stardust, shop, click-through, context menu)
    windows/
      petWindow.js          fullscreen transparent overlay + click-through   [CORE]
      shopWindow.js         normal shop window
      settingsWindow.js     small settings window (Fling power slider)
    systemReads/            READ-ONLY system reads → 'system:event' to the pet
      clipboard.js idle.js power.js timeOfDay.js
      activeWindow.js       TODO (needs a native module or similar)
  preload/preload.js        the `window.sprite` API that renderers use
  shared/                   used by main process
    stateSchema.js          persisted-state shape + migration           [CORE]
    shopCatalog.js          shop items (colors / accessories)        
  renderer/
    shared/sprite.js        draws the star with canvas primitives (used by pet + shop)
    shared/flingTuning.js   Fling power slider (0–100) → throw speed, glide friction, wall bounce
    pet/
      pet.js                builds `ctx`, runs the frame + tick loop, renders
      core/                 clock.js (10 ticks/s), scheduler.js (after/every), eventLog.js
      clickThrough.js       toggles click-through when hovering `.hit` elements
      bubble.js             speech bubble UI (behaviors call ctx.say)
      behaviors/            one file per behavior, registered in behaviors/index.js
        idle.js walk.js drag.js cursorReact.js speech.js stardust.js systemReactions.js
    shop/                   shop window UI
    settings/               settings window UI
```

## How it fits together

- **One overlay window.** The pet window covers the whole primary display, is transparent and click-through.
  The sprite, bubble and stardust are DOM elements moving inside it. When the cursor is over the sprite
  (`.hit`), click-through turns off so you can click or drag it.
- **Behaviors** are small modules with `init(ctx)`, `onTick(ctx, tick)` and `update(ctx, dt)`. They coordinate
  through `ctx.pet.mode` (`idle` | `walk` | `follow` | `flee` | `drag` | `toss`). To add one: create a file in `behaviors/` and add it to
  `behaviors/index.js`.
- **Ticks vs. frames.** A session clock ticks 10 times a second from app start (`core/clock.js`). Behaviors make
  decisions in `onTick` (start walking, hop, pause) and do smooth motion in `update`, which runs every frame.
  The clock follows real time, so it catches up after the PC sleeps.
- **Timed events.** `ctx.after(seconds, fn, label)` and `ctx.every(seconds, fn, label)` run things on the
  session clock (`core/scheduler.js`). Example: `behaviors/sessionEvents.js` (time-open milestones, stardust
  streak).
- **Event log.** `ctx.log(type, data)` records what happened and when; `ctx.events` answers questions like
  `last('say')`, `since(300)`, `count('click', 60)`, `total('walk')` (`core/eventLog.js`). It lives in memory
  for the session only. pet.js logs speech, system events, stardust, purchases/equips and mode changes
  automatically. To browse it, open DevTools on the pet window and run `starby.events.all()`.
- **State** (stardust, owned items, equipped items) lives only in the main process. Renderers change it through
  `window.sprite.*`, and every window gets `state:changed` after each update. That's how equipping in the shop
  changes the on-screen sprite right away.
- **Shop items** are data in `shopCatalog.js`. A new color is a single entry. The star has one shape (no shape
  items). A new accessory needs hand-drawn PNG art from the team (see claude.md).

## Suggested ownership (to avoid merge conflicts)

| Area | Files |
|---|---|
| Movement / idle / drag | `renderer/pet/behaviors/{idle,walk,drag}.js` |
| Cursor + speech | `behaviors/{cursorReact,speech}.js`, `bubble.js` |
| Stardust + shop | `behaviors/stardust.js`, `renderer/shop/*`, `shared/shopCatalog.js`, `renderer/shared/sprite.js` |
| System reads | `main/systemReads/*`, `behaviors/systemReactions.js` |

Core files (`main.js`, `windows/petWindow.js`, `shared/stateSchema.js`, `preload.js` channel names): flag before
changing them.
